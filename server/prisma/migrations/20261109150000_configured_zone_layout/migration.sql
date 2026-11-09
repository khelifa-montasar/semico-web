PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

ALTER TABLE "Zone" ADD COLUMN "configured" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Zone" ADD COLUMN "boundaryJson" TEXT;

CREATE TABLE "new_Sensor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "connection" TEXT NOT NULL DEFAULT 'ONLINE',
    "lastSeenAt" DATETIME,
    "batteryPct" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "configured" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Sensor_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Sensor_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Sensor" ("id", "farmId", "zoneId", "key", "connection", "lastSeenAt", "batteryPct", "sortOrder")
SELECT "id", "farmId", "zoneId", "key", "connection", "lastSeenAt", "batteryPct", "sortOrder" FROM "Sensor";
DROP TABLE "Sensor";
ALTER TABLE "new_Sensor" RENAME TO "Sensor";
CREATE INDEX "Sensor_farmId_zoneId_idx" ON "Sensor"("farmId", "zoneId");
CREATE UNIQUE INDEX "Sensor_farmId_key_key" ON "Sensor"("farmId", "key");

COMMIT;
PRAGMA foreign_keys=ON;
