import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import console from "node:console";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH ?? path.join(root, "server/.env"),
});
process.env.NODE_ENV ??= "production";
process.env.SERVE_CLIENT ??= "true";

function runScript(filename, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [filename, ...args], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Production setup failed with exit code ${code}`)),
    );
  });
}

async function start() {
  const azure = Boolean(process.env.WEBSITE_SITE_NAME);
  if (!process.env.DATABASE_URL && azure)
    process.env.DATABASE_URL = "file:/home/semico-data/semico.db";
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith("file:"))
    throw new Error(
      "Configure DATABASE_URL for the project's SQLite database.",
    );
  const [filename, ...parameters] = databaseUrl.slice(5).split("?");
  const database = path.isAbsolute(filename)
    ? path.resolve(filename)
    : path.resolve(root, "server/prisma", filename);
  if (
    azure &&
    (!database.startsWith("/home/") ||
      database === root ||
      database.startsWith(`${root}${path.sep}`))
  ) {
    throw new Error(
      "Azure SQLite data must be outside the deployed webroot, for example /home/semico-data/semico.db.",
    );
  }
  if (
    !process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_ACCESS_SECRET.length < 32 ||
    !process.env.REFRESH_TOKEN_PEPPER ||
    process.env.REFRESH_TOKEN_PEPPER.length < 32
  ) {
    throw new Error(
      "Configure separate JWT_ACCESS_SECRET and REFRESH_TOKEN_PEPPER values of at least 32 characters.",
    );
  }
  if (process.env.JWT_ACCESS_SECRET === process.env.REFRESH_TOKEN_PEPPER)
    throw new Error(
      "JWT_ACCESS_SECRET and REFRESH_TOKEN_PEPPER must be different.",
    );
  process.env.DATABASE_URL = `file:${database}${parameters.length ? `?${parameters.join("?")}` : ""}`;
  if (!process.env.CORS_ORIGIN && process.env.WEBSITE_HOSTNAME)
    process.env.CORS_ORIGIN = `https://${process.env.WEBSITE_HOSTNAME}`;
  fs.mkdirSync(path.dirname(database), { recursive: true, mode: 0o700 });
  const engines = path.dirname(
    fileURLToPath(import.meta.resolve("@prisma/engines/package.json")),
  );
  for (const engine of fs
    .readdirSync(engines)
    .filter(
      (name) => name.startsWith("schema-engine-") && !name.endsWith(".exe"),
    )) {
    const executable = path.join(engines, engine);
    try {
      fs.accessSync(executable, fs.constants.X_OK);
    } catch {
      fs.chmodSync(executable, 0o755);
    }
  }
  await runScript(fileURLToPath(import.meta.resolve("prisma/build/index.js")), [
    "migrate",
    "deploy",
    "--schema",
    path.join(root, "server/prisma/schema.prisma"),
  ]);
  if (process.env.BOOTSTRAP_SUPER_ADMIN === "true") {
    if (
      !process.env.SUPER_ADMIN_PASSWORD ||
      process.env.SUPER_ADMIN_PASSWORD.length < 16
    )
      throw new Error(
        "Set a unique SUPER_ADMIN_PASSWORD of at least 16 characters before bootstrapping the administrator.",
      );
    await runScript(path.join(root, "server/dist/seed-super-admin.js"));
  }
  await import(pathToFileURL(path.join(root, "server/dist/index.js")).href);
}

start().catch((error) => {
  console.error("Production startup failed:", error.message);
  process.exitCode = 1;
});
