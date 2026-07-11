# Mobile App Redesign — Design Prompt Pack

**Purpose of this document:** a ready-to-paste prompt pack for an AI design tool (Claude Design or similar) to produce a full mobile redesign of the Rudrayani Fintech CRM's Flutter app — one written spec covering every screen, plus individual, self-contained image-generation prompts per screen, organized by role.

**How to use it:** Paste the "Global Context Block" (§4) once at the start of your session with the design tool, then feed it the role sections in order. Each individual screen prompt in §6 is self-contained — it can be pasted on its own to produce that one screen, but always works best if the Global Context Block was established first in the same session.

---

## 1. Product & Business Context

Rudrayani Fintech runs collection-agency CRM software: a multi-tenant SaaS where a collection agency manages debt-recovery work on behalf of finance companies (Hero FinCorp, Bajaj Finance, TVS Credit, HDB Financial, Tata Capital, etc.). The agency imports each company's overdue-loan data, organizes it into buckets (aging stages) and products, and its own staff work that data end-to-end:

```
Customer Imported → Manual Allocation (Team Leader) → Calling → Disposition
   → Promise-to-Pay (PTP) → Reminder → Field Visit (if needed) → Payment → Closed
```

Roles are **capabilities on a user**, not fixed rungs — one person can be a Telecaller *and* a Team Leader *and* a Field Agent simultaneously. The web app (React + Ant Design) is the system of record and covers every workflow, including heavy admin/config work. The Flutter mobile app today covers only three of five roles (Telecaller, Field Agent, Team Leader) and is missing Ops Manager and Agency Admin entirely. This redesign brings mobile to full role parity — with mobile-appropriate scope (see §7).

---

## 2. Design Objective

Redesign the mobile app for **all five roles** — Telecaller, Field Agent, Team Leader, Ops Manager (new), Agency Admin (new) — modern and intuitive, optimized for glanceable, on-the-go use rather than desk-based data entry. **Visual direction is open** — you are not bound to the current design tokens (Deep Trust Teal #00535b, Inter, listed below for reference only). Propose whatever visual language best serves a fast-paced, outdoor, high-volume-task app; a refined evolution of the current system or a clean break are both welcome, as long as the rationale is explicit.

The single most important design principle: **the data a role needs most, in the moment they need it, must never be more than one glance or one tap away.** Every role in this document has a "think like this user" section — read it before designing their screens. A collection agency's daily rhythm is unforgiving: agents are judged on targets, calls made, and follow-through, often standing in a doorway or driving between visits. Design for that reality, not for a desk.

---

## 3. Users, Devices & Field Constraints

- **Devices:** budget/mid-range Android phones (not flagship) — assume modest GPUs, smaller/lower-density screens, and real memory pressure. Avoid heavy animation or large asset weight.
- **Environment:** outdoor use in direct sunlight is common (field agents), and indoor call-center use is common (telecallers) — contrast and legibility must hold up in both. High-contrast text, avoid low-opacity greys for anything load-bearing.
- **Connectivity:** patchy/offline is normal, especially for field agents. Every screen that shows "live" or "today" data needs a visible stale/offline state, not a silent failure. Actions (disposition, payment, field visit) must queue offline and show a clear pending-sync indicator.
- **Hands & attention:** one-handed use is common (holding a phone while standing, or driving between visits — never design an interaction that assumes two hands or sustained visual attention). Minimum 48px tap targets, 56px minimum list-row height (carried forward from the current system as a hard usability floor, not a style choice).
- **Volume:** telecallers may work through 60–150+ customers a day; field agents typically fewer but each visit is higher-stakes. Lists must support fast triage (sort/filter/priority ordering), not just chronological scroll.
- **Dual-capability users:** a Team Leader who is also a Telecaller needs a fast, low-friction toggle between "my team" and "my work" views — this must be a first-class navigation element, not buried in a menu.

---

## 4. Global Context Block

*(Paste this once at the start of every design-tool session before requesting any screen.)*

> You are designing mobile screens for a Flutter Android app used by collection-agency staff (calling agents, field agents, team leads, and managers) at a debt-recovery CRM company called Rudrayani Fintech. The app is used in bursts throughout a workday — often one-handed, often outdoors in bright sunlight, often on a budget Android phone, and often with unreliable connectivity. Design for speed, glanceability, and legibility over visual flourish. Numbers (money, counts, percentages) must use tabular/monospaced figures so columns of numbers align. Minimum tap target 48px, minimum list-row height 56px. Every screen showing "live" or "today" data needs a visible last-updated/offline state. Use a cohesive, modern visual language — you may reference the current palette (Deep Trust Teal `#00535b` primary, Field Recovery Green `#2c694e` secondary, Amber `#d77a00` warning, Crimson `#ba1a1a` error, Inter typeface) as a starting point, but propose whatever direction best fits the brief — state your rationale if you diverge. Design for both light and dark mode. Render at a standard Android portrait viewport (390×844).

---

## 5. Cross-Cutting UX Rules (apply to every screen)

1. **Role-based bottom navigation shell.** Each role sees a small, fixed set of bottom tabs (3–5 max) matched to their top jobs — never a hamburger-buried menu for daily-use screens.
2. **"Today" is the default lens.** Every dashboard opens scoped to today, with an obvious way to look back (date picker / history), never the reverse.
3. **Offline & sync state is always visible.** A persistent, unobtrusive indicator (not a blocking modal) shows: online / offline-queued (n) / syncing / synced.
4. **Alerts are proactive, not buried.** Anything time-sensitive (stationary-agent alert, no-signal alert, approval pending, PTP due today) surfaces as a badge/banner on the home tab, not only inside a dedicated alerts screen.
5. **Empty states teach, not just say "nothing here."** E.g., an empty worklist for a telecaller should say "All caught up — N customers due tomorrow," not a blank illustration.
6. **Every list is triageable.** Sort/filter by priority (overdue PTP, bucket, amount) must be reachable in one tap, not buried in a settings sheet.
7. **Every money figure is exact, tabular, and disambiguated** (₹, sign, and unit — never a bare number that could be confused with a count).
8. **Dark mode is a first-class mode**, not an inverted afterthought — verify every stat tile/chart against a dark background explicitly (this app has hit real bugs from mode-unaware components).

---

## 6. Role-by-Role Specs & Prompts

Screens marked **★ Flagship** are the highest-priority mockups — request these first. Screens without a star still need a full written spec (included below) but are lower-priority for image generation; request them once the flagship screens establish the visual language.

### 6.1 Telecaller

**Think like this user:** You sit at a desk or in a call-center seat with a target hanging over your head — a collection amount and a call-volume expectation, both tracked daily. Your entire day is a queue: pick a customer, dial, talk, categorize the outcome, move to the next. The single worst thing that can happen to you is losing track of who you've already called today — re-calling someone wastes time and looks unprofessional, and forgetting someone due today costs you your target. You are judged on two numbers above all: **how much you collected vs. target**, and **how many calls connected vs. how many you attempted**. You need your worklist prioritized for you (don't make me figure out who's most overdue), and you need a one-tap path from "look at this customer" to "log what happened" — every extra screen between dialing and logging is a call you won't make.

| Screen | Priority | Purpose | Key data shown |
|---|---|---|---|
| Home Dashboard | ★ Flagship | Today's command center | Collection ₹ vs target (progress bar + amount remaining), calls made vs worklist size, connected-call rate, PTPs due today, reminders due, quick-access to worklist |
| Worklist | ★ Flagship | The day's queue | Allocated customers, auto-prioritized (PTP-due-today first, then overdue, then by amount/bucket), filter by company/product/bucket, click-to-call |
| Customer Detail & Disposition | ★ Flagship | Log the outcome of a call | Customer/loan summary, call history timeline, disposition code picker → dynamic structured fields (amount/date/mode/reason) → auto-composed remark, click-to-call button |
| Today's Call Log | ★ Flagship | "Who did I call today" | Chronological list of every call made today with outcome, timestamp, and a "not yet called" counter for remaining worklist — this is the agent's own accountability view |
| My Performance | ★ Flagship | Target tracking | Collection vs target (today/MTD), connected-call rate trend, category breakdown (Resolution/Roll Back/Normalization/Recovery), rank if shown |
| PTPs | Standard | Promises to pay owed | List of active PTPs, due date, amount, status (upcoming/due today/broken) |
| Payments | Standard | Record/view collections | Amount, mode, date, photo proof capture, recent payments list |
| Reminders | Standard | Personal follow-ups | Due-today strip + full list, snooze/complete |
| Correction Request | Standard | Flag bad data | Simple form: field, current value, suggested value, reason |
| Login | Standard | Auth | Phone/OTP or password, device-binding notice, server-URL override (support use) |

#### Prompt — Home Dashboard ★
> Design the Telecaller Home Dashboard. Top: greeting + today's date + offline/sync indicator. Primary hero card: collection ₹ progress toward today's target — big number, progress bar, "₹X more to hit target" as a supporting line. Second row: two compact stat tiles side by side — "Calls made" (n / worklist size) and "Connected rate" (%). Third: a "Due Today" strip — horizontally scrollable chips for PTPs due, reminders due — tappable. Bottom: a prominent "Continue Worklist" CTA button showing how many customers remain. Bottom nav: Worklist, Call Log, Performance, Home.

#### Prompt — Worklist ★
> Design the Telecaller Worklist screen. A filter bar (company, product, bucket, sort) collapses into a single tap-to-expand row. Below it, a scrollable list of customer cards — each card: customer name, loan/amount due, bucket badge (color-coded), a small "PTP due today" or "overdue Nd" flag if applicable, and a one-tap green Call button that launches the native dialer. Cards for already-called-today customers are visually de-emphasized (not hidden) with a small checkmark + time. List supports pull-to-refresh and an empty state reading "All caught up — N due tomorrow."

#### Prompt — Customer Detail & Disposition ★
> Design the Telecaller Customer Detail & Disposition screen, reached after a call. Top: customer/loan summary card (name, amount due, bucket, product, company) with a Call button still accessible. A horizontal timeline strip of past interactions (calls/payments/PTPs) that expands on tap. Below: the disposition flow — a searchable grid of disposition codes grouped by category (Promise to Pay, Refuse to Pay, Dispute, etc.), and on selection, only the structured fields that code requires appear (amount/date/mode/reason), building toward a live preview of the auto-composed remark text before submit. Submit button is large and fixed at the bottom, disabled until required fields are filled.

#### Prompt — Today's Call Log ★
> Design the Telecaller "Today's Call Log" screen — the agent's own record of every call they've made today. A running total at top ("18 calls today, 11 connected"). Below, a reverse-chronological list: time, customer name, outcome badge (Connected/No Answer/Busy/Switched Off), and disposition code if logged. Include a sticky counter at the bottom: "N customers not yet called today" with a tap-through to the remaining worklist. This screen should feel like a proof-of-work log the agent is proud to show, not an audit trail.

#### Prompt — My Performance ★
> Design the Telecaller My Performance screen. Top: today vs. month toggle. Hero: collection ₹ vs target as a large radial or bar gauge. Below: connected-call-rate trend (simple line/bar over the last 7 days). A breakdown section with four labeled metric tiles: Resolution, Roll Back, Normalization, Recovery — each with its current value and short definition on tap (info icon, not a tooltip that requires hover). Keep the whole screen scannable in under 5 seconds.

*(PTPs, Payments, Reminders, Correction Request, Login follow the same visual language and cross-cutting rules — request these once the flagship set above has established the language; each is a straightforward list/form using the same card, badge, and stat-tile components.)*

---

### 6.2 Field Agent

**Think like this user:** Your day is physical — you're driving or walking between addresses, standing on doorsteps, often in bright sun where a low-contrast screen is unreadable. You care about **where to go next and how far it is**, not a scrollable abstract list. Every visit has a non-negotiable proof requirement (a photo) — if the app lets you skip it or makes it easy to fumble, that's a compliance risk for the agency. You're also being tracked continuously via GPS from punch-in to punch-out, so your attendance/tracking status needs to be visibly "on" so you're not caught off guard by a stationary-alert flag you didn't know was firing. Like the telecaller, you live and die by collection-vs-target, but your version of "who did I call today" is "which addresses have I actually visited today."

| Screen | Priority | Purpose | Key data shown |
|---|---|---|---|
| Home Dashboard | ★ Flagship | Today's field plan | Punch in/out status + GPS-tracking indicator, visits done vs assigned, collection ₹ vs target, next customer to visit |
| Worklist | ★ Flagship | Visit queue | Assigned customers, address, distance/proximity sort option, bucket/priority flag, "Navigate" + "Call" actions per card |
| Field Visit Capture | ★ Flagship | Log a visit | Navigate CTA, photo capture (required, camera or gallery), disposition code + structured fields, GPS-stamp confirmation |
| My Performance | ★ Flagship | Target tracking | Collection vs target, visits completed vs assigned, receipts/photos captured count |
| Payments | Standard | Record/view collections | Amount, mode, date, photo proof, recent payments |
| Attendance / Punch In-Out | Standard | Start/stop tracking session | Punch button, current shift duration, GPS accuracy/status |
| Reminders | Standard | Personal follow-ups | Due-today strip + list |
| Correction Request | Standard | Flag bad data | Same form as Telecaller |
| Login | Standard | Auth | Same as Telecaller |

#### Prompt — Home Dashboard ★
> Design the Field Agent Home Dashboard. Top: a visible punch-in/out state — a colored status bar (green = tracking active) with elapsed shift time, not just a small icon; this must be unmissable since GPS tracking correctness matters for compliance. Hero card: "Visits today" as a fraction (done/assigned) with a progress ring. Below: collection ₹ vs target progress bar. A "Next Stop" card showing the next customer's name, address, and distance, with a large Navigate button. High contrast throughout — assume this is being read in direct sunlight.

#### Prompt — Worklist ★
> Design the Field Agent Worklist (visit list) screen. Toggle at top: sort by priority (bucket/overdue) vs. sort by distance. Each card: customer name, address (truncated with expand), distance chip, bucket badge, two action buttons side-by-side — Navigate (opens maps) and Call (dialer). Visited-today cards show a checkmark + photo thumbnail. Strong outdoor-readable contrast; avoid thin/light font weights for anything critical.

#### Prompt — Field Visit Capture ★
> Design the Field Agent Field Visit capture screen, opened after arriving at a customer. Top: customer/loan summary + GPS-confirmed location chip ("Location captured ✓ 12m accuracy"). A mandatory photo capture step presented as a clear, large camera tile — cannot be skipped, with a visible "required" indicator; below it, gallery-choose as a secondary option. Below the photo: the same disposition-code + structured-field flow as the Telecaller screen (shared component). Submit is a large fixed bottom button, disabled until the photo is attached and required fields are filled. If offline, show a clear "will sync when back online" state instead of blocking submission.

#### Prompt — My Performance ★
> Design the Field Agent My Performance screen. Hero: collection ₹ vs target gauge. Two supporting stat tiles: "Visits completed" (n/assigned) and "Photos/receipts captured" (n). A simple weekly trend chart of visits completed. Same visual language and layout grammar as the Telecaller performance screen so the two feel like siblings, not different apps.

*(Payments, Attendance/Punch, Reminders, Correction Request, Login share components with the Telecaller equivalents — request after the flagship set.)*

---

### 6.3 Team Leader

**Think like this user:** You're accountable for a small team's output, and your job is triage: at a glance, who's doing fine and who needs you *right now*? A team member who's been stationary for 20+ minutes mid-shift, or who's gone silent (no GPS ping in 10+ minutes), is a problem you need to see before it becomes a bigger one — not something you discover by scrolling. You also sit in the approval path: reallocation requests and data-correction requests pile up and block your agents' work until you act, so those queues need to be fast to clear, not a chore. If you also carry your own calling/field workload, you need a fast, obvious way to flip between "manage my team" and "do my own work" — this toggle is something you'll use dozens of times a day, so it can't be buried.

| Screen | Priority | Purpose | Key data shown |
|---|---|---|---|
| Team Dashboard | ★ Flagship | Team command center | Attendance grid (in/out/stationary/no-signal per member), team collection vs target, active alerts, pending approvals count |
| My Team | ★ Flagship | Per-member drill-down | Member list with today's status; tap in for their worklist progress, calls/visits made, collection today |
| Live Tracking / Route Replay | ★ Flagship | Where is my team | Map with live pins per member, stationary/no-signal alert markers, tap for route replay of any member's day |
| Approvals | ★ Flagship | Clear the queue | Combined reallocation + correction request queue, customer/agent context, approve/deny with reason, one-tap actions |
| My Worklist (toggle) | Standard | Own workload, if applicable | Reuses Telecaller/Field Agent worklist screens behind the My Team ↔ My Work toggle |
| My Performance | Standard | Own targets, if applicable | Same as Telecaller/Field Agent performance screen |
| Reminders | Standard | Personal follow-ups | Same as other roles |

#### Prompt — Team Dashboard ★
> Design the Team Leader Team Dashboard. Top: a prominent My Team / My Work toggle (segmented control), always visible. Below: an attendance grid — one row per team member, avatar/initials, status dot (green=active, amber=stationary-alert, red=no-signal, grey=not punched in), and today's collection contribution. A banner surfaces above the grid if any member has an active stationary/no-signal alert, with a tap-through to that member. Below the grid: team collection ₹ vs target (aggregate progress bar) and a pending-approvals badge/CTA.

#### Prompt — My Team ★
> Design the Team Leader My Team list-and-drill-down screen. List view: each member as a card with status dot, name, today's calls-or-visits count, collection contribution. Tapping a member expands/navigates to their detail: worklist progress (n called/visited of assigned), disposition breakdown for the day, and a mini activity timeline. This is the TL's way of answering "is this specific person having a good day or a bad day" in two taps.

#### Prompt — Live Tracking / Route Replay ★
> Design the Team Leader Live Tracking screen. Full-screen map (OpenStreetMap style) with a pin per active team member, colored by status (active/stationary-alert/no-signal). A collapsible bottom sheet lists members by status with distance-from-expected-area if relevant. Tapping a pin or list item opens that member's route as a polyline breadcrumb trail with a date picker to replay a past day (within retention window). Alerts (stationary >20min, no ping >10min) are visually distinct on the map, not just in a sidebar.

#### Prompt — Approvals ★
> Design the Team Leader Approvals screen — a combined queue of Reallocation and Correction requests. Segmented tabs at top (Reallocation | Correction) each with a count badge. Each request card: requesting agent, customer/loan context, reason given, and two large action buttons (Approve / Reject) — reject requires a short reason via inline field, not a separate screen. Cleared requests animate/slide out. Empty state: "Queue clear — nice work."

---

### 6.4 Ops Manager *(new to mobile)*

**Think like this user:** You don't work one team, you work the whole operation — collections across every branch/team, exceptions that need your sign-off, and the pulse of "are we on pace today." You're mobile because you're moving between branches or in the field yourself some days, and you need the same command-center view you'd get on the web dashboard, just fast enough to check between meetings. You care most about: **are we hitting the agency's numbers**, **which agents/teams are over- or under-performing**, and **what's stuck waiting on me** (approvals). You do not need to edit org structure or re-map an Excel import from your phone — that's desk work — but you absolutely need to *see* the state of those things so nothing surprises you when you're back at a screen.

| Screen | Priority | Purpose | Key data shown |
|---|---|---|---|
| Management Dashboard | ★ Flagship | Agency-wide pulse | Collection trend chart (period selector), Top 10 / Bottom 10 agent rank cards, KPI tiles (collection vs target, active agents, attendance %) |
| Live Tracking | ★ Flagship | Where is everyone | Same map component as Team Leader's, scoped to all teams/branches, filterable by branch/team |
| Approvals | ★ Flagship | Exceptions needing sign-off | Agency-wide reallocation + correction queue (same component as TL, wider scope) |
| Day Plan | ★ Flagship | Every agent's daily snapshot | Per-agent row: attendance, PTPs due, reminders due, activity today — sortable/filterable by branch/team |
| Attendance Overview | Standard | Who's in today | Grid/table of punch status across the agency, late/absent flags |
| Reports | Standard | Deeper breakdowns | Bucket/product/branch/team-wise collection and recovery figures |
| Employees *(view-only)* | Standard | Directory | Name, role/capabilities, branch/team, status — no add/edit |
| Branches / Teams / Companies *(view-only)* | Standard | Org reference lists | Read-only lists, tap for summary detail |
| Alerts / Notification Center | Standard | Everything time-sensitive in one place | Stationary/no-signal alerts, pending approvals, import completions |

#### Prompt — Management Dashboard ★
> Design the Ops Manager Management Dashboard for mobile. Top: period selector (Today/Week/Month). A row of 3-4 compact KPI tiles: Collection vs Target, Active Agents Today, Attendance %, Pending Approvals — each tappable to drill in. Below: a collection trend bar/line chart, touch-scrollable, condensed for mobile width but not so small that values are unreadable. Below that: Top 10 and Bottom 10 Agent rank cards as a horizontally-swipeable pair of lists, each row showing agent name, branch, and their collection figure. This is the mobile equivalent of a manager's morning briefing — should be readable top-to-bottom in under 10 seconds.

#### Prompt — Live Tracking ★
> Design the Ops Manager Live Tracking screen — the same map/pin/alert language as the Team Leader's Live Tracking screen, but with a branch/team filter chip row at top (defaulting to "All") since this manager oversees multiple teams. Pin density will be higher — use clustering for zoomed-out views that expands as the manager zooms/taps in.

#### Prompt — Approvals ★
> Design the Ops Manager Approvals screen — structurally identical to the Team Leader Approvals screen (segmented Reallocation/Correction tabs, approve/reject cards), but each request card additionally shows which branch/team it's from, since this queue spans the whole agency, not one team.

#### Prompt — Day Plan ★
> Design the Ops Manager Day Plan screen — a dense, scannable table/list, one row per agent: name, branch/team, attendance status icon, PTPs due today (count), reminders due today (count), and an activity indicator (calls/visits logged so far). Include a filter bar (branch, team, role) and a search box. This is a working tool for spotting who's behind, so favor information density over whitespace — but keep row height at the 56px minimum and use color/icon coding so it's scannable without reading every cell.

*(Attendance Overview, Reports, Employees, Branches/Teams/Companies, and Alerts/Notification Center share the list/table/card language established above — request after the flagship set.)*

---

### 6.5 Agency Admin *(new to mobile)*

**Think like this user:** You own the whole agency's outcome and its organizational health, not just today's numbers. Everything the Ops Manager sees, you see too — plus the org's shape (who reports to whom), staff directory control, and visibility into the data pipeline (are this month's imports in and clean?) and the field-configuration that underpins everything. You do not touch the Excel-mapping wizard or restructure the org chart from your phone — those are precise, desk-bound tasks — but you need to know *the instant* something needs your attention there (an import stuck in review, a config gap) so it's not discovered days later.

| Screen | Priority | Purpose | Key data shown |
|---|---|---|---|
| Management Dashboard | ★ Flagship | Agency-wide pulse | Same as Ops Manager's, plus org-health tile (open imports, unresolved correction requests) |
| Org Chart *(view-only)* | ★ Flagship | Reporting structure | Read-only tree/list of who reports to whom, unassigned-staff callout |
| Employees | ★ Flagship | Staff directory | Name, role/capabilities, branch/team, status, with activate/deactivate actions (not full add/edit — that stays on web) |
| Import Status | ★ Flagship | Data pipeline health | List of recent imports per company: status (processing/pending review/committed/failed), row counts, "Review on web" CTA for anything pending |
| Field Config *(view-only)* | Standard | Config reference | Read-only master + per-company field-mapping catalog |
| Live Tracking / Day Plan / Attendance / Approvals / Reports | Standard | Same screens as Ops Manager | Identical components — Admin's scope simply defaults to full-agency rather than a subset |
| Alerts / Notification Center | Standard | Everything time-sensitive | Same as Ops Manager, plus import-completed/import-failed events |

#### Prompt — Management Dashboard ★
> Design the Agency Admin Management Dashboard — the same layout as the Ops Manager's Management Dashboard (period selector, KPI tiles, trend chart, top/bottom agent ranks), with one additional KPI tile: "Org Health" showing counts of open items needing admin attention (imports pending review, unresolved correction requests, employees pending activation). Tapping it routes to the relevant screen.

#### Prompt — Org Chart (view-only) ★
> Design the Agency Admin Org Chart screen for mobile — a read-only, collapsible tree (or, if a tree is too cramped at mobile width, a clean indented list with expand/collapse) showing reporting structure from Agency Admin down through Ops Managers, Team Leaders, and staff. Include a distinct "Unassigned" section for staff with no branch/team. No edit affordances — this is reference-only; make that clear via the absence of edit icons rather than a disabled state.

#### Prompt — Employees ★
> Design the Agency Admin Employees screen. A searchable/filterable list (by branch, team, role/capability, active status) of staff cards: name, phone, active capabilities as small badges (Telecaller/Field Agent/Team Leader/Ops Manager), branch/team, and a status toggle (active/inactive) as the only inline edit action. Tapping a card opens a read-only detail view with a "Manage on web" link for full edits. No "add employee" flow on mobile — note this via the screen's affordances (no + button) rather than a disabled one.

#### Prompt — Import Status ★
> Design the Agency Admin Import Status screen. A list of recent imports, most recent first: company name, file name, timestamp, status badge (Processing/Pending Review/Committed/Failed) with color coding, and row-count summary (e.g., "412 rows, 3 flagged"). Anything in Pending Review or Failed state shows a clear "Review on web" call-to-action rather than an in-app review flow — make it obvious this is a monitoring screen, not a workbench.

*(Field Config view, and the shared Live Tracking/Day Plan/Attendance/Approvals/Reports screens, reuse the Ops Manager components above — no separate prompts needed; scope simply defaults to the full agency.)*

---

## 7. Explicit Non-Goals (stay web-only)

To keep mobile fast and appropriate to the device, the following stay desk/web-only — mobile shows **view/monitor** states for these where relevant (per §6), never full editing:

- Excel Import Template column-mapping wizard (creating/editing a template)
- Field Config catalog editing (master + per-company field definitions)
- Org Chart restructuring (drag/reassign reporting lines)
- Branch / Team / Company create, edit, delete
- Employee create / full profile edit (mobile allows activate/deactivate only)
- Disposition code master editing
- Targets configuration
- Billing (Agency Admin only on web; not surfaced on mobile at all)

---

## 8. Deliverable Checklist for the Design Tool

- [ ] Written screen-by-screen spec confirming/refining the tables in §6 for all 5 roles (all screens, not just flagship)
- [ ] Mockups for every screen marked **★ Flagship** above (23 screens across 5 roles), light **and** dark mode
- [ ] A short rationale note if the proposed visual direction diverges from the current token system (§4)
- [ ] Confirmation that every mockup respects the cross-cutting rules in §5 (offline state, tabular numerals, tap targets, role-based nav shell)
