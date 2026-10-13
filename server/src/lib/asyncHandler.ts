import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async route handler so a rejected promise reaches Express's error handler.
 *
 * Express 5 does forward rejected promises from handlers on its own, but being explicit means
 * the behaviour does not silently depend on the framework version, and it keeps the intent
 * obvious to anyone reading a controller.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
