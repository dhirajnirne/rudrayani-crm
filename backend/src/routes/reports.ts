import { Router, type Request } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requireAnyPermission } from "../middleware/authenticate";
import { capabilitiesHavePermission } from "../services/permission-service";
import { capabilitiesOf } from "../types/user";
import {
  agentBreakdown,
  dashboard,
  filterOptions,
  overview,
  type ReportFilters,
} from "../services/report-service";

/**
 * Performance dashboard API (Phase 5). reports.view = full filterable view
 * (admin/ops agency-wide, TL team-clamped); reports.view_self = own numbers
 * only. The service clamps the scope — the client cannot widen it.
 */
const router = Router();
router.use(authenticate, requireAnyPermission("reports.view", "reports.view_self"));

const filtersSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM")
    .transform((m) => `${m}-01`),
  company_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional(),
  agent_id: z.string().uuid().optional(),
  product: z.string().trim().min(1).max(200).optional(),
  bucket: z.string().trim().min(1).max(200).optional(),
});

async function hasFullView(req: Request): Promise<boolean> {
  return capabilitiesHavePermission(capabilitiesOf(req.user!), "reports.view");
}

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const filters = filtersSchema.parse(req.query) as ReportFilters;
    const full = await hasFullView(req);
    const result = await dashboard(req.user!, filters, full);
    const options = await filterOptions(req.user!.agency_id, filters.company_id);
    res.json({ ...result, filters: options });
  }),
);

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const query = filtersSchema
      .omit({ month: true })
      .extend({
        months: z
          .union([z.literal("all"), z.coerce.number().int().min(1).max(36)])
          .default(3),
      })
      .parse(req.query);
    const full = await hasFullView(req);
    const { months, ...filters } = query;
    const result = await overview(req.user!, filters, full, months);
    res.json(result);
  }),
);

router.get(
  "/agents",
  asyncHandler(async (req, res) => {
    const filters = filtersSchema.parse(req.query) as ReportFilters;
    const full = await hasFullView(req);
    const rows = await agentBreakdown(req.user!, filters, full);
    res.json({ rows });
  }),
);

const METRIC_TITLES: Record<string, string> = {
  resolution: "Resolution",
  rollback: "Roll Back",
  normalization: "Normalization",
  recovery: "Recovery",
};

/** Everything the current filters show, as a two-sheet workbook. */
router.get(
  "/export",
  asyncHandler(async (req, res) => {
    const filters = filtersSchema.parse(req.query) as ReportFilters;
    const full = await hasFullView(req);
    const result = await dashboard(req.user!, filters, full);
    const agents = await agentBreakdown(req.user!, filters, full);

    const wb = new ExcelJS.Workbook();
    const summary = wb.addWorksheet("Summary");
    summary.addRow(["Performance Dashboard", result.month]);
    summary.addRow([
      "Filters",
      [
        filters.company_id && "company",
        filters.branch_id && "branch",
        filters.team_id && "team",
        filters.agent_id && "agent",
        filters.product && `product=${filters.product}`,
        filters.bucket && `bucket=${filters.bucket}`,
      ]
        .filter(Boolean)
        .join(", ") || "All (scope: " + result.scope.clamped_to + ")",
    ]);
    summary.addRow([]);
    summary.addRow(["Allocated Amount", result.allocated.amount]);
    summary.addRow(["Allocated Count", result.allocated.count]);
    summary.addRow([]);
    summary.addRow([
      "Metric",
      "Basis",
      "Allocated Amount",
      "Target Amount",
      "Target %",
      "MTD Amount",
      "MTD %",
      "MTD Count",
      "Run Rate Current",
      "Run Rate Required",
    ]);
    for (const [key, metric] of Object.entries(result.metrics)) {
      summary.addRow([
        METRIC_TITLES[key] ?? key,
        metric.basis,
        metric.allocated_amount,
        metric.target_amount,
        metric.target_pct,
        metric.mtd_amount,
        metric.mtd_pct,
        metric.mtd_count,
        metric.run_rate_current,
        metric.run_rate_required,
      ]);
    }
    summary.addRow([]);
    summary.addRow(["Collection MTD", result.collection.mtd_amount]);
    summary.addRow(["Collection Target", result.collection.target_amount]);
    summary.addRow(["Total Collected", result.deposits.collected]);
    summary.addRow(["Total Deposited", result.deposits.deposited]);
    summary.addRow(["Total Pending", result.deposits.pending]);
    summary.addRow(["Trail Uploaded", result.trail.uploaded_count]);
    summary.addRow(["Trail %", result.trail.pct]);
    summary.getColumn(1).width = 24;
    summary.getRow(7).font = { bold: true };

    const agentsSheet = wb.addWorksheet("Agents");
    agentsSheet.addRow([
      "Agent",
      "Team",
      "Allocated Amount",
      "Allocated Count",
      "Collected",
      "Resolution MTD",
      "Roll Back MTD",
      "Normalization MTD",
      "Recovery MTD",
      "Trail Count",
      "Collection Target",
      "Achievement %",
    ]);
    agentsSheet.getRow(1).font = { bold: true };
    for (const a of agents) {
      agentsSheet.addRow([
        a.full_name,
        a.team_name,
        a.allocated_amount,
        a.allocated_count,
        a.collected_amount,
        a.resolution_amount,
        a.rollback_amount,
        a.normalization_amount,
        a.recovery_amount,
        a.trail_count,
        a.target_amount,
        a.achievement_pct,
      ]);
    }
    agentsSheet.getColumn(1).width = 24;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=dashboard-${result.month}.xlsx`,
    );
    const buffer = await wb.xlsx.writeBuffer();
    res.send(Buffer.from(buffer));
  }),
);

export default router;
