# `@semico/server`

The Semico REST API — Express 5, Prisma and SQLite, in TypeScript.

---

## Running it

```bash
cp .env.example .env      # then edit: at minimum, the two secrets
npm run db:migrate        # from the repo root, or `npm run db:migrate` in this workspace
npm run db:seed
npm run dev               # tsx watch on http://localhost:4000
```

| Script | Does |
|---|---|
| `dev` | `tsx watch src/index.ts` |
| `build` | Bundle to `dist/` with tsup |
| `start` | Run the built output |
| `typecheck` | `tsc --noEmit` |
| `test` / `test:watch` | vitest + supertest |
| `db:migrate` / `db:deploy` | Create a migration / apply migrations in production |
| `db:seed` | Seed demo data |
| `db:reset` | Drop, re-migrate, re-seed |
| `db:studio` | Prisma Studio |

Health endpoints: `GET /healthz` (liveness, never touches the database) and `GET /readyz`
(readiness, checks the database).

## Environment

Validated with zod at boot — a missing or malformed value fails the process immediately with a
readable message rather than surfacing as an `undefined` deep inside a request.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | |
| `PORT` | `4000` | |
| `LOG_LEVEL` | `info` | pino level |
| `CORS_ORIGIN` | `http://localhost:5173` | comma-separated list |
| `DATABASE_URL` | — | `file:./dev.db` |
| `JWT_ACCESS_SECRET` | — | ≥32 chars; `openssl rand -base64 48` |
| `REFRESH_TOKEN_PEPPER` | — | ≥32 chars; **must differ** from the access secret |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | 15 minutes |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | 30 days |
| `COOKIE_SECURE` | `false` | set `true` only behind HTTPS |
| `COOKIE_DOMAIN` | unset | |

---

## Layout

```
src/
├── index.ts          bootstrap: env → app → listen → graceful shutdown
├── app.ts            Express app factory (no listen → supertest can mount it directly)
├── config/env.ts     zod-validated, frozen config
├── db/prisma.ts      PrismaClient singleton + ping helpers
├── lib/              ApiError, response envelope, jwt, password, cookies, audit, validation
├── middleware/       auth, rbac, error handler, 404, request logger, rate limits
├── modules/          one folder per feature
│   └── <feature>/
│       ├── <feature>.routes.ts        paths + middleware only
│       ├── <feature>.controller.ts    HTTP ↔ domain; owns status codes and cookies
│       ├── <feature>.service.ts       rules, permissions, transactions
│       ├── <feature>.repository.ts    the only place Prisma appears
│       └── <feature>.mapper.ts        row → DTO (bilingual pairs, derived fields)
├── routes/index.ts   mounts every module under /api/v1
└── types/            express request augmentation, AuthContext + capability helpers
```

**The layering rule.** Routes never contain logic. Controllers never import Prisma. Services never
touch `req`/`res`. Repositories never throw `ApiError`. This is what keeps permissions and audit
writes in one predictable place per feature instead of scattered across handlers.

## Data model

```mermaid
erDiagram
  User ||--o| Farm : "owns"
  User }o--o| Farm : "works at"
  User ||--o{ Experience : has
  User ||--o{ Education : has
  User ||--o{ RefreshToken : holds
  User ||--o{ IrrigationCommand : issues
  User ||--o{ AuditLog : acts

  Farm ||--|| FarmSettings : has
  Farm ||--o{ Zone : contains
  Farm ||--o{ Telemetry : records
  Farm ||--|| DeviceStatus : reports
  Farm ||--o{ SystemComponent : reports
  Farm ||--o{ ErrorLog : logs
  Farm ||--o{ ActivityLog : logs

  Zone ||--o{ Telemetry : samples
  Zone ||--o{ IrrigationCommand : targets
  Zone ||--o{ ActivityLog : mentions

  User {
    string id PK
    string email UK
    string passwordHash
    string role "OWNER | WORKER"
    string workerType "OPERATOR | OBSERVER"
    boolean valveControl
    string status "ACTIVE | INVITED | DISABLED"
    string farmId FK
  }
  Farm {
    string id PK
    string ownerCode UK "XXXX-XXXX"
    string ownerId FK
  }
  Telemetry {
    string id PK
    string farmId FK
    datetime recordedAt
    float rootMoisture
    float surfaceMoisture
    float flowRateLpm
  }
  ActivityLog {
    string id PK
    string kind
    string type "AUTO | MANUAL"
    datetime occurredAt
    string messageEn
    string messageAr
  }
  AuditLog {
    string id PK
    string actorId FK
    string action
    string entityType
    string entityId
    string ip
  }
  BlogPost {
    string id PK
    string slug UK
    string titleEn
    string titleAr
  }
```

Two schema constraints are worth knowing before you edit `schema.prisma`:

1. **SQLite has no native `enum` in Prisma.** Every status field is a `String` whose allowed values
   live in `shared/src/enums.ts` and are validated by zod at the edges. Writing `enum` in the schema
   will fail `prisma migrate`.
2. **SQLite has no `Json` scalar.** Structured extras (`AuditLog.metadata`, `ActivityLog.params`)
   are JSON-encoded strings.

Translatable content uses explicit `titleEn` / `titleAr` column pairs rather than JSON — queryable,
type-safe, and portable if the project ever moves off SQLite.

## API

All routes are under `/api/v1`. 🔓 public · 🔐 signed in · 👑 owner · 🎛 owner or granted operator

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | 🔓 | versioned liveness |
| POST | `/auth/register` | 🔓 | owner creates a farm, or worker joins by owner code |
| POST | `/auth/login` | 🔓 | also resolves an `INVITED` account to `ACTIVE` |
| POST | `/auth/refresh` | 🔓 | rotates; reuse revokes the whole token family |
| POST | `/auth/logout` | 🔐 | revokes the refresh token |
| GET | `/auth/me` | 🔐 | |
| GET/PATCH | `/users/me` | 🔐 | own profile; email and role are not editable |
| POST/PATCH/DELETE | `/users/me/experience[/:id]` | 🔐 | |
| POST/PATCH/DELETE | `/users/me/education[/:id]` | 🔐 | |
| GET/PATCH | `/farms/me` | 🔐 / 👑 | |
| GET/PATCH | `/farms/me/settings` | 🔐 / 👑 | thresholds and preferences |
| POST | `/farms/me/owner-code/rotate` | 👑 | invalidates the old join code |
| GET | `/farms/me/zones` | 🔐 | |
| GET | `/farms/me/workers` | 👑 | |
| POST | `/farms/me/workers/invite` | 👑 | returns a one-time password |
| PATCH | `/farms/me/workers/:id` | 👑 | demoting an operator clears valve control |
| PATCH | `/farms/me/workers/:id/valve-control` | 👑 | audited |
| POST | `/farms/me/workers/:id/reset-password` | 👑 | returns a one-time password, revokes sessions |
| DELETE | `/farms/me/workers/:id` | 👑 | soft delete — detach + disable |
| GET | `/farms/me/telemetry/latest` · `/latest-per-zone` | 🔐 | |
| GET | `/farms/me/telemetry` | 🔐 | `?interval=day\|hour&range=7d` |
| GET | `/farms/me/device-status` | 🔐 | |
| GET | `/farms/me/system-health` · `/system-health/errors` | 🔐 | |
| GET | `/farms/me/activity` | 🔐 | paged; filter by type/kind/zone/date |
| GET | `/farms/me/activity/calendar` | 🔐 | day numbers that had irrigation |
| POST | `/farms/me/irrigation/irrigate` | 🎛 | writes command + valve + feed + audit atomically |
| POST | `/farms/me/irrigation/valve` | 🎛 | open/close |
| GET | `/farms/me/irrigation/commands` | 🔐 | |
| GET | `/farms/me/analytics/overview` · `/moisture` · `/flow` · `/heatmap` | 🔐 | |
| GET | `/farms/me/analytics/export` | 🔐 | CSV, not the JSON envelope |
| GET | `/farms/me/audit` | 👑 | security trail with actor, IP, user agent |
| GET | `/bookings/availability` | 🔓 | |
| POST | `/bookings` | 🔓 | rate-limited on the auth budget |
| GET | `/bookings` · PATCH `/bookings/:id` | 👑 | confirm or cancel |
| POST | `/leads` | 🔓 | lead-capture form, rate-limited on the auth budget |
| GET | `/leads` · PATCH `/leads/:id` | 👑 | sales pipeline; nothing is emailed, so this is where enquiries surface |
| GET | `/content/bundle` · `/blog` · `/blog/:slug` · `/products` · `/service-plans` · `/team` · `/stats` · `/testimonials` | 🔓 | bilingual |
| GET | `/reference/wilayas` | 🔓 | 58 rows |

Response envelope: `{ data, meta? }` on success, `{ error: { code, message, details? } }` on
failure. The client unwraps `data` and throws on `error`, so handlers never invent their own shape.
`code` is stable and machine-readable; the client branches on it to show translated copy.

## Authentication and permissions

**Two concepts, deliberately separate.**

- **Role** — `OWNER` or `WORKER`. Gates administration: workers, farm settings, the audit trail.
- **Capability** — valve control. Not a role. An `OPERATOR` holds it only while the owner has
  granted it; `OBSERVER`s never do.

**Tokens.** The access token is a 15-minute JWT carrying only `{ sub, role }`, held in memory by the
client. The refresh token is opaque and random, stored only as a hash, delivered as an httpOnly
`SameSite=Lax` cookie scoped to `/api/v1/auth`, and rotated on every use — presenting an
already-revoked one revokes the entire token family and forces a fresh sign-in.

**Why the JWT is deliberately thin.** `requireAuth` re-reads `workerType`, `valveControl`, `status`
and `farmId` from the database on every request. If those lived in the token, revoking an operator's
valve permission would not take effect until their token expired. Do not move them into the JWT to
save a query — that is a security regression, not an optimisation.

## Audit trail

Two tables record the same events for different audiences:

- `AuditLog` — security. Actor, IP, user agent. Owner-only, never bilingual.
- `ActivityLog` — the farmer-facing feed. Bilingual, farm-scoped, what the Activity page renders.

Both are written by `lib/audit.ts` and `service` code **inside the same `$transaction` as the state
change**, so a grant that rolls back cannot leave an audit row claiming it happened. Actions
recorded: `PERMISSION_GRANT`, `PERMISSION_REVOKE`, `VALVE_OPEN`, `VALVE_CLOSE`, `WORKER_INVITED`,
`WORKER_REMOVED`, `LOGIN`, `REFRESH_REUSE_DETECTED`.

## Adding an endpoint

1. Add or extend the zod schema in `shared/src/domain/`.
2. Write the repository method (Prisma only, always farm-scoped).
3. Write the service method (rules, permission checks, transactions, audit writes).
4. Write the controller (parse with the shared schema, call the service, shape the response).
5. Mount it in `<feature>.routes.ts`, then in `routes/index.ts`.
6. Add a supertest case in `tests/`.

## Testing

```bash
npm test
```

vitest + supertest against a real Express app and a throwaway SQLite file, so tests exercise the
middleware chain, validation and the database rather than mocks.

## Notes

- `argon2` is a native module. If it will not build on a target machine, `lib/password.ts` is the
  only file that needs to change to swap in pure-JS `bcryptjs`.
- The build uses `tsup` (esbuild) rather than raw `tsc`: Node ESM requires `.js` extensions on
  relative imports, and `tsc` will not rewrite them. `tsc` is still used for `--noEmit` typechecking.
- The seed data is demo data — mock workers, sensors and posts. It is not real farm data.
