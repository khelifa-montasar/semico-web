import { PrismaClient } from "@prisma/client";
import { env, isProduction } from "../config/env.js";

/**
 * Prisma client singleton.
 *
 * The global cache matters in development: `tsx watch` re-evaluates modules on every save, and
 * without it each reload would open a new connection pool until SQLite started refusing them.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ["error"] : ["warn", "error"],
    datasources: { db: { url: env.DATABASE_URL } },
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

/** Verifies connectivity — used by the readiness probe, not by the liveness probe. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
