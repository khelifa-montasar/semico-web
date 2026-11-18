# Host Semico on Microsoft Azure

## Your existing app

| Item               | Inspected value                            |
| ------------------ | ------------------------------------------ |
| Subscription       | Azure for Students                         |
| App Service        | `semico-khelifa`                           |
| Resource group     | `semico-rg`                                |
| Public URL         | `https://semico-khelifa.azurewebsites.net` |
| Runtime            | Linux, Node 22 LTS                         |
| Plan               | `semico-plan`, Basic B1, one worker        |
| HTTPS / WebSockets | Already enabled                            |
| Always On          | Enabled for this deployment                |

No new hosting plan, VM, container registry, or database service is required for this small,
single-instance showcase. B1 already consumes your credits/budget; monitor Azure Cost Management.
The app is now published and verified at `https://semico-khelifa.azurewebsites.net`.
Deployment changed only the existing App Service; no hosting resources were created, resized,
moved, or deleted. Admin login succeeded and `BOOTSTRAP_SUPER_ADMIN=false` is confirmed.
The administrator-password setting has been removed. Keep the existing password in the
operator's password manager; never recreate a default account to verify the deployment.

**Security gate:** the authorized blocking gate is
`npm audit --omit=dev --audit-level=high`, covering the dependencies shipped after the
packager's `npm prune --omit=dev`. Production dependencies are remediated and their audit is
clean. The full audit remains a separate non-blocking report for the upstream-unpatched
development-only Picomatch advisory, `GHSA-fc5q-39xc-vjpf`. Vitest 5 remains in use and removes
the former critical test-pool findings. This policy does not ignore production vulnerabilities,
falsify dependency versions, or remove the development warning. Offline audit messages are
not a replacement for a fresh registry audit.

## How hosting works

Azure runs the Node API and serves the built React client from one HTTPS origin. Visitors can
view public pages without login; farm dashboards and admin APIs retain authentication/RBAC.
Do not disable permissions to make the public website accessible.

Startup applies reviewed migrations, optionally creates the first administrator, then starts
the server. SQLite lives at `/home/semico-data/semico.db`, outside `/home/site/wwwroot`, so
deploying a new ZIP does not replace it. Keep **one worker**: SQLite and in-memory realtime
tickets/alerts are not suitable for horizontal scaling or shared-file deployment slots.
This is a modest showcase setup, not a load-tested production farm-control architecture.

## 1. Configure Azure

Open Azure Portal → **App Services → semico-khelifa**.

In startup/general settings:

- Keep Linux **Node 22 LTS**.
- Startup command: `node deploy/start-production.mjs`.
- Enable **Always On** on your existing B1 plan for continuous MQTT.
- Keep **HTTPS Only**, TLS 1.2 or higher, **WebSockets**, and one scale-out instance.
- Health-check path: `/readyz`.

In **Settings → Environment variables → App settings**, add:

| Name                             | Value                                             |
| -------------------------------- | ------------------------------------------------- |
| `NODE_ENV`                       | `production`                                      |
| `SERVE_CLIENT`                   | `true`                                            |
| `DATABASE_URL`                   | `file:/home/semico-data/semico.db`                |
| `CORS_ORIGIN`                    | `https://semico-khelifa.azurewebsites.net`        |
| `COOKIE_SECURE`                  | `true`                                            |
| `JWT_ACCESS_SECRET`              | New random value, at least 32 characters          |
| `REFRESH_TOKEN_PEPPER`           | Separate new random value, at least 32 characters |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false`                                           |
| `ENABLE_ORYX_BUILD`              | `false`                                           |

Let the built-in Node runtime supply `PORT`. Do not use `WEBSITE_RUN_FROM_PACKAGE` for this
writable ZIP deployment. Configure secrets in Azure, not in committed `.env` files or `VITE_*`
variables. If you add a custom domain, include its exact HTTPS origin in `CORS_ORIGIN`.

Run this separately for each secret, then save the results in a password manager:

```bash
openssl rand -hex 32
```

## 2. Create the cloud administrator

For the first startup only, also set:

| Name                    | Value                                                   |
| ----------------------- | ------------------------------------------------------- |
| `BOOTSTRAP_SUPER_ADMIN` | `true`                                                  |
| `SUPER_ADMIN_EMAIL`     | Your administrator email, for example `admin@semico.dz` |
| `SUPER_ADMIN_PASSWORD`  | New unique random password, at least 16 characters      |

After creation, set `BOOTSTRAP_SUPER_ADMIN=false`. Save the password securely, then remove
`SUPER_ADMIN_PASSWORD` manually; deployment does not remove it before the operator has saved it.
The account stays in SQLite. Bootstrap does not reset an existing password, reactivate an
account, or promote an existing farm owner/worker.

The initial rollout deliberately started with a **fresh database**. Local accounts, passwords,
farms, telemetry, and personal records are not uploaded. The dedicated public-only content seed
described in [the feature audit](azure-feature-audit.md) restores pricing, catalog, blog summaries,
and wilaya reference data without importing identities or farm data. It is a separate manual
operation, never part of startup or automatic deployment. Administrators can also edit
pricing/blog content in the admin portal.
Never run `db:seed` or `db:reset` on the online service: the development seed resets data and
creates known demo credentials. A current-data migration needs a separate consistent backup,
credential rotation, and review before physical-control integrations are connected.

## 3. Existing GitHub OIDC connection

Your repository is `khelifa-montasar/semico-web`, branch `main`.
The local publish profile is secret and its lookup returned HTTP 401. Do not commit it or
enable basic publishing authentication merely to work around that failure. The workflow uses
short-lived Microsoft Entra/GitHub OIDC credentials instead.

**Existing connection verified:** the November 18 workflow completed both OIDC login and
deployment successfully. The earlier immutable-subject mismatch is historical, not a current
deployment blocker. This content rollout does not create or modify identities, federation,
role assignments, hosting plans, or other Azure resources.

The existing GitHub `production` environment supplies `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
and `AZURE_SUBSCRIPTION_ID` as secrets. Its variables are
`AZURE_WEBAPP_NAME=semico-khelifa` and `AZURE_RESOURCE_GROUP=semico-rg`.
The workflow checks those exact targets before deploying. If OIDC later fails, investigate the
existing federation under separate authorization instead of enabling publishing passwords or
creating replacement resources.

Use protection/review rules where your GitHub plan supports them. No Azure client secret or
publish profile is needed. The workflow deploys existing resources, not new paid services.

## 4. Review, commit, and deploy

Review changes and check that secrets, publish profiles, SQLite files/sidecars, and logs are ignored.
The package includes built client/server files, production dependencies, Prisma schema/migrations,
and startup code; it excludes local databases and `.env` files.

```bash
git status
npm run typecheck
npm run lint -- --max-warnings 0
npm test
npm audit --omit=dev --audit-level=high
npm run build
npm run package:azure
```

The production audit must pass; high/critical shipping findings remain blocking. The full
audit's development-only Picomatch findings are reported non-blockingly under the authorized
policy. After review, commit and push the changes to `main`.
Deployment runs automatically on pushes to `main`: checks/audit → build → ZIP package → OIDC
login → deploy. **GitHub → Actions → Deploy to Azure → Run workflow** remains available for
manual releases of `main`. Neither path runs the content seed.

For an authenticated local Azure CLI, after the same release checks:

```bash
az webapp deploy --name semico-khelifa --resource-group semico-rg \
  --src-path dist/azure-deployment.zip --type zip --clean true
```

The GitHub workflow builds on Linux Node 22 so Prisma and Argon2 match your Azure runtime.
Do not package `node_modules` from a different operating system.

Prisma explicitly includes the `debian-openssl-3.0.x` query engine required by the Azure
Node 22 image, even when the build runner detects OpenSSL 1.1 as its native target.
Deployments clean only the application code directory so stale Oryx manifests/compressed
dependency archives cannot override the new package. The database is outside that directory.

## 5. Verify online

After successful deployment, visit `https://semico-khelifa.azurewebsites.net`:

- `/healthz` and `/readyz` return 200; readiness reports database `up`.
- Public pages load without login; `/login` and dashboard refreshes load the SPA correctly.
- Missing assets and unknown `/api/v1/...` routes still return 404, not an HTML fallback.
- Sign in with the new Azure admin; private farm/admin data stays protected.
- Cookies are secure and realtime uses same-origin `wss://`.
- Restart/redeploy and confirm the database survives outside the deployed folder.

Use Azure **Log stream** for missing secrets, native binaries, or migration errors. Startup
fails clearly when prerequisites are missing rather than claiming readiness.

## IoT and production limits

Leave `MQTT_URL` unset for the initial showcase. Real telemetry needs an external authenticated
`mqtts://` broker, paired credentials, directional device ACLs, and `MQTT_DEVICE_REGISTRY` entries
using **Azure database IDs**, not old local IDs. Do not expose anonymous Mosquitto or use
unencrypted MQTT in production.

Clear dependency findings, validate backups/restore and database/file-locking suitability,
review load/scaling, and verify physical execution/fail-safes before a real farm-control launch.
A functional public showcase is not a production security/safety certification.

References:

- [Azure Node.js configuration](https://learn.microsoft.com/azure/app-service/configure-language-nodejs?pivots=platform-linux)
- [ZIP deployment](https://learn.microsoft.com/azure/app-service/deploy-zip)
- [GitHub Actions deployment](https://learn.microsoft.com/azure/app-service/deploy-github-actions)
- [Azure/GitHub OIDC](https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect)
