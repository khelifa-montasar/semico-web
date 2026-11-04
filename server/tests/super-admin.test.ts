import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { seedSuperAdmin } from "../prisma/seeds/super-admin.js";
import { prisma } from "../src/db/prisma.js";
import { verifyPassword } from "../src/lib/password.js";
import { canAccessDiagnostics, canControlValves, canExportData, canReadFarm, isOwner, type AuthContext } from "../src/types/auth.js";
import { auth, createSuperAdmin, PASSWORD, registerOwner, resetDatabase, testApp } from "./helpers/api.js";
import { claimsOf } from "./helpers/roles.js";

beforeEach(resetDatabase);

describe("super admin provisioning", () => {
  it("creates an active admin with a hashed password and no farm, preserving existing users", async () => {
    const owner = await registerOwner();
    const result = await seedSuperAdmin(prisma, {
      email: "  ADMIN@EXAMPLE.DZ  ", password: PASSWORD, fullName: "Platform Admin",
    });
    expect(result.created).toBe(true);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: result.id }, include: { ownedFarms: true },
    });
    expect(stored).toMatchObject({
      email: "admin@example.dz", role: "SUPER_ADMIN", status: "ACTIVE",
      farmId: null, workerType: null, valveControl: false, ownedFarms: [],
    });
    expect(stored.passwordHash).not.toBe(PASSWORD);
    expect(await verifyPassword(stored.passwordHash, PASSWORD)).toBe(true);
    expect(await prisma.farm.count()).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } })).toMatchObject({ role: "OWNER" });
  });

  it("preserves the password and disabled status when repeated", async () => {
    const admin = await seedSuperAdmin(prisma, { password: PASSWORD });
    const stored = await prisma.user.update({ where: { id: admin.id }, data: { status: "DISABLED" } });
    expect(await seedSuperAdmin(prisma, { password: "DifferentPassword2026!" })).toEqual({
      ...admin, created: false,
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).toMatchObject({
      passwordHash: stored.passwordHash, status: "DISABLED", role: "SUPER_ADMIN",
    });
    expect(await prisma.user.count()).toBe(1);
  });

  it("refuses to promote an existing owner", async () => {
    const owner = await registerOwner();
    await expect(seedSuperAdmin(prisma, { email: owner.email, password: PASSWORD }))
      .rejects.toThrow("already belongs to another role");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } })).toMatchObject({ role: "OWNER" });
  });

  it("requires a valid password before creating any account", async () => {
    await expect(seedSuperAdmin(prisma, {})).rejects.toThrow();
    await expect(seedSuperAdmin(prisma, { password: "short" })).rejects.toThrow();
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("super admin authentication and separation", () => {
  it("logs in, refreshes, and reads its profile without a farm", async () => {
    const admin = await createSuperAdmin();
    expect(claimsOf(admin.accessToken)).toMatchObject({ sub: admin.userId, role: "SUPER_ADMIN" });
    for (const path of ["/api/v1/auth/me", "/api/v1/users/me"]) {
      const response = await request(testApp()).get(path).set(auth(admin.accessToken)).expect(200);
      expect(response.body.data).toMatchObject({
        role: "SUPER_ADMIN", farmId: null, farmName: null, workerType: null, valveControl: false,
      });
      expect(response.body.data).not.toHaveProperty("passwordHash");
    }
    const refreshed = await request(testApp()).post("/api/v1/auth/refresh")
      .set("Cookie", admin.refreshCookie).expect(200);
    expect(refreshed.body.data.user).toMatchObject({ id: admin.userId, role: "SUPER_ADMIN", farmId: null });
    await request(testApp()).get("/api/v1/admin/stats")
      .set(auth(refreshed.body.data.accessToken)).expect(200);
  });

  it("cannot create a super admin through public signup, even with a valid farm code", async () => {
    const owner = await registerOwner();
    for (const extra of [{}, { ownerCode: owner.ownerCode, workerType: "OPERATOR" }]) {
      const response = await request(testApp()).post("/api/v1/auth/register").send({
        fullName: "Untrusted Admin", email: "untrusted@example.dz", password: PASSWORD,
        role: "SUPER_ADMIN", ...extra,
      }).expect(400);
      expect(response.body.error.details).toHaveProperty("role");
    }
    expect(await prisma.user.count({ where: { role: "SUPER_ADMIN" } })).toBe(0);
  });

  it("ignores a selected farm header for platform requests without granting farm access", async () => {
    const owner = await registerOwner();
    const admin = await createSuperAdmin();
    await request(testApp()).get("/api/v1/admin/stats")
      .set(auth(admin.accessToken)).set("X-Farm-Id", owner.farmId).expect(200);
    await request(testApp()).get("/api/v1/farms/me")
      .set(auth(admin.accessToken)).set("X-Farm-Id", owner.farmId).expect(403);
  });

  it.each(["DISABLED", "INVITED"])("refuses a %s admin with an existing token", async (status) => {
    const admin = await createSuperAdmin();
    await prisma.user.update({ where: { id: admin.userId }, data: { status } });
    await request(testApp()).get("/api/v1/admin/stats").set(auth(admin.accessToken)).expect(403);
  });

  it("revokes platform access immediately when the database role changes", async () => {
    const admin = await createSuperAdmin();
    await prisma.user.update({ where: { id: admin.userId }, data: { role: "OWNER" } });
    await request(testApp()).get("/api/v1/admin/stats").set(auth(admin.accessToken)).expect(403);
  });

  it("rejects an unrecognized database role even with a valid token", async () => {
    const admin = await createSuperAdmin();
    await prisma.user.update({ where: { id: admin.userId }, data: { role: "UNKNOWN" } });
    await request(testApp()).get("/api/v1/auth/me").set(auth(admin.accessToken)).expect(403);
  });

  it("does not inherit farm capabilities from stale worker attributes", () => {
    const context: AuthContext = {
      userId: "admin", role: "SUPER_ADMIN", status: "ACTIVE", workerType: "OPERATOR",
      valveControl: true, farmId: "farm", farmName: "Farm", farmStatus: "ACTIVE", email: "admin@example.dz", fullName: "Admin",
    };
    expect(isOwner(context)).toBe(false);
    expect(canReadFarm(context)).toBe(false);
    expect(canControlValves(context)).toBe(false);
    expect(canExportData({ ...context, workerType: "ENGINEER" })).toBe(false);
    expect(canAccessDiagnostics({ ...context, workerType: "ENGINEER" })).toBe(false);
  });
});

describe("platform schema", () => {
  it("defaults a farm to ACTIVE and persists suspension", async () => {
    const owner = await registerOwner();
    expect(await prisma.farm.findUniqueOrThrow({ where: { id: owner.farmId } })).toMatchObject({ status: "ACTIVE" });
    await prisma.farm.update({ where: { id: owner.farmId }, data: { status: "SUSPENDED" } });
    expect(await prisma.farm.findUniqueOrThrow({ where: { id: owner.farmId } })).toMatchObject({ status: "SUSPENDED" });
  });

  it("persists a bilingual pricing plan and its defaults", async () => {
    const features = [{ en: "Farm monitoring", ar: "مراقبة المزرعة" }];
    const plan = await prisma.pricingPlan.create({
      data: { nameEn: "Farm", nameAr: "المزرعة", price: 2500.5, featuresJson: JSON.stringify(features) },
    });
    const stored = await prisma.pricingPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(stored).toMatchObject({ nameEn: "Farm", nameAr: "المزرعة", price: 2500.5, currency: "DZD", isActive: true });
    expect(JSON.parse(stored.featuresJson)).toEqual(features);
  });
});
