import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import {
  auth,
  extractRefreshCookie,
  login,
  PASSWORD,
  registerOwner,
  registerWorker,
  resetDatabase,
  setCookieList,
  testApp,
  unusedOwnerCode,
} from "./helpers/api.js";

/**
 * Authentication.
 *
 * Covers the paths where a mistake is a security bug rather than a broken screen: credential
 * checking, the owner-code join, and refresh-token rotation with reuse detection.
 */

beforeEach(resetDatabase);

describe("POST /auth/register", () => {
  it("creates an owner together with a farm, settings and zones", async () => {
    const response = await request(testApp())
      .post("/api/v1/auth/register")
      .send({
        fullName: "Amine Belkacem",
        email: "amine@test.dz",
        password: PASSWORD,
        role: "OWNER",
        farmName: "Ferme des Oliviers",
      })
      .expect(201);

    expect(response.body.data.user).toMatchObject({
      role: "OWNER",
      farmName: "Ferme des Oliviers",
      initials: "AB",
    });
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.expiresIn).toBeGreaterThan(0);

    // The password hash must never appear in a response, in any form.
    expect(JSON.stringify(response.body)).not.toContain("argon2");

    const farm = await prisma.farm.findFirstOrThrow({
      where: { ownerId: response.body.data.user.id },
      include: { settings: true, zones: true, deviceStatus: true },
    });
    expect(farm.ownerCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(farm.settings).not.toBeNull();
    expect(farm.deviceStatus).not.toBeNull();
    // Registration seeds a few zones so the dashboard is not empty on first sign-in.
    expect(farm.zones.length).toBeGreaterThan(0);
  });

  it("sets an httpOnly, path-scoped refresh cookie", async () => {
    const response = await request(testApp())
      .post("/api/v1/auth/register")
      .send({ fullName: "Cookie Test", email: "cookie@test.dz", password: PASSWORD, role: "OWNER" })
      .expect(201);

    const raw = setCookieList(response.headers).join(";");
    expect(raw).toContain("semico_refresh=");
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("SameSite=Lax");
    // Scoped to the auth routes so it is not attached to every API call.
    expect(raw).toContain("Path=/api/v1/auth");
  });

  it("rejects a duplicate email", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/auth/register")
      .send({ fullName: "Copycat", email: owner.email, password: PASSWORD, role: "OWNER" })
      .expect(409);

    expect(response.body.error.code).toBe("EMAIL_IN_USE");
  });

  it("rejects a password that is too short, with field-level detail", async () => {
    const response = await request(testApp())
      .post("/api/v1/auth/register")
      .send({ fullName: "Short Pass", email: "short@test.dz", password: "abc", role: "OWNER" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details).toHaveProperty("password");
  });

  describe("worker join by owner code", () => {
    it("attaches the worker to the owner's farm", async () => {
      const owner = await registerOwner();
      const worker = await registerWorker(owner.ownerCode, "OPERATOR");

      expect(worker.farmId).toBe(owner.farmId);

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: worker.userId } });
      expect(stored.role).toBe("WORKER");
      expect(stored.workerType).toBe("OPERATOR");
      // Signing up with a valid code must NEVER hand over valve control implicitly.
      expect(stored.valveControl).toBe(false);
    });

    it("rejects an unrecognised code with a specific error code", async () => {
      const response = await request(testApp())
        .post("/api/v1/auth/register")
        .send({
          fullName: "Lost Worker",
          email: "lost@test.dz",
          password: PASSWORD,
          role: "WORKER",
          workerType: "ENGINEER",
          ownerCode: unusedOwnerCode(),
        })
        .expect(400);

      // A distinct code, not a generic 400 — users mistype this constantly and need to be told
      // which field is wrong.
      expect(response.body.error.code).toBe("INVALID_OWNER_CODE");
      expect(response.body.error.details).toHaveProperty("ownerCode");
    });

    it("requires a code for workers", async () => {
      const response = await request(testApp())
        .post("/api/v1/auth/register")
        .send({
          fullName: "No Code",
          email: "nocode@test.dz",
          password: PASSWORD,
          role: "WORKER",
          workerType: "ENGINEER",
        })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects an owner supplying a code", async () => {
      const owner = await registerOwner();

      const response = await request(testApp())
        .post("/api/v1/auth/register")
        .send({
          fullName: "Confused Owner",
          email: "confused@test.dz",
          password: PASSWORD,
          role: "OWNER",
          ownerCode: owner.ownerCode,
        })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });
  });
});

describe("POST /auth/login", () => {
  it("returns a session for correct credentials", async () => {
    const owner = await registerOwner();
    const session = await login(owner.email);

    expect(session.accessToken).toBeTruthy();
    expect(session.refreshCookie).toContain("semico_refresh=");
  });

  it("rejects a wrong password", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: owner.email, password: "definitely-not-it" })
      .expect(401);

    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns the SAME error for an unknown email as for a wrong password", async () => {
    const response = await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: "nobody@test.dz", password: PASSWORD })
      .expect(401);

    // Identical code and message: the response must not reveal whether an account exists.
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(response.body.error.message).toBe("Incorrect email or password");
  });
});

describe("refresh token rotation", () => {
  it("issues a new token and invalidates the presented one", async () => {
    const owner = await registerOwner();

    const refreshed = await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", owner.refreshCookie)
      .expect(200);

    const rotated = extractRefreshCookie(refreshed.headers["set-cookie"]);
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(owner.refreshCookie);
    expect(refreshed.body.data.accessToken).toBeTruthy();

    // The new token works.
    await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", rotated)
      .expect(200);
  });

  it("revokes the whole family when a rotated token is replayed", async () => {
    const owner = await registerOwner();

    const first = await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", owner.refreshCookie)
      .expect(200);
    const rotated = extractRefreshCookie(first.headers["set-cookie"]);

    // Replaying the ORIGINAL token is the signature of a stolen token.
    const replay = await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", owner.refreshCookie)
      .expect(401);
    expect(replay.body.error.code).toBe("REFRESH_REUSE_DETECTED");

    // And the legitimate successor is now dead too — the whole family was revoked.
    await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", rotated)
      .expect(401);

    // The event is recorded for the owner's security review.
    const audit = await prisma.auditLog.findFirst({
      where: { action: "REFRESH_REUSE_DETECTED" },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects a request with no cookie", async () => {
    await request(testApp()).post("/api/v1/auth/refresh").expect(401);
  });
});

describe("GET /auth/me", () => {
  it("returns the caller's profile", async () => {
    const owner = await registerOwner();
    const session = await login(owner.email);

    const response = await request(testApp())
      .get("/api/v1/auth/me")
      .set(auth(session.accessToken))
      .expect(200);

    expect(response.body.data).toMatchObject({ role: "OWNER", email: owner.email });
    expect(response.body.data.farmId).toBe(owner.farmId);
  });

  it("rejects an unauthenticated request", async () => {
    await request(testApp()).get("/api/v1/auth/me").expect(401);
  });

  it("rejects a garbage token", async () => {
    await request(testApp())
      .get("/api/v1/auth/me")
      .set(auth("not.a.real.token"))
      .expect(401);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the refresh token and clears the cookie", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/auth/logout")
      .set("Cookie", owner.refreshCookie)
      .set(auth(owner.accessToken))
      .expect(204);

    // The cookie is cleared on the same path it was set with, or the browser keeps it.
    expect(setCookieList(response.headers).join(";")).toContain("Path=/api/v1/auth");

    // The session is genuinely dead server-side, not just forgotten by the client.
    await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", owner.refreshCookie)
      .expect(401);
  });
});
