import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { SignJWT } from "jose";
import { prisma } from "../src/db/prisma.js";
import { auth, PASSWORD, registerOwner, resetDatabase, setCookieList, testApp } from "./helpers/api.js";
import { buildCast, claimsOf } from "./helpers/roles.js";

/**
 * Authentication edge cases.
 *
 * The existing `auth.test.ts` covers the happy paths and the main failure modes. This file goes
 * after the boundaries: what the token is allowed to carry, what happens at the exact limits, how
 * input is normalised, and the states an account can be in after a token has already been issued.
 */

// Mirrors tests/setup.ts. Known deliberately, so a token can be forged with an arbitrary expiry.
const ACCESS_SECRET = "test-access-secret-0123456789abcdefghijklmnop";

/** Signs an access token with a custom expiry, to reach the expired-token path. */
async function forgeToken(
  userId: string,
  options: { expiresIn: string; role?: string },
): Promise<string> {
  return new SignJWT({ role: options.role ?? "OWNER" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer("semico")
    .setAudience("semico-client")
    .setExpirationTime(options.expiresIn)
    .sign(new TextEncoder().encode(ACCESS_SECRET));
}

beforeEach(resetDatabase);

describe("what the access token is allowed to carry", () => {
  it("carries only the subject and the role", async () => {
    const owner = await registerOwner();
    const claims = claimsOf(owner.accessToken);

    expect(Object.keys(claims).sort()).toEqual(["aud", "exp", "iat", "iss", "role", "sub"]);
    expect(claims.role).toBe("OWNER");
    expect(claims.sub).toBe(owner.userId);
  });

  it("does NOT carry the farm, the worker type or the valve permission", async () => {
    // This is the load-bearing design decision: those three are re-read from the database on every
    // request, which is what makes revoking a permission take effect immediately rather than at
    // token expiry. Putting them in the token would be a silent security regression, so it is
    // asserted rather than assumed.
    const cast = await buildCast();
    const claims = claimsOf(cast.operatorValve.accessToken);

    expect(claims).not.toHaveProperty("farmId");
    expect(claims).not.toHaveProperty("workerType");
    expect(claims).not.toHaveProperty("valveControl");
    expect(claims).not.toHaveProperty("status");
    expect(JSON.stringify(claims)).not.toContain(cast.farmId);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const owner = await registerOwner();
    const forged = await new SignJWT({ role: "OWNER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(owner.userId)
      .setIssuedAt()
      .setIssuer("semico")
      .setAudience("semico-client")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-different-secret-entirely-0123456789"));

    await request(testApp()).get("/api/v1/auth/me").set(auth(forged)).expect(401);
  });

  it("rejects an expired token", async () => {
    const owner = await registerOwner();
    const expired = await forgeToken(owner.userId, { expiresIn: "-1s" });

    const response = await request(testApp())
      .get("/api/v1/auth/me")
      .set(auth(expired))
      .expect(401);

    expect(response.body.error.code).toBe("TOKEN_INVALID");
  });

  it("rejects a token whose subject no longer exists", async () => {
    const owner = await registerOwner();
    await prisma.user.delete({ where: { id: owner.userId } });

    // A deleted account must not keep working off an unexpired token.
    await request(testApp()).get("/api/v1/auth/me").set(auth(owner.accessToken)).expect(401);
  });

  it("rejects a tampered payload", async () => {
    const owner = await registerOwner();
    const [header, , signature] = owner.accessToken.split(".");
    // Re-encode the payload with a role it was never issued for.
    const tampered = Buffer.from(JSON.stringify({ sub: owner.userId, role: "OWNER", exp: 9_999_999_999 })).toString(
      "base64url",
    );

    await request(testApp())
      .get("/api/v1/auth/me")
      .set(auth(`${header}.${tampered}.${signature}`))
      .expect(401);
  });
});

describe("malformed Authorization headers", () => {
  const cases: Array<[string, string]> = [
    ["empty string", ""],
    ["scheme only", "Bearer"],
    ["wrong scheme", "Token abc.def.ghi"],
    ["bearer with no token", "Bearer "],
    ["basic auth", "Basic dXNlcjpwYXNz"],
    ["raw token, no scheme", "abc.def.ghi"],
  ];

  for (const [label, header] of cases) {
    it(`rejects ${label}`, async () => {
      await request(testApp()).get("/api/v1/auth/me").set("Authorization", header).expect(401);
    });
  }

  it("accepts a lowercase scheme", async () => {
    // The scheme is case-insensitive per RFC 7235; rejecting it would be a bug.
    const owner = await registerOwner();
    await request(testApp())
      .get("/api/v1/auth/me")
      .set("Authorization", `bearer ${owner.accessToken}`)
      .expect(200);
  });
});

describe("input normalisation", () => {
  it("normalises the email on registration and finds it on login", async () => {
    await request(testApp())
      .post("/api/v1/auth/register")
      .send({ fullName: "Case Test", email: "  Case.Test@Example.DZ  ", password: PASSWORD, role: "OWNER" })
      .expect(201);

    const stored = await prisma.user.findFirstOrThrow();
    expect(stored.email).toBe("case.test@example.dz");

    // And login reaches the same account whatever case is typed.
    await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: "CASE.TEST@EXAMPLE.DZ", password: PASSWORD })
      .expect(200);
  });

  it("treats a differently-cased email as a duplicate", async () => {
    // Without normalisation this would create a second account for the same person.
    await request(testApp())
      .post("/api/v1/auth/register")
      .send({ fullName: "First", email: "dup@example.dz", password: PASSWORD, role: "OWNER" })
      .expect(201);

    const response = await request(testApp())
      .post("/api/v1/auth/register")
      .send({ fullName: "Second", email: "DUP@EXAMPLE.DZ", password: PASSWORD, role: "OWNER" })
      .expect(409);

    expect(response.body.error.code).toBe("EMAIL_IN_USE");
  });

  it("accepts a lowercase owner code from a worker", async () => {
    const owner = await registerOwner();
    const lowercased = owner.ownerCode.toLowerCase();

    await request(testApp())
      .post("/api/v1/auth/register")
      .send({
        fullName: "Lowercase Joiner",
        email: "lower@example.dz",
        password: PASSWORD,
        role: "WORKER",
        workerType: "ENGINEER",
        ownerCode: lowercased,
      })
      .expect(201);
  });

  it("accepts an owner code with surrounding whitespace", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .post("/api/v1/auth/register")
      .send({
        fullName: "Padded Joiner",
        email: "padded@example.dz",
        password: PASSWORD,
        role: "WORKER",
        workerType: "ENGINEER",
        ownerCode: `  ${owner.ownerCode}  `,
      })
      .expect(201);
  });
});

describe("password boundaries", () => {
  it("rejects a password one character below the minimum", async () => {
    const response = await request(testApp())
      .post("/api/v1/auth/register")
      .send({ fullName: "Too Short", email: "short7@example.dz", password: "a".repeat(7), role: "OWNER" })
      .expect(400);

    expect(response.body.error.details).toHaveProperty("password");
  });

  it("accepts a password exactly at the minimum", async () => {
    await request(testApp())
      .post("/api/v1/auth/register")
      .send({ fullName: "Just Enough", email: "exact8@example.dz", password: "a".repeat(8), role: "OWNER" })
      .expect(201);
  });

  it("does not store the password in plaintext anywhere a response can reach", async () => {
    const response = await request(testApp())
      .post("/api/v1/auth/register")
      .send({ fullName: "Secret Keeper", email: "secret@example.dz", password: PASSWORD, role: "OWNER" })
      .expect(201);

    expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
    const stored = await prisma.user.findFirstOrThrow();
    expect(stored.passwordHash).not.toBe(PASSWORD);
    expect(stored.passwordHash.startsWith("$argon2")).toBe(true);
  });
});

describe("account states after a token was issued", () => {
  it("refuses a disabled account at login", async () => {
    const cast = await buildCast();

    const response = await request(testApp())
      .post("/api/v1/auth/login")
      .send({ email: cast.disabled.email, password: PASSWORD })
      .expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("refuses a disabled account holding a still-valid token", async () => {
    const cast = await buildCast();

    await request(testApp())
      .get("/api/v1/auth/me")
      .set(auth(cast.disabled.accessToken))
      .expect(403);
  });

  it("refuses to refresh a disabled account, and revokes its family", async () => {
    const cast = await buildCast();

    await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", cast.disabled.refreshCookie)
      .expect(403);

    // The refresh must not leave a usable token behind.
    const live = await prisma.refreshToken.count({
      where: { userId: cast.disabled.userId, revokedAt: null },
    });
    expect(live).toBe(0);
  });

  it("refuses an invited account the farm-scoped routes, though it may authenticate", async () => {
    const cast = await buildCast();

    // requireAuth accepts anything that is not DISABLED, so the invited account authenticates…
    await request(testApp())
      .get("/api/v1/auth/me")
      .set(auth(cast.invited.accessToken))
      .expect(200);

    // …but requireFarmAccess needs an ACTIVE account, so farm data stays out of reach.
    await request(testApp())
      .get("/api/v1/farms/me")
      .set(auth(cast.invited.accessToken))
      .expect(403);
  });
});

describe("refresh token handling", () => {
  it("rejects a refresh with no cookie at all", async () => {
    await request(testApp()).post("/api/v1/auth/refresh").expect(401);
  });

  it("rejects a refresh token that was never issued", async () => {
    await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", "semico_refresh=not-a-real-token")
      .expect(401);
  });

  it("does not accept one user's refresh token as another's session", async () => {
    const cast = await buildCast();

    // A refresh cookie belonging to B, presented with... nothing else: the cookie IS the credential,
    // so the test is that it issues a session for its owner and not someone else.
    const refreshed = await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", cast.operatorPlain.refreshCookie)
      .expect(200);

    expect(refreshed.body.data.user.id).toBe(cast.operatorPlain.userId);
    expect(refreshed.body.data.user.id).not.toBe(cast.owner.userId);
  });

  it("stops working after logout", async () => {
    const owner = await registerOwner();

    await request(testApp())
      .post("/api/v1/auth/logout")
      .set("Cookie", owner.refreshCookie)
      .set(auth(owner.accessToken))
      .expect(204);

    await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", owner.refreshCookie)
      .expect(401);
  });

  it("requires authentication to log out", async () => {
    await request(testApp()).post("/api/v1/auth/logout").expect(401);
  });

  it("revokes the whole family when one rotation is replayed", async () => {
    // Two presenters of the same token is the signature of a stolen one, so the safe response is to
    // kill the family — including the token the legitimate client is holding.
    const owner = await registerOwner();

    const first = await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", owner.refreshCookie)
      .expect(200);
    // `setCookieList` normalises the header: supertest types it as a string but returns an array.
    const rotated = setCookieList(first.headers).find((cookie) =>
      cookie.startsWith("semico_refresh="),
    );

    const replay = await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", owner.refreshCookie)
      .expect(401);
    expect(replay.body.error.code).toBe("REFRESH_REUSE_DETECTED");

    // The successor is dead too.
    await request(testApp())
      .post("/api/v1/auth/refresh")
      .set("Cookie", rotated?.split(";")[0] ?? "")
      .expect(401);
  });
});

describe("worker registration via owner code", () => {
  it("defaults an unspecified worker type to ENGINEER, never to an operator", async () => {
    // A signup that forgets the type must not land with a capability it did not ask for.
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/auth/register")
      .send({
        fullName: "No Type Given",
        email: "notype@example.dz",
        password: PASSWORD,
        role: "WORKER",
        ownerCode: owner.ownerCode,
      })
      .expect(201);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: response.body.data.user.id } });
    expect(stored.workerType).toBe("ENGINEER");
    expect(stored.valveControl).toBe(false);
  });

  it("never grants valve control at signup, whatever the payload asks for", async () => {
    const owner = await registerOwner();

    const response = await request(testApp())
      .post("/api/v1/auth/register")
      .send({
        fullName: "Optimistic Worker",
        email: "optimist@example.dz",
        password: PASSWORD,
        role: "WORKER",
        workerType: "OPERATOR",
        ownerCode: owner.ownerCode,
        valveControl: true,
      })
      .expect(201);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: response.body.data.user.id } });
    expect(stored.valveControl).toBe(false);
  });
});
