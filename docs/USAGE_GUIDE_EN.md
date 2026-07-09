# Rudrayani CRM — Usage Guide

*A complete guide to using the Rudrayani Fintech collection-agency CRM: the web
portal (for management) and the mobile app (for field/calling staff).*

> मराठी आवृत्ती (Marathi version) — see `USAGE_GUIDE_MR.md` in this folder.

---

## Table of Contents

1. [What This App Does](#1-what-this-app-does)
2. [Key Terms — Glossary](#2-key-terms--glossary)
3. [Roles and What Each One Can Do](#3-roles-and-what-each-one-can-do)
4. [Getting Started](#4-getting-started)
5. [Web Portal — Page by Page](#5-web-portal--page-by-page)
6. [Mobile App — Screen by Screen](#6-mobile-app--screen-by-screen)
7. [End-to-End Workflows](#7-end-to-end-workflows)
8. [Best Practices for Agents](#8-best-practices-for-agents)
9. [Troubleshooting & FAQ](#9-troubleshooting--faq)

---

## 1. What This App Does

Rudrayani CRM helps a collection agency manage the work of recovering
overdue loan payments on behalf of finance companies (lenders like Hero
FinCorp, Bajaj, TVS Credit, etc.). The agency imports a lender's loan book,
assigns each account to a telecaller or field agent, and tracks every call,
visit, promise-to-pay, and payment made against it — from first contact all
the way to the account being closed or recalled by the lender.

There are two apps:

- **Web portal** — used by the Agency Admin, Operations Managers, and Team
  Leaders to import data, allocate work, monitor the team, and see reports.
- **Mobile app (Android)** — used by Telecallers and Field Agents to see
  their daily worklist, call/visit customers, record outcomes and payments,
  and (for Team Leaders) keep an eye on their team.

One person can hold more than one capability at once (e.g. someone can be
both a Telecaller *and* a Team Leader) — the apps automatically show or hide
screens/menu items based on what a person is allowed to do.

---

## 2. Key Terms — Glossary

| Term | Meaning |
|---|---|
| **Agency** | Your collection agency (Rudrayani Fintech). Everything in the system belongs to one agency. |
| **Company** | A finance company / lender whose loan book you're collecting for (e.g. Hero FinCorp). Not part of your staff org chart — just the source of the customer data. |
| **Branch** | A physical office/location of your agency (e.g. Sangli, Pune). |
| **Team** | A group of staff within a branch, led by a Team Leader. |
| **Capability** | What a staff member is allowed to do: Agency Admin, Operations Manager, Team Leader, Telecaller, Field Agent. One person can have several. |
| **Customer / Loan Account** | One borrower's overdue loan, imported from a company's file. Has a status: **Active**, **Closed**, or **Recalled**. |
| **Bucket** | The lender's own label for how overdue a loan is (e.g. "30 DPD", "NPA 1"). Buckets are configured per company (see Buckets page) and mapped to a standard 0–20 "canonical" delinquency scale so different lenders' labels can be compared fairly. |
| **DPD** | Days Past Due — how many days overdue a loan's EMI is. |
| **Product** | The loan type (e.g. "Personal Loan", "Home Loan"), read automatically from the imported file. |
| **Allocation** | Assigning a loan account to a specific Telecaller or Field Agent so they're responsible for working it. |
| **Unallocated Queue** | Loan accounts that have been imported but not yet assigned to anyone. |
| **Reallocation** | Moving an already-assigned account to a different agent, with a required reason (logged for audit). |
| **Reallocation Request** | A request an agent raises (from the mobile app) asking their Team Leader to move a customer away from them (e.g. wrong area, language mismatch, dispute). The Team Leader approves (optionally picking a new agent) or rejects it. |
| **Disposition / Disposition Code** | The recorded outcome of a call or visit — e.g. "PTP" (Promise to Pay), "RNR" (Ringing, No Response), "RTP" (Refuse to Pay). Each code is configured with which extra details it requires (amount, date, mode, reason, etc.). |
| **Trail / Trail History** | The full history of every call/visit logged against a customer, in order. |
| **PTP (Promise to Pay)** | A commitment the customer made to pay a specific amount by a specific date. Created automatically when an agent logs a promise-type disposition. Status: **pending**, **kept**, or **broken**. |
| **Reminder** | A personal follow-up note an agent sets for themselves (with or without a customer attached), separate from a PTP. Triggers a phone notification at the chosen time. |
| **Field Visit** | A record of an in-person visit to a customer's address — requires a photo and captures GPS location automatically. |
| **Payment** | Money collected from a customer, with amount, mode, date, and (usually) a photo proof. |
| **Deposit / Deposited** | Once a collected payment is physically banked, an admin/ops user marks it "Deposited" on the Deposits page — until then it shows as "Pending". |
| **Closed** (customer status) | The account is fully resolved (paid off) and marked closed from the mobile Payment screen — it leaves active worklists. |
| **Recalled** (customer status) | The lender told the agency (via a new import file) that this account should no longer be worked — different from Closed; it means the *lender* pulled it back, not that it was resolved. |
| **Normalized (this month, pending lender confirmation)** | A blue badge shown when a payment has brought an account's bucket back to current *before* the lender's own file confirms it — the lender's bucket label stays authoritative everywhere else until they confirm. |
| **Bucket Movement** | A detected change in a customer's delinquency bucket — either "Payment (in-month)" (detected immediately from a payment) or "Allocation (confirmed)" (confirmed later by the lender's next monthly file). |
| **Import Template** | A saved mapping (Excel column → system field) for a specific company's file layout, so future uploads for that company don't need re-mapping. |
| **Import Review Queue** | Where an Agency Admin/Ops Manager decides what to do with discrepancies found in a repeat monthly import: new loans (**additions**), loans missing from the new file (**removals** → recalled), and previously-recalled loans reappearing (**reactivations**). Nothing changes automatically — every discrepancy waits here for a decision. |
| **Target** | A monthly goal (₹ or count) set per agent / team / branch / whole agency, for each of five metrics: Collection, Resolution, Roll Back, Normalization, Recovery. Dashboards measure actual performance against these. |
| **Attendance / Punch In / Punch Out** | An agent starting/ending their work shift for the day in the mobile app. Punching in starts location tracking; punching out stops it. |
| **Day Plan** | A web page for managers showing, for any day, every agent's attendance, PTPs due, reminders due, and activity so far. |
| **Attachment / Document** | A supporting file (photo or PDF) uploaded against a customer — e.g. a KYC document or agreement copy — separate from payment/visit proof photos. |
| **Custom Field / Detail Field** | Any column from the original import file that didn't map to a standard system field is kept as a "custom field" so no data is lost; some can be flagged to also show on the Customer Detail view as a "detail field". |

---

## 3. Roles and What Each One Can Do

Roles are called **capabilities** in this system, and they stack — someone
can hold more than one at a time.

| Capability | Can do |
|---|---|
| **Agency Admin** (exactly one per agency) | Everything — including adding/removing Operations Managers and billing access. Cannot be edited or deactivated from the Employees screen (managed separately). |
| **Operations Manager** | Everything the Agency Admin can do **except** adding another Operations Manager or billing. |
| **Team Leader** | A *designation*, not a fixed rung — assigned to any employee by an Ops Manager. Can allocate/reallocate customers, view employees, view reports (for their team), view tracking (for their team), and — on mobile — sees an extra "My Team" tab. |
| **Telecaller** | Works an assigned worklist by phone: logs calls, records payments, sets reminders, requests reallocation. Sees only their own customers and their own performance. |
| **Field Agent** | Same as Telecaller, plus records field visits (in-person, with photo + GPS). |

A person with **Team Leader + Telecaller** capabilities, for example, gets
both the normal worklist screens *and* the "My Team" tab on mobile, plus
extra web-portal access — the apps combine whatever capabilities a person
has rather than forcing a single role.

**Visibility scoping**, used throughout the app:
- **Agency Admin / Operations Manager** → see everything, agency-wide.
- **Team Leader** → see only their own team (customers, reports, tracking,
  employees).
- **Telecaller / Field Agent** → see only their own assigned customers and
  their own performance (self-scoped).

---

## 4. Getting Started

### Web portal
1. Go to the web portal URL your admin gives you.
2. Enter your **Phone** (used as the login ID) and **Password**.
3. Click **Log in**. The menu on the left automatically shows only the
   pages you have permission for.
4. Forgot your password? Click **Forgot password?** — enter your phone
   number, you'll receive a 6-digit OTP by SMS, then set a new password.

### Mobile app
1. Install the app (APK provided by your admin, or via the Play Store
   internal testing track if set up).
2. Enter your **Phone Number** (10 digits) and **Password**, then **Sign
   In**.
3. If you get "Cannot reach server," check your internet connection first.
   If it persists, contact your admin — the app may need to be pointed at
   the correct server address (a technical setting behind the gear icon
   top-right of the login screen; normal users shouldn't need to touch
   this).
4. First login lands you on **My Worklist**. If you also have Team Leader
   capability, you'll see an extra **My Team** tab.

### Account setup (done by an Admin/Ops Manager, not by you)
- The very first Agency Admin account is created by the agency's technical
  setup process — there is no self-registration.
- All other staff are added via the web portal's **Employees** page, where
  their phone number, initial password, branch/team, and capabilities are
  set.

---

## 5. Web Portal — Page by Page

The left-hand menu only shows pages you have permission to open. Every page
below lists which permission unlocks it.

### Dashboard *(everyone — no special permission)*
Your home page after login. What you see depends on your role:
- **Agency Admin / Ops Manager / Team Leader** (anyone with `reports.view`):
  a full **Performance Dashboard** — product tabs, a month picker, filters
  (Company/Branch/Team/Agent/Bucket/Status depending on your scope), an
  Amount/Count toggle, and:
  - Collection MTD vs. target strip, with a "days left in month" indicator.
  - A circular gauge and metric cards for **Resolution**, **Roll Back**,
    **Normalization**, and **Recovery**.
  - Deposited Metrics (collected vs. deposited vs. pending).
  - Trail Uploaded Metrics (how much of the book has been worked).
  - **Recalled This Month** tile (click to see which customers, and why).
  - **Bucket Movements This Month** — payment-detected vs. lender-confirmed.
  - **Bucket Mismatches (DPD Cross-Check)** — a "worth a second look" list
    where the EMI due date suggests a different bucket than the lender's
    own label; informational only, never overrides the lender's data.
  - A **Breakdown** table sliceable by Company/Product/Bucket/Branch/Team/Agent.
  - **Trail Analytics** — call outcomes over a date range, PTP conversion %.
  - An **Export** button downloading everything as an Excel file.
- **Telecaller / Field Agent** (no `reports.view`): a simpler
  **"My Performance — &lt;your name&gt;"** view — just your own numbers, no
  filters. (The same view is also available on the mobile app.)

### Employees *(`employees.view`)*
Your staff directory. Search by name/phone. Add a new employee (name,
phone, email, initial password, branch, team, and capability checkboxes),
edit an existing one, deactivate them, or reset their password. Only
someone with permission to add Operations Managers can grant that specific
capability. The Agency Admin account itself can't be edited here.

### Branches *(`branches.manage`)*
Create or rename your agency's physical office locations. No delete —
branches can only be added or renamed.

### Teams *(`teams.manage`)*
Create or rename teams; each team belongs to exactly one branch.

### Companies *(`companies.manage`)*
Create or rename the finance companies/lenders whose loan books you
collect for. These are data sources, not part of your org chart.

### Buckets *(`companies.manage`)*
Pick a company, then configure that company's delinquency buckets:
reorder them (least to most overdue), mark one as "Current" (fully
regular — needed for the Normalization metric to work), categorize each
as Normal or NPA (drives the Recovery metric), and map each to a
canonical 0–20 DPD number so different lenders can be compared on one
scale. Bucket *labels* themselves arrive automatically from imports — you
don't type them here, only configure how they behave.

### Import *(`imports.manage`)*
Bring a lender's Excel file into the system. A 4-step wizard:
1. **Select & Upload** — pick the Company, choose **New customers** (first
   time importing this book) or **Monthly allocation** (refreshing amounts/
   buckets for existing loans — pick the month), upload the `.xlsx` file
   (max 15 MB).
2. **Map Columns** — match each Excel column to a system field (Loan
   Number, Customer Name, Mobile, Product, Bucket, Due Amount, EMI, EMI Due
   Date, Agent Phone). Save the mapping as a reusable **Template** so future
   files from this company auto-map. Any unmapped column becomes a
   **custom field** automatically — no data is lost.
3. **Preview & Validate** — see counts (valid rows, errors, duplicates, new
   vs. existing loans), a row-level error list, and — for repeat monthly
   imports — a warning if any reactivations were detected.
4. **Done** — inserted/updated/skipped counts, and a link to the **Import
   Review** page if anything needs a decision.

There's also an **Import History** tab per company. Important: a
**repeat** import for a month already loaded does **not** apply changes
automatically — new loans, disappeared loans, and reactivations all go to
Import Review for a human decision, every time.

### Import Review *(`imports.review`)*
The approval queue for import discrepancies. Filter by Company/Status/Type,
select rows individually or in bulk, and **Approve** or **Reject** each:
- **Addition** (blue tag) → approving inserts the new customer.
- **Removal** (red tag) → approving marks the customer **Recalled**.
- **Reactivation** (orange tag) → approving restores a recalled customer to
  Active.
Expand any row to see the customer's last remark, pending PTP, and amount
paid this month before deciding.

### Customers *(`customers.view`)*
Browse and search the whole loan book (filter by Company/Product/Bucket/
Status, or search by name/loan number/mobile). Click any row to open the
full **Customer 360 view** (a side panel) showing:
- Identity, due amount, EMI, DPD.
- Any extra "detail fields" captured at import.
- **Trail History** — every call logged, oldest to newest.
- **Promises to Pay** — status of each.
- **Payments** — amount, mode, date, deposited status.
- **Bucket Movements** — history of delinquency-bucket changes.
- **Allocation History** — every reassignment, with reason.
- **Documents** — upload/download supporting files (photo or PDF, max
  10MB).
- **Month Snapshots** — the customer's state at each monthly import.

### Allocation *(`customers.allocate`)*
Two tabs:
- **Unallocated Queue** — filter, multi-select loans, pick an agent, click
  **Assign**.
- **Allocated** — see who's assigned what; multi-select and
  **Reallocate…** (a reason is mandatory and gets logged); click
  **History** on any row for a full reassignment timeline.

### Reallocation Requests *(`customers.allocate`)*
Approve or reject requests agents raise from the mobile app asking to be
taken off a customer. **Approve** optionally picks a new agent (leave
blank to return the customer to the unallocated pool); **Reject** leaves
the customer with their current agent. Nothing happens automatically until
you decide.

### Dispositions *(`dispositions.manage`)*
The master list of call-outcome codes agents choose from when logging a
call. Add/edit a code: Action Code, Result Code, Category, Description, a
**Remark template** (auto-composes the saved remark from whatever the
agent enters), and checkboxes for which fields it requires (Amount, Date,
Time, Mode, Reason, Name/Relation). Codes are never deleted, only
**Retired** (and can be restored).

### Tracking *(`tracking.view`)*
Two tabs:
- **Live Map** — every on-duty agent as a colored dot on a map (green
  Moving, red Stationary, orange No Signal, grey Awaiting First Ping), with
  an alert banner if anyone's flagged; auto-refreshes every 30 seconds.
- **Route Replay** — pick an employee and a date (up to 60 days back — that's
  the location-data retention window) to see their full day's path on the
  map, with total distance.

A bell icon in the header (visible with this same permission) polls the
same live data from anywhere in the app and pops a toast if someone goes
stationary or loses signal.

### Day Plan *(`tracking.view`)*
For any date, one row per agent: attendance status, PTPs due (count + ₹),
reminders due (count), calls made, payments collected. Expand a row to see
the actual customer list behind those counts.

### Targets *(`targets.manage`)*
Set monthly targets. Choose the scope level (Per agent / Per team / Per
branch / Whole agency), edit numbers directly in the table (Collection,
Resolution, Roll Back, Normalization, Recovery — in ₹ or count), or bulk-
import from Excel. **Save changes** only enables once you've edited
something; clearing a cell removes that target entirely.

### Deposits *(`payments.deposit`)*
Reconcile field-collected cash. Filter by month/status/company, multi-
select **Pending** payments, click **Mark deposited**. Already-deposited
rows can't be unchecked here. This directly feeds the Dashboard's
Deposited Metrics — timely reconciliation matters for accurate reporting.

---

## 6. Mobile App — Screen by Screen

### Login Screen
Phone (10 digits) + Password, then **Sign In**. Clear error messages
distinguish wrong credentials, a locked account, and a server-connection
problem. The gear icon (top-right) is a technical "server address" setting
— leave it alone unless your admin tells you to change it.

### Home — Bottom Tabs
- **My Worklist** — everyone.
- **My Team** — only if you have Team Leader capability.
- **My Performance** — everyone.

### My Worklist
Your daily home base:
- **Duty banner** at the top — **Punch In** (starts your shift and
  location tracking) / **Punch Out** (ends it). Must punch in to be
  tracked; must be online to punch in/out.
- **Sync banner** — appears only if something you did offline is still
  waiting to reach the server; **Sync now** retries immediately.
- **Due Today strip** — your reminders due today (tap the checkmark to
  mark done) and any PTPs due/overdue (view-only — resolve by logging a
  new call). Collapsible.
- **Search** — filter by name, loan number, or mobile.
- **Customer cards** — name, loan number, company, due amount, last call
  outcome, active PTP if any, and a "Normalized, pending lender
  confirmation" note if relevant. Tap a card to open the customer.

### Customer Detail
Everything about one account:
- **Call** — dials the customer directly.
- **Log Call** — record a call outcome (see Call Log Screen below).
- **Record Payment** — record money collected.
- **View PTPs** — this customer's promise-to-pay history (read-only).
- **Field Visit** — record an in-person visit (photo + GPS required).
- **Navigate** — opens your maps app to the customer's address, if one is
  on file.
- **Set Reminder** — set a personal follow-up alert for this customer.
- **⋮ menu → Request Reallocation** — ask your Team Leader to move this
  customer off you, with a required reason.
- Cards below the buttons: **Loan Details**, **Last Disposition**, **Active
  PTP**, **Additional Fields** (extra data from the original import),
  **Documents** (upload/view supporting files), and a **History** timeline
  merging every call/payment/visit/PTP/document into one feed.

### Log Call
Pick a **Disposition Code** — the screen then reveals exactly the fields
that code needs (Amount, Date, Time, Mode, Reason, Name/Relation — never
more than what's required). A live preview shows the exact remark that
will be saved. **Save Call Log**. Works offline — queues and syncs
automatically, with no risk of double-recording.

### Record Payment
Amount (required), Mode, Date (defaults to today), an optional photo
(Camera or Gallery), and a **Mark customer as Closed** toggle if this
payment fully settles the account. **Record Payment**. Works offline.

### View PTPs
Read-only list of this customer's promises: amount, due date (flagged
**Overdue** in red if past and still pending), status (Pending/Kept/
Broken).

### Field Visit
A **photo is required** (Camera or Gallery); an optional remark. GPS
location is captured automatically in the background when you save — no
separate button. **Save Visit**. Works offline.

### Set Reminder / Due Today
Pick a date & time, add an optional note, **Save Reminder** — this
schedules a phone notification for that exact moment, even if the app is
closed and even without network at the time it fires. Reminders due today
show on the **My Worklist** screen's Due Today strip; tap the checkmark to
mark one done. Marking done requires connectivity; creating one does not
(it still fires on time, then syncs when back online).

### Documents (on Customer Detail)
Upload a photo (Camera/Gallery) or a PDF (file picker) against the
customer — for KYC documents, agreements, ID proofs, etc. Photos queue
offline like any other photo; **PDFs need an active connection** to
upload.

### My Team *(Team Leaders only)*
- **Reallocation Approvals** — pending requests from your team members,
  with **Approve** (optionally pick a new agent, or leave blank to return
  the customer to the pool) or **Reject**.
- **Team Today** — every team member's on-duty status (On duty /
  Stationary N min / No Signal / Off duty), hours worked, calls made, PTPs
  taken, payments collected today.

### My Performance
Your own scorecard for the current month: collection vs. target with a
progress bar and "amount needed per day to hit target," your account
count and total outstanding, how much of your book you've worked this
month, and per-metric breakdowns (Resolution, Roll Back, Normalization,
Recovery). Read-only.

### Punching In / Out & Location Tracking
Punching in captures your location, tells the server you're on shift, and
starts a background tracking service (you'll see a persistent notification
the whole time you're on duty — this is expected and required for
tracking to work). Your location is sent automatically every couple of
minutes while on duty; if signal drops, pings are saved on your phone and
sent in a batch once you're back in range — nothing is lost. Punching out
stops all of this. Punch in/out itself needs a live connection; the
location pings during your shift do not.

---

## 7. End-to-End Workflows

### A. Bringing in a new loan book
1. **Companies** page → add the lender if not already there.
2. **Import** page → upload the file as **New customers**, map columns
   (save as a Template for next time), preview, commit.
3. New loans land in the **Unallocated Queue**.
4. Product and Bucket labels are read automatically from the data — check
   **Buckets** page to configure their order/category/canonical mapping.

### B. Monthly refresh of an existing book
1. **Import** page → upload as **Monthly allocation**, pick the month.
2. New loans, or loans that disappeared, or previously-recalled loans
   reappearing all get flagged.
3. **Import Review** → an Admin/Ops Manager approves or rejects each
   discrepancy. Nothing changes until this step happens.
4. Every loan gets a **Month Snapshot** either way, feeding historical
   reporting.

### C. Assigning work
1. **Allocation** page (web) → Unallocated Queue → select rows → pick an
   agent → **Assign**.
2. The agent now sees these customers in **My Worklist** on mobile.
3. Need to move an account later? Same page, **Allocated** tab →
   **Reallocate…** (reason required), or the agent themselves can
   **Request Reallocation** from their phone, which a Team Leader then
   approves/rejects.

### D. Working a customer (agent's day-to-day)
1. **Punch In** at the start of the day.
2. Open a customer from **My Worklist**.
3. **Call** them, then **Log Call** with the outcome — a promise-type
   disposition automatically creates a **PTP**.
4. If money changes hands: **Record Payment** (with photo proof), and
   toggle **Mark customer as Closed** if fully resolved.
5. For field agents visiting in person: **Field Visit** with a photo.
6. Set a **Reminder** for anything you need to personally follow up on
   later, independent of PTPs.
7. Attach any **Documents** the customer provides.
8. **Punch Out** at the end of the day.

### E. Manager oversight
- **Day Plan** (web) — check every agent's attendance and what's due
  today, at a glance, drilling into specifics as needed.
- **Tracking** (web) — see agents live on a map; get alerted if someone's
  stationary too long or has gone off-radar.
- **My Team** (mobile, Team Leaders) — the same idea, on the go.
- **Dashboard** (web) — month-level performance against targets, at every
  level from individual agent up to the whole agency.
- **Deposits** (web) — reconcile collected cash against what's actually
  been banked.

### F. Reallocation request lifecycle
1. Agent taps **Request Reallocation** on a customer (mobile), gives a
   reason.
2. Request appears on the Team Leader's **My Team** screen (mobile) and
   the **Reallocation Requests** page (web).
3. Team Leader **Approves** (optionally naming a new agent, or returning
   the customer to the unallocated pool) or **Rejects**.
4. Nothing changes for the customer until that decision is made.

---

## 8. Best Practices for Agents

These are working guidelines, not app features — they describe how to use
the tools above effectively day to day.

**Call cadence by bucket.** As a rough guide: Current accounts — a monthly
touch to remind about the upcoming EMI. Early buckets (30–60 DPD) — weekly.
Later buckets (60–90 DPD and NPA) — weekly or more, since urgency is
higher. If a customer is responsive, call more often while momentum is on
your side. If a customer stops responding after 3–5 attempts, raise it
with your Team Leader rather than continuing to call indefinitely.

**When a customer says they can't pay.** Don't argue — look for a smaller
commitment instead: "Can you manage a partial amount instead of the full
EMI?" or "Can you commit to a specific date when you'll have funds?" Log
whatever is agreed as a disposition (and a PTP if a promise-type code
fits), and escalate to your Team Leader if the customer describes genuine
hardship.

**When a customer says they already paid.** Don't argue on the call —
check the customer's **Payments** history first (visible on the Customer
Detail / History section). If it's there, acknowledge it and move on. If
it isn't, tell the customer you'll verify and call back — don't pretend to
check something you haven't — then flag it to your Team Leader with the
amount and date the customer claims. It may be a payment still in transit
or a genuine discrepancy that needs investigating, not something you
should resolve unilaterally.

**Updating a promise that's changed.** There is no way to edit or delete
an existing PTP — if a customer changes their mind about when they'll pay,
log a new call with an updated promise-type disposition. The system tracks
PTPs by their own history rather than overwriting one, so the record of
what was promised when stays intact.

**If a customer keeps breaking promises.** A pattern of broken PTPs from
the same customer (say, three or more) is worth raising with your Team
Leader — they may decide to reallocate the account to a different agent or
escalate it further, rather than you continuing to take promises that
don't hold.

**A "Recalled" customer means stop working it.** If a customer's status
changes to Recalled, the lender has pulled that account back — remove it
from your personal follow-up habits (it will also disappear from your
active worklist). If the lender sends it back in a future import
(a reactivation), it will be reallocated to an agent again and you'll see
it return if it's assigned to you.

**Never try to "fix" a bucket yourself.** A loan's bucket always comes from
the lender's own file — there is no way to edit it manually in the app,
and there shouldn't be. If you believe a bucket looks wrong, note your
concern in a call remark and mention it to your Team Leader; they can
escalate to Operations, who can raise it with the lender for correction in
their next file.

**Tracking your own target.** Your **My Performance** screen shows your
target and your collection so far for the month. A simple way to check if
you're on pace: `remaining target ÷ days left in the month` tells you
roughly how much you need to collect per day to land on target — the same
"required per day" figure the Dashboard/Performance screens already
calculate for you.

**What counts toward your Collection number, in practice.** Only money
actually received counts — a PTP that hasn't been kept yet doesn't. A
kept PTP with a smaller, realistic amount is worth more to your numbers
(and to the account's history) than an unrealistic promise that gets
logged as broken later.

---

## 9. Troubleshooting & FAQ

**"Cannot reach server" on mobile login.**
Check your phone's internet connection first. If it keeps happening on a
working connection, the app may be pointed at the wrong server address —
ask your admin; this is set via the gear icon on the login screen.

**I logged in before but got signed out after restarting the app.**
This should not normally happen — the app keeps you signed in across
restarts even without a network connection, only signing you out on an
actual authentication failure (e.g. your password was reset, or your
account was deactivated). If it keeps happening, contact your admin.

**Account locked.**
Too many wrong password attempts in a row locks the account temporarily.
Contact your manager (only an Admin/Ops Manager can reset a password).

**A photo/document I uploaded says "will sync automatically" — is it
saved?**
Yes. It's stored safely on your phone and will upload as soon as you have
a connection again (or tap **Sync now** on the worklist screen). You can
close the app; it will still sync later.

**A PDF upload failed while I was offline.**
Unlike photos, PDF documents require an active connection to upload —
they are not queued. Try again once you're back online.

**Why can't I see the "My Team" tab?**
Only accounts with Team Leader capability see it. If you should have this
capability, ask your Operations Manager to grant it on the Employees page.

**Why does a customer I'm working on say "Normalized this month, pending
lender confirmation"?**
A payment has brought the account back to current, but the lender hasn't
confirmed it in their own file yet. This doesn't change what you should
do — keep working the account normally.

**What's the difference between Closed and Recalled?**
**Closed** means the account was fully resolved (paid) and marked closed
from the app. **Recalled** means the *lender* pulled the account back
(usually seen in a monthly import) — it's not something an agent does, and
it doesn't mean the debt was resolved.

**I set a reminder but didn't get the notification.**
Make sure notifications are allowed for the app in your phone's settings
(you should be prompted for this the first time you set a reminder).
Reminders are rescheduled automatically every time you open the app while
online, so restarting the app or your phone shouldn't lose them.

**Where do I see my own performance?**
**My Performance** tab on mobile, or the Dashboard page on web (which
shows a personal scorecard if you don't have manager-level report access).
