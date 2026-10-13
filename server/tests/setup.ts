/**
 * Test environment.
 *
 * Runs before every test file's imports, which matters: `config/env.ts` validates `process.env` at
 * import time and throws on a bad configuration, so these must be set first. `dotenv` does not
 * override variables that already exist, so anything set here wins over `.env`.
 */

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

// A dedicated database file so a test run can never touch dev.db.
process.env.DATABASE_URL = "file:./test.db";

// Long enough to satisfy the 32-character minimum in the env schema.
process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789abcdefghijklmnop";
process.env.REFRESH_TOKEN_PEPPER = "test-refresh-pepper-0123456789abcdefghijklmnop";

// Short so expiry paths are cheap to exercise; still above the schema's 60s floor.
process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
process.env.REFRESH_TOKEN_TTL_SECONDS = "3600";

process.env.COOKIE_SECURE = "false";
