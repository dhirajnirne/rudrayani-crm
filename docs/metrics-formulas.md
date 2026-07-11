# Rudrayani CRM — Metrics & Formulas Reference

*The exact math behind every number on the Dashboard, Management Dashboard,
and reports. For what each screen looks like and how to use it, see
`USAGE_GUIDE_EN.md`. Source of truth: `backend/src/services/report-service.ts`.*

---

## 1. Two ways of measuring progress: "Transition" vs. "Payments" basis

Four of the five core metrics (Resolution, Roll Back, Normalization —
Recovery is always payments-based, see §5) can be measured two different
ways, and the system picks automatically:

- **Transition basis** — used once next month's allocation file has already
  been imported for the company/agency in question. Compares a customer's
  bucket *this* month against their bucket in *next* month's file — the
  most authoritative signal, because it reflects what the lender itself
  says happened.
- **Payments basis** — used before that file exists yet (i.e. for the
  live, current month). A proxy estimated from payments received so far,
  since there's no "next month" data to compare against yet.

The system checks, once per dashboard request, whether *any*
`customer_month_snapshots` row exists for next month for the relevant
company/agency — if yes, the whole request switches to transition basis;
if no, it stays on payments basis. This is a request-wide switch, not
decided per customer.

The Dashboard shows which basis is active via a small ⓘ tooltip on each
metric card.

---

## 2. Portfolio size: POS vs. Due Amount — read this first

Two different "how big is the book" numbers appear throughout the app, and
they mean different things:

| Term | Meaning |
|---|---|
| **POS (Principal Outstanding)** | The total loan principal a customer still owes. This is what "Allocated Amount," "Portfolio (POS)," and the Resolution/Roll Back/Normalization/Recovery metrics' amounts are measured against — a broad "how much book do we have" figure. |
| **Due Amount** | The current *overdue arrears* — what's actually late right now. Narrower and more volatile than POS; used only inside the classification rules below (e.g. "did the customer pay off their full arrears"), never as a portfolio-size figure. |

If a number on screen answers "how big is our book/target," it's POS. If it
answers "did this specific customer clear what they owed *right now*," it's
Due Amount.

---

## 3. Resolution, Roll Back, Normalization — the classification rules

Every allocated customer is classified each month against one of two rule
sets, depending on the active basis (§1):

### Resolution — "did this account stop being a problem?"
- **Transition basis:** if the customer has no row in next month's file at
  all, they're resolved only if their status is **Closed** — otherwise
  they're excluded from resolution numbers entirely (neither counted as
  resolved nor unresolved, since "vanished from the lender's file" is
  ambiguous). If they *do* have a next-month row, they're resolved if their
  bucket didn't get *worse*.
- **Payments basis:** resolved if they paid at least a full EMI this month
  (or made *any* payment, if no EMI is on record for them).

### Roll Back — "did this account slip further behind?"
- **Transition basis:** resolved-worse — moved to a strictly worse bucket
  next month, but didn't land in the "fully current" bucket.
- **Payments basis:** paid at least one EMI, but didn't clear their full
  arrears (Due Amount).

### Normalization — "did this account become fully current?"
- **Transition basis:** landed in the company's designated "Current" bucket
  next month (configured on the Buckets page).
- **Payments basis:** paid off their entire Due Amount (not just one EMI).

**Amounts** for all three metrics are the **POS** of the qualifying
accounts — i.e. "how much of the book resolved/rolled back/normalized,"
not the money actually collected from those specific accounts. **Counts**
are simply how many accounts qualified.

---

## 4. Recovery — always payments-based

Recovery never switches basis, because it specifically measures cash
collected from the hardest accounts:

- **Allocated base** = POS of accounts whose *current* bucket is
  categorized **NPA** (configured per-bucket on the Buckets page) — not the
  whole book, only the NPA slice.
- **Recovered amount** = money actually paid this month on those same
  NPA-categorized accounts.
- **Recovery % (Achievement)** = Recovered ÷ NPA-allocated POS.

In plain English: *Recovery = ₹ actually collected this month, from
accounts currently sitting in an NPA bucket.*

---

## 5. Collection — the headline MTD number

- **Collection MTD** = the sum of every payment recorded in the scope this
  month, credited to **whoever actually collected it** (the recording
  agent), not to whoever the account is allocated to. (This was corrected
  from an earlier version that credited the allocated agent instead — worth
  knowing if historical figures ever looked different.)
- **Collection Target %** ("Target Achieved") = Collected ÷ Target × 100.
  ⚠️ **Naming trap:** on every *other* metric card, the field called
  `target_pct` means "Target ÷ Allocated book size" — a completely
  different ratio. Only on the Collection card does the same field name
  mean the intuitive "amount achieved ÷ target."
- **Run rate (current)** = Collected so far this month ÷ days elapsed.
- **Run rate (required)** = Remaining amount to hit target ÷ days left in
  the month (at least 1, so this never divides by zero even on the last
  day).
- **Portfolio (POS)** = total principal outstanding across the scope's
  whole book (context for the target, not part of its calculation).
- **EMI ÷ POS %** = what fraction of the book's total outstanding
  principal this month's EMI target represents.
- **Collected Today** = money collected since midnight — currently
  measured in UTC, not IST; an IST-accurate version is a known follow-up,
  not yet built.
- **EMI vs. Settlement split** and **Field vs. Telecalling split** — the
  same MTD collected total, sliced by `payments.type` and by the
  collecting user's capability flags respectively. If a user has both
  Field Agent and Telecaller capability (unusual but possible), their
  collections count toward "Field."

### Collection Target — the computed default (new)
If nobody has set a manual Collection target at any scope level (agent →
team → branch → agency), the system no longer just shows "no target" — it
falls back to the sum of every customer's EMI in that scope as a computed
default, so there's always a sensible collection benchmark. This fallback
applies **only** to Collection; the other four metrics show no target at
all until someone sets one explicitly.

### Target resolution order (all five metrics)
The most specific manually-set target wins; if a scope level has no target
row at all, the system sums its children instead of treating it as zero:
**agent** (exact match only, no children to sum) → **team** (its own
target, or the sum of its agents' targets) → **branch** (its own target, or
sum of its teams', or its agents') → **agency** (its own, or sum of
branches', teams', or agents'). A target row can also be scoped to a
specific company/product/bucket; the most dimensionally-specific match
wins when several could apply.

---

## 6. Deposited Metrics

- **Total Collected** = same MTD payments sum as Collection, but scoped by
  the *collector's* branch/team (not the book's allocated team) — reflects
  who actually brought the money in.
- **Total Deposited** = the portion of that money an Admin/Ops user has
  since marked "Deposited" on the Deposits page (i.e. physically banked).
- **Total Pending** = Collected − Deposited.

---

## 7. Trail Upload Metrics

- **Allocated Count** = the whole allocated book's count for the month.
- **Uploaded Count** = how many of those customers have at least one call
  or field visit logged this month ("has_trail").
- **Trail Upload %** = Uploaded ÷ Allocated × 100.

---

## 8. Trail Analytics (free date-range, not month-locked)

- **Total Trails** = count of all logged calls in the chosen range.
- **Customers Contacted** = count of *distinct* customers with at least one
  call in the range.
- **PTPs Created** = every PTP opened in the range, regardless of its
  current status.
- **PTP Conversion %** = Kept ÷ (Kept + Broken) — i.e. of the PTPs that
  have been resolved one way or the other (still-pending ones are excluded
  from both sides of this ratio).
- **PTP Value (Pending)** = the sum of promised amounts across PTPs still
  awaiting an outcome.
- **Escalated Cases** = calls logged under a disposition code in the
  "Escalated Case" category.

> ⚠️ **Known limitation — read before trusting PTP Conversion %:** as of
> this writing, nothing in the backend ever transitions a PTP's status
> from *pending* to *kept* or *broken* — there is no feature yet for an
> agent (or anyone) to mark a promise as honored or missed. In practice
> this means **PTP Conversion % will always show 0% or blank in a live
> system**, not a real, low conversion rate. Don't read a low number here
> as a performance problem — it reflects a feature gap, not agent
> behavior, until "mark PTP kept/broken" is built.

---

## 9. Bucket Movement

Reads a running log of detected bucket changes, split by how each was
detected:
- **Payment-Detected** = the agency's own payment data suggests an account
  cleared its arrears and should move to a better bucket.
- **Allocation-Confirmed** = the lender's *next* allocation file actually
  confirmed that bucket drop.
- **Not Yet Confirmed** = accounts where the agency's payment signal
  predicted an improvement that the lender's own file (as of that month or
  any later one) hasn't corroborated yet — a "the lender's file hasn't
  caught up to what we're seeing" flag, not an error.

---

## 10. Bucket Mismatches (DPD Cross-Check)

A live, right-now check (not tied to any particular month): for every
active customer with a known EMI due date and a bucket that's been mapped
to a canonical DPD number (on the Buckets page), the system independently
computes what bucket the due date alone would imply (standard 30-day
increments: 0–29 days overdue = bucket 0/current, 30–59 = bucket 1, and so
on), and flags any customer where that computed bucket disagrees with the
lender's own bucket label. **The lender's bucket always stays authoritative
everywhere else in the system** — this is purely a "worth a second look"
list, never an automatic correction. Customers missing a due date or a
canonical bucket mapping are silently left off the list, not flagged as
false mismatches.

---

## 11. Recalled Cases

- **Recalled This Month** = customers whose status changed to Recalled
  during the selected month (the lender pulled them back).
- **Lifetime Book** = the total count of every customer ever marked
  Recalled, regardless of month — a running total, not a monthly figure.

---

## 12. Who sees what — scope clamping

- **Agency Admin / Operations Manager** → agency-wide, unclamped.
- **Team Leader** → forced to their own team; a TL with no team sees
  nothing rather than everyone.
- **Telecaller / Field Agent** (no manager-level report permission) →
  forced to their own data only; any attempt to request someone else's
  scope is rejected.

This clamping is enforced server-side on every report endpoint — a
narrower UI filter never grants a wider view than a role actually has.

---

## 13. Null / zero edge cases — quick reference

| Situation | What you'll see |
|---|---|
| No target set anywhere in the scope chain, and no computed default applies (any metric except Collection) | Target and every target-dependent % show blank/"—" |
| Month hasn't started yet | "Run rate (current)" shows blank |
| Month is fully over, or no target is set | "Run rate (required)" shows blank |
| Allocated book size is zero | Any %-of-allocated figure shows blank (never a fake 0%) |
| A customer is in this month's file but missing from next month's, and isn't marked Closed | Excluded entirely from Resolution's numerator *and* denominator |
| A customer's bucket isn't mapped in the Buckets page | Excluded from Resolution/Roll Back calculations needing that mapping |
| No PTPs have been marked Kept or Broken yet | PTP Conversion % shows blank — see the Known Limitation in §8 |
| A customer is missing a due date or a canonical bucket mapping | Silently left off the DPD Cross-Check list, not flagged as a false mismatch |
