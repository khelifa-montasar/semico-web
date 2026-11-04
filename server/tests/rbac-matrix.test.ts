import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { createSuperAdmin, registerOwner, resetDatabase, testApp, type SuperAdminUser } from "./helpers/api.js";
import { buildCast, type Cast } from "./helpers/roles.js";

/**
 * The RBAC matrix.
 *
 * Every access class crossed with every role, asserted as exact status codes. Individual suites
 * already test specific rules; this proves there are no HOLES — an endpoint that quietly became
 * reachable, or one that started refusing a role it used to serve.
 *
 * The whole matrix is how the two role bugs in this codebase were found: `ownedFarm` broke owners on
 * every farm route, and a router-level `requireOwner` broke workers on all of them. Both were
 * invisible from a single-role test, and both show up instantly in a table like this.
 *
 * Fixtures are built ONCE. A cast costs six argon2 registrations, and re-building it per row would
 * turn a few seconds into minutes. Every endpoint in the matrix is therefore non-destructive:
 * anything that mutates the farm's identity (rotating the owner code, removing a worker) is covered
 * separately, below.
 */

type RoleKey =
  | "anonymous"
  | "superAdmin"
  | "owner"
  | "operatorValve"
  | "operatorPlain"
  | "engineer"
  | "invited"
  | "disabled";

type Access = "public" | "authenticated" | "member" | "valve" | "owner" | "export" | "admin";

interface Endpoint {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  access: Access;
  body?: unknown;
  /** Overrides for endpoints whose success code is not 200. */
  okByRole?: Partial<Record<RoleKey, number>>;
}

const ALL_ROLES: RoleKey[] = [
  "anonymous",
  "superAdmin",
  "owner",
  "operatorValve",
  "operatorPlain",
  "engineer",
  "invited",
  "disabled",
];

/** Status each access class yields per role, before per-endpoint overrides. */
const EXPECTED: Record<Access, Record<RoleKey, number>> = {
  // Public content. Even a disabled account may read it — it needs no session at all.
  public: {
    anonymous: 200,
    superAdmin: 200,
    owner: 200,
    operatorValve: 200,
    operatorPlain: 200,
    engineer: 200,
    invited: 200,
    disabled: 200,
  },
  // Needs a valid session, and nothing more. A disabled account is refused at the door.
  authenticated: {
    anonymous: 401,
    superAdmin: 200,
    owner: 200,
    operatorValve: 200,
    operatorPlain: 200,
    engineer: 200,
    invited: 200,
    disabled: 403,
  },
  // Needs membership of an ACTIVE farm. An INVITED account authenticates but is not a member yet.
  member: {
    anonymous: 401,
    superAdmin: 403,
    owner: 200,
    operatorValve: 200,
    operatorPlain: 200,
    engineer: 200,
    invited: 403,
    disabled: 403,
  },
  // The valve capability: only the owner, or an operator who has been granted it.
  valve: {
    anonymous: 401,
    superAdmin: 403,
    owner: 201,
    operatorValve: 201,
    operatorPlain: 403,
    engineer: 403,
    invited: 403,
    disabled: 403,
  },
  // Administration: role, not capability. An operator with valve control is still not an admin.
  owner: {
    anonymous: 401,
    superAdmin: 403,
    owner: 200,
    operatorValve: 403,
    operatorPlain: 403,
    engineer: 403,
    invited: 403,
    disabled: 403,
  },
  // Data export: the owner and engineers. An OPERATOR may read the same charts on screen but may
  // not take the dataset away — that is the capability separating the two worker types.
  export: {
    anonymous: 401,
    superAdmin: 403,
    owner: 200,
    operatorValve: 403,
    operatorPlain: 403,
    engineer: 200,
    invited: 403,
    disabled: 403,
  },
  // Platform administration is exclusive to active super admins.
  admin: {
    anonymous: 401,
    superAdmin: 200,
    owner: 403,
    operatorValve: 403,
    operatorPlain: 403,
    engineer: 403,
    invited: 403,
    disabled: 403,
  },
};

const MATRIX: Endpoint[] = [
  { method: "get", path: "/api/v1/admin/stats", access: "admin" },
  { method: "get", path: "/api/v1/admin/farms", access: "admin" },
  { method: "get", path: "/api/v1/admin/users", access: "admin" },
  { method: "patch", path: "/api/v1/admin/farms/FARM_ID/status", access: "admin", body: { status: "ACTIVE" } },
  { method: "patch", path: "/api/v1/admin/users/TARGET/status", access: "admin", body: { status: "ACTIVE" } },
  { method: "get", path: "/api/v1/admin/pricing", access: "admin" },
  { method: "get", path: "/api/v1/admin/pricing/PRICING_ID", access: "admin" },
  { method: "get", path: "/api/v1/admin/blog", access: "admin" },
  { method: "get", path: "/api/v1/admin/blog/POST_ID", access: "admin" },
  {
    method: "post", path: "/api/v1/admin/pricing", access: "admin",
    body: { nameEn: "Matrix plan", nameAr: "خطة المصفوفة", price: 1000 },
    okByRole: { superAdmin: 201 },
  },
  {
    method: "post", path: "/api/v1/admin/blog", access: "admin",
    body: { slug: "matrix-content-post", titleEn: "Matrix post", titleAr: "مقال المصفوفة", bodyEn: "Content", bodyAr: "المحتوى" },
    okByRole: { superAdmin: 201 },
  },
  {
    method: "patch", path: "/api/v1/admin/pricing/PRICING_ID", access: "admin",
    body: { isActive: false },
  },
  {
    method: "patch", path: "/api/v1/admin/blog/POST_ID", access: "admin",
    body: { published: false },
  },
  { method: "get", path: "/api/v1/content/pricing-plans", access: "public" },
  // ── public ────────────────────────────────────────────────────────────────
  { method: "get", path: "/api/v1/content/bundle", access: "public" },
  { method: "get", path: "/api/v1/reference/wilayas", access: "public" },
  { method: "get", path: "/api/v1/bookings/availability", access: "public" },
  {
    method: "post",
    path: "/api/v1/leads",
    access: "public",
    body: { name: "Matrix Lead", email: "matrix.lead@example.dz" },
    okByRole: { anonymous: 201, superAdmin: 201, owner: 201, operatorValve: 201, operatorPlain: 201, engineer: 201, invited: 201, disabled: 201 },
  },

  // ── any valid session ─────────────────────────────────────────────────────
  { method: "get", path: "/api/v1/auth/me", access: "authenticated" },
  { method: "get", path: "/api/v1/users/me", access: "authenticated" },

  // ── farm membership ───────────────────────────────────────────────────────
  { method: "get", path: "/api/v1/farms/me", access: "member" },
  { method: "get", path: "/api/v1/farms/me/settings", access: "member" },
  { method: "get", path: "/api/v1/farms/me/zones", access: "member" },
  { method: "get", path: "/api/v1/farms/me/telemetry", access: "member" },
  { method: "get", path: "/api/v1/farms/me/telemetry/latest", access: "member" },
  { method: "get", path: "/api/v1/farms/me/system-health", access: "member" },
  { method: "get", path: "/api/v1/farms/me/sensors", access: "member" },
  { method: "get", path: "/api/v1/farms/me/activity", access: "member" },
  { method: "get", path: "/api/v1/farms/me/activity/calendar", access: "member" },
  { method: "get", path: "/api/v1/farms/me/analytics/overview", access: "member" },
  { method: "get", path: "/api/v1/farms/me/analytics/flow", access: "member" },
  { method: "get", path: "/api/v1/farms/me/analytics/moisture", access: "member" },
  { method: "get", path: "/api/v1/farms/me/analytics/heatmap", access: "member" },
  { method: "get", path: "/api/v1/farms/me/irrigation/commands", access: "member" },

  // ── export capability ─────────────────────────────────────────────────────
  { method: "get", path: "/api/v1/farms/me/analytics/export", access: "export" },

  // ── the owner's farms themselves ──────────────────────────────────────────
  { method: "get", path: "/api/v1/farms", access: "owner" },
  {
    method: "post",
    path: "/api/v1/farms",
    access: "owner",
    body: { name: "Matrix Second Farm" },
    okByRole: {
      anonymous: 401,
      owner: 201,
      operatorValve: 403,
      operatorPlain: 403,
      engineer: 403,
      invited: 403,
      disabled: 403,
    },
  },

  // ── valve capability ──────────────────────────────────────────────────────
  {
    method: "post",
    path: "/api/v1/farms/me/irrigation/irrigate",
    access: "valve",
    body: { durationMin: 5 },
  },
  {
    method: "post",
    path: "/api/v1/farms/me/irrigation/valve",
    access: "valve",
    body: { action: "CLOSE" },
  },

  // ── owner only ────────────────────────────────────────────────────────────
  { method: "get", path: "/api/v1/farms/me/workers", access: "owner" },
  { method: "get", path: "/api/v1/farms/me/audit", access: "owner" },
  { method: "get", path: "/api/v1/leads", access: "owner" },
  { method: "get", path: "/api/v1/bookings", access: "owner" },
  {
    method: "patch",
    path: "/api/v1/farms/me/settings",
    access: "owner",
    body: { moistureThreshold: 45 },
  },
  {
    method: "patch",
    path: "/api/v1/farms/me/boundary",
    access: "owner",
    body: {
      boundary: [
        [36.7162, 3.1849],
        [36.7163, 3.1849],
        [36.7163, 3.185],
      ],
    },
  },
  {
    method: "post",
    path: "/api/v1/farms/me/workers/invite",
    access: "owner",
    body: { name: "Matrix Invite", email: "matrix.invite@example.dz", type: "ENGINEER", grantValve: false },
    okByRole: {
      anonymous: 401,
      owner: 201,
      operatorValve: 403,
      operatorPlain: 403,
      engineer: 403,
      invited: 403,
      disabled: 403,
    },
  },
  {
    method: "patch",
    path: "/api/v1/farms/me/workers/TARGET",
    access: "owner",
    body: { name: "Renamed By Matrix" },
  },
  {
    method: "patch",
    path: "/api/v1/farms/me/workers/TARGET/valve-control",
    access: "owner",
    body: { granted: true },
  },
  {
    method: "post",
    path: "/api/v1/farms/me/workers/TARGET/reset-password",
    access: "owner",
  },
];

let cast: Cast;
let superAdmin: SuperAdminUser;
let pricingId: string;
let postId: string;
/**
 * A throwaway worker the matrix's writes target, so no role's own account is altered.
 *
 * OPERATOR, not ENGINEER: the API refuses to grant valve control to an engineer (400), because the
 * capability guard would never honour it. The matrix's `valve-control` row therefore needs a target
 * whose type can actually hold the permission — the refusal itself is asserted separately below.
 */
let targetId: string;

beforeAll(async () => {
  await resetDatabase();
  cast = await buildCast("Matrix Farm");
  superAdmin = await createSuperAdmin();
  pricingId = (await prisma.pricingPlan.create({ data: { nameEn: "Plan", nameAr: "الخطة", price: 1 } })).id;
  postId = (await prisma.blogPost.create({ data: {
    slug: `matrix-fixture-${randomUUID()}`, titleEn: "Post", titleAr: "المقال", bodyEn: "Content", bodyAr: "المحتوى",
    excerptEn: "", excerptAr: "", category: "GUIDES", publishedAt: new Date(),
  } })).id;

  const target = await prisma.user.create({
    data: {
      email: `matrix.target.${randomUUID().slice(0, 8)}@test.dz`,
      // Never logs in, so the hash is irrelevant — but it must be present.
      passwordHash: "not-a-real-hash",
      fullName: "Matrix Target",
      role: "WORKER",
      workerType: "OPERATOR",
      status: "ACTIVE",
      farmId: cast.farmId,
    },
  });
  targetId = target.id;
});

function tokenFor(role: RoleKey): string | null {
  switch (role) {
    case "anonymous":
      return null;
    case "superAdmin":
      return superAdmin.accessToken;
    case "owner":
      return cast.owner.accessToken;
    case "operatorValve":
      return cast.operatorValve.accessToken;
    case "operatorPlain":
      return cast.operatorPlain.accessToken;
    case "engineer":
      return cast.engineer.accessToken;
    case "invited":
      return cast.invited.accessToken;
    case "disabled":
      return cast.disabled.accessToken;
  }
}

async function call(endpoint: Endpoint, role: RoleKey): Promise<number> {
  const path = endpoint.path.replace("TARGET", targetId).replace("PRICING_ID", pricingId).replace("POST_ID", postId).replace("FARM_ID", cast.farmId);
  const token = tokenFor(role);

  const test = request(testApp())[endpoint.method](path);
  if (token) test.set("Authorization", `Bearer ${token}`);
  if (endpoint.body !== undefined) test.send(endpoint.body as object);

  const response = await test;
  return response.status;
}

describe("the matrix", () => {
  for (const endpoint of MATRIX) {
    it(`${endpoint.method.toUpperCase()} ${endpoint.path} (${endpoint.access})`, async () => {
      for (const role of ALL_ROLES) {
        const expected = endpoint.okByRole?.[role] ?? EXPECTED[endpoint.access][role];
        const actual = await call(endpoint, role);

        // The message names the role, so a failure says who was wrongly allowed or refused.
        expect(actual, `${role} → ${endpoint.method.toUpperCase()} ${endpoint.path}`).toBe(expected);
      }
    });
  }
});

describe("platform admin namespace", () => {
  for (const method of ["get", "post", "patch", "delete"] as const) {
    for (const path of ["/api/v1/admin", "/api/v1/admin/dashboard", "/api/v1/admin/pricing/unknown"] as const) {
      it(`${method.toUpperCase()} ${path} rejects every farm role`, async () => {
        for (const role of ALL_ROLES) {
          expect(await call({ method, path, access: "admin", body: method === "patch" ? { isActive: false } : undefined }, role), `${role} → ${method.toUpperCase()} ${path}`)
            .toBe(role === "superAdmin" ? 404 : EXPECTED.admin[role]);
        }
      });
    }
  }
});

describe("destructive owner-only actions", () => {
  // Kept out of the matrix because they change the fixture: rotating the owner code would break any
  // later worker signup, and removing a worker would empty a role.
  beforeEach(resetDatabase);

  it("lets only the owner rotate the owner code, and invalidates the old one", async () => {
    const owner = await registerOwner();
    const staleCode = owner.ownerCode;

    await request(testApp())
      .post("/api/v1/farms/me/owner-code/rotate")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(200);

    const farm = await prisma.farm.findUniqueOrThrow({ where: { id: owner.farmId } });
    expect(farm.ownerCode).not.toBe(staleCode);
    expect(farm.ownerCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    // A worker presenting the old code is refused from now on.
    const response = await request(testApp())
      .post("/api/v1/auth/register")
      .send({
        fullName: "Stale Code",
        email: "stale@example.dz",
        password: "Semico2026!",
        role: "WORKER",
        ownerCode: staleCode,
      })
      .expect(400);
    expect(response.body.error.code).toBe("INVALID_OWNER_CODE");
  });

  it("refuses to rotate the code for a non-owner", async () => {
    const castForThisTest = await buildCast();

    for (const user of [castForThisTest.operatorValve, castForThisTest.engineer]) {
      await request(testApp())
        .post("/api/v1/farms/me/owner-code/rotate")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(403);
    }
  });

  it("removes a worker for the owner, and refuses every other role", async () => {
    const castForThisTest = await buildCast();

    const spare = async () =>
      prisma.user.create({
        data: {
          email: `spare.${randomUUID().slice(0, 8)}@test.dz`,
          passwordHash: "not-a-real-hash",
          fullName: "Spare Worker",
          role: "WORKER",
          workerType: "ENGINEER",
          status: "ACTIVE",
          farmId: castForThisTest.farmId,
        },
      });

    // Non-owners are refused before they can touch anything.
    for (const user of [
      castForThisTest.operatorValve,
      castForThisTest.operatorPlain,
      castForThisTest.engineer,
    ]) {
      const victim = await spare();
      await request(testApp())
        .delete(`/api/v1/farms/me/workers/${victim.id}`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(403);

      // And the worker is untouched.
      const stillThere = await prisma.user.findUnique({ where: { id: victim.id } });
      expect(stillThere).not.toBeNull();
    }

    // The owner may.
    const target = await spare();
    await request(testApp())
      .delete(`/api/v1/farms/me/workers/${target.id}`)
      .set("Authorization", `Bearer ${castForThisTest.owner.accessToken}`)
      .expect(204);
  });
});

describe("capability depends on the worker's TYPE, not just the grant", () => {
  beforeEach(resetDatabase);

  it("refuses to grant valve control to an engineer", async () => {
    const castForThisTest = await buildCast();

    const response = await request(testApp())
      .patch(`/api/v1/farms/me/workers/${castForThisTest.engineer.userId}/valve-control`)
      .set("Authorization", `Bearer ${castForThisTest.owner.accessToken}`)
      .send({ granted: true })
      .expect(400);

    // Granting it would create a state the capability guard does not honour, which would look like a
    // bug from the owner's side.
    expect(response.body.error.code).toBe("VALIDATION_FAILED");

    const unchanged = await prisma.user.findUniqueOrThrow({
      where: { id: castForThisTest.engineer.userId },
    });
    expect(unchanged.valveControl).toBe(false);
  });

  it("revokes an operator's valve control, and the operator is refused immediately", async () => {
    const castForThisTest = await buildCast();

    // Granted in the fixture, so the operator can irrigate to begin with.
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set("Authorization", `Bearer ${castForThisTest.operatorValve.accessToken}`)
      .send({ durationMin: 5 })
      .expect(201);

    await request(testApp())
      .patch(`/api/v1/farms/me/workers/${castForThisTest.operatorValve.userId}/valve-control`)
      .set("Authorization", `Bearer ${castForThisTest.owner.accessToken}`)
      .send({ granted: false })
      .expect(200);

    // Same token, no re-login — the permission is read from the database on every request.
    await request(testApp())
      .post("/api/v1/farms/me/irrigation/irrigate")
      .set("Authorization", `Bearer ${castForThisTest.operatorValve.accessToken}`)
      .send({ durationMin: 5 })
      .expect(403);
  });
});
