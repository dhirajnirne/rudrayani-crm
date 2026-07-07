# Deployment Guide

**Stack:** Vercel (web frontend, free) + Render (backend + Postgres, free tier)
+ Cloudflare R2 (file storage, free tier).

## Why not everything on Vercel?

Vercel only runs stateless serverless functions. This backend has an
in-process cron job (`backend/src/jobs/scheduler.ts`, a daily 3am data purge)
and, until this pass, saved uploaded files (payment photos, import
spreadsheets) to local disk -- neither survives Vercel's model (no persistent
background process, no durable local filesystem). The web frontend has none
of those constraints and fits Vercel perfectly.

## 1. Cloudflare R2 (file storage)

1. Cloudflare dashboard -> R2 -> **Create bucket**. Name it e.g. `rudrayani-crm`.
2. R2 -> **Manage API Tokens** -> **Create API Token** -> permissions:
   Object Read & Write, scoped to that bucket.
3. Note down: **Account ID**, **Access Key ID**, **Secret Access Key**.
4. Your R2 endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
5. Free tier: 10GB storage, no egress fees -- comfortably enough for
   payment photos and import files for a long time.

## 2. Render (backend + Postgres)

`render.yaml` at the repo root is a Render **Blueprint** -- it describes both
the web service and the database, so Render can create both in one step.

1. Push this branch (or merge to `main` -- see note at the bottom).
2. Render dashboard -> **New** -> **Blueprint** -> connect this GitHub repo.
   Render detects `render.yaml` automatically.
3. Render creates:
   - `rudrayani-db` (free Postgres)
   - `rudrayani-backend` (free web service, `rootDir: backend`)
4. The build command (`npm install && npm run build && npm run migrate:up`)
   runs migrations automatically on every deploy -- the database schema is
   never manually applied.
5. Once created, open `rudrayani-backend` -> **Environment** and fill in the
   four vars marked `sync: false` in `render.yaml`:
   - `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
     (from step 1)
   - `SMS_PROVIDER_API_KEY` (leave blank for now -- until a real SMS provider
     is wired into `backend/src/services/sms/sms-provider.ts`, OTPs and the
     new employee-credential notifications are only logged, not sent)
6. `JWT_SECRET` and `DATABASE_URL` are generated/wired automatically by the
   blueprint -- no manual entry needed.
7. **Free tier caveats** (know these going in):
   - The free web service **spins down after 15 minutes of no traffic** and
     takes ~30-50s to wake on the next request. Fine for an internal agency
     tool people check a few times a day; not fine if you need it always-on
     -- upgrade the plan if that matters.
   - The free Postgres **expires after 90 days**. Before then, either upgrade
     to a paid Render Postgres plan, or export (`pg_dump`) and restore into a
     fresh free instance as a stopgap. Set a calendar reminder now.

## 3. Bootstrap the first Agency Admin

The app has no self-registration -- the very first user is created by a
script, same as local dev:

```bash
# From your machine, pointed at the production DATABASE_URL (Render dashboard
# -> rudrayani-db -> "External Database URL"):
DATABASE_URL="<external connection string>" npm run seed:admin -- <agency_id> <phone> <password> "<Full Name>"
```

You'll need an `agencies` row first if this is a genuinely fresh database --
check `seed_admin.ts` for the expected flow, or insert one manually:
`INSERT INTO agencies (name) VALUES ('Rudrayani Fintech') RETURNING id;`

## 4. Vercel (web frontend)

1. Vercel dashboard -> **Add New** -> **Project** -> import this repo.
2. **Root Directory**: set to `frontend` (this is a monorepo -- Vercel needs
   to know the frontend lives in a subfolder).
3. Framework preset: Vite (auto-detected).
4. Environment variable: `VITE_API_URL` = `https://<your-render-service>.onrender.com/api`
   (the `/api` suffix matters -- it's how the frontend's axios client is configured).
5. Deploy. `frontend/vercel.json` is already in place with the SPA rewrite
   rule so client-side routes (e.g. `/dashboard`, `/customers`) don't 404 on
   a hard refresh or direct link.
6. Every push to the connected branch auto-deploys; Vercel's free tier has
   no meaningful limits for a tool this size.

## 5. Mobile app (Android)

The mobile app currently defaults to `http://10.0.2.2:4000` (Android emulator
loopback) for local dev. Point a release build at production instead:

```bash
cd mobile
flutter build apk --release --dart-define=API_URL=https://<your-render-service>.onrender.com
```

Distribute the resulting APK directly (internal testing) or through the Play
Store's internal testing track -- there's no separate "mobile hosting" step;
it's just a build artifact pointed at the same backend.

## 6. After every deploy, sanity-check

- `curl https://<your-render-service>.onrender.com/api/health` -> should
  return `200`.
- Log into the web portal, confirm the dashboard loads (even with zero data).
- Record a test payment with a photo -- confirm it's retrievable afterward
  (proves R2 wiring, not just that the upload didn't error).

## Merging to main

Render and Vercel are typically pointed at your default branch (`main`).
Everything above was built and verified on
`worktree-phase7-allocation-lifecycle` -- merge it to `main` (and push)
before connecting Render/Vercel, or point both platforms at this branch
temporarily if you want to test the deploy pipeline before merging.
