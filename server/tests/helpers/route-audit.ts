import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * A small static reader for the server's route table.
 *
 * WHY PARSE RATHER THAN IMPORT: importing the routers would execute them, but it would not tell us
 * what middleware each route carries — that information only exists in the source. The audit needs
 * the declared guards, so it reads them.
 *
 * The parser is deliberately strict: anything it cannot resolve becomes an explicit error rather
 * than being skipped. A silently-unresolved guard would make the whole audit pass while checking
 * nothing, which is worse than no audit.
 */

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = path.join(serverRoot, "src");

export interface RouteRegistration {
  file: string;
  method: "get" | "post" | "patch" | "delete";
  /** Path as written in the file, e.g. `/me/settings`. */
  path: string;
  /** Middleware identifiers found between the path and the handler, spreads already expanded. */
  guards: string[];
  /** Names of the guard arrays that were spread into `guards`, e.g. `memberOnly`. */
  via: string[];
  /** Full API path once the mount prefix is applied. */
  fullPath: string;
  line: number;
}

/** Walks to the parenthesis matching the one at `openIndex`. */
function matchingParen(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];

    if (quote) {
      // Skip escaped characters and the closing quote.
      if (char === "\\") i += 1;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    // Comments cannot contain a paren that matters.
    if (char === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/** `const memberOnly = [requireAuth, requireFarmAccess]` → a map of identifier to its members. */
function guardArrays(source: string): Map<string, string[]> {
  const arrays = new Map<string, string[]>();
  const re = /const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*\[([^\]]*)\]/g;

  for (const match of source.matchAll(re)) {
    const name = match[1];
    const body = match[2] ?? "";
    if (!name) continue;

    arrays.set(
      name,
      body
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    );
  }

  return arrays;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** Every `router.<method>("path", ...)` registration in one file. */
export function routesInFile(file: string): Array<Omit<RouteRegistration, "fullPath">> {
  const source = readFileSync(file, "utf8");
  const arrays = guardArrays(source);
  const found: Array<Omit<RouteRegistration, "fullPath">> = [];

  const re = /\.(get|post|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

  for (const match of source.matchAll(re)) {
    const method = match[1] as RouteRegistration["method"];
    const routePath = match[2] ?? "";
    const openParen = source.indexOf("(", match.index);
    const closeParen = matchingParen(source, openParen);

    if (closeParen === -1) {
      throw new Error(`${path.basename(file)}: could not find the end of the "${routePath}" registration`);
    }

    // Everything after the path. Deliberately NOT pre-filtered for things that look like a handler:
    // the stop condition below is what separates guards from the handler, and a filter here would
    // hide exactly the fragments it is the stop condition's job to refuse.
    const args = source.slice(openParen + 1, closeParen);
    const afterPath = args.slice(args.indexOf(routePath) + routePath.length + 2);
    const parts = afterPath
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    // Guards are the LEADING RUN of bare identifiers, and the handler is everything from the first
    // argument that is not one.
    //
    // Express requires the handler last, so this rule is exact rather than a heuristic — but the
    // reason it is written as a stop condition instead of a filter is worth recording. Splitting the
    // argument list on commas cannot handle an inline `asyncHandler(async (req, res) => { ... })`,
    // whose body contains commas of its own; the fragments that fall out (`await someService()))`)
    // look exactly like a guard to any shape-based filter. Stopping at the first non-identifier
    // cannot make that mistake, and nothing a guard is written as can be mistaken for a handler.
    const guards: string[] = [];
    const via: string[] = [];
    let sawHandler = false;

    for (const part of parts) {
      const spread = /^\.\.\.([A-Za-z_$][\w$]*)$/.exec(part);
      if (spread) {
        const name = spread[1] ?? "";
        const members = arrays.get(name);
        if (!members) {
          throw new Error(
            `${path.basename(file)}: guard array "${name}" used on "${routePath}" cannot be resolved`,
          );
        }
        guards.push(...members);
        via.push(name);
        continue;
      }

      if (!/^[A-Za-z_$][\w$]*$/.test(part)) {
        sawHandler = true;
        break;
      }

      guards.push(part);
    }

    if (!sawHandler) {
      throw new Error(
        `${path.basename(file)}: the "${routePath}" registration has no handler, or its handler is not recognised as one`,
      );
    }

    found.push({
      file: path.relative(serverRoot, file),
      method,
      path: routePath,
      guards,
      via,
      line: lineOf(source, match.index ?? 0),
    });
  }

  return found;
}

/** Maps each router identifier to the prefix it is mounted on, per `routes/index.ts`. */
function mountPrefixes(): Map<string, string> {
  const source = readFileSync(path.join(srcRoot, "routes/index.ts"), "utf8");
  const prefixes = new Map<string, string>();
  const re = /apiRouter\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;

  for (const match of source.matchAll(re)) {
    prefixes.set(match[2] ?? "", match[1] ?? "");
  }

  return prefixes;
}

/** Every route registration across the whole API, with its full path. */
export function allRoutes(): RouteRegistration[] {
  const prefixes = mountPrefixes();
  // Path-scoped guards such as the exclusive /admin namespace run before module routers.
  const mountSource = readFileSync(path.join(srcRoot, "routes/index.ts"), "utf8");
  const inheritedGuards = [...mountSource.matchAll(/apiRouter\.use\(\s*["']([^"']+)["']\s*,\s*([^)]*)\)/g)]
    .map((match) => ({
      prefix: match[1] ?? "",
      guards: (match[2] ?? "").split(",").map((name) => name.trim()).filter((name) => /^(require\w+|\w+Limiter)$/.test(name)),
    }))
    .filter((mount) => mount.guards.length > 0);
  const routes: RouteRegistration[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".routes.ts")) {
        const routerName = entry.replace(".routes.ts", "") + "Routes";
        const prefix = prefixes.get(routerName);

        if (!prefix) {
          throw new Error(`${entry}: not mounted in routes/index.ts, so its full path is unknown`);
        }

        for (const route of routesInFile(full)) {
          const guards = inheritedGuards
            .filter((mount) => prefix === mount.prefix || prefix.startsWith(`${mount.prefix}/`))
            .flatMap((mount) => mount.guards);
          routes.push({ ...route, guards: [...guards, ...route.guards], fullPath: `${prefix}${route.path === "/" ? "" : route.path}` });
        }
      }
    }
  };

  walk(path.join(srcRoot, "modules"));

  // The versioned health route lives on the router itself rather than in a module.
  routes.push({
    file: "src/routes/index.ts",
    method: "get",
    path: "/health",
    guards: [],
    via: [],
    fullPath: "/health",
    line: 0,
  });

  return routes;
}

/**
 * Every route whose guard is applied at the router level with `.use(...)`.
 *
 * This pattern is a bug class in its own right: several routers share the `/farms/me` prefix, and a
 * router-level `requireOwner` runs for every request that ENTERS the router — including ones it
 * does not handle — which once locked every worker out of the whole API.
 */
export function routerLevelGuards(): Array<{ file: string; line: number; guard: string }> {
  const offenders: Array<{ file: string; line: number; guard: string }> = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".routes.ts")) {
        const source = readFileSync(full, "utf8");
        const re = /\.use\(\s*([^)]*)\)/g;

        for (const match of source.matchAll(re)) {
          const inner = match[1] ?? "";
          if (!/(require|Limiter)/.test(inner)) continue;

          offenders.push({
            file: path.relative(serverRoot, full),
            line: lineOf(source, match.index ?? 0),
            guard: inner.trim(),
          });
        }
      }
    }
  };

  walk(path.join(srcRoot, "modules"));

  return offenders;
}
