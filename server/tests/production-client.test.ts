import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";

const html =
  "<!doctype html><html><head><title>Semico</title></head><body>Production client fixture</body></html>";
let directory: string;
beforeAll(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "semico-client-"));
  mkdirSync(path.join(directory, "assets"));
  mkdirSync(path.join(directory, "api/v1"), { recursive: true });
  writeFileSync(path.join(directory, "index.html"), html);
  writeFileSync(path.join(directory, "assets/app.js"), "window.semico=true;");
  writeFileSync(
    path.join(directory, "api/v1/shadow.txt"),
    "Must never be served as an API route",
  );
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const application = () =>
  createApp({ serveClient: true, clientDirectory: directory });

describe("production same-origin client hosting", () => {
  it.each([
    "/",
    "/login",
    "/services",
    "/dashboard/diagnostics",
    "/admin/dashboard",
  ])("serves the SPA shell for %s", async (route) => {
    const response = await request(application())
      .get(route)
      .set("Accept", "text/html")
      .expect(200);
    expect(response.text).toBe(html);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("serves static assets with immutable caching", async () => {
    const response = await request(application())
      .get("/assets/app.js")
      .expect(200);
    expect(response.text).toBe("window.semico=true;");
    expect(response.headers["cache-control"]).toContain("immutable");
  });

  it.each([
    "/assets/missing.js",
    "/assets/missing",
    "/missing.css",
    "/api/v1/missing",
    "/api/v1/shadow.txt",
    "/readyz/missing",
  ])("does not mask missing assets or API paths: %s", async (route) => {
    const response = await request(application())
      .get(route)
      .set("Accept", "text/html")
      .expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.text).not.toBe(html);
  });

  it("preserves authentication and health endpoints", async () => {
    await request(application())
      .get("/api/v1/admin/stats")
      .set("Accept", "text/html")
      .expect(401);
    const health = await request(application())
      .get("/api/v1/health")
      .expect(200);
    expect(health.body.data.status).toBe("ok");
    await request(application()).get("/healthz").expect(200);
    await request(application()).get("/readyz").expect(200);
  });

  it("permits the existing map, weather, font, and secure WebSocket integrations in CSP", async () => {
    const response = await request(application()).get("/").expect(200);
    const policy = response.headers["content-security-policy"];
    expect(policy).toContain("img-src 'self' data: https:");
    expect(policy).toContain("https://fonts.googleapis.com");
    expect(policy).toContain("https://fonts.gstatic.com");
    expect(policy).toContain("https://api.open-meteo.com");
    expect(policy).toContain("wss:");
    expect(policy).toContain("script-src 'self'");
  });

  it("keeps the API-only default unchanged", async () => {
    await request(createApp()).get("/").expect(404);
  });

  it("fails early when a configured client build is missing", () => {
    expect(() =>
      createApp({
        serveClient: true,
        clientDirectory: path.join(directory, "missing"),
      }),
    ).toThrow("Client build is missing");
  });
});
