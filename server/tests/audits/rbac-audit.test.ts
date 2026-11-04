import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allRoutes, routerLevelGuards, type RouteRegistration } from "../helpers/route-audit.js";

/**
 * A static audit of the authorization surface.
 *
 * WHY STATIC RATHER THAN ANOTHER REQUEST SUITE: a request suite proves that the endpoints it names
 * behave as asserted. It cannot prove anything about the endpoints it does not name, and a route
 * that ships with NO guard at all is invisible to every test that does not happen to call it. This
 * audit reads the route table itself, so its coverage is the API rather than a list of examples.
 *
 * The centrepiece is a CROSS-CHECK. `rbac-matrix.test.ts` is an independent, hand-written statement
 * of the access policy — one `access` class per endpoint. The route files are the implementation.
 * Neither is derived from the other, so where they disagree one of them is wrong. Every other check
 * here exists to make that comparison trustworthy.
 *
 * The route reader is strict by construction: an unresolvable guard array, a registration with no
 * recognised handler, or a router that is not mounted all throw rather than being skipped. A parser
 * that silently returns a partial route table would make this file pass while checking nothing.
 */

const testsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Paths used for comparison: the `/api/v1` mount and any query string removed, and every parameter
 * normalised to `*`, so `/farms/me/workers/:id` and `/api/v1/farms/me/workers/TARGET` agree.
 */
function canonical(routePath: string): string {
  return routePath
    .replace(/^\/api\/v1/, "")
    .replace(/\?.*$/, "")
    .split("/")
    .map((segment) => (segment.startsWith(":") || segment.startsWith("$") ? "*" : segment))
    .join("/");
}

/** Whether a target path matches a route template. Only the route side may wildcard. */
function pathMatches(routePath: string, targetPath: string): boolean {
  const routeSegments = canonical(routePath).split("/");
  const targetSegments = targetPath.split("/");

  if (routeSegments.length !== targetSegments.length) return false;
  return routeSegments.every((segment, index) => segment === "*" || segment === targetSegments[index]);
}

/** Whether a concrete test target, as `METHOD /canonical/path`, covers a registered route. */
function covers(route: RouteRegistration, target: string): boolean {
  const separator = target.indexOf(" ");
  if (target.slice(0, separator) !== route.method.toUpperCase()) return false;

  return pathMatches(route.fullPath, target.slice(separator + 1));
}

/**
 * Every request target named anywhere in the suite, as `METHOD /canonical/path`.
 *
 * Both spellings are collected because the suites use both: paths built inline at the call site
 * (`request(app).get("/api/v1/...")`) and paths declared as data in the RBAC matrix's endpoint
 * table (`{ method, path, access }`). Missing the second would report the whole matrix as untested.
 */
function testTargets(dir: string): Set<string> {
  const targets = new Set<string>();

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Not this directory: an audit that counted its own path literals as coverage would report
      // every route as tested.
      if (full.includes(`${path.sep}audits`) || full.endsWith("audits")) continue;
      for (const target of testTargets(full)) targets.add(target);
      continue;
    }

    if (!entry.name.endsWith(".test.ts")) continue;
    const source = readFileSync(full, "utf8");

    for (const match of source.matchAll(/\.(get|post|patch|delete)\(\s*[`"'](\/api\/v1\/[^`"'\n]*)[`"']/g)) {
      targets.add(`${match[1]?.toUpperCase()} ${canonical(match[2] ?? "")}`);
    }
    for (const match of source.matchAll(/method:\s*"(\w+)",\s*path:\s*"([^"]+)"/g)) {
      targets.add(`${match[1]?.toUpperCase()} ${canonical(match[2] ?? "")}`);
    }
  }

  return targets;
}

interface MatrixEntry {
  method: string;
  path: string;
  access: string;
  line: number;
}

/** The endpoint table declared in `rbac-matrix.test.ts`. */
function matrixEntries(): MatrixEntry[] {
  const source = readFileSync(path.join(testsRoot, "rbac-matrix.test.ts"), "utf8");
  const entries: MatrixEntry[] = [];
  const pattern = /\{\s*method:\s*"(\w+)",\s*path:\s*"([^"]+)",\s*access:\s*"(\w+)"/g;

  for (const match of source.matchAll(pattern)) {
    entries.push({
      method: match[1] ?? "",
      path: match[2] ?? "",
      access: match[3] ?? "",
      line: source.slice(0, match.index).split("\n").length,
    });
  }

  return entries;
}

/**
 * What each access class must and must not carry, as declared guards.
 *
 * `owner` requires `requireOwner` but does not demand `requireFarmAccess`: the `access` class is
 * about ROLE, and two of the endpoints in it (`/leads`, `/bookings`) are company-level rather than
 * farm-scoped, so they legitimately have no farm guard. That every `/farms/me/*` route is
 * farm-guarded is asserted separately and more precisely below.
 */
const ACCESS_CONTRACT: Record<string, { required: string[]; forbidden: string[] }> = {
  admin: {
    required: ["requireAuth", "requireSuperAdmin"],
    forbidden: ["requireFarmAccess", "requireOwner", "requireValveControl"],
  },
  public: {
    required: [],
    forbidden: ["requireAuth", "requireFarmAccess", "requireOwner", "requireValveControl"],
  },
  authenticated: {
    required: ["requireAuth"],
    forbidden: ["requireFarmAccess", "requireOwner", "requireValveControl"],
  },
  member: {
    required: ["requireAuth", "requireFarmAccess"],
    forbidden: ["requireOwner", "requireValveControl"],
  },
  valve: {
    required: ["requireAuth", "requireFarmAccess", "requireValveControl"],
    forbidden: ["requireOwner"],
  },
  owner: {
    required: ["requireAuth", "requireOwner"],
    forbidden: ["requireValveControl"],
  },
  // Owner or ENGINEER. Never an operator: exporting the dataset is not the same permission as
  // reading a chart, and it is the capability that distinguishes the two worker types in V2.
  export: {
    required: ["requireAuth", "requireFarmAccess", "requireExportAccess"],
    forbidden: ["requireOwner", "requireValveControl"],
  },
};

/** Middleware that may legitimately appear on a route, so a typo or a stray name is caught. */
const KNOWN_MIDDLEWARE = new Set([
  "requireAuth",
  "requireFarmAccess",
  "requireOwner",
  "requireSuperAdmin",
  "requireValveControl",
  "requireExportAccess",
  "authLimiter",
  "apiLimiter",
]);

/**
 * Routes with no test that names them.
 *
 * This is a REGISTRY, not an excuse. The assertion below is a subset check, so a route that ships
 * untested fails this audit until it is either tested or added here deliberately — which is the
 * point. The list is also checked against the live route table, so an entry that survives a rename
 * or a deletion is reported rather than quietly shrinking the check's reach.
 */
const KNOWN_COVERAGE_GAPS: Array<{ route: string; why: string }> = [
  { route: "GET /health", why: "the versioned liveness route; /healthz is exercised by the rate-limit suite" },
  { route: "PATCH /farms/me", why: "farm profile update; only the settings PATCH is covered" },
  { route: "GET /farms/me/telemetry/latest-per-zone", why: "per-zone latest readings" },
  { route: "GET /farms/me/device-status", why: "device connectivity summary" },
  // The analytics reads below are deliberately left until the V2 permission model lands: export and
  // diagnostics become capability-gated, so tests written against the current rules would be rewritten
  // in the same change that introduces them.
];

const routes = allRoutes();
const matrix = matrixEntries();
const targets = testTargets(testsRoot);

describe("the audit is reading a real, complete route table", () => {
  // If the reader ever silently returned a subset, every assertion in this file would pass while
  // checking less than it claims. These are the guard rails against exactly that.
  it("discovers the whole API", () => {
    expect(routes.length).toBeGreaterThanOrEqual(55);
  });

  it("discovers every module router", () => {
    const modules = new Set(routes.map((route) => route.file));
    for (const module of ["auth", "farm", "workers", "irrigation", "analytics", "audit", "leads", "bookings", "content", "reference", "telemetry", "activity", "users"]) {
      expect(
        [...modules].some((file) => file.includes(`/modules/${module}/`)),
        `no routes were found for the ${module} module`,
      ).toBe(true);
    }
  });

  it("reads a guard on the routes that have one", () => {
    // A parser that returned `[]` for every route would satisfy "no route is missing a guard"
    // vacuously, so the population that DOES carry guards is asserted to be substantial.
    const guarded = routes.filter((route) => route.guards.length > 0);
    expect(guarded.length).toBeGreaterThanOrEqual(40);
  });

  it("resolves every spread guard array rather than reporting it as a name", () => {
    // `...memberOnly` must arrive as the middleware it expands to, never as the literal "memberOnly".
    const names = new Set(routes.flatMap((route) => route.via));
    expect([...names].sort()).toEqual(["canActuate", "memberOnly", "ownerOnly", "self"]);
  });
});

describe("shared farm routers use per-route guards", () => {
  it("has no module-level router.use(guard)", () => {
    // This is a bug class, not a style preference. Several routers share the `/farms/me` prefix, so a
    // router-level `requireOwner` runs for EVERY request that enters the router — including ones it
    // does not handle. A `requireOwner` in `workers.routes.ts` once locked every worker out of the
    // entire API, and because the router was entered but did not match, the failure looked like a
    // routing problem rather than an authorization one.
    expect(routerLevelGuards()).toEqual([]);
  });
});

describe("the admin namespace is protected before its router is entered", () => {
  it("authenticates and checks the platform role before mounting admin handlers", () => {
    const source = readFileSync(path.resolve(testsRoot, "../src/routes/index.ts"), "utf8");
    const guardIndex = source.indexOf('apiRouter.use("/admin", requireAuth, requireSuperAdmin)');
    const routerIndex = source.indexOf('apiRouter.use("/admin", adminRoutes)');
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(routerIndex).toBeGreaterThan(guardIndex);
  });
});

describe("guard chains are well formed", () => {
  it("puts authentication before every other guard", () => {
    // `requireOwner` reads `req.auth`, which only exists once `requireAuth` has run. Express runs
    // middleware in order, so a reordered chain would not fail loudly — it would throw at runtime.
    for (const route of routes) {
      const authIndex = route.guards.indexOf("requireAuth");
      if (authIndex === -1) continue;

      for (const guard of ["requireFarmAccess", "requireOwner", "requireSuperAdmin", "requireValveControl"]) {
        const index = route.guards.indexOf(guard);
        if (index !== -1) {
          expect(authIndex, `${route.method.toUpperCase()} ${route.fullPath}: ${guard} runs before requireAuth`).toBeLessThan(index);
        }
      }
    }
  });

  it("puts farm membership before the role and capability checks", () => {
    for (const route of routes) {
      const farmIndex = route.guards.indexOf("requireFarmAccess");
      if (farmIndex === -1) continue;

      for (const guard of ["requireOwner", "requireValveControl"]) {
        const index = route.guards.indexOf(guard);
        if (index !== -1) {
          expect(
            farmIndex,
            `${route.method.toUpperCase()} ${route.fullPath}: ${guard} runs before requireFarmAccess`,
          ).toBeLessThan(index);
        }
      }
    }
  });

  it("never repeats a guard in one chain", () => {
    for (const route of routes) {
      expect(new Set(route.guards).size, `${route.method.toUpperCase()} ${route.fullPath} repeats a guard`).toBe(
        route.guards.length,
      );
    }
  });

  it("uses only middleware this audit knows about", () => {
    for (const route of routes) {
      for (const guard of route.guards) {
        expect(KNOWN_MIDDLEWARE, `${route.method.toUpperCase()} ${route.fullPath} uses an unknown guard: ${guard}`).toContain(guard);
      }
    }
  });
});

describe("farm-scoped routes are uniformly guarded", () => {
  const farmRoutes = routes.filter((route) => route.fullPath.startsWith("/farms/me"));

  it("found the farm routes", () => {
    expect(farmRoutes.length).toBeGreaterThanOrEqual(25);
  });

  it("requires authentication on every one", () => {
    for (const route of farmRoutes) {
      expect(route.guards, `${route.method.toUpperCase()} ${route.fullPath} is reachable without a session`).toContain("requireAuth");
    }
  });

  it("requires farm membership on every one", () => {
    for (const route of farmRoutes) {
      expect(route.guards, `${route.method.toUpperCase()} ${route.fullPath} does not check farm membership`).toContain(
        "requireFarmAccess",
      );
    }
  });
});

describe("actuating routes require the valve capability", () => {
  // The routes that change physical state. Listed explicitly so that adding one is a deliberate act:
  // a new actuating endpoint that forgets `requireValveControl` fails here rather than in the field.
  const ACTUATING = [
    "POST /farms/me/irrigation/irrigate",
    "POST /farms/me/irrigation/valve",
  ];

  const actuatingRoutes = routes.filter((route) =>
    ACTUATING.includes(`${route.method.toUpperCase()} ${route.fullPath}`),
  );

  it("found every route it expects to exist", () => {
    expect(actuatingRoutes.map((route) => `${route.method.toUpperCase()} ${route.fullPath}`).sort()).toEqual(
      [...ACTUATING].sort(),
    );
  });

  it("guards each with the valve capability", () => {
    for (const route of actuatingRoutes) {
      expect(route.guards, `${route.method.toUpperCase()} ${route.fullPath}`).toContain("requireValveControl");
    }
  });

  it("grants the capability to no other route", () => {
    // The reverse direction: a read endpoint that demanded valve control would lock engineers out of
    // data they are entitled to see, which is a real bug rather than a conservative default.
    const holders = routes
      .filter((route) => route.guards.includes("requireValveControl"))
      .map((route) => `${route.method.toUpperCase()} ${route.fullPath}`)
      .sort();

    expect(holders).toEqual([...ACTUATING].sort());
  });
});

describe("the RBAC matrix and the route table agree", () => {
  it("declares enough endpoints to be a matrix", () => {
    expect(matrix.length).toBeGreaterThanOrEqual(25);
  });

  it("names only routes that exist", () => {
    // A typo'd path in the matrix would exercise a 404. Most access classes would catch that by
    // failing, but the assertion makes the cause obvious instead of leaving it to be inferred.
    for (const entry of matrix) {
      const target = `${entry.method.toUpperCase()} ${canonical(entry.path)}`;
      expect(
        routes.some((route) => covers(route, target)),
        `rbac-matrix.test.ts:${entry.line} names ${target}, which is not a registered route`,
      ).toBe(true);
    }
  });

  it("uses only access classes this audit understands", () => {
    for (const entry of matrix) {
      expect(Object.keys(ACCESS_CONTRACT), `rbac-matrix.test.ts:${entry.line} uses access "${entry.access}"`).toContain(
        entry.access,
      );
    }
  });

  it("agrees with the guards the code actually declares, endpoint by endpoint", () => {
    const mismatches: string[] = [];

    for (const entry of matrix) {
      const target = `${entry.method.toUpperCase()} ${canonical(entry.path)}`;
      const route = routes.find((candidate) => covers(candidate, target));

      if (!route) continue; // Reported by the check above.
      const contract = ACCESS_CONTRACT[entry.access];
      if (!contract) continue;

      for (const guard of contract.required) {
        if (!route.guards.includes(guard)) {
          mismatches.push(
            `rbac-matrix.test.ts:${entry.line} declares ${target} as "${entry.access}", but ${route.file}:${route.line} does not apply ${guard}`,
          );
        }
      }

      for (const guard of contract.forbidden) {
        if (route.guards.includes(guard)) {
          mismatches.push(
            `rbac-matrix.test.ts:${entry.line} declares ${target} as "${entry.access}", but ${route.file}:${route.line} applies ${guard}`,
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});

describe("every route is accounted for", () => {
  it("is declared in the RBAC matrix or reachable by another test", () => {
    const gaps = new Set(KNOWN_COVERAGE_GAPS.map((gap) => gap.route));

    const unaccounted = routes
      .filter((route) => !gaps.has(`${route.method.toUpperCase()} ${route.fullPath}`))
      .filter((route) => ![...targets].some((target) => covers(route, target)))
      .map((route) => `${route.method.toUpperCase()} ${route.fullPath}`)
      .sort();

    // A new endpoint with no test fails here. So does a route that lost its only test. Both are worth
    // knowing about at the moment they happen rather than at the next incident.
    expect(
      unaccounted,
      "These routes are neither in the RBAC matrix nor named by any test. Add a test, add them to the matrix, or add a justified entry to KNOWN_COVERAGE_GAPS.",
    ).toEqual([]);
  });

  it("does not carry a stale entry in the known-gaps registry", () => {
    // A gap entry that no longer matches a route means a route was renamed or removed and the
    // registry was not updated — which silently narrows what this audit checks.
    const live = new Set(routes.map((route) => `${route.method.toUpperCase()} ${route.fullPath}`));

    const stale = KNOWN_COVERAGE_GAPS.map((gap) => gap.route).filter((route) => !live.has(route));
    expect(stale, "KNOWN_COVERAGE_GAPS names routes that no longer exist").toEqual([]);
  });

  it("records a reason for every known gap", () => {
    for (const gap of KNOWN_COVERAGE_GAPS) {
      expect(gap.why.length, `${gap.route} has no explanation`).toBeGreaterThan(10);
    }
  });
});

describe("public surface", () => {
  /** Routes reachable with no session: no authentication guard anywhere in the chain. */
  const publicRoutes = routes.filter((route) => !route.guards.includes("requireAuth"));

  it("is a closed, reviewable list", () => {
    // The highest-value assertion in this file. A route that loses its guard, or a new one that ships
    // without any, appears here — and this list failing is the signal that a deliberate decision is
    // required, not a formality.
    expect(publicRoutes.map((route) => `${route.method.toUpperCase()} ${route.fullPath}`).sort()).toEqual([
      "GET /bookings/availability",
      "GET /content/blog",
      "GET /content/blog/:slug",
      "GET /content/bundle",
      "GET /content/pricing-plans",
      "GET /content/products",
      "GET /content/service-plans",
      "GET /content/stats",
      "GET /content/team",
      "GET /content/testimonials",
      "GET /health",
      "GET /reference/wilayas",
      "POST /auth/login",
      "POST /auth/refresh",
      "POST /auth/register",
      "POST /bookings",
      "POST /leads",
    ]);
  });

  it("rate-limits every route that creates an account or accepts a credential", () => {
    // The unauthenticated write surface is the one an attacker reaches first, so each of these must
    // carry the tighter limiter rather than only the global one.
    for (const routePath of ["/auth/register", "/auth/login", "/bookings", "/leads"]) {
      const route = routes.find((candidate) => candidate.fullPath === routePath && candidate.method === "post");
      expect(route?.guards, `POST ${routePath} is unthrottled`).toContain("authLimiter");
    }
  });

  it("leaves public reads unthrottled by the auth limiter", () => {
    // The auth limiter is keyed on the email, and public content reads carry none — so applying it
    // there would drain a shared budget for no security benefit.
    for (const route of publicRoutes.filter((candidate) => candidate.fullPath.startsWith("/content"))) {
      expect(route.guards).not.toContain("authLimiter");
    }
  });
});
