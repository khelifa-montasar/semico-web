import type { Prisma } from "@prisma/client";

export async function reconcileFarmLayout(
  database: Prisma.TransactionClient,
  farmId: string,
  zoneCount: number,
  sensorsPerZone: number,
): Promise<{ blockedZoneId: string | null }> {
  const zones = await database.zone.findMany({
    where: { farmId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const current = zones.filter((zone) => zone.configured);
  const selected = current.slice(0, zoneCount);
  const removed = current.slice(zoneCount);
  const pending = removed.length
    ? await database.irrigationCommand.findFirst({
        where: {
          farmId,
          zoneId: { in: removed.map((zone) => zone.id) },
          status: "PENDING",
        },
        select: { zoneId: true },
      })
    : null;
  const blockedZoneId =
    removed.find((zone) => zone.valveState === "OPEN")?.id ??
    pending?.zoneId ??
    null;
  if (blockedZoneId) return { blockedZoneId };
  selected.push(
    ...zones
      .filter((zone) => !zone.configured)
      .slice(0, zoneCount - selected.length),
  );
  let nextOrder = Math.max(-1, ...zones.map((zone) => zone.sortOrder)) + 1;
  const names = new Set(zones.map((zone) => zone.name));
  while (selected.length < zoneCount) {
    let nameIndex = nextOrder + 1;
    while (names.has(`Zone ${nameIndex}`)) nameIndex++;
    const name = `Zone ${nameIndex}`;
    selected.push(
      await database.zone.create({
        data: { farmId, name, sortOrder: nextOrder++, configured: true },
      }),
    );
    names.add(name);
  }
  const zoneIds = selected.map((zone) => zone.id);
  await database.zone.updateMany({
    where: { farmId, id: { notIn: zoneIds }, configured: true },
    data: { configured: false },
  });
  await database.zone.updateMany({
    where: { farmId, id: { in: zoneIds }, configured: false },
    data: { configured: true },
  });
  await database.sensor.updateMany({
    where: { farmId, zoneId: { notIn: zoneIds }, configured: true },
    data: { configured: false, connection: "OFFLINE" },
  });
  const sensors = await database.sensor.findMany({
    where: { farmId },
    orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
  });
  const usedKeys = new Set(sensors.map((sensor) => sensor.key));
  for (const [zoneIndex, zone] of selected.entries()) {
    const previous = sensors.filter((sensor) => sensor.zoneId === zone.id);
    const retained = previous
      .filter((sensor) => sensor.configured)
      .slice(0, sensorsPerZone);
    retained.push(
      ...previous
        .filter((sensor) => !sensor.configured)
        .slice(0, sensorsPerZone - retained.length),
    );
    const sensorIds = retained.map((sensor) => sensor.id);
    await database.sensor.updateMany({
      where: {
        farmId,
        zoneId: zone.id,
        id: { notIn: sensorIds },
        configured: true,
      },
      data: { configured: false, connection: "OFFLINE" },
    });
    await database.sensor.updateMany({
      where: {
        farmId,
        zoneId: zone.id,
        id: { in: sensorIds },
        configured: false,
      },
      data: { configured: true, connection: "OFFLINE" },
    });
    const additions: Prisma.SensorCreateManyInput[] = [];
    let sensorOrder =
      Math.max(-1, ...previous.map((sensor) => sensor.sortOrder)) + 1;
    for (let slot = retained.length; slot < sensorsPerZone; slot++) {
      const base = `Z${zoneIndex + 1}-S${slot + 1}`;
      let key = base;
      let suffix = 2;
      while (usedKeys.has(key)) key = `${base}-${suffix++}`;
      usedKeys.add(key);
      additions.push({
        farmId,
        zoneId: zone.id,
        key,
        configured: true,
        connection: "OFFLINE",
        lastSeenAt: null,
        batteryPct: null,
        sortOrder: sensorOrder++,
      });
    }
    if (additions.length) await database.sensor.createMany({ data: additions });
  }
  return { blockedZoneId: null };
}
