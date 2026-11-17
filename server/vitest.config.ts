import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Creates the schema once, before any suite runs.
    globalSetup: ["./tests/globalSetup.ts"],
    // Runs before each test file's imports, so env vars are set before config/env.ts validates.
    setupFiles: ["./tests/setup.ts"],
    // Suites share one SQLite file; running them in parallel would race on it.
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 20_000,
    include: ["tests/**/*.test.ts"],
  },
});
