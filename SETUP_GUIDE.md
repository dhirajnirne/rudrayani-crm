# Local Development Setup Guide — Rudrayani CRM

This gets you a working local environment: Postgres (with PostGIS) running in Docker, a Node/Express API skeleton connected to it, seeded with your real disposition codes, plus pointers for React and Flutter.

Everything here runs on your own machine — no cloud, no cost, until you decide to deploy.

---

## Prerequisites (install once)

- **Docker Desktop** (runs Postgres locally without installing Postgres directly) — https://www.docker.com/products/docker-desktop
- **Node.js 20 LTS** — https://nodejs.org
- **Flutter SDK** (for the mobile app later) — https://docs.flutter.dev/get-started/install
- A code editor (VS Code recommended)

---

## 1. Start the database

From the project root (where `docker-compose.yml` lives):

```bash
docker compose up -d
```

This starts:
- **Postgres 16 + PostGIS** on `localhost:5432` (user: `rudrayani`, password: `rudrayani_dev_pass`, db: `rudrayani_crm`)
- **Adminer** (a simple DB browser UI) on http://localhost:8080 — log in with the same credentials, system: PostgreSQL, server: `postgres`

Check it's running:
```bash
docker compose ps
```

---

## 2. Set up the backend

```bash
cd backend
cp .env.example .env
npm install
```

Run the schema migration (creates all tables, including the disposition_codes and location_pings tables):

```bash
docker compose exec -T postgres psql -U rudrayani -d rudrayani_crm < src/migrations/001_init.sql
```

Seed your real disposition codes from `Trail_Codes.xlsx` (already copied into `src/migrations/`):

```bash
npm install xlsx
# First create an agency row and grab its id, e.g. via Adminer, then:
node src/migrations/seed_disposition_codes.js <agency_id>
```

Start the API in dev mode (auto-restarts on file changes):

```bash
npm run dev
```

Verify it's alive and can reach the database:

```bash
curl http://localhost:4000/api/health
```

You should see `{"status":"ok","db_connected":true,...}`.

---

## 3. Set up the frontend (React)

The scaffold doesn't hand-write a full React app (better to use the official generator so you're on current tooling):

```bash
cd ..
npm create vite@latest frontend-app -- --template react
cd frontend-app
npm install
npm run dev
```

Point its API calls at `http://localhost:4000/api`. Add a `.env` with:
```
VITE_API_URL=http://localhost:4000/api
```

---

## 4. Set up the mobile app (Flutter)

```bash
flutter create rudrayani_mobile
cd rudrayani_mobile
flutter run
```

Key packages to add early, matching the build brief:
- `url_launcher` — for click-to-call (opens native dialer with number prefilled, Section 8)
- `geolocator` or `flutter_background_geolocation` — for punch-in/out location tracking, pinging every 2 minutes (Section 9, confirmed)
- `flutter_map` (OpenStreetMap-based, free — matches the confirmed map provider) — if you need in-app maps on mobile too
- `image_picker` — for payment proof photo capture/gallery selection
- `connectivity_plus` + local storage (e.g. `hive` or `sqflite`) — for offline queueing and sync
- `dio` or `http` — for API calls

On the web portal (React), use `react-leaflet` with OpenStreetMap tiles for the same reason — no per-load map API cost.

---

## 5. Suggested repo layout going forward

```
rudrayani-crm/
├── docker-compose.yml
├── backend/          # Node/Express API
├── frontend-app/      # React web portal (Ops Manager / Admin)
└── rudrayani_mobile/  # Flutter app (agents / field staff)
```

Keep these as three folders in one repo (a monorepo) for now — simplest to manage with a small team, and nothing stops you from splitting them later.

---

## 6. What's already wired up in the backend skeleton

- `src/config/db.js` — shared Postgres connection pool
- `src/routes/health.js` — confirms API ↔ DB connectivity
- `src/migrations/001_init.sql` — full schema: agencies, branches, teams, companies, users (capability model), import_templates, customers, disposition_codes, call_logs, payments, location_pings, attendance
- `src/migrations/seed_disposition_codes.js` — loads your actual 69-row disposition sheet into the database, so it's real data from day one, not placeholders

## 7. Location ping retention (confirmed: 60 days)

`src/jobs/purge_old_location_pings.js` deletes pings older than 60 days. Run it manually for now:

```bash
node src/jobs/purge_old_location_pings.js
```

Once deployed, schedule it daily via cron (a suggested crontab line is in the file's header comment).

## 8. What to build next (maps to the build brief phases)

1. Auth routes (`/api/auth/login`, OTP reset) + JWT issuing, device-binding check
2. Agency/Ops Manager employee-management endpoints (add employee, assign branch/team/designation)
3. Excel import endpoint using the `import_templates` column mapping
4. Allocation, calling, disposition-logging, and payment endpoints
5. Location-ping ingestion endpoint (`POST /api/location/ping`, pinging every 2 minutes from the app) + a route-replay query endpoint using PostGIS

Refer back to `rudrayani-crm-build-brief.md` for the full functional detail behind each of these.
