import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A bug hunt across the server's structure, configuration and data model.
 *
 * These are the defect classes that a behavioural test cannot see. A request suite proves what an
 * endpoint returns; it says nothing about a Prisma model that exists in `schema.prisma` but in no
 * migration (works locally on `db push`, fails on deploy), an env var read from `process.env`
 * outside the validator (boots with a silently wrong value), or a `*En` column shipped without its
 * `*Ar` partner (the language toggle renders `undefined` in one direction only, and only for users
 * who switch).
 *
 * Everything here is asserted against the source as it stands, so a new file that breaks one of
 * these conventions fails the build at the moment it is added.
 */

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = path.join(serverRoot, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(srcRoot).filter((file) => file.endsWith(".ts"));
const relative = (file: string) => path.relative(serverRoot, file);
const read = (file: string) => readFileSync(file, "utf8");

/** Files whose text matches, reported as repo-relative paths. */
function matching(pattern: RegExp): string[] {
  return sourceFiles.filter((file) => pattern.test(read(file))).map(relative).sort();
}

describe("the module structure is uniform", () => {
  const modulesDir = path.join(srcRoot, "modules");
  const modules = readdirSync(modulesDir).filter((entry) => statSync(path.join(modulesDir, entry)).isDirectory());

  /**
   * Modules that legitimately do not have a service/repository pair.
   *
   * `reference` is a lookup table read: there is no business rule to hold and no invariant to
   * protect, so a service layer over a single `findMany` would be indirection without a purpose.
   * Named here rather than inferred, so a NEW thin module is a decision instead of a drift.
   */
  const THIN_MODULES = new Set(["reference"]);

  it("gives every module a routes file", () => {
    for (const module of modules) {
      expect(
        existsSync(path.join(modulesDir, module, `${module}.routes.ts`)) ||
          existsSync(path.join(modulesDir, module, "routes.ts")),
        `modules/${module} has no routes file`,
      ).toBe(true);
    }
  });

  it("gives every full module all four layers", () => {
    for (const module of modules.filter((name) => !THIN_MODULES.has(name))) {
      for (const layer of ["routes", "controller", "service", "repository"]) {
        expect(
          existsSync(path.join(modulesDir, module, `${module}.${layer}.ts`)),
          `modules/${module} is missing its ${layer} layer`,
        ).toBe(true);
      }
    }
  });

  it("names only real directories on the thin-module list", () => {
    // A stale entry here would exempt a module from the layer check above without anyone noticing.
    expect([...THIN_MODULES].filter((module) => !modules.includes(module))).toEqual([]);
  });

  it("mounts every module on the API router", () => {
    const routerSource = read("src/routes/index.ts");
    for (const module of modules) {
      expect(routerSource, `modules/${module} is never mounted, so none of its routes are reachable`).toContain(
        `${module}Routes`,
      );
    }
  });

  it("keeps guards out of the controller layer", () => {
    // Authorization belongs in the route declaration, where it can be read as one list per endpoint.
    // A controller that consults `req.auth.role` directly hides the policy from the route table and
    // therefore from the RBAC audit.
    const offenders = sourceFiles
      .filter((file) => file.includes(".controller.ts"))
      .filter((file) => /req\.auth\.(role|valveControl|workerType|status)/.test(read(file)))
      .map(relative);

    expect(offenders, "controllers are making authorization decisions instead of the route guards").toEqual([]);
  });
});

describe("configuration is read in exactly one place", () => {
  it("reads process.env only in the validating config module", () => {
    // Every other module must import `env` so that a missing or malformed variable fails at boot
    // with a clear message, rather than surfacing as `undefined` deep inside a request handler.
    expect(matching(/process\.env/)).toEqual(["src/config/env.ts"]);
  });

  it("requires the secrets rather than defaulting them", () => {
    // A defaulted secret is worse than a missing one: the service starts happily with a value an
    // attacker knows, and nothing anywhere reports a problem.
    const env = read("src/config/env.ts");

    for (const secret of ["JWT_ACCESS_SECRET", "REFRESH_TOKEN_PEPPER"]) {
      const line = env.split("\n").find((candidate) => candidate.trim().startsWith(`${secret}:`));
      expect(line, `${secret} is not declared in the env schema`).toBeTruthy();
      expect(line, `${secret} must not have a default`).not.toContain(".default(");
      expect(line, `${secret} must be length-checked`).toContain("min(32");
    }
  });

  it("documents every variable it validates", () => {
    // An undocumented required variable turns a first run into a debugging session.
    const env = read("src/config/env.ts");
    const readme = read(path.join(serverRoot, "README.md"));
    const keys = [...env.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1] ?? "");

    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const key of keys) {
      expect(readme, `${key} is validated but never documented in server/README.md`).toContain(key);
    }
  });

  it("keeps the environment file out of version control", () => {
    const gitignore = readFileSync(path.join(serverRoot, "../.gitignore"), "utf8");
    expect(gitignore).toMatch(/^\.env$/m);
  });
});

describe("logging and error handling", () => {
  it("never writes to the console", () => {
    // The service logs through pino, which carries the level, the request id and the redaction
    // rules. A stray `console.log` bypasses all three and, in this codebase, would be the most
    // likely way for a credential to reach a log aggregator.
    expect(matching(/console\.(log|warn|error|info|debug|trace)/)).toEqual([]);
  });

  it("has a single error-handling boundary", () => {
    // Every route reaches the same handler, so the response shape and the production stack-trace
    // policy are decided once.
    const mounted = read("src/app.ts");
    expect(mounted).toContain("errorHandler");
    expect(mounted).toContain("notFound");
  });
});

describe("the type system is not being silenced", () => {
  it("uses no suppression comments", () => {
    // `@ts-expect-error` at least fails once the error is fixed; `@ts-ignore` never does, and both
    // hide exactly the class of mistake the strict config exists to catch.
    expect(matching(/@ts-(ignore|expect-error|nocheck)/)).toEqual([]);
  });

  it("uses no explicit any", () => {
    expect(matching(/:\s*any\b/)).toEqual([]);
    expect(matching(/\bas any\b/)).toEqual([]);
  });

  it("uses a double assertion only for the Prisma hot-reload singleton", () => {
    // One deliberate escape, and it is the documented Prisma pattern: stashing the client on
    // `globalThis` so a dev-server reload does not open a new connection pool each time.
    expect(matching(/as unknown as/)).toEqual(["src/db/prisma.ts"]);

    const prisma = read(path.join(srcRoot, "db/prisma.ts"));
    expect(prisma).toMatch(/globalThis as unknown as \{ prisma\?: PrismaClient \}/);
  });
});

describe("the data model and the migrations agree", () => {
  const schema = read(path.join(serverRoot, "prisma/schema.prisma"));
  const models = [...schema.matchAll(/^model\s+(\w+)/gm)].map((match) => match[1] ?? "");

  const migrationsDir = path.join(serverRoot, "prisma/migrations");
  const migrationNames = readdirSync(migrationsDir)
    .filter((entry) => statSync(path.join(migrationsDir, entry)).isDirectory())
    .sort();

  const migrationSql = migrationNames
    .map((name) => read(path.join(migrationsDir, name, "migration.sql")))
    .join("\n");

  /**
   * Tables a migration creates, excluding Prisma's own rebuilding temporaries.
   *
   * SQLite cannot alter a column in place, so Prisma's migration engine creates `new_User`, copies
   * the rows, drops the original and renames. Those temporaries are an implementation detail of the
   * migration, not a table the application knows about.
   */
  const tables = new Set(
    [...migrationSql.matchAll(/CREATE TABLE\s+"?(\w+)"?/g)]
      .map((match) => match[1] ?? "")
      .filter((table) => !table.startsWith("new_")),
  );

  it("finds a schema and its migrations", () => {
    expect(models.length).toBeGreaterThanOrEqual(20);
    expect(migrationNames.length).toBeGreaterThanOrEqual(4);
  });

  it("has a migration for every model", () => {
    // A model with no CREATE TABLE works on a developer's machine, where `db push` builds the
    // database from the schema directly, and fails on any environment that runs `migrate deploy` —
    // which is every environment that matters.
    const unmigrated = models.filter((model) => !tables.has(model));
    expect(
      unmigrated,
      "These models exist in schema.prisma but no migration creates them. Run `prisma migrate dev` and commit the result.",
    ).toEqual([]);
  });

  it("has a model for every table", () => {
    const orphaned = [...tables].filter((table) => !models.includes(table));
    expect(orphaned, "These tables are created by a migration but no model maps them").toEqual([]);
  });

  it("names migrations with a sortable timestamp prefix", () => {
    for (const name of migrationNames) {
      expect(name, `migration "${name}" is not timestamp-prefixed`).toMatch(/^\d{14}_[a-z0-9_]+$/);
    }
  });

  it("has no empty migration", () => {
    for (const name of migrationNames) {
      expect(read(path.join(migrationsDir, name, "migration.sql")).trim().length, `${name} is empty`).toBeGreaterThan(0);
    }
  });
});

describe("translatable columns come in pairs", () => {
  const schema = read(path.join(serverRoot, "prisma/schema.prisma"));
  const blocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];

  it("finds the models", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(20);
  });

  it("gives every *En column an *Ar counterpart, and the reverse", () => {
    // SQLite has no JSON scalar and the project's bilingual content lives in explicit columns, so a
    // half-added pair is the natural mistake. It fails quietly: the API returns the field the client
    // asks for in one language and `undefined` in the other.
    const mismatches: string[] = [];

    for (const [, model, body] of blocks) {
      const english = new Set([...(body ?? "").matchAll(/^\s*(\w+)En\b/gm)].map((match) => match[1] ?? ""));
      const arabic = new Set([...(body ?? "").matchAll(/^\s*(\w+)Ar\b/gm)].map((match) => match[1] ?? ""));

      for (const field of english) if (!arabic.has(field)) mismatches.push(`${model}.${field}En has no ${field}Ar`);
      for (const field of arabic) if (!english.has(field)) mismatches.push(`${model}.${field}Ar has no ${field}En`);
    }

    expect(mismatches).toEqual([]);
  });

  it("has at least one bilingual pair, so the check above is not vacuous", () => {
    const pairs = [...schema.matchAll(/^\s*(\w+)En\b/gm)].map((match) => match[1] ?? "");
    expect(pairs.length).toBeGreaterThanOrEqual(15);
  });
});

describe("no unfinished work is left in the source", () => {
  it("carries no TODO, FIXME or HACK marker", () => {
    // These are fine in a branch and corrosive on a default branch, where they accumulate into a
    // list nobody owns. The build fails instead, which makes each one a decision.
    expect(matching(/\b(TODO|FIXME|HACK|XXX)\b/)).toEqual([]);
  });
});
