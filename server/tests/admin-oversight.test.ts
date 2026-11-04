import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { oversightService } from "../src/modules/admin/oversight.service.js";
import {
  canAccessDiagnostics,
  canControlValves,
  canExportData,
  canReadFarm,
  type AuthContext,
} from "../src/types/auth.js";
import {
  auth,
  createSuperAdmin,
  PASSWORD,
  registerOwner,
  resetDatabase,
  testApp,
} from "./helpers/api.js";
import { buildCast } from "./helpers/roles.js";

beforeEach(resetDatabase);

describe("platform farm oversight", () => {
  it("returns an empty, private farm list without requiring an admin farm", async () => {
    const admin = await createSuperAdmin();
    const response = await request(testApp())
      .get("/api/v1/admin/farms")
      .set(auth(admin.accessToken))
      .expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    });
  });

  it("lists all farms with safe owner details, statuses, worker counts, and pagination", async () => {
    const cast = await buildCast("First Farm");
    const second = await registerOwner("Second Farm");
    const admin = await createSuperAdmin();
    await prisma.farm.update({
      where: { id: cast.farmId },
      data: { createdAt: new Date("2026-01-01T00:00:00Z") },
    });
    await prisma.farm.update({
      where: { id: second.farmId },
      data: {
        status: "SUSPENDED",
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
    });
    const response = await request(testApp())
      .get("/api/v1/admin/farms?pageSize=1")
      .set(auth(admin.accessToken))
      .set("X-Farm-Id", cast.farmId)
      .expect(200);
    expect(response.body.meta).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(response.body.data[0]).toMatchObject({
      id: second.farmId,
      status: "SUSPENDED",
      owner: { id: second.userId, fullName: "Test Owner", email: second.email },
    });
    const next = await request(testApp())
      .get("/api/v1/admin/farms?page=2&pageSize=1")
      .set(auth(admin.accessToken))
      .expect(200);
    expect(next.body.data[0]).toMatchObject({
      id: cast.farmId,
      workerCount: 5,
      status: "ACTIVE",
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /ownerCode|passwordHash|tokenHash|refreshTokens/,
    );
    await request(testApp())
      .get("/api/v1/admin/farms?page=0")
      .set(auth(admin.accessToken))
      .expect(400);
  });

  it("suspends farm access immediately, preserves devices and accounts, and restores access on resume", async () => {
    const cast = await buildCast();
    const admin = await createSuperAdmin();
    const zone = await prisma.zone.findFirstOrThrow({
      where: { farmId: cast.farmId },
    });
    await prisma.zone.update({
      where: { id: zone.id },
      data: { valveState: "OPEN" },
    });
    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(cast.owner.accessToken))
      .expect(200);
    const suspended = await request(testApp())
      .patch(`/api/v1/admin/farms/${cast.farmId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "SUSPENDED" })
      .expect(200);
    expect(suspended.body.data).toMatchObject({
      id: cast.farmId,
      status: "SUSPENDED",
    });
    for (const member of [
      cast.owner,
      cast.operatorValve,
      cast.operatorPlain,
      cast.engineer,
    ]) {
      await request(testApp())
        .get("/api/v1/farms/me")
        .set(auth(member.accessToken))
        .expect(403);
      await request(testApp())
        .get("/api/v1/farms/me/telemetry/latest")
        .set(auth(member.accessToken))
        .expect(403);
    }
    await request(testApp())
      .patch("/api/v1/farms/me/settings")
      .set(auth(cast.owner.accessToken))
      .send({ moistureThreshold: 45 })
      .expect(403);
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/valve")
      .set(auth(cast.operatorValve.accessToken))
      .send({ zoneId: zone.id, action: "CLOSE" })
      .expect(403);
    await request(testApp())
      .post("/api/v1/farms/me/realtime-ticket")
      .set(auth(cast.owner.accessToken))
      .expect(403);
    await request(testApp())
      .get("/api/v1/auth/me")
      .set(auth(cast.owner.accessToken))
      .expect(200);
    await request(testApp())
      .get("/api/v1/farms")
      .set(auth(cast.owner.accessToken))
      .expect(200);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: cast.owner.userId } }),
    ).toMatchObject({ status: "ACTIVE", platformDisabled: false });
    expect(
      await prisma.zone.findUniqueOrThrow({ where: { id: zone.id } }),
    ).toMatchObject({ valveState: "OPEN" });
    await request(testApp())
      .post("/api/v1/auth/register")
      .send({
        fullName: "New Worker",
        email: "suspended.join@test.dz",
        password: PASSWORD,
        role: "WORKER",
        ownerCode: cast.owner.ownerCode,
      })
      .expect(403);
    await request(testApp())
      .patch(`/api/v1/admin/farms/${cast.farmId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "ACTIVE" })
      .expect(200);
    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(cast.owner.accessToken))
      .expect(200);
    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(cast.operatorValve.accessToken))
      .expect(200);
    const events = await prisma.auditLog.findMany({
      where: { action: "ADMIN_FARM_STATUS_CHANGED", entityId: cast.farmId },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      actorId: admin.userId,
      farmId: cast.farmId,
      entityType: "FARM",
    });
    expect(JSON.parse(events[0]!.metadata!)).toEqual({
      previousStatus: "ACTIVE",
      status: "SUSPENDED",
    });
  });

  it("allows a multi-farm owner to use another active farm while one is suspended", async () => {
    const owner = await registerOwner("Suspended Farm");
    const second = await prisma.farm.create({
      data: {
        name: "Active Farm",
        ownerId: owner.userId,
        ownerCode: "SAFE-0002",
      },
    });
    const admin = await createSuperAdmin();
    await request(testApp())
      .patch(`/api/v1/admin/farms/${owner.farmId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "SUSPENDED" })
      .expect(200);
    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .expect(403);
    const active = await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(owner.accessToken))
      .set("X-Farm-Id", second.id)
      .expect(200);
    expect(active.body.data.id).toBe(second.id);
    const farms = await request(testApp())
      .get("/api/v1/farms")
      .set(auth(owner.accessToken))
      .expect(200);
    expect(farms.body.data).toHaveLength(2);
  });

  it.each([
    {},
    { status: "DISABLED" },
    { status: "active" },
    { status: null },
    { status: "ACTIVE", ownerId: "other" },
  ])("rejects invalid farm status input: %j", async (input) => {
    const owner = await registerOwner();
    const admin = await createSuperAdmin();
    await request(testApp())
      .patch(`/api/v1/admin/farms/${owner.farmId}/status`)
      .set(auth(admin.accessToken))
      .send(input)
      .expect(400);
    expect(
      (await prisma.farm.findUniqueOrThrow({ where: { id: owner.farmId } }))
        .status,
    ).toBe("ACTIVE");
  });

  it("returns 404 for an unknown farm and does not duplicate audits for an unchanged status", async () => {
    const admin = await createSuperAdmin();
    const owner = await registerOwner();
    await request(testApp())
      .patch("/api/v1/admin/farms/unknown/status")
      .set(auth(admin.accessToken))
      .send({ status: "ACTIVE" })
      .expect(404);
    await request(testApp())
      .patch(`/api/v1/admin/farms/${owner.farmId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "ACTIVE" })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: { action: "ADMIN_FARM_STATUS_CHANGED" },
      }),
    ).toBe(0);
  });

  it.each(["OWNER", "WORKER"] as const)(
    "removes all farm capabilities from a suspended-farm %s context",
    (role) => {
      const context: AuthContext = {
        userId: "member",
        email: "member@test.dz",
        fullName: "Member",
        role,
        status: "ACTIVE",
        workerType: "OPERATOR",
        valveControl: true,
        farmId: "farm",
        farmName: "Farm",
        farmStatus: "SUSPENDED",
      };
      expect(canReadFarm(context)).toBe(false);
      expect(canControlValves(context)).toBe(false);
      expect(canExportData({ ...context, workerType: "ENGINEER" })).toBe(false);
      expect(canAccessDiagnostics({ ...context, workerType: "ENGINEER" })).toBe(
        false,
      );
    },
  );
});

describe("platform user oversight", () => {
  it("lists every role and account status with safe farm associations and pagination", async () => {
    const cast = await buildCast();
    const admin = await createSuperAdmin();
    const response = await request(testApp())
      .get("/api/v1/admin/users")
      .set(auth(admin.accessToken))
      .expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.meta.total).toBe(7);
    expect(
      response.body.data.find(
        (user: { id: string }) => user.id === cast.owner.userId,
      ),
    ).toMatchObject({
      role: "OWNER",
      farm: null,
      ownedFarms: [{ id: cast.farmId }],
    });
    expect(
      response.body.data.find(
        (user: { id: string }) => user.id === cast.operatorValve.userId,
      ),
    ).toMatchObject({
      role: "WORKER",
      workerType: "OPERATOR",
      farm: { id: cast.farmId },
      platformDisabled: false,
    });
    expect(
      response.body.data.find(
        (user: { id: string }) => user.id === cast.invited.userId,
      ).status,
    ).toBe("INVITED");
    expect(
      response.body.data.find(
        (user: { id: string }) => user.id === admin.userId,
      ),
    ).toMatchObject({ role: "SUPER_ADMIN", farm: null, ownedFarms: [] });
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|tokenHash|refreshTokens|ownerCode/,
    );
    const page = await request(testApp())
      .get("/api/v1/admin/users?page=2&pageSize=2")
      .set(auth(admin.accessToken))
      .expect(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 7,
      totalPages: 4,
    });
    await request(testApp())
      .get("/api/v1/admin/users?pageSize=101")
      .set(auth(admin.accessToken))
      .expect(400);
  });

  it("disables login, existing access, and refresh sessions without suspending the user's farms", async () => {
    const cast = await buildCast();
    const admin = await createSuperAdmin();
    const original = await prisma.user.findUniqueOrThrow({
      where: { id: cast.owner.userId },
    });
    const disabled = await request(testApp())
      .patch(`/api/v1/admin/users/${cast.owner.userId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "DISABLED" })
      .expect(200);
    expect(disabled.body.data).toMatchObject({
      role: "OWNER",
      status: "DISABLED",
      platformDisabled: true,
    });
    expect(disabled.body.data).not.toHaveProperty("passwordHash");
    await request(testApp())
      .get("/api/v1/auth/me")
      .set(auth(cast.owner.accessToken))
      .expect(403);
    await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: cast.owner.email, password: PASSWORD })
      .expect(403);
    await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", cast.owner.refreshCookie)
      .expect(401);
    expect(
      await prisma.refreshToken.count({
        where: { userId: cast.owner.userId, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      (await prisma.farm.findUniqueOrThrow({ where: { id: cast.farmId } }))
        .status,
    ).toBe("ACTIVE");
    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(cast.operatorPlain.accessToken))
      .expect(200);
    await request(testApp())
      .patch(`/api/v1/admin/users/${cast.owner.userId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "ACTIVE" })
      .expect(200);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: cast.owner.userId } }),
    ).toMatchObject({
      role: "OWNER",
      passwordHash: original.passwordHash,
      status: "ACTIVE",
      platformDisabled: false,
    });
    await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: cast.owner.email, password: PASSWORD })
      .expect(200);
    await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", cast.owner.refreshCookie)
      .expect(401);
    const audits = await prisma.auditLog.findMany({
      where: {
        action: "ADMIN_USER_STATUS_CHANGED",
        entityId: cast.owner.userId,
      },
    });
    expect(audits).toHaveLength(2);
    expect(audits[0]?.actorId).toBe(admin.userId);
  });

  it("prevents owners overriding platform bans and retains the ban through offboarding", async () => {
    const cast = await buildCast();
    const admin = await createSuperAdmin();
    const target = cast.operatorValve;
    await request(testApp())
      .patch(`/api/v1/admin/users/${target.userId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "DISABLED" })
      .expect(200);
    for (const status of ["ACTIVE", "INVITED"]) {
      await request(testApp())
        .patch(`/api/v1/farms/me/workers/${target.userId}`)
        .set(auth(cast.owner.accessToken))
        .send({ status, platformDisabled: false })
        .expect(409);
    }
    await request(testApp())
      .patch(`/api/v1/farms/me/workers/${target.userId}`)
      .set(auth(cast.owner.accessToken))
      .send({ name: "Renamed Worker", platformDisabled: false })
      .expect(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.userId } }))
        .platformDisabled,
    ).toBe(true);
    await request(testApp())
      .delete(`/api/v1/farms/me/workers/${target.userId}`)
      .set(auth(cast.owner.accessToken))
      .expect(204);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: target.userId } }),
    ).toMatchObject({
      farmId: null,
      platformDisabled: true,
      status: "DISABLED",
    });
    await request(testApp())
      .post("/api/v1/farms/me/workers/invite")
      .set(auth(cast.owner.accessToken))
      .send({ name: "Reinvite", email: target.email, type: "OPERATOR" })
      .expect(409);
    await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: target.email, password: PASSWORD })
      .expect(403);
  });

  it("restores worker access without changing role, farm membership, or valve permissions", async () => {
    const cast = await buildCast();
    const admin = await createSuperAdmin();
    const target = cast.operatorValve;
    await request(testApp())
      .patch(`/api/v1/admin/users/${target.userId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "DISABLED" })
      .expect(200);
    await request(testApp())
      .patch(`/api/v1/admin/users/${target.userId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "ACTIVE" })
      .expect(200);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: target.userId } }),
    ).toMatchObject({
      role: "WORKER",
      workerType: "OPERATOR",
      farmId: cast.farmId,
      valveControl: true,
      platformDisabled: false,
    });
    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(target.accessToken))
      .expect(200);
  });

  it("checks the platform flag even if a legacy status write leaves the account ACTIVE", async () => {
    const owner = await registerOwner();
    const admin = await createSuperAdmin();
    await prisma.user.update({
      where: { id: owner.userId },
      data: { platformDisabled: true },
    });
    await request(testApp())
      .get("/api/v1/auth/me")
      .set(auth(owner.accessToken))
      .expect(403);
    await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: owner.email, password: PASSWORD })
      .expect(403);
    await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", owner.refreshCookie)
      .expect(403);
    const users = await request(testApp())
      .get("/api/v1/admin/users")
      .set(auth(admin.accessToken))
      .expect(200);
    expect(
      users.body.data.find((user: { id: string }) => user.id === owner.userId),
    ).toMatchObject({ status: "DISABLED", platformDisabled: true });
  });

  it("rejects self-disabling and protects the last active administrator", async () => {
    const admin = await createSuperAdmin();
    await request(testApp())
      .patch(`/api/v1/admin/users/${admin.userId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "DISABLED" })
      .expect(409);
    const inactive = await prisma.user.create({
      data: {
        email: "inactive.admin@test.dz",
        fullName: "Inactive Admin",
        passwordHash: "fixture",
        role: "SUPER_ADMIN",
        status: "DISABLED",
        platformDisabled: true,
      },
    });
    await expect(
      oversightService.setUserStatus(inactive.id, admin.userId, {
        status: "DISABLED",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } }),
    ).toMatchObject({ status: "ACTIVE", platformDisabled: false });
  });

  it("allows managing other administrators without granting them farm capabilities", async () => {
    const admin = await createSuperAdmin();
    const other = await createSuperAdmin();
    await request(testApp())
      .patch(`/api/v1/admin/users/${other.userId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "DISABLED" })
      .expect(200);
    await request(testApp())
      .get("/api/v1/admin/users")
      .set(auth(other.accessToken))
      .expect(403);
    await request(testApp())
      .patch(`/api/v1/admin/users/${other.userId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "ACTIVE" })
      .expect(200);
    await request(testApp())
      .get("/api/v1/admin/users")
      .set(auth(other.accessToken))
      .expect(200);
    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(other.accessToken))
      .expect(403);
  });

  it("can activate an invited account without changing its worker role", async () => {
    const cast = await buildCast();
    const admin = await createSuperAdmin();
    const response = await request(testApp())
      .patch(`/api/v1/admin/users/${cast.invited.userId}/status`)
      .set(auth(admin.accessToken))
      .send({ status: "ACTIVE" })
      .expect(200);
    expect(response.body.data).toMatchObject({
      role: "WORKER",
      status: "ACTIVE",
      farm: { id: cast.farmId },
    });
  });

  it.each([
    {},
    { status: "SUSPENDED" },
    { status: "INVITED" },
    { status: "ACTIVE", role: "SUPER_ADMIN" },
    { status: "ACTIVE", platformDisabled: false },
  ])("rejects invalid or overprivileged user updates: %j", async (input) => {
    const owner = await registerOwner();
    const admin = await createSuperAdmin();
    await request(testApp())
      .patch(`/api/v1/admin/users/${owner.userId}/status`)
      .set(auth(admin.accessToken))
      .send(input)
      .expect(400);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } }),
    ).toMatchObject({
      role: "OWNER",
      status: "ACTIVE",
      platformDisabled: false,
    });
  });

  it("returns 404 for unknown accounts", async () => {
    const admin = await createSuperAdmin();
    await request(testApp())
      .patch("/api/v1/admin/users/unknown/status")
      .set(auth(admin.accessToken))
      .send({ status: "DISABLED" })
      .expect(404);
  });
});

describe("oversight RBAC", () => {
  it("blocks anonymous callers and every farm role before parsing status updates", async () => {
    const cast = await buildCast();
    for (const caller of [
      null,
      cast.owner,
      cast.operatorValve,
      cast.operatorPlain,
      cast.engineer,
      cast.invited,
      cast.disabled,
    ]) {
      for (const resource of ["farms", "users"]) {
        const list = request(testApp()).get(`/api/v1/admin/${resource}`);
        const update = request(testApp())
          .patch(`/api/v1/admin/${resource}/unknown/status`)
          .send({});
        if (caller) {
          list.set(auth(caller.accessToken));
          update.set(auth(caller.accessToken));
        }
        await list.expect(caller ? 403 : 401);
        await update.expect(caller ? 403 : 401);
      }
    }
  });
});
