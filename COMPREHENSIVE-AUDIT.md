# Comprehensive System Audit & Smoke Test

**Report finalized:** 2026-11-05 UTC  
**Initial full verification:** 2026-11-05, 11:25–11:53 UTC  
**Follow-up rechecks:** Phase 2 at 12:08, Phase 3 at 12:24, and Phase 4 at 12:39 UTC on the same date and commit.  
**Audited commit:** `a6940f00a3658f48921d69af49565580469dc1df`  
**Scope:** all four requested phases, plus production-mode startup, external-image follow-up, and process cleanup.  
**Changes:** this report and ignored audit evidence only. Application source, schema, dependency, and environment files remain unchanged; dependency remediation is still required before production.

## Final Verdict

> **READY FOR DEFENSE — CONDITIONAL PASS: controlled local demonstration.**
>
> All requested functional flows pass against the current commit, including real MQTT delivery,
> database persistence, authenticated WebSockets, and simulator receipt of a valve command.
>
> **NOT READY FOR PUBLIC PRODUCTION DEPLOYMENT.** The recorded dependency audit reports
> **2 critical / 6 high findings overall**, including **5 high production-classified findings**.
> These require remediation and revalidation before an internet-facing release.

The earlier report already present in the workspace is preserved unchanged in the historical
section at the end. The results in this current section were independently rerun; historical
passes were not used as substitutes for fresh checks.

### Phase Outcomes

| Verification | Final result | Supporting evidence |
| --- | --- | --- |
| Phase 1: static checks, database, full suite | PASS: typecheck, zero-warning lint, zero schema drift, 828 tests | Initial full-audit logs/results |
| Phase 1: dependency security gate | BLOCKED: 2 critical / 6 high overall; 5 high in the production audit | Recorded npm audit JSON reports |
| Phase 2: RBAC and tenant isolation | PASS: all five requested flows; 197 focused checks | Phase 2 recheck, 12:08 UTC |
| Phase 3: build and assets | PASS: 456,198-byte entry, lazy Leaflet, 45 served files, 33 focused tests | Phase 3 recheck, 12:24 UTC |
| Phase 4: live IoT and realtime | PASS: real MQTT, durable telemetry, WebSocket alerts, command receipt, 22 focused tests | Phase 4 recheck, 12:39 UTC |

### Executive Checklist

- [x] Typecheck passes across `shared`, `server`, and `client`.
- [x] Repository-wide lint passes, including a final `--max-warnings 0` run.
- [x] Prisma validates; migration history and the current development database both have zero schema drift.
- [x] All 13 migrations are applied to the development database; no development migration/reset/seed was performed.
- [x] Full suite: **828 passed**, comprising **515 server + 313 client tests**, in 49 files.
- [x] Focused security rerun: **197 passed**, covering role separation, valve permissions, and tenant isolation.
- [x] Focused bundle/i18n rerun: **33 passed**, with no failures or skips.
- [x] Focused realtime/valve rerun: **22 passed**, with no failures or skips.
- [x] Monorepo production build and compiled server startup pass.
- [x] Main entry: **456,198 bytes**, below 500,000 bytes; Leaflet stays outside its static dependency graph.
- [x] All 45 client files return HTTP 200 with matching build hashes; server bundle and source map validate.
- [x] All 543 English/Arabic translation keys match, contain nonempty strings, and are included in the build.
- [x] 27 primary Chromium navigation checks pass; all 17 observed internal destinations are registered routes.
- [x] Five footer destinations and nine external map-tile URLs respond successfully.
- [x] Real Mosquitto and the existing ESP32 simulator complete telemetry, alerts, and valve-command receipt.
- [x] Exactly 18% moisture does not trigger `MOISTURE_LOW`; a subsequent 17.5% sample does.
- [x] Telemetry and command-receipt records survive service shutdown; duplicate delivery stores one row per message UUID.
- [x] The unrelated farm receives zero WebSocket events during the live test.
- [x] Cleanup passes for the initial audit and every follow-up API, broker, and preview run.
- [x] Before/after hashes confirm the development database and compiled backend remain unchanged during live smoke tests.
- [ ] Dependency security gate: unresolved critical/high findings.
- [ ] Public production approval: blocked pending remediation and deployment-specific verification.
- [ ] Physical valve execution: outside this simulator-only audit; receipt is not execution confirmation.

The 197, 33, and 22 focused checks are reruns of subsets of the **828-test suite**, not additional
unique tests. Browser navigation and live-broker checks are separate smoke-test evidence.

## Evidence and Environment

The following workspace-relative directories contain the command logs, structured assertions,
and supporting artifacts. They are ignored by Git and are local evidence, not application source.
Do not publish disposable databases or browser profiles as deployment artifacts.

| Evidence set | Directory | Key records |
| --- | --- | --- |
| Initial full audit, browser checks, production startup | `logs/system-audit-20261105T112547Z/` | `phase1-tests.log`, `final-static.json`, `phase1-database.json`, npm audit reports, `phase3-browser.json`, `production-startup.json` |
| Requested RBAC recheck | `logs/rbac-smoke-20261105T120404Z/` | `results.json`, `requested-flows.json`, development database hash check |
| Requested build/asset recheck | `logs/production-build-20261105T121518Z/` | `summary.json`, `artifact-validation.json`, `http-assets.json`, `tests.json` |
| Requested live IoT recheck | `logs/live-iot-20261105T122909Z/` | `summary.json`, broker/WebSocket messages, `post-run-verification.json`, `tests.json` |

Bare evidence filenames in the initial phase details refer to the initial full-audit directory;
dated recheck sections give their own explicit paths. Results represent the recorded test windows,
not a continuous availability guarantee.

| Component | Fresh observation |
| --- | --- |
| Node.js / npm | 24.21.0 / 12.2.0, using `/usr/bin/node` in the command shell |
| TypeScript / Prisma CLI and client | 5.9.3 / 6.19.3 |
| Vitest / application Vite / tsup | 2.1.9 / 6.4.4 / 8.5.1 |
| Browser | Chromium 150.0.7871.181, real headless browser through DevTools Protocol |
| Broker / MQTT client | Mosquitto 2.1.2 / mqtt.js 5.16.1 |
| Initial API / production-startup API / preview / broker ports | 4429 / 4430 / 5188 / 18896 |
| Follow-up preview / live API / live broker ports | 5198 / 4449 / 18916; each closed after its run |
| Test data | Dedicated `server/prisma/test.db`; separate freshly migrated audit databases for live checks |
| Runtime modes | Compiled backend in development mode for local `mqtt://`; separate production-mode health smoke with MQTT disabled |

`audit-metadata.json` records the commit and tool versions. Socket tests required approved
execution outside the socket-restricted sandbox. Dependency and external-link probes used
approved network access; no packages were installed or automatically fixed.

## Phase 1 — Static Analysis, Database, Tests, Dependencies

### Workspace and Database Results

| Executed check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS in all three workspaces, initially and at completion | `phase1-typecheck.log`, `final-typecheck.log` |
| `npm run lint` | PASS; no source warnings to fix | `phase1-lint.log` |
| `npm run lint -- --max-warnings 0` | PASS | `final-lint.log` |
| `npx --no-install prisma validate` | PASS | `phase1-prisma-validate.log` |
| `prisma migrate diff --from-migrations … --to-schema-datamodel … --exit-code` | PASS, exit 0: no difference detected | `phase1-migration-diff.log` |
| `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --exit-code` | PASS, exit 0: no difference detected | `phase1-database-diff.log` |
| `npx --no-install prisma migrate status` | PASS: 13 migrations, database up to date | `phase1-migration-status.log` |
| `npm test` | PASS: 515 server + 313 client = **828**, no failed/skipped tests reported | `phase1-tests.log`, `phase1-tests.json` |

Prisma commands ran from `server/`. The migration-history comparison used a separate shadow
SQLite file under the new evidence directory, never the development database. The datasource
comparison and status check inspected `server/prisma/dev.db` without applying migrations.
Live smoke databases were created with `prisma migrate deploy`, validating fresh migration replay too.
The shared workspace has a typecheck script but no separate test script; the root test command
runs the server and client suites, which consume its contracts.

### Dependency Findings — Release Blockers

Both registry queries completed successfully as audits and returned exit 1 because findings exist:

| Command | Critical | High | Moderate | Total |
| --- | ---: | ---: | ---: | ---: |
| `npm audit --json` | 2 | 6 | 11 | 19 |
| `npm audit --omit=dev --json` | 0 | 5 | 1 | 6 |

| Package and installed version | Highest reported severity | In production audit? | Reported concern |
| --- | --- | --- | --- |
| `vitest` 2.1.9 | Critical | No | UI-server arbitrary file read/execution and vulnerable transitive test tooling |
| `tinypool` 1.1.1 | Critical | No | Prototype-pollution gadgets leading to remote code execution |
| `body-parser` 2.3.0 | High | Yes | Denial of service involving trailing bytes after compressed request bodies |
| `zod` 3.25.76 | High | Yes | Memory exhaustion while validating oversized constrained collections |
| `deepmerge-ts` 7.1.5 | High | Yes | Stack exhaustion on recursive object graphs |
| `@prisma/config` 6.19.3 | High | Yes | Transitive exposure through `deepmerge-ts` |
| `prisma` 6.19.3 | High | Yes | Transitive exposure through `@prisma/config` |
| `vite` 6.4.4 and two nested 5.4.21 installations | High | No | Development-server/editor/file-access advisories and vulnerable transitive dependencies |

Counts are npm's affected-package classifications, not eight independently demonstrated exploits.
The Prisma chain is included in npm's production-classified dependency graph despite Prisma also
being declared as a server development dependency. Vite's high aggregate includes its older nested
copies; it should not be read as every listed advisory applying to the 6.4.4 application copy.

The audit offers fixes, but Vitest/tinypool and Zod recommendations include major upgrades.
No `npm audit fix`, forced overrides, or unreviewed dependency changes were made during this audit.
Prioritize the production-classified findings, then remediate build/test tooling and rerun all checks.
Do not expose Vite or Vitest development/UI servers publicly as a substitute for production hosting.

Evidence: `phase1-npm-audit.json`, `phase1-npm-audit-production.json`,
`phase1-npm-audit-exit-codes.json`, and `dependency-risk-summary.json` contain the exact
dependency paths, advisory titles/URLs, affected ranges, and suggested fixes.

**Phase 1 result:** functional/static/database checks pass; dependency release gate fails.

## Phase 2 — Security, RBAC, Tenant Isolation

Reused eight existing focused suites rather than adding application features. **197 tests pass**
with zero failures or skips. This is a rerun of a subset of the 828 tests, not 197 additional unique tests.
Of these, 26 are static route/guard audits; the other 171 include real HTTP integration,
permission, and model checks.

| Identity / scenario | Verified operation | Expected and observed |
| --- | --- | --- |
| Super admin | `GET /api/v1/admin/stats` | 200 |
| Super admin | `GET /api/v1/farms/me` | 403 |
| Farm owner | Own `GET /api/v1/farms/me` and farm-scoped data | 200, own tenant only |
| Farm owner | Admin stats/farms/users and protected admin operations | 403 |
| Engineer | `GET /api/v1/farms/me/system-health` and `GET /api/v1/farms/me/analytics/export` | 200 |
| Engineer | `POST /api/v1/farms/me/irrigation/valve` | 403 |
| Operator with valve grant | `POST /api/v1/farms/me/irrigation/valve` | 201 |
| Operator without valve grant | Same valve-control operation | 403 |
| Operator | Admin endpoints and `GET /api/v1/farms/me/audit` | 403 |
| Farm A reading Farm B's zone | Direct foreign-zone read | 404 |
| Farm A modifying Farm B's zone/worker | Valve command, worker edit, valve grant, password reset | 404; foreign resources remain unchanged |
| Anonymous / disabled / invited users | Protected operations | Correct 401/403 denial; stale privileges do not bypass guards |

The operator allowance is deliberately capability-based: being an operator alone is insufficient;
the account must be active and have `valveControl` granted. Company-level leads and public reference
data are deliberate non-tenant-scoped exceptions, not farm-resource leaks.

Suites: `rbac-matrix.test.ts`, `farm-isolation.test.ts`, `multi-farm.test.ts`,
`super-admin.test.ts`, `admin-dashboard.test.ts`, `valve-control.test.ts`, `access.test.ts`,
and `audits/rbac-audit.test.ts`, all under `server/tests/`.

Evidence: `phase2-rbac.log`, `phase2-rbac-results.json`, and `phase2-rbac.json`.

**Phase 2 result:** PASS, including the requested role boundaries and cross-tenant 404 behavior.

### Requested Phase 2 Recheck — 2026-11-05 12:08 UTC

Independently reran the eight focused suites after the follow-up request: **197 passed, zero
failed, zero skipped**. The HTTP integration checks use the real Express app and a real,
dedicated SQLite test database, not mocked authentication or repositories. The total also
includes the 26 static route/guard checks described above.

- [x] **Super admin:** admin stats returns 200; farm-member endpoints return 403.
- [x] **Farm owner:** own farm data returns 200 without foreign tenant data; admin operations return 403.
- [x] **Engineer:** diagnostics and CSV export return 200; valve control returns 403.
- [x] **Operator:** valve control returns 201 with the explicit grant; admin and farm audit access return 403.
- [x] **Tenant isolation:** foreign-zone reads and cross-farm writes return 404; denied writes leave foreign resources unchanged.
- [x] An operator without the valve-control grant receives 403, even though their role is `OPERATOR`.
- [x] Before/after SHA-256 verification confirms `server/prisma/dev.db` is unchanged.

Fresh evidence: `logs/rbac-smoke-20261105T120404Z/tests.log`,
`logs/rbac-smoke-20261105T120404Z/results.json`, and
`logs/rbac-smoke-20261105T120404Z/requested-flows.json`. The last file maps each of the five
requested scenarios to its passing test assertions. No application code or permanent tests
were added or modified.

Reproduce from the repository root:

```bash
npm --workspace server run test -- \
  tests/rbac-matrix.test.ts tests/farm-isolation.test.ts \
  tests/multi-farm.test.ts tests/super-admin.test.ts \
  tests/admin-dashboard.test.ts tests/valve-control.test.ts \
  tests/access.test.ts tests/audits/rbac-audit.test.ts
```

## Phase 3 — Production Build, Navigation, Assets

### Build and Runtime

- [x] `npm run build` passes: shared contracts typecheck, server tsup bundle, and client Vite bundle.
- [x] The real compiled `server/dist/index.js`, not a development source server, serves the browser and IoT checks.
- [x] A separate `NODE_ENV=production` startup succeeds with an isolated migrated database and MQTT disabled.
- [x] Production-mode `/healthz`, `/readyz`, and `/api/v1/health` all return 200; readiness reports database `up`.

| Bundle / asset check | Measured result |
| --- | --- |
| Main entry | `assets/index-Dk2WzvWQ.js`: **456,198 bytes raw / 140,086 gzip** |
| Entry budget | PASS: 43,802 bytes below the 500,000-byte limit |
| Leaflet-containing chunk | `assets/config-W-bGrppU.js`: 158,304 bytes, outside the entry's entire static import graph |
| Lazy route entries | 17 dynamic-entry chunks |
| Emitted references | 45 HTML/JS/CSS/image files checked on disk and fetched successfully from the preview |
| Favicon / local images | Present and load successfully; no missing local images |
| Translations | 543 keys per language; EN/AR keys match and every value is a nonempty string |

A temporary Vite inspection plugin records the actual Rollup module graph and emits a manifest.
The main-entry SHA-256 remains unchanged from the normal build. Translations are compiled from
`client/src/app/i18n/translations.ts` into the entry; separate locale JSON files are not expected.

### Browser and Dead-Link Checks

The primary real Chromium run performs **27 navigation checks**, including login repetitions and redirects:

- Public: `/`, `/services`, `/products`, `/blog`, `/about`, `/login`.
- Admin: `/admin` redirect plus dashboard, pricing, blog, farms, and users pages.
- Owner: dashboard, system health, activity, analytics, settings, and diagnostics.
- Authorization: anonymous admin navigation redirects to login; owner admin navigation redirects to dashboard;
  engineer diagnostics navigation succeeds; operator diagnostics navigation redirects to dashboard.
- Arabic admin users page: translated labels and RTL rendering pass.

All **17 distinct internal destinations** collected from these rendered pages match registered routes.
No uncaught browser exceptions or unexpected same-origin HTTP error responses occur. Anonymous
`401 /api/v1/auth/refresh` responses are expected session-bootstrap behavior, not dead links.

The first quick image snapshots record **36 pending external tile observations across nine URLs**.
A focused browser follow-up with a maximum 20-second image wait loads **all 18 images** across
dashboard, diagnostics, and settings with **zero remaining image warnings or failed network requests**.
All nine ArcGIS tile GET probes return **200, `image/jpeg`**, and the dashboard screenshot confirms
the satellite map renders. This is resolved loading latency, not a missing bundled asset.

Footer HEAD probes following redirects return 200 for Facebook, Instagram, X, LinkedIn, and GitHub.
These links still target generic service homepages, not verified Semico profiles. They are reachable
but should be replaced with official destinations before launch. External providers, map tiles,
fonts, and future CMS-managed URLs are not covered by an ongoing availability guarantee.

Evidence: `phase3-build.log`, `phase3-chunk-graph.json`, `phase3-bundle-assets.json`,
`phase3-entry-sha256-before.log`, `phase3-translations.json`, `phase3-browser.json`,
`phase3-external-assets.json`, `phase3-dashboard.png`, `phase3-external-links.log`,
`phase3-map-tile-probes.log`, and `production-startup.json`.

**Phase 3 result:** PASS for the audited routes and artifacts; external-service connectivity remains a rehearsal prerequisite.

### Requested Phase 3 Recheck — 2026-11-05 12:24 UTC

Reran `npm run build` for the entire monorepo and independently remeasured the generated
artifacts. No application changes or dependency upgrades were required.

- [x] **Monorepo build:** shared typecheck, server tsup build, and client Vite build all pass.
- [x] **Main bundle:** `client/dist/assets/index-Dk2WzvWQ.js` is **456,198 bytes raw / 140,086 gzip**,
  leaving **43,802 bytes** below the 500,000-byte raw entry budget.
- [x] **Lazy loading:** the actual emitted module graph keeps Leaflet and React Leaflet outside
  the entry's entire static dependency graph. The Leaflet-containing chunk is 158,304 bytes;
  the build has 17 dynamic-entry chunks.
- [x] **Client assets:** all 45 original client output files, including HTML, JavaScript, CSS,
  the logo, and favicon reference, exist and return HTTP 200 from a temporary production preview.
  Every response's SHA-256 matches its built file, so an HTML fallback cannot conceal a missing asset.
- [x] **Server artifacts:** the compiled entry and source map exist and are nonempty;
  `node --check server/dist/index.js` passes, the source map is valid, and shared contracts are bundled.
- [x] **Artifact integrity:** all 47 original client/server build files retain their SHA-256
  hashes after the temporary manifest/module-graph inspection build.
- [x] **Translations:** all 543 English/Arabic keys match, every value is nonempty, and the
  translation module is present in the emitted entry chunk. No standalone locale JSON is expected.
- [x] **Focused checks:** all 33 existing bundle/i18n tests pass, with zero failures or skips.
- [x] **Cleanup:** the loopback-only preview on port 5198 is stopped after verification.

There are no missing emitted assets. The shared package is source-only and is consumed by the
client/server builds; a separate `shared/dist` directory is not required. This recheck verifies
build artifacts and local HTTP delivery, not renewed browser navigation or external-provider uptime.

Fresh evidence: `logs/production-build-20261105T121518Z/summary.json`,
`logs/production-build-20261105T121518Z/phase3-chunk-graph.json`,
`logs/production-build-20261105T121518Z/artifact-validation.json`, and
`logs/production-build-20261105T121518Z/http-assets.json`. The same directory contains the
build log, original file/hash inventory, and the 33-test JSON report.

**Recheck result:** PASS. Application source remains unchanged; this does not clear the
dependency/security release blockers recorded in Phase 1.

## Phase 4 — Live IoT and Realtime Demo

Used a **real Mosquitto broker**, the existing `server/scripts/esp32-simulator.ts`, the compiled
backend, two real authenticated WebSocket clients belonging to different farms, and a fresh
migrated SQLite database. The broker is real; the device is a software simulator, not physical hardware.

| Verification | Observed evidence |
| --- | --- |
| Telemetry subscription/publication | `semico/v1/devices/+/telemetry`; actual topic `semico/v1/devices/audit-controller/telemetry` |
| Threshold boundary | A persisted 18% sample produces no `MOISTURE_LOW` alert |
| Below-threshold simulator sample | 17.5%, with a new message UUID |
| Database persistence | Exact `sourceMessageId`, farm, zone, and 17.5% reading verified |
| Realtime telemetry | Authorized WebSocket receives `telemetry.updated` with the sample timestamp |
| Alert delivery | `alert.updated` contains `MOISTURE_LOW` for the mapped farm/zone |
| QoS 1 duplicate handling | Republishing the same message leaves exactly one stored row |
| REST valve request | `POST /api/v1/farms/me/irrigation/valve`, action `OPEN`, returns 201 |
| Command transport | `semico/v1/devices/audit-controller/commands/valve`, matching command ID, QoS 1, non-retained |
| Simulator receipt | Output includes `ESP32 received: OPEN valve` |
| Receipt acknowledgment | Matching `RECEIVED` message on `semico/v1/devices/audit-controller/acks/valve`; receipt timestamp persisted |
| Realtime tenant isolation | The unrelated farm receives zero events |
| Platform device count | Admin stats reports one active MQTT device |

Initial full-run correlation identifiers:

- Telemetry message: `9028e8c3-ce0c-4201-90fd-ae99ea35bbd3`.
- Valve command: `cmw3h6tga000tlbsc4t6k9s4a`.
- Persisted acknowledgment time: `2026-11-05T11:41:55.000Z`.

**Important semantic limit:** the simulator acknowledges receipt, not physical execution.
After receipt the command correctly remains **`PENDING`**, and the confirmed valve state remains
**`CLOSED`**. This audit does not claim that an actual valve opened or that execution was confirmed.

Local MQTT uses anonymous access on a temporary loopback-only broker and development-mode runtime
configuration. Production-mode startup was checked separately. Production `mqtts://`, certificates,
broker authentication, and directional device ACLs require deployment-specific verification.

Evidence: `phase4-live-iot.json`, `phase4-wire-messages.json`, `phase4-websocket-events.json`,
`phase4-live-run.log`, `iot-esp32-simulator.log`, and `iot-mosquitto.log`.

**Phase 4 result:** PASS through command receipt and persistence, with physical actuation explicitly unverified.

### Requested Phase 4 Recheck — 2026-11-05 12:39 UTC

Completed a fresh end-to-end run using the exact compiled backend verified in the Phase 3
recheck, a newly migrated audit database, and two authenticated test WebSocket clients.

- [x] **1. Broker:** real Mosquitto 2.1.2 runs on `127.0.0.1:18916`; no mock broker is used.
- [x] **2. Simulator telemetry:** the existing ESP32 simulator publishes 17.5% moisture readings
  to `semico/v1/devices/audit-controller/telemetry`, matching `semico/v1/devices/+/telemetry`.
- [x] **3. Persistence and WebSockets:** the backend stores the exact message UUID, farm, zone,
  timestamp, and reading, then delivers `telemetry.updated` to the authorized WebSocket client.
  Reopening the audit database after service shutdown confirms the reading remains persisted.
- [x] **4. Moisture alert:** an initial 18% reading has no `MOISTURE_LOW` alert; the subsequent
  17.5% simulator reading produces `alert.updated` containing `MOISTURE_LOW` for its mapped zone.
- [x] **5. Valve command:** authenticated `POST /api/v1/farms/me/irrigation/valve` with `OPEN`
  returns 201 and publishes a matching command on
  `semico/v1/devices/audit-controller/commands/valve`, with QoS 1 and `retain=false`.
  The simulator logs `ESP32 received: OPEN valve` and sends a matching `RECEIVED` acknowledgment.

Additional checks pass: duplicate delivery is observed twice on the broker but stored once
per message UUID; the unrelated farm receives zero WebSocket events; the command receipt
timestamp survives service shutdown; and all **22 existing realtime/valve tests** pass
with zero failures or skips.

Fresh correlation identifiers:

- Telemetry message: `ac5c0caf-8bec-4a04-b906-1ccf77462732`.
- Valve command: `cmw3j4zdi000tlbynml8g7pqs`.
- Persisted acknowledgment time: `2026-11-05T12:36:28.588Z`.

**Receipt is not execution:** the command remains `PENDING` and the confirmed valve state
remains `CLOSED`. This verifies the requested simulator delivery flow, not physical valve actuation.

All three audit services exit gracefully with code 0; API port 4449 and broker port 18916
are closed. Before/after SHA-256 checks confirm the development database and compiled backend
artifacts are unchanged. No application source, dependency, or environment files were modified.

Fresh evidence: `logs/live-iot-20261105T122909Z/summary.json`,
`logs/live-iot-20261105T122909Z/phase4-wire-messages.json`,
`logs/live-iot-20261105T122909Z/phase4-websocket-events.json`, and
`logs/live-iot-20261105T122909Z/post-run-verification.json`. The same directory contains the
live-run, Mosquitto, simulator, migration, and 22-test logs/results.

**Recheck result:** PASS for all five requested steps. The controlled-demo defense verdict
stands; production remains blocked by the dependency findings and deployment-specific gates.

## Warnings, Cleanup, and Defense Gates

### Minor Warnings

The dependency vulnerabilities in Phase 1 are **release blockers**, not minor warnings.
The following observations do not invalidate the passing functional checks:

- Prisma warns that `package.json#prisma` configuration is deprecated ahead of Prisma 7. This is not schema drift.
- Client server-rendered component tests emit 66 non-failing React Router `useLayoutEffect` warnings.
  Real-browser navigation has no corresponding uncaught runtime errors.
- Initial external map images need settling time; the focused recheck resolves all pending images.
- Generic social-profile links are reachable placeholders, not confirmed company profiles.
- Headless Chromium logs background Google-service registration errors (`PHONE_REGISTRATION_ERROR`
  and `DEPRECATED_ENDPOINT`). The browser audit records zero application runtime exceptions and
  zero unexpected same-origin HTTP errors; these background messages are not app failures.
- No unused-import, missing-type, or lint warnings remain. No source correction was needed in this rerun.

### Cleanup and Evidence Integrity

Cleanup is verified for the initial audit **and** subsequent rechecks:

| Run | Verified cleanup | Evidence |
| --- | --- | --- |
| Initial full audit | All 12 recorded service child processes exited; ports 4429, 4430, 5188, and 18896 closed | `logs/system-audit-20261105T112547Z/final-cleanup.json` |
| Build recheck | In-process Vite preview on port 5198 closed after all asset requests | `logs/production-build-20261105T121518Z/http-assets.json` |
| Live IoT recheck | Broker, backend, and simulator each exited with code 0; ports 4449 and 18916 closed | `logs/live-iot-20261105T122909Z/post-run-verification.json` |

The initial preview processes' exit 143 is their expected response to audit-requested termination,
not a runtime failure. Only audit-owned services were stopped. The development database was not
reset or seeded, and the follow-up before/after hashes confirm it is unchanged.

Temporary harnesses are archived as `system-smoke.cjs.txt` and `bundle-inspect.mjs.txt` inside
the ignored evidence directory, so they do not add application features or pollute repository lint.
Final typecheck and zero-warning lint pass; the tracked application source and lockfile remain unchanged.
No administrator password, JWT, refresh cookie, or production secret is included in this report.

### Before the Defense

- [x] Verify startup, UI navigation, roles, tenant isolation, telemetry, alerts, and command receipt.
- [ ] Rehearse with the actual presentation machine, broker configuration, device mappings, and venue network.
- [ ] Keep the demonstration isolated; explain that simulator receipt is not physical valve execution.

### Before Public Deployment

- [ ] Remediate critical/high dependency findings and rerun audits, tests, and production smoke checks.
- [ ] Configure HTTPS, secure cookies, authenticated `mqtts://`, device ACLs, and reverse-proxy WebSocket/SPA routing.
- [ ] Verify production migration/backup/restore procedures, secrets, and runtime monitoring.
- [ ] Verify hardware calibration, physical execution, and fail-safe behavior if deploying real valve control.
- [ ] Replace generic social destinations and account for external map/font availability.

This audit is a functional/security-boundary smoke test, not a penetration test, load/capacity
certification, cross-browser/mobile accessibility certification, or verification of an actual
public production deployment. The defense stamp is limited to the evidenced controlled demo.

**Final status — READY FOR DEFENSE, CONDITIONAL:** all four requested phases are complete;
the controlled functional demo passes. Keep the demonstration isolated, rehearse network-dependent
assets, and describe simulator receipt accurately. **Public production remains blocked** by the
documented dependency security findings and unverified deployment-specific gates.
No application code was changed, and no audit changes were committed automatically.

## Historical Report

The following pre-existing report is retained verbatim for provenance. Its baseline, timestamps,
test totals for focused reruns, and corrective changes describe the earlier audit, not this run.

<details>
<summary>Earlier audit, preserved unchanged (2026-11-04/05)</summary>

# Comprehensive System Audit & Smoke Test

**Platform:** Semico V5 — Super Admin Portal & SaaS Oversight  
**Audit window:** 2026-11-04 to 2026-11-05 UTC  
**Baseline commit:** `f9ecb6f4f39acf682af3241e0f4830155c4cc16f`  
**Final audited changes:** two corrective fixes described below; no new features or dependency upgrades.

## Verdict

> **READY FOR DEFENSE — CONDITIONAL: controlled local demonstration only.**
>
> The application builds, starts from compiled output, passes all 828 automated tests,
> renders the audited browser routes correctly, and completes the real Mosquitto → API →
> database → WebSocket → simulator command-receipt flow.
>
> **NOT READY FOR PUBLIC PRODUCTION DEPLOYMENT.** The dependency audit reports critical/high
> findings that require remediation and revalidation. A passing functional demonstration is
> not a security clearance for internet exposure or evidence of physical valve execution.

### Executive checklist

- [x] All-workspace typecheck passes.
- [x] Full repository lint passes without warnings after temporary-harness cleanup.
- [x] Prisma schema validates; migration history and the current database have no schema drift.
- [x] All **828 tests pass: 515 server + 313 client**, across 49 test files.
- [x] All **153 targeted RBAC/tenant-isolation integration tests pass**.
- [x] Both production builds pass; compiled backend startup is verified after a packaging fix.
- [x] Main client entry is **456,198 bytes**, below the 500,000-byte budget.
- [x] Leaflet is lazy-loaded outside the entry's static dependency graph.
- [x] **27 real Chromium navigation checks**, 17 internal link destinations, and 45 emitted asset requests pass.
- [x] Arabic/RTL rendering, four account categories, and protected-route redirects are verified in Chromium.
- [x] Real Mosquitto and the existing ESP32 simulator deliver telemetry, alerts, and valve-command receipt.
- [x] Audit-owned processes are stopped; development data and credentials are not reset or altered.
- [ ] Dependency audit is clean: **2 critical / 6 high overall; 5 high in production-classified dependencies**.
- [ ] Public production security approval: blocked pending dependency remediation and deployment hardening.

## Scope, environment, and evidence

The audit used existing integration tests, temporary audit harnesses, the actual built client,
the actual compiled backend, Chromium, and a real Mosquitto broker. It did not substitute a
mock broker for the live IoT check.

| Component                          | Observed version / configuration                                           |
| ---------------------------------- | -------------------------------------------------------------------------- |
| Node.js / npm                      | 22.21.0 / 10.9.4                                                           |
| TypeScript                         | 5.9.3                                                                      |
| Prisma client / CLI                | 6.19.3 / 6.19.3                                                            |
| Vitest                             | 2.1.9                                                                      |
| Vite                               | 6.4.4 for the application build                                            |
| Chromium                           | 150.0.7871.181, headless via DevTools Protocol                             |
| Mosquitto                          | 2.1.2                                                                      |
| Audit API / preview / broker ports | 4419 / 5178 / 18886                                                        |
| Browser preview / broker binding   | Loopback-only temporary services                                           |
| Live backend                       | `node server/dist/index.js`, development configuration for local `mqtt://` |
| Audit databases                    | Separate disposable SQLite files under the ignored evidence directory      |

Evidence is saved locally under `logs/system-audit-20261104T214841Z/`. This directory is ignored
by Git and is not part of the application source. Temporary scripts are archived as `.cjs.txt`
and `.mjs.txt` after execution so ordinary repository lint does not include audit harness code.
No administrator password, JWT, refresh cookie, or database is included in this report.

## Phase 1 — Static analysis, database, tests, and dependencies

### Workspace and database checks

| Check                                              | Result                                   | Evidence                      |
| -------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| `npm run typecheck`                                | PASS, all three workspaces               | `final-typecheck.log`         |
| `npm run lint`                                     | PASS, exit 0, no source warnings         | `final-lint.log`              |
| `npx --no-install prisma validate`                 | PASS                                     | `phase1-prisma-validate.log`  |
| Migration history → datamodel diff, `--exit-code`  | PASS, exit 0: “No difference detected”   | `phase1-migration-diff.log`   |
| Current datasource → datamodel diff, `--exit-code` | PASS, exit 0: “No difference detected”   | `phase1-database-diff.log`    |
| `npx --no-install prisma migrate status`           | PASS, 13 migrations; database up to date | `phase1-migration-status.log` |
| `npm test`, initial run                            | PASS, 828 tests                          | `phase1-tests.log`            |
| `npm test`, after corrective fixes                 | PASS, 828 tests                          | `final-tests.log`             |

Prisma commands ran from `server/`. The migration-history comparison used:

```bash
npx --no-install prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url file:<absolute-audit-directory>/phase1-shadow.db \
  --exit-code
```

The live-schema comparison used `--from-schema-datasource prisma/schema.prisma` and
`--to-schema-datamodel prisma/schema.prisma`. These checks did not migrate or reset development
data; only the isolated shadow database was used for migration replay.

### Dependency audit — unresolved deployment blockers

Both `npm audit --json` and `npm audit --omit=dev --json` successfully contacted the registry.
Their exit code was 1 because vulnerabilities were reported, not because the registry check failed.

| Scope                              | Critical | High | Moderate | Total |
| ---------------------------------- | -------: | ---: | -------: | ----: |
| All dependencies                   |        2 |    6 |       11 |    19 |
| Production-classified dependencies |        0 |    5 |        1 |     6 |

Counts are npm's affected-package counts; transitive parent findings are not necessarily distinct
independent exploits. Production classification is reported as npm produced it, not as a claim
that every affected code path is exercised by the running API.

| Package / installed version    | Severity       | Finding / remediation direction                                                                                                               |
| ------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest` 2.1.9                 | Critical       | Vitest UI server arbitrary file read/execution; additional mock redirect traversal finding. npm proposes Vitest 5.1.0, a major upgrade.       |
| `tinypool` 1.1.1               | Critical       | Worker/run options prototype-pollution gadgets with RCE impact; update through a compatible test-runner upgrade.                              |
| `body-parser` 2.3.0            | High           | Denial of service involving trailing bytes after compressed request bodies; audit range indicates a fix at 2.4.0+.                            |
| `zod` 3.25.76                  | High           | Memory exhaustion while validating oversized constrained collections; npm proposes Zod 4.6.7, a major upgrade requiring compatibility checks. |
| `deepmerge-ts` 7.1.5           | High           | Stack exhaustion on recursive object graphs; affected versions are below 8.0.0.                                                               |
| `@prisma/config` 6.19.3        | High           | Dependency-chain exposure through `deepmerge-ts`; assess a compatible Prisma/config update.                                                   |
| `prisma` 6.19.3                | High           | Parent dependency-chain finding; coordinate Prisma CLI and client updates.                                                                    |
| `vite` 6.4.4 and nested 5.4.21 | High aggregate | Multiple dev-server/editor/path-handling findings across installed copies. The 6.4.4 `server.fs.deny` query bypass is also reported.          |

Primary advisory references returned by npm:

- Vitest: `GHSA-5xrq-8626-4rwp`, `GHSA-82fw-gwwq-j7x9`.
- Tinypool: `GHSA-5gmw-xhrv-c9v3`, `GHSA-85c8-ppgw-ccpr`.
- body-parser: `GHSA-27r3-jxmh-p828`.
- Zod: `GHSA-mrhx-c7xc-m3w5`.
- deepmerge-ts: `GHSA-ggr8-5vv4-36mx`.
- Vite examples: `GHSA-587h-7wmj-h5pm`, `GHSA-8g5g-mxqh-grgj`; see raw JSON for all advisories.

No `npm audit fix`, forced overrides, or major upgrades were applied during this audit. Keep
development/test servers unexposed for the defense. Before public deployment, remediate the
dependency findings in a separate reviewed change and repeat the full audit.

Evidence: `phase1-npm-audit.json`, `phase1-npm-audit-production.json`, and
`dependency-risk-summary.json`.

## Phase 2 — Security, RBAC, and tenant isolation

Existing integration tests use the real Express application and a disposable SQLite database,
not mocked repository responses. The targeted run passed **153 tests in five files**.

| Actor / operation                              | Expected                       | Observed                                  |
| ---------------------------------------------- | ------------------------------ | ----------------------------------------- |
| Super admin: `GET /api/v1/admin/stats`         | Allowed                        | 200                                       |
| Super admin: `GET /api/v1/farms/me`            | No inherited farm-owner access | 403                                       |
| Owner: own farm data                           | Allowed                        | 200                                       |
| Owner: `/api/v1/admin/*`                       | Forbidden                      | 403                                       |
| Engineer: diagnostics and analytics/export     | Allowed                        | API/export 200; diagnostics route renders |
| Engineer: valve operation                      | Forbidden                      | 403                                       |
| Operator with valve grant: valve operation     | Allowed                        | 201                                       |
| Operator without valve grant                   | Forbidden                      | 403                                       |
| Operator: admin endpoints and farm audit trail | Forbidden                      | 403                                       |
| Farm A requests Farm B's resource IDs          | Resource isolation             | 404 on covered cross-farm reads/writes    |

Selecting an unowned farm with `X-Farm-Id` is separately rejected with 403; that selection check
does not replace the 404 policy for foreign resource IDs.

Additional existing coverage verifies database-fresh permissions, account disablement, farm
suspension, platform-ban override protection, super-admin safeguards, audit records, and session
revocation. In the browser, owners redirect away from `/admin`, engineers reach diagnostics,
and operators redirect away from diagnostics.

Evidence: `phase2-rbac-tests.log`, `phase2-rbac.json`, and `phase3-browser.json`.

## Phase 3 — Production startup, routes, bundles, and assets

### Corrective fixes found by smoke testing

1. **Compiled backend failed to start despite a successful build.**
   - Symptom: `ERR_MODULE_NOT_FOUND` for `shared/src/enums.js`, reached through the raw TypeScript
     workspace export.
   - Cause: tsup treated `@semico/shared` as an external dependency despite the intended bundled
     server architecture.
   - Fix: add `noExternal: ["@semico/shared"]` in `server/tsup.config.ts`; Prisma remains external.
   - Recheck: compiled `server/dist/index.js` starts, readiness succeeds, real HTTP login works,
     and the same compiled artifact completes browser and live MQTT smoke tests.
2. **The browser requested a missing favicon and received 404.**
   - Fix: declare the existing brand PNG as the favicon in `client/index.html`.
   - Recheck: Vite resolves the icon to the emitted asset; the final browser run has no unexpected
     same-origin HTTP failures.

These are packaging/asset corrections only. No application features, database schema changes,
or dependency upgrades were introduced by the audit.

### Build and browser results

- [x] `npm run build` passes for the entire monorepo after the fixes.
- [x] Compiled backend starts without a TypeScript runtime loader.
- [x] Main entry: `assets/index-Dk2WzvWQ.js`, **456,198 bytes / 456.198 kB**;
      Vite reports approximately **140.49 kB gzip**.
- [x] Leaflet is in the separate **158,304-byte** `assets/config-W-bGrppU.js` chunk and is not
      reachable through the entry's static imports. This was checked from Rollup module metadata.
- [x] 17 dynamic-entry chunks are present.
- [x] All 45 emitted asset references resolve on disk and return HTTP 200 through production preview.
- [x] No missing local images remain; the final image snapshot also reports no unresolved external images.
- [x] No uncaught Chromium runtime exceptions or unexpected same-origin HTTP errors.
- [x] Arabic labels and RTL rendering work on the admin users page; bilingual contract/UI tests also pass.

The **27 browser navigation checks** include login/redirect repetitions and cover these route areas:

- Public: `/`, `/services`, `/products`, `/blog`, `/about`, `/login`.
- Admin: `/admin` → `/admin/dashboard`, plus dashboard, pricing, blog, farms, and users.
- Owner dashboard: dashboard, System Health, Activity, Analytics, Settings, and Technical Diagnostics.
- Unauthorized redirects: anonymous admin access → login; owner admin access → dashboard;
  operator diagnostics access → dashboard; engineer diagnostics access remains allowed.

All **17 distinct internal navigation destinations** collected from the rendered pages correspond
to registered routes. Expected anonymous `401 /auth/refresh` responses are not classified as dead links.

Footer destination probes returned HTTP 200, following redirects, for Facebook, Instagram, X,
LinkedIn, and GitHub. These currently point to generic service homepages, not verified Semico
profiles; replacing them with official company URLs is a pre-launch content task. Arbitrary
future CMS URLs and external-service uptime are outside this snapshot's guarantee.

Evidence: `phase3-build.log`, `phase3-backend-build-fix.log`, `phase3-chunk-graph.json`,
`phase3-bundle-assets.json`, `phase3-browser.json`, `phase3-browser-run.log`,
`external-link-probes.log`, and `final-build.log`.

## Phase 4 — Live MQTT, persistence, WebSockets, and command receipt

The live test started a real Mosquitto broker with a temporary loopback listener and anonymous
local-test access, then started the compiled API and the existing ESP32 simulator. It used
separate audit accounts/farms and a fresh migrated audit database. No production credentials
or real device were used.

| Verification                  | Observed evidence                                                        |
| ----------------------------- | ------------------------------------------------------------------------ |
| Simulator publishes telemetry | `semico/v1/devices/audit-controller/telemetry`                           |
| Low moisture value            | **17.5%**, below the 18% threshold                                       |
| Database persistence          | Reading stored under its exact UUID `sourceMessageId`                    |
| Browser realtime notification | Real WebSocket receives `telemetry.updated`                              |
| Alert delivery                | `alert.updated` contains `MOISTURE_LOW` for the authorized farm/zone     |
| QoS 1 duplicate suppression   | Republishing the same message leaves **one** stored row                  |
| Tenant stream isolation       | The second farm's WebSocket receives **zero** unrelated events           |
| REST valve request            | Authorized OPEN request returns 201                                      |
| Broker command publication    | `semico/v1/devices/audit-controller/commands/valve`                      |
| Simulator receipt             | Console prints `ESP32 received: OPEN valve`                              |
| Device acknowledgment         | Correlated `RECEIVED` on `semico/v1/devices/audit-controller/acks/valve` |
| Receipt persisted             | `IrrigationCommand.acknowledgedAt` populated                             |
| Correct execution semantics   | Command remains **PENDING**; confirmed valve remains **CLOSED**          |
| Global device statistics      | Admin stats reports **one** active MQTT device                           |

Concrete final-run identifiers:

- Telemetry message: `68646dc8-b2b7-4526-90e7-b95a7bfbfa52`.
- Farm: `cmw2texok0003lb07p7tdx12j`.
- Zone: `cmw2texok0006lb076nvbukc3`.
- OPEN command: `cmw2tezlz000plb2h0yjp6zm7`.
- Receipt timestamp: `2026-11-05T00:36:25.445Z`.

The simulator intentionally does not send `EXECUTED`. The live test proves messaging,
persistence, authorization, alert delivery, and command receipt—not physical valve actuation,
sensor calibration, or measured agricultural water savings. Terminal execution/failed-ACK and
receipt-timeout branches are covered by automated tests rather than a real actuator in this run.

Evidence: `phase4-live-iot.json`, `phase4-wire-messages.json`, `phase4-websocket-events.json`,
`phase4-live-run.log`, `iot-mosquitto.log`, and `iot-esp32-simulator.log`.

## Minor warnings and audit-harness corrections

- Prisma warns that `package.json#prisma` configuration is deprecated for Prisma 7. The current
  Prisma 6 validation/migration commands work; migrate configuration during a reviewed upgrade.
- React Router server-rendered tests emit non-failing `useLayoutEffect` SSR warnings. The actual
  Chromium run has no uncaught runtime errors.
- An early browser probe treated not-yet-loaded map images as broken. Allowing normal loading
  and distinguishing local assets from external images resolved the harness false positive;
  the final run reports zero unresolved external images.
- The first IoT harness checked a nonexistent database field named `receivedAt`; the actual
  persisted field is `acknowledgedAt`. Correcting the harness confirmed receipt persistence.
- Temporary `.cjs`/`.mjs` audit scripts were initially picked up by repository lint. They were
  archived as text after execution; final `npm run lint` is clean. No production lint rules
  were weakened or suppressed.

## Defense and deployment gates

### Controlled graduation defense

- [x] Functional defense flow verified with the built application and real broker.
- [x] Existing MQTT demo procedure available in `docs/realtime-mqtt.md`.
- [x] Use local/controlled services and trusted source; do not expose Vite/Vitest development tools.
- [x] Explain receipt-versus-execution and synthetic/modelled data explicitly during the defense.
- [x] Audit processes terminated and temporary ports released after testing.

### Before public production deployment

- [ ] Remediate or formally assess every critical/high dependency finding, then rerun audits/tests.
- [ ] Configure HTTPS, secure cookies, `mqtts://`, broker authentication, and directional device ACLs.
- [ ] Verify real hardware execution, fail-safe behavior, and calibration if physical-control claims are required.
- [ ] Replace generic social links with official profiles and rehearse with the venue's network connectivity.
- [ ] Apply a reviewed production deployment/backup plan; this audit does not certify load capacity,
      distributed-state behavior, penetration resistance, or external-service availability.

**Final status:** application functionality is verified for the controlled defense demo after the
two corrective fixes. Public production deployment remains blocked by the reported dependency
security findings. No audit changes were committed automatically.

</details>
