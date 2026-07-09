# Production Data Wipe — Runbook

**Who runs this**: The agency owner (not an automated process).  
**When**: After confirming all phases 1–8 are deployed and smoke-tested on Railway.  
**Irreversible**: Once `COMMIT` is typed, the data is gone.

---

## Pre-flight checklist

1. **Take a pg_dump backup first** (mandatory):
   ```
   pg_dump "$DATABASE_URL" -Fc -f prod-backup-$(date +%Y%m%d-%H%M).dump
   ```
   Store it somewhere safe (local disk, S3, Dropbox).

2. **Confirm phases 1–8 are deployed and live** on Railway — check the admin login and a key route (e.g. `GET /api/health`).

3. **Check the connection string host** before connecting — Railway's DATABASE_URL is on the Railway dashboard under the Postgres service → Variables → `DATABASE_URL`. Make absolutely sure it points to the **production** Railway Postgres, not a local or test DB.

4. **Notify anyone using the system** that it will be down for a few minutes.

---

## Steps

### 1. Connect to production Postgres

```bash
psql "$DATABASE_URL"
```

(Or paste the connection string from the Railway dashboard.)

### 2. Verify you are on the right database

```sql
SELECT current_database(), current_user, inet_server_addr();
```

The host should be the Railway Postgres host (ends with `.railway.internal` or similar). If it says `localhost` or a local address, **STOP** — you are on the wrong server.

### 3. Run the before-counts inline to sanity-check the live state

```sql
SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'companies', COUNT(*) FROM companies;
```

You should see real customer rows (> 0) and at least 1 user (the admin account).

### 4. Run the wipe script

```bash
psql "$DATABASE_URL" -f backend/scripts/prod-data-wipe.sql
```

Or from inside `psql`:
```sql
\i backend/scripts/prod-data-wipe.sql
```

This opens a transaction and prints before-counts, runs the TRUNCATEs, and prints after-counts. **It does NOT commit** — the last line is commented out.

### 5. Review the output

- After-counts for `customers`, `import_runs`, `payments`, `call_logs`, `attendance` should all be **0**.
- `users` count should still be ≥ 1 (the admin login).
- `companies`, `branches`, `teams` should be unchanged.

If anything looks wrong, type `ROLLBACK;` and investigate.

### 6. Confirm and commit

If everything looks correct, type:
```sql
COMMIT;
```

This is the point of no return. The data is now gone.

### 7. Post-wipe smoke test

1. Log in to the web portal with the admin credentials — should work.
2. Check the Dashboard — should load without errors (empty state, not a crash).
3. Check the Employees page — agency admin and any seeded users should still appear.
4. Check Companies, Branches, Teams — should be intact.
5. Try a small import of a single-row test file — should succeed.

---

## What is preserved

| Table | Preserved |
|-------|-----------|
| `agencies` | ✅ |
| `users` | ✅ (including the admin login) |
| `branches` | ✅ |
| `teams` | ✅ |
| `companies` | ✅ |
| `buckets` | ✅ |
| `disposition_codes` | ✅ |
| `import_templates` | ✅ |
| `targets` | ✅ |
| `permissions`, `capability_permissions` | ✅ |

## What is wiped

`customers`, `import_runs`, `import_review_items`, `customer_month_snapshots`, `allocation_logs`, `bucket_movements`, `call_logs`, `payments`, `ptps`, `attachments`, `field_visits`, `reminders`, `attendance`, `location_pings`
