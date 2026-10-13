import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { pingDatabase } from "./db/prisma.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { apiRouter } from "./routes/index.js";

/**
 * Builds the Express app.
 *
 * Deliberately does NOT call `listen`: the test suite mounts this directly through supertest, and
 * a factory keeps that possible without opening a port or importing the bootstrap file.
 *
 * Middleware order matters and is intentional:
 *   request id + logging  → so even a rejected request is traceable
 *   security headers      → before any body handling
 *   CORS                  → must answer preflight before the limiter counts it
 *   body + cookie parsing → so rate-limit keying and guards can read them
 *   routes                → then the 404 and the error handler, always last
 */
export function createApp(): Express {
  const app = express();

  // Behind the Vite dev proxy / a reverse proxy in production, so `req.ip` and the rate limiter
  // see the real client address rather than the proxy's.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(requestLogger);
  app.use(helmet());

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((value) => value.trim()),
      credentials: true, // the refresh cookie must survive cross-origin dev requests
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  /**
   * Liveness — is the process up? Never touches the database, so a slow query cannot make an
   * orchestrator kill an otherwise healthy server.
   */
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime: Math.round(process.uptime()) });
  });

  /** Readiness — can this instance actually serve traffic? */
  app.get("/readyz", async (_req, res) => {
    const databaseUp = await pingDatabase();
    res.status(databaseUp ? 200 : 503).json({
      status: databaseUp ? "ready" : "degraded",
      checks: { database: databaseUp ? "up" : "down" },
    });
  });

  app.use("/api/v1", globalLimiter, apiRouter);

  // Order is required: 404 first, then the error handler as the final middleware.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
