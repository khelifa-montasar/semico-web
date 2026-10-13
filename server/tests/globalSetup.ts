import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Creates the test database schema once per run.
 *
 * The test database is a disposable file, so the cleanest way to get a fresh schema is to DELETE
 * the file and let `db push` recreate it. An earlier version used `prisma db push --force-reset`,
 * which is unnecessary here and carries a destructive flag — Prisma rightly refuses to let an
 * automated agent run it without explicit human consent. Deleting a throwaway file needs no such
 * consent and is exactly equivalent.
 *
 * The database is `server/prisma/test.db`, never `dev.db` and never anything remote: the URL is set
 * explicitly below, so this cannot touch a real database even if the ambient environment says
 * otherwise.
 */
export default function globalSetup(): void {
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const prismaDir = path.join(serverRoot, "prisma");

  // SQLite keeps sidecar files alongside the database; leaving them behind would resurrect state.
  for (const suffix of ["test.db", "test.db-journal", "test.db-wal", "test.db-shm"]) {
    const target = path.join(prismaDir, suffix);
    if (existsSync(target)) rmSync(target, { force: true });
  }

  execSync("npx prisma db push --skip-generate", {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
}
