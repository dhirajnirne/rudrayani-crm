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

export type MetricKey = "resolution" | "rollback" | "normalization" | "recovery";

export interface DashboardData {
  month: string;
  days: { in_month: number; elapsed: number; left: number };
  scope: { clamped_to: "agency" | "branch" | "team" | "teams" | "self" };
  allocated: { amount: number; count: number };
  metrics: Record<MetricKey, MetricBlock>;
  collection: {
    mtd_amount: number;
    target_amount: number | null;
    target_pct: number | null;
    run_rate_current: number | null;
    run_rate_required: number | null;
    /** Total principal outstanding of the scope's book (Phase 8) -- context
     *  for the target, not baked into it. */
    pos_total: number;
    /** target_amount as a % of pos_total. */
    emi_over_pos_pct: number | null;
    /** Phase 12: money collected since midnight UTC. */
    today_amount: number;
    /** Phase 12: MTD collected split by payment.type. */
    by_type: { emi: number; settlement: number };
    /** Phase 12: MTD collected split by the collecting user's capability. */
    by_channel: { field: number; telecalling: number; other: number };
  };
  deposits: { collected: number; deposited: number; pending: number };
  trail: { allocated_count: number; uploaded_count: number; pct: number | null };
  filters: { products: string[]; buckets: string[] };
}

export const METRIC_TITLES: Record<MetricKey, string> = {
  resolution: "Resolution",
  rollback: "Roll Back",
  normalization: "Normalization",
  recovery: "Recovery",
};

export interface DashboardFilters {
  month: string; // YYYY-MM
  company_id?: string;
  branch_id?: string;
  team_id?: string;
  agent_id?: string;
  product?: string;
  bucket?: string;
  status?: "active" | "closed" | "recalled";
}
