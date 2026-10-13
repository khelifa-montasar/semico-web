import { randomUUID } from "node:crypto";
import pino from "pino";
import pinoHttp from "pino-http";
import type { RequestHandler } from "express";
import { env, isProduction, isTest } from "../config/env.js";

/**
 * Structured request logging.
 *
 * Every request gets an id (echoed back in the `x-request-id` header) so a browser report can be
 * tied to a specific server log line. Bodies and cookies are never logged — they carry passwords
 * and refresh tokens.
 */

export const logger = pino({
  level: isTest ? "silent" : env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "req.body.password",
      "req.body.newPassword",
      "req.body.currentPassword",
    ],
    remove: true,
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
});

export const requestLogger: RequestHandler = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers["x-request-id"];
    const id = typeof existing === "string" && existing ? existing : randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  // Health probes fire constantly; keeping them out of the log preserves its signal.
  autoLogging: {
    ignore: (req) => req.url === "/healthz" || req.url === "/readyz",
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
