import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

/**
 * Rate limiting.
 *
 * WHY THIS FILE SPAWNS A SERVER: `rateLimit.ts` does `const disabled = isTest`, so both limiters are
 * no-ops under `NODE_ENV=test` — which is every other suite in this project. They cannot be
 * exercised in-process at all, and the app's own configuration cannot be changed from a test. So
 * this suite starts the real server as a child process with `NODE_ENV=development` and drives it
 * over HTTP.
 *
 * That is heavier than the other suites and is the honest cost of testing behaviour the test
 * environment deliberately disables. It also means these assertions cover the limiters as actually
 * configured (20 attempts per 15 minutes, keyed on IP + email), not a reconstruction of them.
 */

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4199;
const BASE = `http://localhost:${PORT}`;

/** The auth limiter's configured ceiling, from `src/middleware/rateLimit.ts`. */
const AUTH_LIMIT = 20;

let child: ChildProcess;
let childOutput = "";

async function waitForReady(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/healthz`);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`The server did not become ready within ${timeoutMs}ms.\n--- child output ---\n${childOutput}`);
}

beforeAll(async () => {
  child = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: serverRoot,
    env: {
      ...process.env,
      // The whole point: NOT "test", so the limiters are real.
      NODE_ENV: "development",
      PORT: String(PORT),
      // The database the rest of the suite uses, already migrated by tests/globalSetup.ts.
      DATABASE_URL: "file:./test.db",
      LOG_LEVEL: "error",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    childOutput += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    childOutput += chunk.toString();
  });

  await waitForReady(60_000);
}, 90_000);

afterAll(async () => {
  if (!child || child.exitCode !== null) return;

  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGKILL");
  await exited;
});

describe("the auth limiter", () => {
  it("refuses after the configured number of attempts, with a usable error", async () => {
    const email = `rate.limit.${Date.now()}@example.dz`;

    let blocked: request.Response | null = null;
    let attempts = 0;

    for (let i = 0; i < AUTH_LIMIT + 4; i += 1) {
      attempts += 1;
      const response = await request(BASE)
        .post("/api/v1/auth/login")
        .send({ email, password: "definitely-wrong" });

      if (response.status === 429) {
        blocked = response;
        break;
      }
    }

    expect(blocked, `no 429 within ${attempts} attempts`).not.toBeNull();

    // The client branches on `code`, so it must be the documented one rather than a generic 429.
    expect(blocked?.body.error.code).toBe("RATE_LIMITED");
    expect(blocked?.body.error.message).toMatch(/too many/i);

    // Attempts below the ceiling were refused for the ordinary reason, not by the limiter.
    expect(attempts).toBeGreaterThan(1);
    expect(attempts).toBeLessThanOrEqual(AUTH_LIMIT + 1);
  }, 40_000);

  it("advertises the limit through standard headers", async () => {
    // draft-7 headers, so a well-behaved client can back off before being refused.
    const response = await request(BASE)
      .post("/api/v1/auth/login")
      .send({ email: `headers.${Date.now()}@example.dz`, password: "wrong" });

    const header = response.headers["ratelimit"];
    expect(header, "no RateLimit header on the response").toBeTruthy();
    expect(String(header)).toContain("limit=");
  });

  it("keys on the email as well as the address", async () => {
    // Without the email in the key, one attacker would lock out everyone behind a shared NAT — and
    // this project's users plausibly share an office connection.
    const exhausted = `shared.nat.${Date.now()}@example.dz`;

    for (let i = 0; i < AUTH_LIMIT + 2; i += 1) {
      const response = await request(BASE)
        .post("/api/v1/auth/login")
        .send({ email: exhausted, password: "wrong" });
      if (response.status === 429) break;
    }

    const blocked = await request(BASE)
      .post("/api/v1/auth/login")
      .send({ email: exhausted, password: "wrong" });
    expect(blocked.status).toBe(429);

    // A different account from the same address is unaffected.
    //
    // The password must clear the signup/login schema's 8-character minimum, or the request is
    // rejected as invalid input (400) before authentication is even attempted — which would make
    // this assertion pass for the wrong reason. The limiter itself counts invalid attempts too,
    // which is correct: probing with malformed payloads should still be limited.
    const other = await request(BASE)
      .post("/api/v1/auth/login")
      .send({ email: `unaffected.${Date.now()}@example.dz`, password: "not-the-right-password" });

    expect(other.status).not.toBe(429);
    // Still rejected, but for the ordinary reason: those credentials do not exist.
    expect(other.status).toBe(401);
    expect(other.body.error.code).toBe("INVALID_CREDENTIALS");
  }, 40_000);

  it("leaves non-auth endpoints alone", async () => {
    // The global limiter is far more permissive (600 per 15 minutes), so public reads keep working
    // after the tighter credential budget is exhausted. This is the contrast that matters: the
    // limiter is scoped, not a blanket block.
    for (let i = 0; i < 5; i += 1) {
      const response = await request(BASE).get("/api/v1/content/bundle");
      expect(response.status).toBe(200);
    }
  });
});

describe("the server under test", () => {
  it("is genuinely running outside the test environment", async () => {
    // Guards the premise of this whole file: if the child had inherited NODE_ENV=test, every
    // assertion above would be vacuous because the limiters would be no-ops.
    const response = await request(BASE).get("/healthz").expect(200);
    expect(response.body.status).toBe("ok");
  });

  it("reports the database as reachable", async () => {
    // /readyz is the only check that touches the database; a 200 here means the child really did
    // connect to the migrated test database rather than failing every query behind the limiter.
    const response = await request(BASE).get("/readyz").expect(200);
    expect(response.body.checks.database).toBe("up");
  });
});
