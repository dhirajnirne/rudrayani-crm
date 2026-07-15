# Rudrayani CRM — Full UI Capture

Live capture of every route and modal/drawer state in the web app (`frontend/`), taken via Playwright against the running dev server, one file per role.

## Regenerate

```bash
# Pre-flight: docker compose up -d, backend `npm run dev` (:4000), frontend `npm run dev` (:5173)
node scripts/capture-ui.mjs   # writes ui-capture/raw/
node scripts/assemble-ui.mjs  # writes ui-capture/<role>.html + this file
```

## Files

- `agency_admin.html` — Agency Admin
- `operations_manager.html` — Operations Manager
- `team_leader.html` — Team Leader
- `telecaller.html` — Telecaller
- `field_agent.html` — Field Agent
- `raw/` — per-screen raw captures + `_capture-results.json` (full ok/skipped/error log)
- `raw/_public/` — Login and Forgot Password (unauthenticated, captured once)

## Known, accepted gaps (not bugs in this capture)

Nothing here was forced — every gap below is because a trigger genuinely had no data to act on in the live dev database at capture time (e.g. no row to click), not a script failure. No demo/business data was seeded, reallocated, or otherwise mutated to manufacture these states, per the explicit decision to accept gaps rather than touch real data.

- **Report an Error (Payment)** — not captured for agency_admin, operations_manager, team_leader: trigger not reachable (locator.click: Timeout 3000ms exceeded.)
- **Approve Reallocation Request** — not captured for agency_admin, operations_manager, team_leader: trigger not reachable (locator.click: Timeout 3000ms exceeded.)
- **Reject Reallocation Request** — not captured for agency_admin, operations_manager, team_leader: trigger not reachable (locator.click: Timeout 3000ms exceeded.)
- **Approve Correction Request** — not captured for agency_admin, operations_manager, team_leader: trigger not reachable (locator.click: Timeout 3000ms exceeded.)
- **Reject Correction Request** — not captured for agency_admin, operations_manager, team_leader: trigger not reachable (locator.click: Timeout 3000ms exceeded.)
- **Customer Detail Drawer** — not captured for telecaller, field_agent: trigger not reachable (page.waitForSelector: Timeout 5000ms exceeded.)
- **Log Call** — not captured for telecaller, field_agent: trigger not reachable (locator.click: Timeout 3000ms exceeded.)
- **Record Payment** — not captured for telecaller, field_agent: trigger not reachable (locator.click: Timeout 3000ms exceeded.)
- **Worklist Reallocate** — not captured for telecaller, field_agent: trigger not reachable (locator.click: Timeout 3000ms exceeded.)
- **Report an Error (Payment)** — not captured for telecaller: trigger not reachable (page.waitForSelector: Timeout 5000ms exceeded.)

## Note on fidelity: charts and same-origin assets

Canvas-based charts (`@ant-design/plots`) are flattened to a static PNG snapshot at capture time (canvases don't serialize into HTML) — they render correctly but are non-interactive. Each captured screen has `<base href="http://localhost:5173/">` injected so any residual same-origin asset reference still resolves — **keep `frontend: npm run dev` running while viewing these files** for full fidelity, even though most Ant Design styling is self-contained (Vite dev-mode injects `<style>` tags directly into the captured DOM).

## Per-role capture counts

| Role | OK | Skipped | Error |
|---|---|---|---|
| Agency Admin | 41 | 5 | 0 |
| Operations Manager | 41 | 5 | 0 |
| Team Leader | 28 | 5 | 0 |
| Telecaller | 25 | 5 | 0 |
| Field Agent | 25 | 4 | 0 |
