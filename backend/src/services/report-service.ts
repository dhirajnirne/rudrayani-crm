import { pool } from "../config/db";
import { HttpError } from "../middleware/error-handler";
import type { UserRow } from "../types/user";

/**
 * Performance report engine (Phase 5). The allocated book for month M is
 * customer_month_snapshots(M); metric classification per account:
 *
 *  - once month M+1's allocation file exists (basis "transition"):
 *      resolution    = didn't flow forward (next sort <= current sort);
 *                      closed accounts count as resolved
 *      rollback      = moved strictly back but not to the current bucket
 *      normalization = landed in the company's is_current bucket
 *  - before that (basis "payments" — live MTD):
 *      resolution    = paid at least one EMI this month (no EMI -> any payment)
 *      rollback      = paid >= 1 EMI but less than the full arrears
 *      normalization = paid the full arrears (due_amount)
 *  - recovery is always payments-based: money collected on NPA-bucket
 *    accounts; its allocated base is the NPA slice only.
 *
 * Attribution: the allocated book belongs to the snapshot's agent (stable for
 * the month); collected money belongs to payments.collected_by_user_id.
 */

const IST = "Asia/Kolkata";
export const REPORT_METRICS = [
  "resolution",
  "rollback",
  "normalization",
  "recovery",
  "collection",
] as const;
export type ReportMetric = (typeof REPORT_METRICS)[number];

export interface ReportFilters {
  month: string; // 'YYYY-MM-01'
  company_id?: string;
  branch_id?: string;
  team_id?: string;
  agent_id?: string;
  product?: string;
  bucket?: string;
  /** Narrows to the customer's CURRENT status (not the status at the time of the snapshot). */
  status?: "active" | "closed" | "recalled";
}

export interface ResolvedScope {
  clampedTo: "agency" | "team" | "self";
  filters: ReportFilters;
}

/**
 * Server-side scope clamp: admin/ops roam the agency; a TL is pinned to their
 * team; everyone else (self-scoped access) is pinned to themselves.
 */
export function resolveReportScope(
  user: UserRow,
  requested: ReportFilters,
  hasFullView: boolean,
): ResolvedScope {
  if (!hasFullView) {
    if (requested.agent_id && requested.agent_id !== user.id) {
      throw new HttpError(403, "You can only view your own performance");
    }
    return {
      clampedTo: "self",
      filters: { ...requested, agent_id: user.id, branch_id: undefined, team_id: undefined },
    };
  }
  if (user.is_agency_admin || user.is_operations_manager) {
    return { clampedTo: "agency", filters: requested };
  }
  if (user.is_team_leader) {
    // TL without a team sees nothing rather than everything.
    const teamId = user.team_id ?? "00000000-0000-0000-0000-000000000000";
    if (requested.team_id && requested.team_id !== teamId) {
      throw new HttpError(403, "Team leaders can only view their own team");
    }
    return { clampedTo: "team", filters: { ...requested, team_id: teamId, branch_id: undefined } };
  }
  // reports.view holders that fit none of the above shouldn't exist, but fail shut.
  return {
    clampedTo: "self",
    filters: { ...requested, agent_id: user.id, branch_id: undefined, team_id: undefined },
  };
}

export interface MonthDays {
  in_month: number;
  elapsed: number;
  left: number;
}

/** Day arithmetic in IST — a month that's over is fully elapsed, a future one not started. */
export function monthDays(month: string, now = new Date()): MonthDays {
  const [y, m] = month.split("-").map(Number);
  const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const istNow = new Date(now.toLocaleString("en-US", { timeZone: IST }));
  const curY = istNow.getFullYear();
  const curM = istNow.getMonth() + 1;
  if (y < curY || (y === curY && m < curM)) return { in_month: inMonth, elapsed: inMonth, left: 0 };
  if (y > curY || (y === curY && m > curM)) return { in_month: inMonth, elapsed: 0, left: inMonth };
  const elapsed = istNow.getDate();
  return { in_month: inMonth, elapsed, left: inMonth - elapsed };
}

/** WHERE fragments for the snapshot base under the resolved filters. */
function baseConditions(filters: ReportFilters, params: unknown[]): string[] {
  const conditions: string[] = [];
  if (filters.company_id) {
    params.push(filters.company_id);
    conditions.push(`s.company_id = $${params.length}`);
  }
  if (filters.branch_id) {
    params.push(filters.branch_id);
    conditions.push(`tm.branch_id = $${params.length}`);
  }
  if (filters.team_id) {
    params.push(filters.team_id);
    conditions.push(`s.assigned_team_id = $${params.length}`);
  }
  if (filters.agent_id) {
    params.push(filters.agent_id);
    conditions.push(`s.assigned_agent_id = $${params.length}`);
  }
  if (filters.product) {
    // The filter value is the canonical label; snapshots store the raw label.
    params.push(filters.product);
    conditions.push(
      `(lower(s.product) = lower($${params.length}) OR EXISTS (
          SELECT 1 FROM products pr
           WHERE pr.company_id = s.company_id
             AND lower(pr.raw_label) = lower(s.product)
             AND lower(pr.canonical_label) = lower($${params.length})))`,
    );
  }
  if (filters.bucket) {
    params.push(filters.bucket);
    conditions.push(`lower(s.bucket) = lower($${params.length})`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`c.status = $${params.length}`);
  }
  return conditions;
}

/** Is there a next-month allocation file to compare against (transition basis)? */
async function hasNextMonthSnapshot(
  agencyId: string,
  filters: ReportFilters,
): Promise<boolean> {
  const params: unknown[] = [agencyId, filters.month];
  const companyClause = filters.company_id
    ? (params.push(filters.company_id), `AND s.company_id = $${params.length}`)
    : "";
  const { rows } = await pool.query(
    `SELECT 1 FROM customer_month_snapshots s
       JOIN companies co ON co.id = s.company_id
      WHERE co.agency_id = $1
        AND s.month = ($2::date + interval '1 month')::date ${companyClause}
      LIMIT 1`,
    params,
  );
  return rows.length > 0;
}

interface ClassifiedAggregates {
  allocated_count: number;
  allocated_amount: number;
  recovery_allocated_count: number;
  recovery_allocated_amount: number;
  collected_amount: number;
  collected_count: number;
  resolution_amount: number;
  resolution_count: number;
  rollback_amount: number;
  rollback_count: number;
  normalization_amount: number;
  normalization_count: number;
  recovery_amount: number;
  recovery_count: number;
  trail_count: number;
}

/** The classification CTE chain shared by the dashboard totals and the per-agent breakdown. */
function classifiedCtes(conditions: string[]): string {
  const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
  return `
    base AS (
      SELECT s.customer_id, s.due_amount, s.emi, s.assigned_agent_id, s.assigned_team_id,
             s.product, s.company_id, s.bucket,
             bm.sort_order AS cur_sort, COALESCE(bm.category, 'normal') AS cur_cat,
             c.status,
             co.name AS company_name, tm.branch_id, tm.name AS team_name, br.name AS branch_name,
             au.full_name AS agent_name,
             COALESCE(pr.canonical_label, s.product) AS canonical_product
        FROM customer_month_snapshots s
        JOIN companies co ON co.id = s.company_id AND co.agency_id = $1
        JOIN customers c ON c.id = s.customer_id
        LEFT JOIN buckets bm ON bm.company_id = s.company_id AND lower(bm.label) = lower(s.bucket)
        LEFT JOIN teams tm ON tm.id = s.assigned_team_id
        LEFT JOIN branches br ON br.id = tm.branch_id
        LEFT JOIN users au ON au.id = s.assigned_agent_id
        LEFT JOIN products pr ON pr.company_id = s.company_id AND lower(pr.raw_label) = lower(s.product)
       WHERE s.month = $2::date ${where}
    ),
    pays AS (
      SELECT b.customer_id, SUM(p.amount) AS paid
        FROM payments p JOIN base b ON b.customer_id = p.customer_id
       WHERE p.paid_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND p.paid_at < ((($2::date + interval '1 month')::date)::timestamp AT TIME ZONE 'Asia/Kolkata')
       GROUP BY 1
    ),
    nxt AS (
      SELECT s2.customer_id, b2.sort_order AS nxt_sort,
             COALESCE(b2.is_current, false) AS nxt_is_current
        FROM customer_month_snapshots s2
        JOIN base b ON b.customer_id = s2.customer_id
        LEFT JOIN buckets b2 ON b2.company_id = s2.company_id AND lower(b2.label) = lower(s2.bucket)
       WHERE s2.month = ($2::date + interval '1 month')::date
    ),
    trail AS (
      SELECT b.customer_id
        FROM base b
       WHERE EXISTS (SELECT 1 FROM call_logs cl WHERE cl.customer_id = b.customer_id
                        AND cl.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
                        AND cl.created_at < ((($2::date + interval '1 month')::date)::timestamp AT TIME ZONE 'Asia/Kolkata'))
          OR EXISTS (SELECT 1 FROM field_visits fv WHERE fv.customer_id = b.customer_id
                        AND fv.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
                        AND fv.created_at < ((($2::date + interval '1 month')::date)::timestamp AT TIME ZONE 'Asia/Kolkata'))
    ),
    class AS (
      SELECT b.*, COALESCE(p.paid, 0) AS paid,
             (t.customer_id IS NOT NULL) AS has_trail,
        CASE WHEN $3::boolean THEN
          CASE WHEN n.customer_id IS NULL AND b.status = 'closed' THEN true
               WHEN n.customer_id IS NULL THEN NULL          -- dropped from next file: excluded
               ELSE n.nxt_sort IS NOT NULL AND b.cur_sort IS NOT NULL AND n.nxt_sort <= b.cur_sort
          END
        ELSE
          COALESCE(p.paid, 0) > 0
          AND (b.emi IS NULL OR b.emi <= 0 OR COALESCE(p.paid, 0) >= b.emi)
        END AS is_resolved,
        CASE WHEN $3::boolean THEN COALESCE(n.nxt_is_current, false)
        ELSE b.due_amount > 0 AND COALESCE(p.paid, 0) >= b.due_amount
        END AS is_normalized,
        CASE WHEN $3::boolean THEN
          n.nxt_sort IS NOT NULL AND b.cur_sort IS NOT NULL
          AND n.nxt_sort < b.cur_sort AND NOT n.nxt_is_current
        ELSE
          b.emi > 0 AND COALESCE(p.paid, 0) >= b.emi
          AND (b.due_amount IS NULL OR COALESCE(p.paid, 0) < b.due_amount)
        END AS is_rolled_back
      FROM base b
      LEFT JOIN pays p ON p.customer_id = b.customer_id
      LEFT JOIN nxt n ON n.customer_id = b.customer_id
      LEFT JOIN trail t ON t.customer_id = b.customer_id
    )`;
}

const AGGREGATE_SELECT = `
  COUNT(*)::int                                                    AS allocated_count,
  COALESCE(SUM(due_amount), 0)::float                              AS allocated_amount,
  COUNT(*) FILTER (WHERE cur_cat = 'npa')::int                     AS recovery_allocated_count,
  COALESCE(SUM(due_amount) FILTER (WHERE cur_cat = 'npa'), 0)::float AS recovery_allocated_amount,
  COALESCE(SUM(paid), 0)::float                                    AS collected_amount,
  COUNT(*) FILTER (WHERE paid > 0)::int                            AS collected_count,
  COALESCE(SUM(due_amount) FILTER (WHERE is_resolved), 0)::float   AS resolution_amount,
  COUNT(*) FILTER (WHERE is_resolved)::int                         AS resolution_count,
  COALESCE(SUM(due_amount) FILTER (WHERE is_rolled_back), 0)::float AS rollback_amount,
  COUNT(*) FILTER (WHERE is_rolled_back)::int                      AS rollback_count,
  COALESCE(SUM(due_amount) FILTER (WHERE is_normalized), 0)::float AS normalization_amount,
  COUNT(*) FILTER (WHERE is_normalized)::int                       AS normalization_count,
  COALESCE(SUM(paid) FILTER (WHERE cur_cat = 'npa'), 0)::float     AS recovery_amount,
  COUNT(*) FILTER (WHERE cur_cat = 'npa' AND paid > 0)::int        AS recovery_count,
  COUNT(*) FILTER (WHERE has_trail)::int                           AS trail_count`;

async function classify(
  agencyId: string,
  filters: ReportFilters,
  useTransition: boolean,
): Promise<ClassifiedAggregates> {
  const params: unknown[] = [agencyId, filters.month, useTransition];
  const conditions = baseConditions(filters, params);
  const { rows } = await pool.query(
    `WITH ${classifiedCtes(conditions)}
     SELECT ${AGGREGATE_SELECT} FROM class`,
    params,
  );
  return rows[0] as ClassifiedAggregates;
}

interface TargetValue {
  target_amount: number | null;
  target_count: number | null;
}

/**
 * Target lookup: the row at the effective scope level with the most specific
 * company/product/bucket match wins; when the level has no rows, child-scope
 * rows are summed (agency <- branches <- teams <- agents), first level with
 * rows wins so levels never double-count.
 */
export async function resolveTarget(
  agencyId: string,
  metric: ReportMetric,
  filters: ReportFilters,
): Promise<TargetValue> {
  const dims = (params: unknown[]): string => {
    params.push(filters.company_id ?? null);
    const c = params.length;
    params.push(filters.product ?? null);
    const p = params.length;
    params.push(filters.bucket ?? null);
    const b = params.length;
    return `AND (t.company_id IS NULL OR t.company_id = $${c})
            AND (t.product IS NULL OR lower(t.product) = lower($${p}))
            AND (t.bucket IS NULL OR lower(t.bucket) = lower($${b}))`;
  };

  const exact = async (
    scopeType: string,
    scopeId: string | null,
  ): Promise<TargetValue | null> => {
    const params: unknown[] = [agencyId, filters.month, metric, scopeType];
    let scopeClause = "AND t.scope_id IS NULL";
    if (scopeId) {
      params.push(scopeId);
      scopeClause = `AND t.scope_id = $${params.length}`;
    }
    const dimClause = dims(params);
    const { rows } = await pool.query(
      `SELECT t.target_amount::float, t.target_count
         FROM targets t
        WHERE t.agency_id = $1 AND t.month = $2::date AND t.metric = $3
          AND t.scope_type = $4 ${scopeClause} ${dimClause}
        ORDER BY (t.company_id IS NOT NULL)::int + (t.product IS NOT NULL)::int
                 + (t.bucket IS NOT NULL)::int DESC
        LIMIT 1`,
      params,
    );
    return rows[0] ?? null;
  };

  const childSum = async (
    scopeType: string,
    parentJoinTemplate?: string, // uses $PARENT placeholder for the parent id
    parentId?: string,
  ): Promise<TargetValue | null> => {
    const params: unknown[] = [agencyId, filters.month, metric, scopeType];
    let parentJoin = "";
    if (parentJoinTemplate && parentId) {
      params.push(parentId);
      parentJoin = parentJoinTemplate.replace("$PARENT", `$${params.length}`);
    }
    const dimClause = dims(params);
    const { rows } = await pool.query(
      `SELECT SUM(t.target_amount)::float AS target_amount,
              SUM(t.target_count)::int AS target_count, COUNT(*)::int AS n
         FROM targets t ${parentJoin}
        WHERE t.agency_id = $1 AND t.month = $2::date AND t.metric = $3
          AND t.scope_type = $4 ${dimClause}`,
      params,
    );
    if (!rows[0] || rows[0].n === 0) return null;
    return { target_amount: rows[0].target_amount, target_count: rows[0].target_count };
  };

  if (filters.agent_id) {
    return (await exact("agent", filters.agent_id)) ?? { target_amount: null, target_count: null };
  }
  if (filters.team_id) {
    return (
      (await exact("team", filters.team_id)) ??
      (await childSum(
        "agent",
        "JOIN users u ON u.id = t.scope_id AND u.team_id = $PARENT",
        filters.team_id,
      )) ?? { target_amount: null, target_count: null }
    );
  }
  if (filters.branch_id) {
    return (
      (await exact("branch", filters.branch_id)) ??
      (await childSum(
        "team",
        "JOIN teams tm ON tm.id = t.scope_id AND tm.branch_id = $PARENT",
        filters.branch_id,
      )) ??
      (await childSum(
        "agent",
        "JOIN users u ON u.id = t.scope_id AND u.branch_id = $PARENT",
        filters.branch_id,
      )) ?? { target_amount: null, target_count: null }
    );
  }
  return (
    (await exact("agency", null)) ??
    (await childSum("branch")) ??
    (await childSum("team")) ??
    (await childSum("agent")) ?? { target_amount: null, target_count: null }
  );
}

/** Payment-side filters (deposits card + overview): money in the current scope. */
function paymentConditions(filters: ReportFilters, params: unknown[]): string[] {
  const conditions: string[] = [];
  if (filters.company_id) {
    params.push(filters.company_id);
    conditions.push(`c.company_id = $${params.length}`);
  }
  if (filters.agent_id) {
    params.push(filters.agent_id);
    conditions.push(`p.collected_by_user_id = $${params.length}`);
  }
  if (filters.team_id) {
    params.push(filters.team_id);
    conditions.push(`cu.team_id = $${params.length}`);
  }
  if (filters.branch_id) {
    params.push(filters.branch_id);
    conditions.push(`cu.branch_id = $${params.length}`);
  }
  if (filters.product) {
    params.push(filters.product);
    conditions.push(
      `(lower(c.product) = lower($${params.length}) OR EXISTS (
          SELECT 1 FROM products pr
           WHERE pr.company_id = c.company_id
             AND lower(pr.raw_label) = lower(c.product)
             AND lower(pr.canonical_label) = lower($${params.length})))`,
    );
  }
  if (filters.bucket) {
    params.push(filters.bucket);
    conditions.push(`lower(c.bucket) = lower($${params.length})`);
  }
  return conditions;
}

export interface DepositTotals {
  collected: number;
  deposited: number;
  pending: number;
}

async function depositTotals(agencyId: string, filters: ReportFilters): Promise<DepositTotals> {
  const params: unknown[] = [agencyId, filters.month];
  const conditions = paymentConditions(filters, params);
  const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(p.amount), 0)::float AS collected,
            COALESCE(SUM(p.amount) FILTER (WHERE p.deposited_at IS NOT NULL), 0)::float AS deposited
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
       JOIN companies co ON co.id = c.company_id AND co.agency_id = $1
       JOIN users cu ON cu.id = p.collected_by_user_id
      WHERE p.paid_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
        AND p.paid_at < ((($2::date + interval '1 month')::date)::timestamp AT TIME ZONE 'Asia/Kolkata')
        ${where}`,
    params,
  );
  const collected = rows[0].collected as number;
  const deposited = rows[0].deposited as number;
  return { collected, deposited, pending: collected - deposited };
}

export interface MetricBlock {
  basis: "transition" | "payments";
  allocated_amount: number;
  allocated_count: number;
  target_amount: number | null;
  target_count: number | null;
  target_pct: number | null;
  mtd_amount: number;
  mtd_count: number;
  mtd_pct: number | null;
  run_rate_current: number | null;
  run_rate_required: number | null;
  away_amount: number | null;
  away_count: number | null;
}

export interface DashboardResult {
  month: string;
  days: MonthDays;
  scope: { clamped_to: string };
  allocated: { amount: number; count: number };
  metrics: Record<Exclude<ReportMetric, "collection">, MetricBlock>;
  collection: {
    mtd_amount: number;
    target_amount: number | null;
    target_pct: number | null;
    run_rate_current: number | null;
    run_rate_required: number | null;
  };
  deposits: DepositTotals;
  trail: { allocated_count: number; uploaded_count: number; pct: number | null };
}

const pct = (num: number, den: number | null | undefined): number | null =>
  den && den > 0 ? Math.round((num / den) * 10000) / 100 : null;

export async function dashboard(
  user: UserRow,
  requested: ReportFilters,
  hasFullView: boolean,
): Promise<DashboardResult> {
  const scope = resolveReportScope(user, requested, hasFullView);
  const filters = scope.filters;
  const days = monthDays(filters.month.slice(0, 7));
  const useTransition = await hasNextMonthSnapshot(user.agency_id, filters);
  const agg = await classify(user.agency_id, filters, useTransition);
  const deposits = await depositTotals(user.agency_id, filters);

  const basisOf = (metric: ReportMetric): "transition" | "payments" =>
    metric === "recovery" ? "payments" : useTransition ? "transition" : "payments";

  const block = async (
    metric: Exclude<ReportMetric, "collection">,
    mtdAmount: number,
    mtdCount: number,
    allocatedAmount: number,
    allocatedCount: number,
  ): Promise<MetricBlock> => {
    const target = await resolveTarget(user.agency_id, metric, filters);
    const runRateCurrent = days.elapsed > 0 ? mtdAmount / days.elapsed : null;
    const remaining = target.target_amount != null ? Math.max(target.target_amount - mtdAmount, 0) : null;
    return {
      basis: basisOf(metric),
      allocated_amount: allocatedAmount,
      allocated_count: allocatedCount,
      target_amount: target.target_amount,
      target_count: target.target_count,
      target_pct: target.target_amount != null ? pct(target.target_amount, allocatedAmount) : null,
      mtd_amount: mtdAmount,
      mtd_count: mtdCount,
      mtd_pct: pct(mtdAmount, allocatedAmount),
      run_rate_current: runRateCurrent,
      run_rate_required: remaining != null && days.left > 0 ? remaining / days.left : null,
      away_amount: target.target_amount != null ? Math.max(target.target_amount - mtdAmount, 0) : null,
      away_count: target.target_count != null ? Math.max(target.target_count - mtdCount, 0) : null,
    };
  };

  const collectionTarget = await resolveTarget(user.agency_id, "collection", filters);
  const collectionRemaining =
    collectionTarget.target_amount != null
      ? Math.max(collectionTarget.target_amount - agg.collected_amount, 0)
      : null;

  return {
    month: filters.month.slice(0, 7),
    days,
    scope: { clamped_to: scope.clampedTo },
    allocated: { amount: agg.allocated_amount, count: agg.allocated_count },
    metrics: {
      resolution: await block(
        "resolution",
        agg.resolution_amount,
        agg.resolution_count,
        agg.allocated_amount,
        agg.allocated_count,
      ),
      rollback: await block(
        "rollback",
        agg.rollback_amount,
        agg.rollback_count,
        agg.allocated_amount,
        agg.allocated_count,
      ),
      normalization: await block(
        "normalization",
        agg.normalization_amount,
        agg.normalization_count,
        agg.allocated_amount,
        agg.allocated_count,
      ),
      recovery: await block(
        "recovery",
        agg.recovery_amount,
        agg.recovery_count,
        agg.recovery_allocated_amount,
        agg.recovery_allocated_count,
      ),
    },
    collection: {
      mtd_amount: agg.collected_amount,
      target_amount: collectionTarget.target_amount,
      target_pct: pct(agg.collected_amount, collectionTarget.target_amount),
      run_rate_current: days.elapsed > 0 ? agg.collected_amount / days.elapsed : null,
      run_rate_required:
        collectionRemaining != null && days.left > 0 ? collectionRemaining / days.left : null,
    },
    deposits,
    trail: {
      allocated_count: agg.allocated_count,
      uploaded_count: agg.trail_count,
      pct: pct(agg.trail_count, agg.allocated_count),
    },
  };
}

export interface OverviewPoint {
  month: string;
  collected: number;
}

export async function overview(
  user: UserRow,
  requested: Omit<ReportFilters, "month">,
  hasFullView: boolean,
  months: number | "all",
): Promise<{ total: number; points: OverviewPoint[] }> {
  const scope = resolveReportScope(user, { ...requested, month: "2000-01-01" }, hasFullView);
  const params: unknown[] = [user.agency_id];
  const conditions = paymentConditions(scope.filters, params);
  let monthLimit = "";
  if (months !== "all") {
    params.push(months);
    monthLimit = `AND p.paid_at >= ((date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))
                    - make_interval(months => $${params.length}::int - 1))::timestamp AT TIME ZONE 'Asia/Kolkata')`;
  }
  const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT to_char(date_trunc('month', p.paid_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
            SUM(p.amount)::float AS collected
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
       JOIN companies co ON co.id = c.company_id AND co.agency_id = $1
       JOIN users cu ON cu.id = p.collected_by_user_id
      WHERE true ${monthLimit} ${where}
      GROUP BY 1 ORDER BY 1`,
    params,
  );
  const points = rows as OverviewPoint[];
  return { total: points.reduce((sum, p) => sum + p.collected, 0), points };
}

export interface AgentReportRow {
  agent_id: string;
  full_name: string;
  team_name: string | null;
  allocated_amount: number;
  allocated_count: number;
  collected_amount: number;
  resolution_amount: number;
  rollback_amount: number;
  normalization_amount: number;
  recovery_amount: number;
  trail_count: number;
  target_amount: number | null;
  achievement_pct: number | null;
}

export async function agentBreakdown(
  user: UserRow,
  requested: ReportFilters,
  hasFullView: boolean,
): Promise<AgentReportRow[]> {
  const scope = resolveReportScope(user, requested, hasFullView);
  const filters = scope.filters;
  const useTransition = await hasNextMonthSnapshot(user.agency_id, filters);

  const params: unknown[] = [user.agency_id, filters.month, useTransition];
  const conditions = baseConditions(filters, params);
  const { rows } = await pool.query(
    `WITH ${classifiedCtes(conditions)}
     SELECT class.assigned_agent_id AS agent_id, ${AGGREGATE_SELECT}
       FROM class
      WHERE class.assigned_agent_id IS NOT NULL
      GROUP BY class.assigned_agent_id`,
    params,
  );

  const result: AgentReportRow[] = [];
  for (const row of rows) {
    const { rows: users } = await pool.query(
      `SELECT u.full_name, tm.name AS team_name FROM users u
        LEFT JOIN teams tm ON tm.id = u.team_id WHERE u.id = $1`,
      [row.agent_id],
    );
    const target = await resolveTarget(user.agency_id, "collection", {
      ...filters,
      agent_id: row.agent_id as string,
    });
    result.push({
      agent_id: row.agent_id,
      full_name: users[0]?.full_name ?? "—",
      team_name: users[0]?.team_name ?? null,
      allocated_amount: row.allocated_amount,
      allocated_count: row.allocated_count,
      collected_amount: row.collected_amount,
      resolution_amount: row.resolution_amount,
      rollback_amount: row.rollback_amount,
      normalization_amount: row.normalization_amount,
      recovery_amount: row.recovery_amount,
      trail_count: row.trail_count,
      target_amount: target.target_amount,
      achievement_pct: pct(row.collected_amount, target.target_amount),
    });
  }
  result.sort((a, b) => b.collected_amount - a.collected_amount);
  return result;
}

export type BreakdownDimension = "company" | "product" | "bucket" | "branch" | "team" | "agent";

export interface BreakdownRow {
  key: string | null;
  label: string;
  allocated_amount: number;
  allocated_count: number;
  collected_amount: number;
  resolution_amount: number;
  resolution_pct: number | null;
  rollback_amount: number;
  rollback_pct: number | null;
  normalization_amount: number;
  normalization_pct: number | null;
  recovery_amount: number;
  recovery_pct: number | null;
  trail_pct: number | null;
  target_amount: number | null;
  achievement_pct: number | null;
}

const DIMENSION_GROUP: Record<BreakdownDimension, { group: string; label: string }> = {
  company: { group: "class.company_id", label: "MAX(class.company_name)" },
  product: { group: "class.canonical_product", label: "MAX(class.canonical_product)" },
  bucket: { group: "class.bucket", label: "MAX(class.bucket)" },
  branch: { group: "class.branch_id", label: "MAX(class.branch_name)" },
  team: { group: "class.assigned_team_id", label: "MAX(class.team_name)" },
  agent: { group: "class.assigned_agent_id", label: "MAX(class.agent_name)" },
};

/**
 * Per-dimension slice of the same classification used by the dashboard and
 * agent breakdown (brief §15's "product wise view" and friends). Targets are
 * only meaningful for organizational dimensions (company/branch/team/agent)
 * -- product/bucket are cross-cutting narrowing filters in the targets model,
 * not their own scope level, so those rows carry a null target.
 */
export async function dimensionBreakdown(
  user: UserRow,
  requested: ReportFilters,
  hasFullView: boolean,
  dimension: BreakdownDimension,
): Promise<BreakdownRow[]> {
  const scope = resolveReportScope(user, requested, hasFullView);
  const filters = scope.filters;
  const useTransition = await hasNextMonthSnapshot(user.agency_id, filters);
  const params: unknown[] = [user.agency_id, filters.month, useTransition];
  const conditions = baseConditions(filters, params);
  const dim = DIMENSION_GROUP[dimension];
  const orderBy = dimension === "bucket" ? "MIN(class.cur_sort) ASC NULLS LAST" : "allocated_amount DESC";

  const { rows } = await pool.query(
    `WITH ${classifiedCtes(conditions)}
     SELECT ${dim.group} AS key, ${dim.label} AS label, ${AGGREGATE_SELECT}
       FROM class
      WHERE ${dim.group} IS NOT NULL
      GROUP BY ${dim.group}
      ORDER BY ${orderBy}`,
    params,
  );

  const isOrgDimension =
    dimension === "company" || dimension === "branch" || dimension === "team" || dimension === "agent";
  const result: BreakdownRow[] = [];
  for (const row of rows) {
    let target: TargetValue = { target_amount: null, target_count: null };
    if (isOrgDimension) {
      const scopeFilter: ReportFilters = { ...filters };
      if (dimension === "company") scopeFilter.company_id = row.key;
      if (dimension === "branch") scopeFilter.branch_id = row.key;
      if (dimension === "team") scopeFilter.team_id = row.key;
      if (dimension === "agent") scopeFilter.agent_id = row.key;
      target = await resolveTarget(user.agency_id, "collection", scopeFilter);
    }
    result.push({
      key: row.key,
      label: row.label ?? "—",
      allocated_amount: row.allocated_amount,
      allocated_count: row.allocated_count,
      collected_amount: row.collected_amount,
      resolution_amount: row.resolution_amount,
      resolution_pct: pct(row.resolution_amount, row.allocated_amount),
      rollback_amount: row.rollback_amount,
      rollback_pct: pct(row.rollback_amount, row.allocated_amount),
      normalization_amount: row.normalization_amount,
      normalization_pct: pct(row.normalization_amount, row.allocated_amount),
      recovery_amount: row.recovery_amount,
      recovery_pct: pct(row.recovery_amount, row.recovery_allocated_amount),
      trail_pct: pct(row.trail_count, row.allocated_count),
      target_amount: target.target_amount,
      achievement_pct: pct(row.collected_amount, target.target_amount),
    });
  }
  return result;
}

export interface TrailAnalytics {
  from: string;
  to: string;
  total_trails: number;
  unique_customers_contacted: number;
  by_action_code: { action_code: string; count: number }[];
  by_result_code: { result_code: string; count: number }[];
  ptps_created: number;
  ptps_kept: number;
  ptps_broken: number;
  ptps_pending: number;
  ptp_conversion_pct: number | null; // kept / (kept + broken)
}

/** Date-range trail/disposition analytics (event-level, so a range fits naturally here). */
export async function trailAnalytics(
  agencyId: string,
  from: string,
  to: string,
  filters: Omit<ReportFilters, "month">,
): Promise<TrailAnalytics> {
  const conditions = ["co.agency_id = $1", "cl.created_at >= $2::date", "cl.created_at < ($3::date + interval '1 day')"];
  const params: unknown[] = [agencyId, from, to];
  if (filters.company_id) {
    params.push(filters.company_id);
    conditions.push(`c.company_id = $${params.length}`);
  }
  if (filters.team_id) {
    params.push(filters.team_id);
    conditions.push(`u.team_id = $${params.length}`);
  }
  if (filters.agent_id) {
    params.push(filters.agent_id);
    conditions.push(`cl.agent_id = $${params.length}`);
  }
  if (filters.product) {
    params.push(filters.product);
    conditions.push(`lower(c.product) = lower($${params.length})`);
  }
  if (filters.bucket) {
    params.push(filters.bucket);
    conditions.push(`lower(c.bucket) = lower($${params.length})`);
  }
  const where = conditions.join(" AND ");

  const [totals, byAction, byResult, ptps] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(DISTINCT cl.customer_id)::int AS unique_customers
         FROM call_logs cl
         JOIN customers c ON c.id = cl.customer_id
         JOIN companies co ON co.id = c.company_id
         JOIN users u ON u.id = cl.agent_id
        WHERE ${where}`,
      params,
    ),
    pool.query(
      `SELECT dc.action_code, COUNT(*)::int AS count
         FROM call_logs cl
         JOIN customers c ON c.id = cl.customer_id
         JOIN companies co ON co.id = c.company_id
         JOIN users u ON u.id = cl.agent_id
         JOIN disposition_codes dc ON dc.id = cl.disposition_code_id
        WHERE ${where}
        GROUP BY dc.action_code ORDER BY count DESC`,
      params,
    ),
    pool.query(
      `SELECT dc.result_code, COUNT(*)::int AS count
         FROM call_logs cl
         JOIN customers c ON c.id = cl.customer_id
         JOIN companies co ON co.id = c.company_id
         JOIN users u ON u.id = cl.agent_id
         JOIN disposition_codes dc ON dc.id = cl.disposition_code_id
        WHERE ${where} AND dc.result_code IS NOT NULL
        GROUP BY dc.result_code ORDER BY count DESC`,
      params,
    ),
    pool.query(
      `SELECT p.status, COUNT(*)::int AS count
         FROM ptps p
         JOIN call_logs cl ON cl.id = p.call_log_id
         JOIN customers c ON c.id = cl.customer_id
         JOIN companies co ON co.id = c.company_id
         JOIN users u ON u.id = cl.agent_id
        WHERE ${where}
        GROUP BY p.status`,
      params,
    ),
  ]);

  const ptpCounts: Record<string, number> = { pending: 0, kept: 0, broken: 0 };
  for (const r of ptps.rows) ptpCounts[r.status as string] = r.count as number;
  const ptpsCreated = ptpCounts.pending + ptpCounts.kept + ptpCounts.broken;

  return {
    from,
    to,
    total_trails: totals.rows[0].total,
    unique_customers_contacted: totals.rows[0].unique_customers,
    by_action_code: byAction.rows as { action_code: string; count: number }[],
    by_result_code: byResult.rows as { result_code: string; count: number }[],
    ptps_created: ptpsCreated,
    ptps_kept: ptpCounts.kept,
    ptps_broken: ptpCounts.broken,
    ptps_pending: ptpCounts.pending,
    ptp_conversion_pct: pct(ptpCounts.kept, ptpCounts.kept + ptpCounts.broken),
  };
}

export interface RecallReportRow {
  company_id: string;
  company_name: string;
  recalled_count: number;
  recalled_amount: number;
}

export interface RecalledCustomerRow {
  customer_id: string;
  loan_number: string;
  customer_name: string;
  company_name: string;
  recalled_at: string;
  last_bucket: string | null;
  last_due_amount: number | null;
  last_agent_name: string | null;
}

export interface RecallReport {
  month: string;
  by_company: RecallReportRow[];
  customers: RecalledCustomerRow[];
  total_recalled_count: number;
  total_recalled_amount: number;
  lifetime_recalled_count: number;
}

/** Recalled cases (Phase 7 discrepancy review) -- a distinct fact from `closed`, reported separately. */
export async function recallReport(
  agencyId: string,
  month: string,
  companyId?: string,
): Promise<RecallReport> {
  const params: unknown[] = [agencyId, month];
  let companyClause = "";
  if (companyId) {
    params.push(companyId);
    companyClause = `AND c.company_id = $${params.length}`;
  }
  const byCompany = await pool.query(
    `SELECT c.company_id, co.name AS company_name,
            COUNT(*)::int AS recalled_count,
            COALESCE(SUM(c.due_amount), 0)::float AS recalled_amount
       FROM customers c
       JOIN companies co ON co.id = c.company_id
      WHERE co.agency_id = $1 AND c.status = 'recalled'
        AND c.recalled_at >= $2::date AND c.recalled_at < ($2::date + interval '1 month')
        ${companyClause}
      GROUP BY c.company_id, co.name
      ORDER BY recalled_count DESC`,
    params,
  );
  // Independent param numbering from the byCompany query above -- that one's
  // companyClause references $3 (built after month occupies $2), which
  // doesn't exist in this two-param query.
  const lifetimeParams: unknown[] = [agencyId];
  let lifetimeCompanyClause = "";
  if (companyId) {
    lifetimeParams.push(companyId);
    lifetimeCompanyClause = `AND c.company_id = $${lifetimeParams.length}`;
  }
  const lifetime = await pool.query(
    `SELECT COUNT(*)::int AS n FROM customers c
       JOIN companies co ON co.id = c.company_id
      WHERE co.agency_id = $1 AND c.status = 'recalled' ${lifetimeCompanyClause}`,
    lifetimeParams,
  );

  // Detailed downloadable list, same month window as by_company above -- its
  // own independent param array, same reason as lifetimeParams.
  const detailParams: unknown[] = [agencyId, month];
  let detailCompanyClause = "";
  if (companyId) {
    detailParams.push(companyId);
    detailCompanyClause = `AND c.company_id = $${detailParams.length}`;
  }
  const customerRows = await pool.query(
    `SELECT c.id AS customer_id, c.loan_number, c.customer_name, co.name AS company_name,
            c.recalled_at, c.bucket AS last_bucket, c.due_amount::float AS last_due_amount,
            (SELECT u.full_name FROM allocation_logs al
               JOIN users u ON u.id = al.to_agent_id
              WHERE al.customer_id = c.id
              ORDER BY al.created_at DESC LIMIT 1) AS last_agent_name
       FROM customers c
       JOIN companies co ON co.id = c.company_id
      WHERE co.agency_id = $1 AND c.status = 'recalled'
        AND c.recalled_at >= $2::date AND c.recalled_at < ($2::date + interval '1 month')
        ${detailCompanyClause}
      ORDER BY c.recalled_at DESC`,
    detailParams,
  );

  const rows = byCompany.rows as RecallReportRow[];
  return {
    month: month.slice(0, 7),
    by_company: rows,
    customers: customerRows.rows as RecalledCustomerRow[],
    total_recalled_count: rows.reduce((s, r) => s + r.recalled_count, 0),
    total_recalled_amount: rows.reduce((s, r) => s + r.recalled_amount, 0),
    lifetime_recalled_count: lifetime.rows[0].n,
  };
}

export interface BucketMovementReportRow {
  company_id: string;
  company_name: string;
  bucket: string;
  payment_detected: number;
  allocation_confirmed: number;
  detected_not_confirmed: number;
}

/**
 * Payment-detected normalizations vs. allocation-confirmed ones, per
 * company/bucket. "Detected but not confirmed" is the owner-level insight:
 * in-house signal the lender's next file hasn't (yet) agreed with.
 */
export async function bucketMovementReport(
  agencyId: string,
  month: string,
  companyId?: string,
): Promise<{ month: string; rows: BucketMovementReportRow[] }> {
  const params: unknown[] = [agencyId, month];
  let companyClause = "";
  if (companyId) {
    params.push(companyId);
    companyClause = `AND bm.company_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT bm.company_id, co.name AS company_name, bm.from_bucket AS bucket,
            COUNT(*) FILTER (WHERE bm.trigger = 'payment')::int AS payment_detected,
            COUNT(*) FILTER (WHERE bm.trigger = 'allocation')::int AS allocation_confirmed,
            COUNT(*) FILTER (
              WHERE bm.trigger = 'payment' AND NOT EXISTS (
                SELECT 1 FROM bucket_movements c2
                 WHERE c2.customer_id = bm.customer_id AND c2.trigger = 'allocation'
                   AND c2.month >= bm.month
              )
            )::int AS detected_not_confirmed
       FROM bucket_movements bm
       JOIN companies co ON co.id = bm.company_id
      WHERE co.agency_id = $1 AND bm.month = $2::date ${companyClause}
      GROUP BY bm.company_id, co.name, bm.from_bucket
      ORDER BY co.name, bm.from_bucket`,
    params,
  );
  return { month: month.slice(0, 7), rows: rows as BucketMovementReportRow[] };
}

export interface BucketMismatchRow {
  customer_id: string;
  loan_number: string;
  customer_name: string;
  company_name: string;
  lender_bucket: string;
  lender_canonical: number;
  due_date: string;
  dpd: number;
  computed_canonical: number;
}

/**
 * DPD cross-check (Phase 7 correction): buckets are 100% lender-supplied
 * with no independent aging calculation -- standard collection-agency
 * practice also tracks the EMI due date and computes DPD independently, to
 * catch cases where the two disagree. This NEVER overrides `customers.bucket`
 * -- the lender's bucket stays authoritative for billing/reporting; a
 * mismatch here just means "worth a second look," using the standard
 * 30-day-increment convention (0-29 days = canonical 0/current, 30-59 = 1,
 * 60-89 = 2, ...). Only customers with BOTH a due_date (the source column
 * was mapped) and a canonically-mapped lender bucket can be checked at all;
 * everyone else is silently excluded, not flagged as a false mismatch.
 */
export async function bucketMismatchReport(
  agencyId: string,
  companyId?: string,
): Promise<{ rows: BucketMismatchRow[] }> {
  const params: unknown[] = [agencyId];
  let companyClause = "";
  if (companyId) {
    params.push(companyId);
    companyClause = `AND c.company_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT c.id AS customer_id, c.loan_number, c.customer_name, co.name AS company_name,
            c.bucket AS lender_bucket, b.canonical_bucket AS lender_canonical,
            c.due_date,
            GREATEST(CURRENT_DATE - c.due_date, 0)::int AS dpd,
            GREATEST(FLOOR(GREATEST(CURRENT_DATE - c.due_date, 0) / 30.0), 0)::int AS computed_canonical
       FROM customers c
       JOIN companies co ON co.id = c.company_id
       JOIN buckets b ON b.company_id = c.company_id AND lower(b.label) = lower(c.bucket)
      WHERE co.agency_id = $1 AND c.status = 'active'
        AND c.due_date IS NOT NULL AND b.canonical_bucket IS NOT NULL
        AND FLOOR(GREATEST(CURRENT_DATE - c.due_date, 0) / 30.0) <> b.canonical_bucket
        ${companyClause}
      ORDER BY dpd DESC`,
    params,
  );
  return { rows: rows as BucketMismatchRow[] };
}

/** Products + buckets available under the current scope (dashboard filter options). */
export async function filterOptions(
  agencyId: string,
  companyId?: string,
): Promise<{ products: string[]; buckets: string[] }> {
  const productParams: unknown[] = [agencyId];
  let companyClause = "";
  if (companyId) {
    productParams.push(companyId);
    companyClause = `AND p.company_id = $${productParams.length}`;
  }
  const { rows: products } = await pool.query(
    `SELECT DISTINCT p.canonical_label AS label
       FROM products p JOIN companies co ON co.id = p.company_id
      WHERE co.agency_id = $1 ${companyClause}
      ORDER BY 1`,
    productParams,
  );
  const bucketParams: unknown[] = [agencyId];
  let bucketCompanyClause = "";
  if (companyId) {
    bucketParams.push(companyId);
    bucketCompanyClause = `AND b.company_id = $${bucketParams.length}`;
  }
  const { rows: buckets } = await pool.query(
    `SELECT b.label, MIN(b.sort_order) AS ord
       FROM buckets b JOIN companies co ON co.id = b.company_id
      WHERE co.agency_id = $1 ${bucketCompanyClause}
      GROUP BY b.label ORDER BY ord, b.label`,
    bucketParams,
  );
  return {
    products: products.map((r) => r.label as string),
    buckets: buckets.map((r) => r.label as string),
  };
}
