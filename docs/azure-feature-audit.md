# Azure feature audit and public content restoration

Target: <https://semico-khelifa.azurewebsites.net>, existing app `semico-khelifa` in `semico-rg`.
Audit date: November 18, 2026. No other Azure resource may be changed.

## Final live checklist

Application release: `c9124353e7299048461fc8e4a359c4832313d954`.
[Automatic deployment 44367413808](https://github.com/khelifa-montasar/semico-web/actions/runs/44367413808)
and the separate CI workflow are green. Verification includes 561 server tests, 333 client tests,
typechecks, lint, production dependency audit, build, packaging, OIDC login, and deployment.

The hash-checked content script ran **once** inside the existing app container. Its transaction
inserted 58 wilayas, 3 service plans, 2 pricing plans, 6 products, and 4 blog posts: **73 rows**.
Pre/post SELECT/count checks confirm every non-content table is unchanged, including the existing
2 users, 1 farm, 3 zones, 1 booking, 4 refresh-token records, and 8 audit records. No accounts,
credentials, farms, device readings, enquiries, appointments, or histories were imported.
The original backup remains `/home/semico-data/semico.backup-20261118.db` (401408 bytes).

All URLs below are relative to <https://semico-khelifa.azurewebsites.net>.

| Feature | Final status | Live evidence / URL |
| --- | --- | --- |
| Services/pricing | WORKING | `/services` renders Residential/Farm; `/api/v1/content/pricing-plans` 200, 2 rows |
| Service reference plans | WORKING | `/api/v1/content/service-plans` 200, Residential/Farm/Custom, 3 rows |
| Catalog | WORKING | `/products` renders 6 cards; `/api/v1/content/products` 200, 6 rows |
| Blog and filters | WORKING | `/blog` renders 4 articles; Guides/Technology each show 2; all 4 blog-record endpoints return 200 |
| Arabic/RTL | WORKING | Browser switches pricing and blog titles to Arabic and sets `lang=ar`, `dir=rtl` |
| Home/about base content | WORKING | `/` and `/about` render; ROI slider updates modelled savings; booking availability loads |
| Team/testimonials/marketing metrics | EMPTY-DATA, withheld | Public collections return 200 with 0 rows; personal-looking/unverified copy was not approved |
| Wilaya reference data | WORKING | `/api/v1/reference/wilayas` 200, 58 rows; source labels/coverage preserved |
| Login form and anonymous guards | WORKING | `/login` renders; invalid login/register return 400; guarded APIs return 401 |
| Positive admin login/CMS/oversight | BLOCKED: credentials | Admin account exists and pricing/blog rows are present; password absent from app settings and private environment |
| Farm dashboard/maps/settings/profiles/workers/activity/audit | BLOCKED: positive owner checks | Every handler is deployed/protected; all farm routes redirect anonymous browsers to `/login`; existing records remain intact |
| Telemetry/system-health/diagnostics/analytics/export data | EMPTY-DATA | No sensor telemetry imported; real device onboarding/data required; protected handlers remain reachable |
| Consultation booking | WORKING reads/validation | `/api/v1/bookings/availability` 200; invalid creation 400; existing booking preserved; no test appointment submitted |
| Lead capture | WORKING modal/validation | Pricing CTA opens the lead form; invalid creation 400; no false enquiry submitted |
| WebSocket rejection/origin guards | WORKING | `wss://semico-khelifa.azurewebsites.net/api/v1/realtime` rejects missing ticket with 401, wrong origin with 403 |
| Positive WebSocket 101 handshake | BLOCKED: owner/worker credentials | Requires a legitimate farm-member ticket; SUPER_ADMIN intentionally cannot obtain one |
| Real MQTT broker/physical actuation | INTENTIONALLY-OFF | MQTT_URL remains unset; no real broker enabled; no physical execution claimed |
| Demo/test accounts and farm fixtures | INTENTIONALLY-OFF | Production seed writes only five public/reference tables; existing identities remain unchanged |
| Static/media assets | WORKING | All 46 deployed JS/CSS/PNG assets match local SHA-256; zero broken browser images; no upload transfer needed |
| Unknown API/assets | WORKING | Unknown `/api/v1/...` and `/assets/...` return JSON 404, not SPA HTML; unknown WSS path returns 404 |
| Health/readiness | WORKING | `/healthz`, `/readyz`, `/api/v1/health` 200; readiness database `up` |
| Current app logs | WORKING | Connected log tail after deployment reports zero fresh error/fatal records; expected anonymous/validation warnings remain |

Rendered HTML from `/services`, `/products`, and `/blog` was inspected after API content loaded;
these pages no longer show empty states. Browser checks found zero uncaught exceptions and
broken images. All 12 concrete admin/farm destinations correctly redirect anonymous sessions
to login. All 84 feature API signatures were reprobed after seeding; expected 200/400/401/resource
404 results are intact. CMS ID parameters accept the deterministic content IDs.

### Remaining operator decisions

- Provide existing administrator and farm-member credentials securely for positive login,
  authenticated dashboard/CMS reads, and a successful WSS 101 test. Do not paste credentials
  into public logs/chat, reset passwords, enable bootstrap, or create demo accounts to bypass this.
- Approve or replace public team profiles, attributed testimonials, and marketing statistics
  before publishing them. They remain excluded, not silently anonymized or fabricated.
- Supply full article bodies if article-detail reading is desired; the local project only
  supplies the four titles/excerpts. Review copied pricing/trial copy and the modelled ROI formula
  against actual business offers; none is derived from real farm telemetry.
- Real telemetry and physical-control verification require separately authorized device/broker
  onboarding. Leave the real broker off for this showcase; do not manufacture sensor history.

## Root cause and baseline evidence

The deployed server, homepage, and all 46 client JS/CSS/logo assets match their local SHA-256
hashes. All 18 client destinations return the full SPA. All 84 feature API handlers, plus the
versioned health endpoint, are present. Public collections return 200, protected handlers return
401 without a token, invalid anonymous submissions return 400, and unknown API/assets return
JSON 404 rather than the SPA. A browser renders the catalog/blog empty states without broken
images or uncaught exceptions.

The public/reference tables were empty. This is a fresh-database content gap, not missing
application code or static files. Production already contains an existing administrator, owner,
farm, three zones, and booking; these are operational records, not content to replace.

The database was copied before inspection to
`/home/semico-data/semico.backup-20261118.db`. Keep this original backup; do not overwrite it on
another run on the same day. No SQLite WAL sidecar was present at snapshot time. All 15
migrations were complete. Roles and permissions are shared-code enums and RBAC guards, not
missing reference tables.

| Feature | In code? | Live baseline | Data baseline | Classification |
| --- | --- | --- | --- | --- |
| Home/about landing sections | Yes | Pages and content bundle 200 | Team/statistics/testimonials empty | EMPTY-DATA; unapproved records excluded |
| Services/pricing | Yes | Page and pricing API 200 | PricingPlan 0 | EMPTY-DATA |
| Products/catalog | Yes | Page and products API 200 | Product 0 | EMPTY-DATA |
| Blog/filtering | Yes | Page and blog API 200 | BlogPost 0 | EMPTY-DATA |
| Wilaya dropdowns | Yes | Reference API 200 | Wilaya 0 | EMPTY-DATA |
| Login/session | Yes | Login SPA, validation 400, guards 401 | Existing admin and owner | WORKING guards; positive login needs credentials |
| Admin overview/farms/users | Yes | SPA and guarded APIs | Existing farm/users | WORKING guards; positive reads need admin session |
| Admin pricing/blog CMS | Yes | SPA and guarded APIs | Both collections empty | EMPTY-DATA |
| Farm dashboard/settings/maps | Yes | SPA and guarded APIs | Farm/settings/zones present | WORKING guards; no fake farms imported |
| System health/diagnostics/history | Yes | SPA and guarded APIs | Device status present; no sensor telemetry | EMPTY-DATA; real device onboarding required |
| Activity/security audit | Yes | SPA and guarded APIs | Existing activity/audit records | WORKING guards |
| Analytics/export | Yes | SPA and guarded APIs | No telemetry | EMPTY-DATA; no synthetic history imported |
| Profiles/workers/irrigation | Yes | Registered guarded APIs | Existing operational records | WORKING guards; no demo users imported |
| Consultation booking | Yes | Availability 200; invalid creation 400 | Existing booking preserved | WORKING validation; no test booking created |
| Lead capture | Yes | Invalid creation 400; protected reads 401 | No leads | WORKING validation; no fake enquiry created |
| Realtime WebSocket | Yes | Same-origin WSS 401; wrong origin 403; unknown socket 404 | Needs a farm-member ticket | WORKING guards; positive 101 needs owner/worker credentials |
| Physical MQTT broker | Yes | MQTT_URL unset | No live telemetry | INTENTIONALLY-OFF |
| Client assets/health/404 behavior | Yes | 46 assets 200; health/readiness 200; unknown API 404 | Complete bundle; DB up | WORKING |

`WORKING guards` records deployment/reachability evidence, not an authenticated positive test.
The saved administrator password is absent from Azure settings. Do not reset it or re-enable
bootstrap for verification. A SUPER_ADMIN intentionally has no farm membership and cannot
obtain an owner/worker realtime ticket.

## Reviewed public content

Only public constants were extracted from `server/prisma/seed.ts` into the independent
`server/prisma/seeds/content-data.ts` module. The production seed never imports or executes the
development seed. The original local database is not packaged or copied.

| Table | Items | Count | Source |
| --- | --- | --- | --- |
| Wilaya | Codes 01–58, Adrar through El Meniaa | 58 | Public WILAYAS definitions; matches local DB |
| ServicePlan | Residential, Farm, Custom | 3 | Public SERVICE_PLANS definitions |
| PricingPlan | Residential, Farm | 2 | Existing development seed's derivation from SERVICE_PLANS |
| Product | Semico Controller V2; Soil Moisture Sensor; LoRa Gateway; Solar Power Kit; Flow Meter; 4G Module | 6 | Public PRODUCTS definitions |
| BlogPost | How LoRa is Revolutionizing Algerian Agriculture; Optimizing Soil Moisture Thresholds for Olive Trees; Solar-Powered Irrigation: A Complete Guide; Understanding Soil Drying Rates in Arid Climates | 4 | Public BLOG_POSTS definitions |

Total: 73 reference/content rows. Prices and trial copy are copied from the existing public
project content, not inferred from private records. The local PricingPlan table was also empty;
copying it alone would not restore the services page. Wilaya Arabic labels preserve the source
dataset's Latin-script names rather than inventing translations.

Excluded pending explicit public-content approval: named team profiles, attributed testimonials,
and unverified marketing metrics (system count, water savings, service coverage, uptime).
Never import development users, passwords, refresh tokens, profiles, farms, sensor readings,
bookings, leads, audit/activity history, or dated sample booking blocks. The four articles contain
titles/excerpts, not full bodies; real article copy requires the business owner.

## Media strategy

The reviewed blog/product rows have no image URLs. Products use existing bundled Lucide icons;
branding is a bundled PNG. All bundled assets are already included by `deploy/package-azure.sh`.
No uploads directory or missing public file was found. The dedicated seed writes null optional
image URLs, never local paths or external placeholder links. No upload files need to be copied.

## One-time operator execution

Build/package includes `server/dist/seed-content.js`; packaging fails if it is absent. The seed
is never run at startup, by migrations, or by the deployment workflow.

Preview without connecting to a database:

```bash
node server/dist/seed-content.js --dry-run
```

The root workspace alias also previews by default and forwards explicit CLI arguments:

```bash
npm run db:seed:content -- --dry-run
```

Passing `--apply` without an explicit DATABASE_URL must fail, not silently preview or load a
development `.env`. A regression test covers flag forwarding through this root npm alias.

After deployment, use Azure CLI SSH to the existing app only:

```bash
az webapp ssh --name semico-khelifa --resource-group semico-rg
```

Inside the app container, confirm the backup exists and run the reviewed seed once:

```bash
test -f /home/semico-data/semico.backup-20261118.db
DATABASE_URL=file:/home/semico-data/semico.db \
  node /home/site/wwwroot/server/dist/seed-content.js --apply
```

Without `--apply`, the script only previews names/counts. Applying requires an explicit SQLite
DATABASE_URL. It writes only the five listed tables in one transaction. Wilaya code, blog slug,
and deterministic content IDs are unique upsert keys. Existing matching service/pricing/product
names are adopted without duplication. Empty upsert updates preserve existing editor changes,
deactivated prices, unpublished posts, and coverage settings. Reruns do not reset content or
create accounts. Tests verify idempotence and preservation against a disposable test database.

## Live verification

- Render `/`, `/services`, `/products`, `/blog`, `/about`, and `/login` in a browser. Check real
  pricing/product/article text, category filtering, language switching, and broken-image count.
- Public APIs must return 2 pricing plans, 3 service plans, 6 products, 4 blog summaries, and
  58 wilayas after an empty-table import. Team/statistics/testimonials stay empty until approved.
- Inspect production counts with Node/Prisma SELECT/count queries only; verify existing user,
  farm, zone, booking, telemetry, and other non-content counts are unchanged.
- Unknown `/api/v1/...` and `/assets/...` remain JSON 404. Guarded handlers remain 401 without
  a token. `/healthz`, `/readyz`, and `/api/v1/health` remain 200, with readiness database `up`.
- Use the existing admin credentials from a password manager or private environment variables;
  never print credentials, cookies, tokens, or personal response bodies. Verify admin pricing/blog
  APIs and refresh/logout. Do not reset credentials to make this check pass.
- Use an existing OWNER/WORKER session for a one-use realtime ticket and successful same-origin
  WSS handshake. Anonymous 401 and wrong-origin 403 alone are not a successful 101 test.
- Review fresh log records for error/fatal events. Ignore only clearly historical resolved
  failures, not new startup, database, or migration errors.
- Leave MQTT_URL unset. Irrigation without a configured transport remains simulated; do not
  present simulated execution as proof of physical actuation or manufacture telemetry.

## Client route inventory

| Route group | Destinations |
| --- | --- |
| Public | `/`, `/services`, `/products`, `/blog`, `/about`, `/login` |
| Admin | `/admin` (redirect), `/admin/dashboard`, `/admin/pricing`, `/admin/blog`, `/admin/farms`, `/admin/users` |
| Farm | `/dashboard`, `/dashboard/system-health`, `/dashboard/activity`, `/dashboard/analytics`, `/dashboard/settings`, `/dashboard/diagnostics` |

Admin paths use RequireSuperAdmin; farm paths use RequireAuth. Diagnostics additionally
requires an owner or engineer. The admin wildcard redirects to its dashboard.

## Server API router inventory

All mounts below come from server/src/routes/index.ts. Sharing the farm prefix does not remove
per-route authentication, farm isolation, owner/engineer checks, or valve-control permissions.

| Router | API mount | Handlers |
| --- | --- | ---: |
| admin | `/api/v1/admin` | 15 |
| auth | `/api/v1/auth` | 5 |
| content | `/api/v1/content` | 9 |
| reference | `/api/v1/reference` | 1 |
| bookings | `/api/v1/bookings` | 4 |
| leads | `/api/v1/leads` | 3 |
| users | `/api/v1/users` | 8 |
| farm | `/api/v1/farms` | 12 |
| telemetry | `/api/v1/farms/me` | 9 |
| realtime | `/api/v1/farms/me` | 1 |
| activity | `/api/v1/farms/me` | 2 |
| irrigation | `/api/v1/farms/me` | 3 |
| analytics | `/api/v1/farms/me` | 5 |
| workers | `/api/v1/farms/me` | 6 |
| audit | `/api/v1/farms/me` | 1 |

The root API additionally serves GET /api/v1/health. The same-origin WebSocket upgrade
handler is /api/v1/realtime, and MQTT is a gateway rather than an HTTP router.

| Method | Registered path |
| --- | --- |
| GET | `/api/v1/admin/stats` |
| GET | `/api/v1/admin/pricing` |
| GET | `/api/v1/admin/pricing/:id` |
| POST | `/api/v1/admin/pricing` |
| PATCH | `/api/v1/admin/pricing/:id` |
| DELETE | `/api/v1/admin/pricing/:id` |
| GET | `/api/v1/admin/blog` |
| GET | `/api/v1/admin/blog/:id` |
| POST | `/api/v1/admin/blog` |
| PATCH | `/api/v1/admin/blog/:id` |
| DELETE | `/api/v1/admin/blog/:id` |
| GET | `/api/v1/admin/farms` |
| PATCH | `/api/v1/admin/farms/:id/status` |
| GET | `/api/v1/admin/users` |
| PATCH | `/api/v1/admin/users/:id/status` |
| POST | `/api/v1/auth/register` |
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/refresh` |
| POST | `/api/v1/auth/logout` |
| GET | `/api/v1/auth/me` |
| GET | `/api/v1/content/bundle` |
| GET | `/api/v1/content/blog` |
| GET | `/api/v1/content/blog/:slug` |
| GET | `/api/v1/content/products` |
| GET | `/api/v1/content/service-plans` |
| GET | `/api/v1/content/pricing-plans` |
| GET | `/api/v1/content/team` |
| GET | `/api/v1/content/stats` |
| GET | `/api/v1/content/testimonials` |
| GET | `/api/v1/reference/wilayas` |
| GET | `/api/v1/bookings/availability` |
| POST | `/api/v1/bookings` |
| GET | `/api/v1/bookings` |
| PATCH | `/api/v1/bookings/:id` |
| POST | `/api/v1/leads` |
| GET | `/api/v1/leads` |
| PATCH | `/api/v1/leads/:id` |
| GET | `/api/v1/users/me` |
| PATCH | `/api/v1/users/me` |
| POST | `/api/v1/users/me/experience` |
| PATCH | `/api/v1/users/me/experience/:id` |
| DELETE | `/api/v1/users/me/experience/:id` |
| POST | `/api/v1/users/me/education` |
| PATCH | `/api/v1/users/me/education/:id` |
| DELETE | `/api/v1/users/me/education/:id` |
| GET | `/api/v1/farms` |
| POST | `/api/v1/farms` |
| GET | `/api/v1/farms/me` |
| PATCH | `/api/v1/farms/me` |
| PATCH | `/api/v1/farms/me/boundary` |
| GET | `/api/v1/farms/me/settings` |
| PATCH | `/api/v1/farms/me/settings` |
| POST | `/api/v1/farms/me/owner-code/rotate` |
| GET | `/api/v1/farms/me/zones` |
| POST | `/api/v1/farms/me/zones` |
| PATCH | `/api/v1/farms/me/zones/:id` |
| GET | `/api/v1/farms/me/zones/:id` |
| GET | `/api/v1/farms/me/zones/:zoneId/history` |
| GET | `/api/v1/farms/me/sensors/:sensorId/history` |
| GET | `/api/v1/farms/me/telemetry/latest` |
| GET | `/api/v1/farms/me/telemetry/latest-per-zone` |
| GET | `/api/v1/farms/me/telemetry` |
| GET | `/api/v1/farms/me/device-status` |
| GET | `/api/v1/farms/me/sensors` |
| GET | `/api/v1/farms/me/system-health` |
| GET | `/api/v1/farms/me/system-health/errors` |
| POST | `/api/v1/farms/me/realtime-ticket` |
| GET | `/api/v1/farms/me/activity` |
| GET | `/api/v1/farms/me/activity/calendar` |
| POST | `/api/v1/farms/me/irrigation/irrigate` |
| POST | `/api/v1/farms/me/irrigation/valve` |
| GET | `/api/v1/farms/me/irrigation/commands` |
| GET | `/api/v1/farms/me/analytics/overview` |
| GET | `/api/v1/farms/me/analytics/moisture` |
| GET | `/api/v1/farms/me/analytics/flow` |
| GET | `/api/v1/farms/me/analytics/heatmap` |
| GET | `/api/v1/farms/me/analytics/export` |
| GET | `/api/v1/farms/me/workers` |
| POST | `/api/v1/farms/me/workers/invite` |
| PATCH | `/api/v1/farms/me/workers/:id` |
| PATCH | `/api/v1/farms/me/workers/:id/valve-control` |
| POST | `/api/v1/farms/me/workers/:id/reset-password` |
| DELETE | `/api/v1/farms/me/workers/:id` |
| GET | `/api/v1/farms/me/audit` |
