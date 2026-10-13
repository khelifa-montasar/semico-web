import type { AuthContext } from "./auth.js";

/**
 * Request augmentation.
 *
 * Only `auth` is added. Validated input is *not* stashed on the request: controllers call the
 * typed parse helpers in `lib/validate.ts` instead, which keeps request payloads fully typed
 * without casting `req.body as SomeInput` at every call site.
 */
declare global {
  namespace Express {
    interface Request {
      /** Present only on routes behind `requireAuth`. */
      auth?: AuthContext;
      /** Set by the request logger so every log line for one request can be correlated. */
      requestId?: string;
    }
  }
}

export {};
