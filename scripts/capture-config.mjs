// Shared data + helpers for the UI capture pipeline (scripts/capture-ui.mjs, scripts/assemble-ui.mjs).
export const BASE_URL = "http://localhost:5173";

export const ROLES = [
  { slug: "agency_admin", label: "Agency Admin", phone: "9999999999", password: "Admin@1234" },
  { slug: "operations_manager", label: "Operations Manager", phone: "8888888804", password: "Admin@1234" },
  { slug: "team_leader", label: "Team Leader", phone: "8888888803", password: "Admin@1234" },
  { slug: "telecaller", label: "Telecaller", phone: "8888888801", password: "Admin@1234" },
  { slug: "field_agent", label: "Field Agent", phone: "8888888802", password: "Admin@1234" },
];

// All 23 authenticated routes from frontend/src/App.tsx. Every role attempts every
// route directly (by URL), regardless of whether that role's sidebar nav shows the
// link -- several permission-gated routes render fully anyway (some GET endpoints
// are permission-open), and per the user's explicit "capture all" instruction we
// over-capture rather than assume a route is inapplicable to a role.
export const ROUTES = [
  { slug: "dashboard", label: "Dashboard", path: "/" },
  { slug: "management-dashboard", label: "Management Dashboard", path: "/management-dashboard" },
  { slug: "employees", label: "Employees", path: "/employees" },
  { slug: "org-chart", label: "Org Chart", path: "/org-chart" },
  { slug: "branches", label: "Branches", path: "/branches" },
  { slug: "teams", label: "Teams", path: "/teams" },
  { slug: "companies", label: "Companies", path: "/companies" },
  { slug: "buckets", label: "Buckets", path: "/buckets" },
  { slug: "field-config", label: "Field Config", path: "/field-config" },
  { slug: "import", label: "Import", path: "/import" },
  { slug: "import-reviews", label: "Import Review", path: "/import-reviews" },
  { slug: "customers", label: "Customers", path: "/customers" },
  { slug: "my-worklist", label: "My Worklist", path: "/my-worklist" },
  { slug: "my-requests", label: "My Requests", path: "/my-requests" },
  { slug: "allocation", label: "Allocation", path: "/allocation" },
  { slug: "reallocation-requests", label: "Reallocation Requests", path: "/reallocation-requests" },
  { slug: "correction-requests", label: "Correction Requests", path: "/correction-requests" },
  { slug: "dispositions", label: "Dispositions", path: "/dispositions" },
  { slug: "tracking", label: "Tracking", path: "/tracking" },
  { slug: "day-plan", label: "Day Plan", path: "/day-plan" },
  { slug: "targets", label: "Targets", path: "/targets" },
  { slug: "deposits", label: "Deposits", path: "/deposits" },
  { slug: "attendance", label: "Attendance", path: "/attendance" },
];

const ALL_ROLES = ROLES.map((r) => r.slug);
const ADMIN_OPS = ["agency_admin", "operations_manager"];
const ALLOCATORS = ["agency_admin", "operations_manager", "team_leader"];

// Every modal/drawer recipe. `host` is the route slug to be on before attempting
// the trigger. `prep(page)` runs first (e.g. switch tab, select a row checkbox) --
// optional. `open(page)` performs the actual trigger click and must leave the
// modal/drawer visibly open when it resolves. `appliesToRoles` narrows which
// roles even attempt this recipe (skip entirely rather than log a noisy failure
// for a role that structurally can't reach this trigger, e.g. no nav access).
export const MODAL_RECIPES = [
  // Tier 1 -- core recipes named in the approved plan.
  {
    id: "customer-detail-drawer",
    label: "Customer Detail Drawer",
    host: "my-worklist",
    appliesToRoles: ["telecaller", "field_agent"],
    open: async (page) => {
      await page.locator(".ant-table-tbody tr:not(.ant-table-measure-row)").first().click({ timeout: 3000 });
    },
  },
  {
    id: "customer-detail-drawer",
    label: "Customer Detail Drawer",
    host: "customers",
    appliesToRoles: ["agency_admin", "operations_manager", "team_leader"],
    open: async (page) => {
      await page.locator(".ant-table-tbody tr:not(.ant-table-measure-row)").first().click({ timeout: 3000 });
    },
  },
  {
    id: "log-call-modal",
    label: "Log Call",
    host: "my-worklist",
    appliesToRoles: ["telecaller", "field_agent"],
    open: async (page) => {
      await page.getByRole("button", { name: "Log Call" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "record-payment-modal",
    label: "Record Payment",
    host: "my-worklist",
    appliesToRoles: ["telecaller", "field_agent"],
    open: async (page) => {
      await page.getByRole("button", { name: "Payment" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "worklist-reallocate-modal",
    label: "Worklist Reallocate",
    host: "my-worklist",
    appliesToRoles: ["telecaller", "field_agent"],
    open: async (page) => {
      await page.getByRole("button", { name: "Reallocate" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "report-correction-modal",
    label: "Report an Error (Payment)",
    host: "my-worklist",
    appliesToRoles: ["telecaller"],
    open: async (page) => {
      await page.locator(".ant-table-tbody tr:not(.ant-table-measure-row)").first().click({ timeout: 3000 });
      await page.waitForSelector(".ant-drawer", { timeout: 5000 });
      await page.getByTitle("Report an error").first().click({ timeout: 3000 });
    },
  },
  {
    id: "report-correction-modal",
    label: "Report an Error (Payment)",
    host: "customers",
    appliesToRoles: ["agency_admin", "operations_manager", "team_leader"],
    open: async (page) => {
      await page.locator(".ant-table-tbody tr:not(.ant-table-measure-row)").first().click({ timeout: 3000 });
      await page.waitForSelector(".ant-drawer", { timeout: 5000 });
      await page.getByTitle("Report an error").first().click({ timeout: 3000 });
    },
  },
  {
    id: "branch-detail-drawer",
    label: "Branch Detail Drawer",
    host: "branches",
    appliesToRoles: ALL_ROLES,
    open: async (page) => {
      await page.locator(".ant-table-tbody tr:not(.ant-table-measure-row)").first().click({ timeout: 3000 });
    },
  },
  {
    id: "alerts-bell",
    label: "Alerts Bell",
    host: "dashboard",
    appliesToRoles: ALL_ROLES,
    waitSelector: ".ant-popover:not(.ant-popover-hidden)",
    closeWaitSelector: ".ant-popover:not(.ant-popover-hidden)",
    open: async (page) => {
      await page.locator("button:has(.anticon-bell)").first().click({ timeout: 3000 });
    },
  },

  // Tier 2 -- broader ad-hoc CRUD modals, in scope per user decision.
  {
    id: "employees-add",
    label: "Add Employee",
    host: "employees",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Add employee" }).click({ timeout: 3000 });
    },
  },
  {
    id: "employees-edit",
    label: "Edit Employee",
    host: "employees",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "employees-reset-password",
    label: "Reset Employee Password",
    host: "employees",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Reset password" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "companies-add",
    label: "Add Company",
    host: "companies",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Add company" }).click({ timeout: 3000 });
    },
  },
  {
    id: "companies-rename",
    label: "Rename Company",
    host: "companies",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Rename" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "teams-add",
    label: "Add Team",
    host: "teams",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Add team" }).click({ timeout: 3000 });
    },
  },
  {
    id: "teams-edit",
    label: "Edit Team",
    host: "teams",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "branches-add",
    label: "Add Branch",
    host: "branches",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Add branch" }).click({ timeout: 3000 });
    },
  },
  {
    id: "branches-rename",
    label: "Rename Branch",
    host: "branches",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Rename" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "dispositions-add",
    label: "Add Disposition Code",
    host: "dispositions",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Add code" }).click({ timeout: 3000 });
    },
  },
  {
    id: "dispositions-edit",
    label: "Edit Disposition Code",
    host: "dispositions",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "allocation-reallocate",
    label: "Allocation Reallocate",
    host: "allocation",
    appliesToRoles: ALLOCATORS,
    open: async (page) => {
      await page.getByRole("tab", { name: "Allocated", exact: true }).first().click({ timeout: 3000 });
      await page
        .locator(".ant-tabs-tabpane-active .ant-table-tbody tr:not(.ant-table-measure-row) .ant-checkbox")
        .first()
        .click({ timeout: 3000 });
      await page.getByRole("button", { name: "Reallocate…" }).click({ timeout: 3000 });
    },
  },
  {
    id: "allocation-history",
    label: "Allocation History",
    host: "allocation",
    appliesToRoles: ALLOCATORS,
    open: async (page) => {
      await page.getByRole("tab", { name: "Allocated", exact: true }).first().click({ timeout: 3000 });
      await page.getByRole("button", { name: "History" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "reallocation-approve",
    label: "Approve Reallocation Request",
    host: "reallocation-requests",
    appliesToRoles: ALLOCATORS,
    open: async (page) => {
      await page.getByRole("button", { name: "Approve" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "reallocation-reject",
    label: "Reject Reallocation Request",
    host: "reallocation-requests",
    appliesToRoles: ALLOCATORS,
    open: async (page) => {
      await page.getByRole("button", { name: "Reject" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "correction-approve",
    label: "Approve Correction Request",
    host: "correction-requests",
    appliesToRoles: ALLOCATORS,
    open: async (page) => {
      await page.getByRole("button", { name: "Approve" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "correction-reject",
    label: "Reject Correction Request",
    host: "correction-requests",
    appliesToRoles: ALLOCATORS,
    open: async (page) => {
      await page.getByRole("button", { name: "Reject" }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "import-review-approve",
    label: "Approve Import Review Item",
    host: "import-reviews",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Approve", exact: true }).first().click({ timeout: 3000 });
    },
  },
  {
    id: "import-review-reject",
    label: "Reject Import Review Item",
    host: "import-reviews",
    appliesToRoles: ADMIN_OPS,
    open: async (page) => {
      await page.getByRole("button", { name: "Reject", exact: true }).first().click({ timeout: 3000 });
    },
  },
];

/**
 * Bounded wait: TrackingPage and AlertsBell poll every 30s and Leaflet retries
 * tiles, so an absolute networkidle wait can hang past reason. Every stage below
 * is timeout-and-swallow, never a hard requirement.
 */
export async function waitForPageReady(page) {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  } catch {
    /* proceed anyway -- capture whatever rendered */
  }
  try {
    await page.waitForSelector(".ant-spin-spinning", { state: "detached", timeout: 15000 });
  } catch {
    /* a page with no spinner, or one still loading past the timeout -- proceed */
  }
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    /* polling pages never go idle -- proceed */
  }
  await page.waitForTimeout(400);
}

/** Canvas charts (@ant-design/plots) don't serialize into outerHTML -- swap each
 * for a same-sized <img> snapshot right before capture. No-op if there are none. */
export async function flattenCanvases(page) {
  await page.evaluate(() => {
    document.querySelectorAll("canvas").forEach((canvas) => {
      try {
        const img = document.createElement("img");
        img.src = canvas.toDataURL("image/png");
        img.width = canvas.width;
        img.height = canvas.height;
        img.style.cssText = canvas.style.cssText;
        canvas.replaceWith(img);
      } catch {
        /* tainted or zero-size canvas -- leave as-is rather than fail the capture */
      }
    });
  });
}

export async function closeOverlay(page, selector) {
  await page.keyboard.press("Escape");
  try {
    await page.waitForSelector(selector ?? ".ant-modal, .ant-drawer", { state: "detached", timeout: 4000 });
  } catch {
    /* nothing was open, or it didn't detach in time -- move on regardless */
  }
}
