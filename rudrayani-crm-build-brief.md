# Rudrayani Fintech — Collection Agency CRM
## Build Brief for Claude Code (v3 — final, all open questions resolved)

> Built for Rudrayani Fintech first, architected multi-tenant so more agencies can be onboarded later without rework.

---

## 1. System Overview

Multi-tenant SaaS for collection agencies. One agency (Rudrayani, for now) manages multiple finance-company clients (Hero FinCorp, Bajaj Finance, TVS Credit, HDB Financial, Tata Capital, etc.), each with its own customer data, products, and buckets. The agency organizes its own staff into branches and teams who call/visit/collect against that data.

Two clients: **Web portal** (admin/management) and **Mobile app** (field/calling staff).

---

## 2. Tenancy Model

```
Software Owner (Super Admin)
  └── Agency (Rudrayani Fintech) [future: multiple agencies]
        ├── Companies (Hero, Bajaj, TVS, HDB, Tata Capital, ...)
        ├── Branches / Locations (Sangli, Pune, Kolhapur, Latur, Solapur)
        └── Teams (agency's own internal teams, per branch)
```

- A **Company** is a data source (owns customers/loans), not an org structure the agency staff belongs to.
- A **Team** belongs to the agency/branch, and works allocated customers regardless of which company those customers came from.
- Design the schema so `agency_id` scopes everything now, even with only one agency live — this is what makes future multi-agency support free.

---

## 3. Organization Hierarchy & Permissions (v2)

```
Agency Admin (exactly 1 per agency)
  ├── Full permissions, including billing
  ├── Can add Operations Manager(s)
  └── Can add employees, assign roles, assign location/branch
        │
        ▼
Operations Manager
  ├── Can do everything Agency Admin can, EXCEPT:
  │     - adding another Operations Manager
  │     - billing access
  ├── Adds employees, assigns location, sets designation
        │
        ▼
Field Agents / Calling Agents (base operational staff)
```

**Confirmed:** "Team Leader" and "Branch Manager" are **designations/capabilities** that an Operations Manager assigns to any employee — not fixed rungs on the admin ladder. This is what makes a Team Leader who is also a Telecaller/Field Agent possible without a special case in the permission system.

### Capability model (unchanged principle, still recommended)
Model roles as **capabilities on a user**, not mutually exclusive:

```
User
 ├── is_agency_admin
 ├── is_operations_manager
 ├── is_team_leader        (designation, assigned by Ops Manager)
 ├── is_telecaller
 └── is_field_agent
```

- One login per person. UI/menu assembled from active capabilities.
- Converting a Telecaller to a Field Agent (or both) = toggling a flag, no re-onboarding.
- Permissions live in a separate permissions table, not hardcoded per role — future role tweaks become config changes, not code changes.
- **Dual-capability UI:** add a **toggle** so a user with both Team Leader + Agent capability can switch between "My Team" view and "My Work" view (confirmed per your answer).

---

## 4. Company-Specific Data: Import Template Engine

Each company can have a completely different Excel layout. Products and Buckets are *derived* from that data, not predefined.

### Import Template Configuration
- Per company, Admin uploads a sample file once and maps: Excel column → system field (customer name, loan number, mobile, EMI, due amount, product, bucket, branch/location if present, etc.)
- Save this mapping as a reusable template tied to `company_id`.
- Future uploads for that company auto-apply the saved template; show a preview + validation step (missing required fields, malformed rows, duplicate loan numbers) before committing.
- Unmapped columns → store as flexible `custom_fields` (JSON) on the customer record, so no data is lost.
- Allow Admin to edit/version a template if a company changes their sheet layout later.

### Products
- Populated from the imported data itself (distinct values in the mapped "Product" column), scoped per company.
- Admin screen to normalize duplicate labels (e.g., "HL" / "Home Loan" → one canonical product) without re-importing.

### Buckets — CONFIRMED
- Pulled directly from the mapped "Bucket" column in the Excel import. No system-side aging calculation needed.

### Teams
- Internal to the agency/branch. Not derived from import data. Created by Agency Admin / Operations Manager.

---

## 5. Customer Allocation — Manual Only

```
Customer Imported → Unallocated Queue (scoped to branch/team)
                          ↓
          Team Leader selects customers (multi-select)
                          ↓
              Assigns to Agent(s) on their team
                          ↓
        (Reallocation later: same action, logged with reason + timestamp)
```

Unallocated queue should be filterable by company, product, bucket so a TL can work it efficiently even with mixed-source data.

---

## 6. Customer Journey

```
Customer Imported → Manual Allocation (Team Leader) → Calling → Disposition
   → PTP → Reminder → Field Visit → Payment → Closed
```

---

## 7. Disposition Code Master (from Trail_Codes.xlsx)

Your uploaded sheet is much richer than a flat list — it's effectively a **configurable master table**, not a hardcoded enum. Model it as:

| Field | Purpose |
|---|---|
| `action_code` | Where this code applies: `OC` (outbound call), `FV` (field visit), `LG` (legal), `PIOC`/`PIFV` (penal collected — call/visit), or combined `OC/FV` |
| `category` | Grouping used for reporting rollups (e.g., "PROMISE TO PAY", "REFUSE TO PAY", "DISPUTE", "SETTLEMENT", "LEGAL PROCEEDINGS") |
| `result_code` | Short code shown/selected in the UI (e.g., `PTP`, `BP`, `RTP`, `DL`, `SKIP`) |
| `description` | Human-readable label |
| `remark_template` | Template text with placeholders, e.g. *"Customer agree to make payment of \<amount\> by \<Online payment mode\> on \<Date\> at \<Time\>"* |

**Design recommendation for the agent UI:** don't parse the template text with regex at runtime. Instead, tag each disposition code with which structured fields it needs (`needs_amount`, `needs_date`, `needs_time`, `needs_mode`, `needs_reason`, `needs_name_relation`). When an agent selects a code, the app shows only the relevant input fields, then composes the final remark by substituting values into the template. This is far more reliable than free-text placeholder parsing and still gives you the exact sentence structure from your sheet.

This master table should be **agency-configurable** (add/edit/retire codes) since your sheet already shows real-world evolution (blank result codes, duplicate categories like `RNR` appearing twice) — don't hardcode it, let Ops Manager maintain it.

Full imported list (69 rows) is preserved as-is in the source file — build the seed data importer directly from `Trail_Codes.xlsx` rather than retyping it.

---

## 8. Mobile App — Revised Scope

**Agent (Telecaller / Field capability):**
- Login (see Section 10)
- Today's Allocation (from their team's manually-assigned list)
- **Click-to-call:** tapping "Call" opens the **native phone dialer with the number pre-filled** (`tel:` intent / `url_launcher` in Flutter). No embedded VoIP/SIP — this is OS-level handoff only, so there's no automatic call-connect event; the agent still manually logs the disposition afterward.
- Manual call logging: select customer → disposition (from Section 7 master) → structured fields → remarks
- **Payment capture:** recorded by whichever agent (field or calling) closes the payment — capture amount, mode, date, and a **photo proof** (camera capture or choose from gallery)
- Field: photo upload, customer signature, navigation
- **Call duration/timing:** optional field only — not required, not validated
- Offline mode: queue actions locally, sync when connectivity returns

**Team Leader capability (toggle view):**
- Live tracking of their team (see Section 9)
- Attendance
- Team performance
- Reallocation approvals

**Operations Manager / Agency Admin (web, primarily):**
- Branch dashboard, daily collection, live team status, reports
- Employee management, location/designation assignment

---

## 9. Real-Time Location Tracking & Route Mapping (NEW)

Every employee's location must be tracked continuously from **punch-in to punch-out**, with the full route reconstructable afterward.

### Design — confirmed parameters
- **Ping frequency: every 2 minutes** while punched in — implemented as a background location service (Flutter: `flutter_background_geolocation` or `geolocator` + a foreground service on Android for reliability). This interval is a reasonable middle ground on battery drain; easy to tune later via a config value rather than a hardcoded constant, in case a specific branch wants tighter tracking.
- Each ping stored as `(user_id, timestamp, lat, lng, accuracy)` in the `location_pings` table (already in the schema, using PostGIS `GEOGRAPHY(POINT)`).
- **Retention: 60 days.** A scheduled purge job deletes pings older than 60 days (script included in the scaffold — see `backend/src/jobs/purge_old_location_pings.js`). Run it daily via cron or a scheduled task.
- On the web portal: render the day's pings as a **polyline route** on a map for admin/Ops Manager/Team Leader review — both **live** (auto-refreshing current position) and **historical replay** (pick employee + date, see the full day's path within the 60-day retention window).
- **Map provider: OpenStreetMap tiles via Leaflet** — confirmed as the free option (no per-load API cost, unlike Google Maps or Mapbox at scale). Use `react-leaflet` on the web portal and `flutter_map` (OSM-based) on mobile if you need in-app maps there too.
- PostGIS also enables "was this agent within X meters of the customer address at time of field visit" queries later if you want that validation — no extra infrastructure needed, it's built into the schema already.
- **Battery/permission reality check, still worth flagging:** continuous background GPS is one of the more permission- and battery-sensitive features on both Android and iOS. Android requires a persistent foreground-service notification for reliable background tracking; iOS background location needs "Always Allow" permission with a clear justification shown to the user. A 2-minute interval is gentler on battery than tighter intervals, but this still needs real device testing early, not just backend design.

---

## 10. Login & Auth — Recommendations

- Single login per user regardless of capability count.
- **Device binding:** one active session/device per agent login.
- **Offline-tolerant tokens:** field agents need to keep working through connectivity gaps.
- **GPS/attendance tie-in:** punch-in starts the location-tracking session (Section 9); punch-out ends it. Make this explicit in the UI, not implicit.
- **Account lockout** after repeated failed attempts.
- **Password/OTP reset path:** SMS OTP fallback for staff without usable email.
- **Role-aware landing screen:** route to the right default view based on active capabilities; dual-capability users land on their toggle view (Section 3).

---

## 11. Technology Stack (v2 — updated per your decision)

| Layer | Choice |
|---|---|
| Web frontend | React (Vite) |
| Backend | Node.js (Express or Fastify) |
| Mobile | Flutter |
| Database | **PostgreSQL** (recommended — see rationale below) |
| Hosting (later) | Any Node-friendly host — Railway, Render, DigitalOcean, or AWS/Azure when you scale |
| Auth | JWT + OTP |

### Why PostgreSQL over SQL Server here
- Free and open-source — no per-core/per-user licensing, unlike SQL Server, which matters a lot once you're self-hosting locally and later paying for production hosting.
- **PostGIS extension** gives you proper geospatial querying for Section 9 (route mapping, "distance from customer address" checks) essentially for free — this is the strongest technical reason to pick it given your new location-tracking requirement.
- First-class JSON column support (`jsonb`) — a clean fit for the flexible `custom_fields` from company-specific Excel imports (Section 4).
- Pairs naturally with a Node backend; the ecosystem (Prisma, Sequelize, node-postgres) is mature and free.

---

## 12. Local Development Setup

See the companion `SETUP_GUIDE.md` and starter scaffold (docker-compose + backend skeleton) provided alongside this brief.

---

## 13. Cost Efficiency & Rough Cost Framework

**Note:** I can't give you a firm quote — actual cost depends entirely on who builds it (in-house hires, freelancers, or an agency) and how many phases you build before launch. What I can give you is a cost-efficient framing and a ballpark range.

### Why this stack is cost-efficient
- Every layer (React, Node, PostgreSQL, Flutter) is open-source with no licensing fees — your previous stack (ASP.NET Core + SQL Server + Azure) has real recurring costs (SQL Server licensing or Azure SQL managed pricing, Windows-based App Service pricing tiers). Dropping those is the single biggest structural saving, independent of who builds it.
- Local-first development (Postgres in Docker on your own machine) costs nothing until you're ready to deploy — you only start paying for hosting when you actually need a shared/staging environment.
- A single Node backend serving both the web app's API and the mobile app's API means one backend team, not two.

### Rough build-cost ballpark (India market, MVP scope = Phases 1–3 from the earlier phased plan)
This is a **rough planning range**, not a quote:

- **Team shape:** 1 backend/full-stack developer (Node + Postgres), 1 frontend developer (React), 1 Flutter developer, part-time QA/PM — or 2 strong full-stack developers covering web+backend and mobile respectively, which is the more cost-efficient path for a lean MVP.
- **Timeline:** roughly 3–5 months for Phases 1–3 (foundation, import engine, core collection workflow) with a 2–3 person team; location tracking (Section 9) and reporting (Phase 5) add meaningfully to this if included in MVP.
- **Typical India freelance/contract rates** for mid-level developers on this kind of work run roughly ₹40,000–₹90,000/month per developer, or agency day-rate equivalents that are usually 1.5–2.5x that for the same seniority. A 2-developer team over 4 months lands very roughly in the **₹4–8 lakh range** for development labor alone at freelance rates — agency-built versions of the same scope typically run several times higher due to overhead, project management, and fixed margins.
- This excludes: hosting once live, SMS/OTP gateway costs, maps/geolocation API costs if you use Google Maps (Mapbox/OpenStreetMap-based tiles are a free alternative worth considering given the route-mapping feature), and any telephony integration you add later.

Treat these numbers as a planning anchor to sanity-check quotes you receive, not a budget to commit to sight-unseen.

---

## 14. Open Questions — All Resolved

| # | Question | Decision |
|---|---|---|
| 1 | Team Leader / Branch Manager: fixed hierarchy level or designation? | Designation/capability assigned by Operations Manager |
| 2 | Location ping frequency | Every 2 minutes |
| 3 | Map provider | OpenStreetMap / Leaflet (free) |
| 4 | Location data retention | 60 days, then purged |

No outstanding decisions remain — this brief is ready to build against.

---

## 15. Suggested Build Phases

**Phase 1 — Foundation:** multi-tenant schema, auth (login, device binding, OTP reset), capability-based role/permission system, hierarchy (Agency Admin → Ops Manager → employees).

**Phase 2 — Data Ingestion:** Import Template Configuration UI, Excel upload/validation/preview/commit, Product/Bucket derivation, disposition master seeded from `Trail_Codes.xlsx`.

**Phase 3 — Core Collection Workflow:** unallocated queue + manual allocation, calling screen (click-to-call handoff + manual disposition logging), PTP, reminders, payment entry with photo proof.

**Phase 4 — Mobile Field Features:** offline mode + sync, background location tracking (punch-in/out), photo/signature/navigation, live team tracking (Team Leader toggle view).

**Phase 5 — Reporting:** Agency/Company/Branch/Team/Agent/Bucket/Product-wise reports, route-replay view, collection efficiency.

**Phase 6 — Admin & Scale-readiness:** multi-agency onboarding, billing, master settings, API management.
