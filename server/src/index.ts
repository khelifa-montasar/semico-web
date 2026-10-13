import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { disconnectDatabase } from "./db/prisma.js";
import { logger } from "./middleware/requestLogger.js";

/**
 * Process entry point.
 *
 * Config is validated on import (config/env.ts), so by the time we bind a port the environment is
 * known-good. Shutdown is handled explicitly: on SIGTERM/SIGINT we stop accepting connections,
 * let in-flight requests finish, then close the database — so a deploy or Ctrl-C cannot cut a
 * request in half or leak SQLite handles.
 */

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    `Semico API listening on http://localhost:${env.PORT}`,
  );
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  // Fail-safe: if a connection refuses to drain, exit anyway rather than hang forever.
  const forceExit = setTimeout(() => {
    logger.error("shutdown timed out, exiting forcefully");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    if (error) logger.error({ err: error }, "error closing http server");
    try {
      await disconnectDatabase();
    } catch (dbError) {
      logger.error({ err: dbError }, "error disconnecting from database");
    }
    clearTimeout(forceExit);
    logger.info("shutdown complete");
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  // An uncaught exception leaves the process in an unknown state — log and go down so the
  // supervisor restarts a clean one.
  logger.fatal({ err: error }, "uncaught exception");
  void shutdown("uncaughtException");
});
