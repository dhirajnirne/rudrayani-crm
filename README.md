# Rudrayani CRM — Collection Agency Operations Platform

Multi-tenant CRM for collection agencies: a **web portal** (admin / operations management) and a **mobile app** (field & calling agents), backed by a Node.js API and PostgreSQL/PostGIS.

- Business requirements: [`rudrayani-crm-build-brief.md`](rudrayani-crm-build-brief.md)
- Original environment guide: [`SETUP_GUIDE.md`](SETUP_GUIDE.md)
- Change log (what was built, task by task): [`docs/DEVLOG.md`](docs/DEVLOG.md)

## Repository layout

```
├── backend/     Node.js (Express, TypeScript) API — serves both web and mobile
├── frontend/    React (Vite + Ant Design) web portal        [Phase 1]
├── mobile/      Flutter app for agents (Android first)      [Phase 3]
└── docker-compose.yml   Postgres 16 + PostGIS, Adminer
```

## Prerequisites

- Docker Desktop (running)
- Node.js 20+ (22 recommended)
- Flutter SDK (only for the mobile app, from Phase 3)

## Run it locally

```bash
# 1. Database — from the repo root
docker compose up -d

# 2. Backend API
cd backend
cp .env.example .env        # first time only
npm install
npm run migrate:up          # apply database migrations
npm run dev                 # starts http://localhost:4000
```

## View / verify

| What | Where |
|---|---|
| API health (DB connectivity) | http://localhost:4000/api/health |
| Database browser (Adminer) | http://localhost:8080 — System: PostgreSQL, Server: `postgres`, User: `rudrayani`, Password: `rudrayani_dev_pass`, DB: `rudrayani_crm` |
| Container status | `docker compose ps` |
| Backend tests | `cd backend && npm test` (needs the DB container running) |

## Seed data (first-time setup)

```bash
cd backend
# Create the agency row, note the returned id:
docker compose exec postgres psql -U rudrayani -d rudrayani_crm \
  -c "INSERT INTO agencies (name) VALUES ('Rudrayani Fintech') RETURNING id;"

# Load the 70 real disposition codes from Trail_Codes.xlsx:
npm run seed:dispositions -- <agency_id>
```

## Development workflow

Work follows the approved phase plan (Phases 0–6). Every schema change is a new
`node-pg-migrate` migration under `backend/migrations/` — the original
`backend/src/migrations/001_init.sql` is the frozen baseline and is never edited.
Each completed task is committed separately and recorded in `docs/DEVLOG.md`.
