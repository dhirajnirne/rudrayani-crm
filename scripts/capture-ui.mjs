// Playwright driver for the UI capture pipeline. Logs in as each of the 5 demo
// roles against the real running dev app (frontend :5173, backend :4000) and
// captures real rendered HTML for every route + applicable modal/drawer state.
// Usage:
//   node scripts/capture-ui.mjs                                   # full sweep
//   node scripts/capture-ui.mjs --role=telecaller --routes=dashboard,my-worklist --modals=log-call-modal
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROLES,
  ROUTES,
  MODAL_RECIPES,
  BASE_URL,
  waitForPageReady,
  flattenCanvases,
  closeOverlay,
} from "./capture-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "ui-capture", "raw");

function parseArgs() {
  const opts = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) opts[m[1]] = m[2];
  }
  return {
    roles: opts.role ? opts.role.split(",") : null,
    routes: opts.routes ? opts.routes.split(",") : null,
    modals: opts.modals ? opts.modals.split(",") : null,
  };
}
const filters = parseArgs();

const results = [];
function record(entry) {
  results.push({ ...entry, ts: new Date().toISOString() });
  const tag = entry.status === "ok" ? "OK   " : entry.status === "skipped" ? "SKIP " : "ERROR";
  console.log(`[${tag}] ${entry.role ?? "_public"} / ${entry.item}${entry.reason ? " -- " + entry.reason : ""}`);
}

async function captureCurrentPage(page, outFile) {
  await flattenCanvases(page);
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, html, "utf-8");
}

async function capturePublicPages(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);
    await captureCurrentPage(page, path.join(OUT_DIR, "_public", "login.html"));
    record({ role: null, item: "public/login", status: "ok" });
  } catch (err) {
    record({ role: null, item: "public/login", status: "error", reason: String(err?.message || err) });
  }

  try {
    await page.goto(`${BASE_URL}/forgot-password`, { waitUntil: "domcontentloaded" });
    await waitForPageReady(page);
    await captureCurrentPage(page, path.join(OUT_DIR, "_public", "forgot-password-step1.html"));
    record({ role: null, item: "public/forgot-password-step1", status: "ok" });
  } catch (err) {
    record({ role: null, item: "public/forgot-password-step1", status: "error", reason: String(err?.message || err) });
  }

  try {
    // Reveal step 2 via the dev-mode OTP echo (POST /auth/otp/request only
    // issues an OTP, it never changes the password -- resetPassword is never
    // invoked here, so this stays non-mutating with respect to login state).
    await page.getByPlaceholder("9999999999").fill("9999999999");
    await page.getByRole("button", { name: "Send OTP" }).click({ timeout: 5000 });
    await waitForPageReady(page);
    await captureCurrentPage(page, path.join(OUT_DIR, "_public", "forgot-password-step2.html"));
    record({ role: null, item: "public/forgot-password-step2", status: "ok" });
  } catch (err) {
    record({ role: null, item: "public/forgot-password-step2", status: "error", reason: String(err?.message || err) });
  }

  await context.close();
}

async function loginAs(page, role) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("9999999999").fill(role.phone);
  await page.getByPlaceholder("Password").fill(role.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 15000 });
}

async function captureRoutesForRole(page, role, routes) {
  for (const route of routes) {
    const item = `${route.slug}`;
    try {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
      await waitForPageReady(page);
      const outFile = path.join(OUT_DIR, role.slug, `${route.slug}.html`);
      await captureCurrentPage(page, outFile);
      record({ role: role.slug, item, status: "ok", label: route.label, kind: "route" });
    } catch (err) {
      record({ role: role.slug, item, status: "error", label: route.label, kind: "route", reason: String(err?.message || err) });
    }
  }
}

const ROUTE_PATH_BY_SLUG = new Map(ROUTES.map((r) => [r.slug, r.path]));

async function captureModalsForRole(page, role, recipes) {
  for (const recipe of recipes) {
    const item = `modal-${recipe.id}`;
    try {
      const hostPath = ROUTE_PATH_BY_SLUG.get(recipe.host);
      if (!hostPath) throw new Error(`unknown host route slug "${recipe.host}"`);
      await page.goto(`${BASE_URL}${hostPath}`, {
        waitUntil: "domcontentloaded",
      });
      await waitForPageReady(page);
      await recipe.open(page);
      await page.waitForSelector(recipe.waitSelector ?? ".ant-modal, .ant-drawer", { timeout: 5000 });
      await page.waitForTimeout(350);
      const outFile = path.join(OUT_DIR, role.slug, `${item}.html`);
      await captureCurrentPage(page, outFile);
      record({ role: role.slug, item, status: "ok", label: recipe.label, kind: "modal" });
    } catch (err) {
      record({
        role: role.slug,
        item,
        status: "skipped",
        label: recipe.label,
        kind: "modal",
        reason: `trigger not reachable (${String(err?.message || err).split("\n")[0]})`,
      });
    } finally {
      await closeOverlay(page, recipe.closeWaitSelector);
    }
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  const rolesToRun = ROLES.filter((r) => !filters.roles || filters.roles.includes(r.slug));
  const routesToRun = ROUTES.filter((r) => !filters.routes || filters.routes.includes(r.slug));
  const modalsToRun = MODAL_RECIPES.filter((m) => !filters.modals || filters.modals.includes(m.id));

  if (!filters.roles) {
    await capturePublicPages(browser);
  }

  for (const role of rolesToRun) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAs(page, role);
      record({ role: role.slug, item: "login", status: "ok" });
    } catch (err) {
      record({ role: role.slug, item: "login", status: "error", reason: String(err?.message || err) });
      await context.close();
      continue;
    }

    await captureRoutesForRole(page, role, routesToRun);

    const applicableModals = modalsToRun.filter((m) => m.appliesToRoles.includes(role.slug));
    await captureModalsForRole(page, role, applicableModals);

    await context.close();
  }

  await browser.close();

  const resultsFile = path.join(OUT_DIR, "_capture-results.json");
  await mkdir(path.dirname(resultsFile), { recursive: true });
  await writeFile(resultsFile, JSON.stringify(results, null, 2), "utf-8");

  const summary = {};
  for (const r of results) {
    const key = r.role ?? "_public";
    summary[key] ??= { ok: 0, skipped: 0, error: 0 };
    summary[key][r.status] = (summary[key][r.status] ?? 0) + 1;
  }
  console.log("\n=== Capture summary ===");
  for (const [role, counts] of Object.entries(summary)) {
    console.log(`${role}: ok=${counts.ok ?? 0} skipped=${counts.skipped ?? 0} error=${counts.error ?? 0}`);
  }
  const errors = results.filter((r) => r.status === "error");
  if (errors.length > 0) {
    console.log("\n=== Errors ===");
    for (const e of errors) console.log(`${e.role ?? "_public"} / ${e.item}: ${e.reason}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("Fatal error in capture run:", err);
  process.exitCode = 1;
});
