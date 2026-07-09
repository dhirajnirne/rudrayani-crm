-- ============================================================
-- PRODUCTION DATA WIPE
-- Wraps everything in BEGIN — do NOT run \i in autocommit mode.
-- Review the before-counts and after-counts, then type COMMIT
-- or ROLLBACK. This step is irreversible once COMMIT is typed.
-- ============================================================

BEGIN;

-- ── BEFORE COUNTS ────────────────────────────────────────────
SELECT 'customers'               AS tbl, COUNT(*) AS n FROM customers
UNION ALL
SELECT 'import_runs',                    COUNT(*) FROM import_runs
UNION ALL
SELECT 'import_review_items',            COUNT(*) FROM import_review_items
UNION ALL
SELECT 'customer_month_snapshots',       COUNT(*) FROM customer_month_snapshots
UNION ALL
SELECT 'allocation_logs',                COUNT(*) FROM allocation_logs
UNION ALL
SELECT 'bucket_movements',               COUNT(*) FROM bucket_movements
UNION ALL
SELECT 'call_logs',                      COUNT(*) FROM call_logs
UNION ALL
SELECT 'payments',                       COUNT(*) FROM payments
UNION ALL
SELECT 'ptps',                           COUNT(*) FROM ptps
UNION ALL
SELECT 'attachments',                    COUNT(*) FROM attachments
UNION ALL
SELECT 'field_visits',                   COUNT(*) FROM field_visits
UNION ALL
SELECT 'reminders',                      COUNT(*) FROM reminders
UNION ALL
SELECT 'attendance',                     COUNT(*) FROM attendance
UNION ALL
SELECT 'location_pings',                 COUNT(*) FROM location_pings
UNION ALL
SELECT 'users (preserved)',              COUNT(*) FROM users
UNION ALL
SELECT 'companies (preserved)',          COUNT(*) FROM companies
ORDER BY tbl;

-- ── WIPE TRANSACTIONAL / BUSINESS DATA ───────────────────────
-- Order: dependents before parents (FK order).

TRUNCATE TABLE
  location_pings,
  attendance,
  reminders,
  field_visits,
  attachments,
  ptps,
  call_logs,
  payments,
  import_review_items,
  allocation_logs,
  bucket_movements,
  customer_month_snapshots,
  import_runs,
  customers
RESTART IDENTITY CASCADE;

-- ── AFTER COUNTS ─────────────────────────────────────────────
SELECT 'customers'               AS tbl, COUNT(*) AS n FROM customers
UNION ALL
SELECT 'import_runs',                    COUNT(*) FROM import_runs
UNION ALL
SELECT 'call_logs',                      COUNT(*) FROM call_logs
UNION ALL
SELECT 'payments',                       COUNT(*) FROM payments
UNION ALL
SELECT 'attendance',                     COUNT(*) FROM attendance
UNION ALL
SELECT 'users (preserved)',              COUNT(*) FROM users
UNION ALL
SELECT 'companies (preserved)',          COUNT(*) FROM companies
UNION ALL
SELECT 'branches (preserved)',           COUNT(*) FROM branches
UNION ALL
SELECT 'teams (preserved)',              COUNT(*) FROM teams
ORDER BY tbl;

-- ── PRESERVED: users, agencies, branches, teams, companies,
--              buckets, disposition_codes, import_templates,
--              targets, permissions, capability_permissions ──

-- Type COMMIT here after reviewing the counts above.
-- Type ROLLBACK if anything looks wrong.
-- COMMIT;
