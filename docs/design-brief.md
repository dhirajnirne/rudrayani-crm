# Rudrayani CRM — UI/UX Design Brief

> Source of truth for visual design across the web console and mobile app.
> Living document — update here first, then propagate to code.

## Context

Modern, exceptionally smooth, operationally resilient SaaS CRM + field-operations
mobile dashboard. The UI must display high-density financial data and complex
tracking chains clearly under high-stress field conditions: poor connectivity,
budget Android devices, glaring outdoor sunlight.

**Aesthetic:** high-utility corporate fintech — zero decorative clutter, crisp
lines, clear spacing.

## Design tokens

```yaml
Colors:
  Primary: '#00535b'          # Deep Trust Teal (primary actions, active headers, key links)
  Secondary: '#2c694e'        # Field Recovery Green (success logs, synced data, cash collected)
  Warning: '#d77a00'          # Warning Amber (pending sync queue, out-of-radius geofence)
  Error: '#ba1a1a'            # Crimson Red (overdue logs, shift logout, critical alerts)
  Surface-Main: '#ffffff'     # Stark White (high reflectance for outdoors)
  Surface-Dim: '#f7f9ff'      # Cool Light Blue/Grey (dashboard cards & backgrounds)
  Text-Primary: '#181c20'     # Carbon Charcoal (high-contrast reading)
  Sidebar: '#1A2332'          # Web console left sidebar

Typography:
  Font-Family: 'Inter, sans-serif'
  Numeric-Data: 'font-variant-numeric: tabular-nums'   # MANDATORY for all financial values

Layout:
  Minimum-Tap-Target: 48px    # strict, across inputs, segmented tabs, buttons
  Minimum-List-Row: 56px      # mobile lists/form items (anti-misclick for field officers)
  Corner-Radius:
    standard: 4px             # crisp, professional
    cards-modals: 8px
    badges-statuses: 12px     # near-circular, distinct visual separation
```

## Screen architecture

### 1. Web console — Data Import & Configuration (Admin / Ops Manager)
- Left sidebar `#1A2332`, dual-state collapsible; top breadcrumb header; large workspace card.
- **Company selector dropdown** — active banking client data sources (Hero FinCorp, TVS Credit, Bajaj Finance, …).
- **Interactive Excel field-mapping canvas** — two-column matching matrix:
  left = parsed columns from the uploaded `.xlsx`; right = dropdown assignment to
  system fields (Customer Name, Loan ID, Due Amount, Mobile, Bucket).
- **JSON custom-fields tray** at the bottom: "Unmapped Custom Columns (Saved to
  Schema JSONB)" — confirms nothing is dropped during ingestion.
- Action button: 48px solid Deep Teal — **"Apply Template & Parse Ledger"**.

### 2. Web portal — Live Team Allocation Hub & Route Replay
- Split screen: 35% left interaction deck / 65% right map canvas.
- **Left operations desk:** multi-select unallocated queue; customer cards
  filterable by Bucket, Product, Bank Entity; checkbox toggles to assign 50+
  records at once to selected agents.
- **Right map panel:** OpenStreetMap tiles (Leaflet).
- **2-minute breadcrumb trail overlay:** solid black polyline for the selected
  employee; color-coded ping dots at exact 2-minute intervals; hover tooltip =
  timestamp (HH:MM:SS), GPS accuracy radius (m), clickable [Notes] anchor
  revealing the typed visit summary in place.

### 3. Mobile — Core Execution Dashboard (Telecaller / Field Agent)
- Absolute top-anchored **network status banner**:
  - Online: Deep Teal, cloud-check icon — "Online — Cloud Connection Secured".
  - Offline: Warning Amber, cloud-slash icon — "Offline Mode — [X] Packets Queued Locally".
- **Capability switch box** (dual-capability profiles): prominent horizontal
  toggle — "My Work view" ↔ "My Team desk" (Team Leader + Agent flags).
- **Primary CTA shutter matrix:** large square button grid.
  - "Punch In / Start Shift" → opens front-camera selfie verification frame with
    embedded background GPS locking.
  - Becomes high-contrast outline "Punch Out / End Session" during a shift.

### 4. Mobile — High-Velocity Disposition Entry (offline-capable)
- Scrollable; input safe zones separated by 24px padding.
- **Customer profile block** (locked, non-editable): exactly three lines —
  Name, Contact Phone, Balance Due (large crisp tabular numbers).
- **Outcome chip array:** single-tap horizontal ribbon of 48px chips mapped to
  the disposition master (Contacted, No Answer, Callback, Resolved, …);
  selection = deep high-visibility green border/text.
- **Conditional trait capture panels:**
  - Promise codes (PTP): inline panel expands — amount promised + date/time
    follow-up controls.
  - Field cash collection: dashed-boundary container, large icon —
    "Capture Physical Receipt Proof".
- **Sticky submission trigger** anchored at base: "Commit Transaction to Queue" —
  desaturated grey and unclickable until all required fields are satisfied.

## UX micro-interactions

- **Zero-data-loss feedback loops:** offline entries write immediately to a local
  SQLite/Drift queue card with a spinner → green checkmark on sync.
- **Tabular precision alignment:** all credit values/balances/ledgers in
  tabular-nums so digits align vertically (sunlight readability).
- **Anti-misclick:** list components and form items ≥ 56px tall with clearly
  defined borders.
