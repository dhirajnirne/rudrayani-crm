# Deployment Guide

**This is the accurate, current deployment description.** A previous version of
this file described a Vercel + Render + Cloudflare R2 setup that was scaffolded
but **never actually adopted for the live product** — the site has run on
Railway since 2026-07-08 and still does today. If you see `render.yaml` at the
repo root or `frontend/vercel.json`, those are leftovers from that unused
alternate path; they are not connected to anything and can be ignored or
removed. Do not follow instructions referencing Render/Vercel/R2 elsewhere in
old chat history or docs — this file is the source of truth.

**Stack:** Railway (web frontend + backend + Postgres, all three services in
one project). Auto-deploys on every push to `main`.

---

## 1. Railway project layout

Project **"pretty-trust"** (Railway workspace: Dhiraj Nirne's Projects), three services:

| Service | Root dir | Build | Start | URL |
|---|---|---|---|---|
| `rudrayani-backend` | `/backend` | `npm install && npm run build` | `npm start` (preDeploy: `npm run migrate:up`) | https://rudrayani-backend-production.up.railway.app |
| `rudrayani-web` | `/frontend` | `npm install && npm run build` | `npx --yes serve -s dist -l $PORT` | https://rudrayani-web-production.up.railway.app |
| `rudrayani-db` | — | — (runs the `postgis/postgis:16-3.4` Docker image directly) | — | internal only, not exposed |

`rudrayani-web`'s build bakes `VITE_API_URL` in at **build time** (Vite env
vars are compiled into the bundle, not read at runtime) — if the backend URL
ever changes, `rudrayani-web` needs a fresh build with the new value, not just
an env var update.

**Auto-deploy:** both `rudrayani-backend` and `rudrayani-web` are connected to
this GitHub repo's `main` branch and redeploy automatically on every push/merge
— there is no manual "deploy" step for normal changes. (Verified 2026-07-09:
merging a PR into `main` had the new routes live and responding within
Railway's normal build window, no manual trigger needed.)

## 2. Why Postgres runs as a raw Docker image, not Railway's managed Postgres

Railway's managed Postgres template does not include the PostGIS extension,
which this schema needs (`GEOGRAPHY(POINT)` columns for location tracking).
`rudrayani-db` instead runs `postgis/postgis:16-3.4` directly as a Docker
service, with `PGDATA=/var/lib/postgresql/data/pgdata` (a subdirectory, not
the volume mount root) — the volume mount root contains a `lost+found`
directory that trips Postgres's `initdb` "directory not empty" check
otherwise.

## 3. Database migrations

Every deploy of `rudrayani-backend` runs `npm run migrate:up` as a
**preDeployCommand**, before the new build starts serving traffic — so the
schema is never applied manually, and every migration file committed to
`backend/migrations/` takes effect automatically on the next deploy.

Two build-time gotchas worth knowing if `rudrayani-backend` ever fails to
deploy:
- Railway's build system (Railpack) **prunes `devDependencies`** from the
  runtime image. `node-pg-migrate` must stay in `dependencies`, not
  `devDependencies`, in `backend/package.json`, or the preDeployCommand fails
  with a "command not found" error.
- Never edit an already-applied migration file. Add a new timestamped file to
  `backend/migrations/` instead (see the naming convention already in that
  directory — a Unix-ms timestamp prefix).

## 4. File storage (payment photos, field-visit photos, supporting documents)

`backend/src/services/storage/storage-provider.ts` picks its backend
automatically based on environment variables:

- If `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
  `R2_BUCKET` are **all** set → uploads go to that S3-compatible bucket
  (e.g. Cloudflare R2), which persists across deploys.
- Otherwise → uploads fall back to local disk on the Railway container
  (`UPLOAD_DIR`, defaults to `uploads`). **This does not survive a redeploy or
  restart** unless a Railway volume is mounted at that path.

**Action item, not yet confirmed as of 2026-07-09:** check the
`rudrayani-backend` service's Environment tab on Railway to see whether the
four `R2_*` variables are set. If they are not, every payment photo,
field-visit photo, and supporting document uploaded so far is at risk of
being wiped on the next deploy — either configure R2 (or any S3-compatible
bucket) and set those four variables, or attach a persistent Railway volume
at `UPLOAD_DIR` as a stopgap.

## 5. Environment variables (backend)

Set on the `rudrayani-backend` service in the Railway dashboard:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Points at `rudrayani-db`; wired automatically if using Railway's internal networking |
| `JWT_SECRET` | Long random string |
| `JWT_EXPIRES_IN` | e.g. `8h` |
| `NODE_ENV` | `production` |
| `UPLOAD_DIR` | Local-disk fallback path (see §4) |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Optional — enables durable file storage (see §4) |
| `SMS_PROVIDER_API_KEY` | Optional — until a real SMS provider is wired into `backend/src/services/sms/sms-provider.ts`, OTPs and credential notifications are only logged, not sent |

Editing build command / start command / root directory / preDeploy command
for a service has no direct Railway CLI support — this was previously done
via the public GraphQL API (`https://backboard.railway.com/graphql/v2`,
`serviceInstanceUpdate` mutation) using the token in the Railway CLI's local
config. Environment variables themselves ARE settable via CLI
(`railway variables --set KEY=value`, after `railway link`ing to the right
service) or the dashboard.

## 6. Bootstrapping the first Agency Admin

The app has no self-registration — the first user in a fresh database is
created by a script:

```bash
# Pointed at the production DATABASE_URL (Railway dashboard -> rudrayani-db ->
# Connect -> copy the "Public Network" connection string, or run via
# `railway run` from a machine linked to the project):
DATABASE_URL="<connection string>" npm run seed:admin -- <agency_id> <phone> <password> "<Full Name>"
```

Requires an `agencies` row to exist first:
`INSERT INTO agencies (name) VALUES ('Rudrayani Fintech') RETURNING id;`

The production agency is already seeded — see the Usage Guide for current
login credentials, or check `backend/src/migrations/seed_admin.ts` for the
expected shape if bootstrapping a second agency.

## 7. Mobile app (Android)

The mobile app resolves its backend URL with this precedence:

1. **A server-address override saved on the device** — tap the gear icon on
   the login screen to view/change it without reinstalling. Useful for
   pointing an already-installed build at a different backend.
2. `--dart-define=API_URL=...` passed at build time.
3. **Build-mode default** — debug builds use `http://10.0.2.2:4000` (Android
   emulator loopback only; unreachable from a real device); release builds
   use the production URL baked into
   `mobile/lib/core/api/api_client.dart` (`_releaseDefaultUrl`), currently
   `https://rudrayani-backend-production.up.railway.app`.

For a normal release build, no flags are needed — the default is already
correct:

```bash
cd mobile
flutter build apk --release
```

Only pass `--dart-define=API_URL=...` to point a release build somewhere
other than the baked-in default (e.g. a staging backend) without touching the
in-app override:

```bash
flutter build apk --release --dart-define=API_URL=https://<other-backend>
```

If the production backend URL ever changes, update `_releaseDefaultUrl` in
`api_client.dart` and cut a new release build — existing installs can also be
repointed instantly via the in-app override, without a rebuild or reinstall.

Distribute the resulting APK directly (internal testing / sideload) or
through the Play Store's internal testing track. There is no separate
"mobile hosting" step — it's a build artifact pointed at the same Railway
backend as the web portal.

## 8. After every deploy, sanity-check

- `curl https://rudrayani-backend-production.up.railway.app/api/health`
  should return `200`.
- Log into the web portal, confirm the dashboard loads.
- Record a test payment with a photo, then reload the page and confirm the
  photo is still retrievable (this proves file storage is actually durable,
  not just that the upload didn't error — see §4).
- If a real device previously couldn't log in, confirm the mobile app's
  release build points at the correct backend (§7) before assuming a
  server-side problem.

## Known stale artifacts in this repo (not connected to anything live)

- `render.yaml` (repo root) — a Render Blueprint from the abandoned
  Render/Vercel/R2 migration attempt. Not used.
- `frontend/vercel.json` — a Vercel SPA-rewrite config from the same
  abandoned attempt. Not used.

Both are safe to delete in a future cleanup pass; they're left in place for
now only because removing them wasn't part of this update's scope.
