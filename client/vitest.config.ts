import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for the client workspace.
 *
 * Runs the demo-plot engine tests, which are pure TypeScript with no DOM and no React — so
 * `environment: "node"` is enough and no jsdom or Testing Library is required.
 *
 * The `@` alias mirrors `vite.config.ts` and `tsconfig.json`, so tests import the same way the app
 * does. It is not needed by the engine itself (which uses relative imports), but it keeps the path
 * available for the audit scripts in a later phase.
 *
 * NOTE: `vitest` is not declared in `client/package.json` — it resolves from the monorepo root,
 * hoisted by the server workspace. Adding it to this workspace would be a package.json edit rather
 * than a new dependency, and is deliberately left for the user to approve.
 */
const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(dir, "./src") },
  },
  test: {
    environment: "node",
    globals: false,
    // `.tsx` is included because Phase 2 renders components with `react-dom/server`, which needs no
    // DOM — so the environment stays `node` and no jsdom is required.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    reporters: ["default"],
  },
});
