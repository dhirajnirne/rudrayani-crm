# Test fixtures: two companies, three months each

Realistic allocation files for manual QA/demo of the Phase 7 allocation
lifecycle through the actual Import wizard UI, mirroring the untracked
`resource files/` folder's real-world flavor but tracked in git. Generated
by `generate.ts` from the shared scenario in `build-scenarios.ts` — the same
functions the automated end-to-end test
(`backend/test/e2e-allocation-lifecycle.test.ts`) drives directly, so the
demo files and the test can never silently drift apart.

Regenerate any time (refreshes the DPD-relative due dates to "today"):

```
cd backend
npx tsx test/fixtures/generate.ts
```

## Alpha Finance NBFC (Hero-FinCorp-style columns)

Columns: `loan_agreement_no, customername, Bkt, PROD, pos, emi_amount`
(`due_date` added from month 3). Map with:
`loan_agreement_no→loan_number, customername→customer_name, Bkt→bucket,
PROD→product, pos→due_amount, emi_amount→emi` (`due_date→emi_due_date` from
month 3).

Import all three as **mode=allocation**, in order, for the **same
allocation month** (any month works — it's a repeat/refresh import the
moment a second file for that month lands, regardless of what day of the
month it arrives):

1. **`alpha-finance-month1.xlsx`** — first import for the month: 8 loans, all
   insert directly.
2. **`alpha-finance-month2-refresh.xlsx`** — a refresh for the *same* month:
   `ALPHA-004` is missing (→ flagged as a removal in Import Review) and
   `ALPHA-009` is brand new (→ flagged as an addition). Everyone else's
   bucket/amount updates directly, as normal. **Approve both** in Import
   Review before continuing.
3. **`alpha-finance-month3-refresh.xlsx`** — another refresh: `ALPHA-004`
   reappears (→ flagged as a **reactivation**, since it's `recalled` from
   step 2's approval — approve it to restore the customer). Introduces
   `emi_due_date` for the first time. `ALPHA-008`'s due date is set ~75 days
   overdue while its bucket still says "X" (current) — map the canonical
   buckets on the Buckets page first (X=0, 1=1, 2=2, NPA=3) to see this show
   up on the **Bucket Mismatches** dashboard card.

## Beta Credit Corp (Indifi-style columns)

Columns: `App Id, Promoter Name, Updated Bucket, POS, EMI` (`Next EMI Date`
added from month 3) — deliberately different naming from Alpha, since real
lenders never agree on a schema. Map with:
`App Id→loan_number, Promoter Name→customer_name, Updated Bucket→bucket,
POS→due_amount, EMI→emi` (`Next EMI Date→emi_due_date` from month 3).

1. **`beta-credit-month1.xlsx`** — first import: 6 loans.
2. **`beta-credit-month2-refresh.xlsx`** — refresh: `BETA-103` missing (→
   removal), `BETA-107` new (→ addition). Approve both.
3. **`beta-credit-month3-refresh.xlsx`** — refresh: bucket transitions, plus
   a deliberate mismatch on `BETA-106` (bucket says "60-90"/canonical 2, due
   date implies only ~20 days overdue/canonical 0).

## What this exercises end-to-end

- First-of-month vs. repeat/refresh import routing (additions insert
  directly the first time, wait for review on every refresh)
- Removals, additions, and a reactivation, all through Import Review
- Canonical bucket mapping across two companies with entirely different
  label schemes
- Bucket transitions across three consecutive months (feeds
  Resolution/Rollback/Normalization once a next-month file exists)
- The DPD cross-check report catching a lender bucket that disagrees with
  the due date, on both companies
- Record a payment on any bucket-1/2 loan large enough to cover its arrears
  (canonical_bucket × EMI) to see a payment-driven bucket movement event,
  independent of the next allocation file
