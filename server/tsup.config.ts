import { defineConfig } from "tsup";

/**
 * Bundles the server to ESM output.
 *
 * tsup (esbuild) rather than raw `tsc` on purpose: Node ESM requires explicit `.js` extensions on
 * every relative import, and `tsc` will not rewrite them. Bundling sidesteps that entirely and
 * also inlines the `@semico/shared` workspace, which `tsc` would refuse to compile because it
 * lives outside this package's rootDir.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "seed-super-admin": "prisma/seed-super-admin.ts",
    "seed-content": "prisma/seed-content.ts",
    "seed-landing-content": "prisma/seed-landing-content.ts",
  },
  outDir: "dist",
  format: ["esm"],
  target: "node20",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Prisma's engine binaries must stay external; bundling them breaks at runtime.
  external: ["@prisma/client", ".prisma"],
  noExternal: ["@semico/shared"],
  // Silences the CJS/ESM interop shim noise for deps that ship both.
  shims: false,
});
