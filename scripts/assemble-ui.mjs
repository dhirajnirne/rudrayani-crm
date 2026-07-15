// Builds the 5 combined per-role HTML files + README.md from the raw captures
// produced by scripts/capture-ui.mjs. Pure Node/filesystem work, no browser.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES, ROUTES, MODAL_RECIPES, BASE_URL } from "./capture-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "ui-capture", "raw");
const OUT_DIR = path.join(__dirname, "..", "ui-capture");

function escapeForSrcdoc(html) {
  return html
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function injectBase(html) {
  const baseTag = `<base href="${BASE_URL}/">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, (m) => `${m}${baseTag}`);
  }
  return baseTag + html;
}

async function loadResults() {
  const raw = await readFile(path.join(RAW_DIR, "_capture-results.json"), "utf-8");
  return JSON.parse(raw);
}

function findEntry(results, roleSlug, item) {
  return results.find((r) => r.role === roleSlug && r.item === item);
}

const PAGE_CSS = `
  :root { color-scheme: light; }
  body { margin: 0; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #f0f2f5; }
  .layout { display: flex; min-height: 100vh; }
  nav.toc { width: 260px; flex: none; background: #1a2332; color: #d7dbe6; padding: 16px 0; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  nav.toc h1 { font-size: 15px; padding: 0 16px; margin: 0 0 12px; color: #fff; }
  nav.toc h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 16px 4px; margin: 0; color: #8a93a8; }
  nav.toc a { display: block; padding: 6px 16px; color: #d7dbe6; text-decoration: none; font-size: 13px; }
  nav.toc a:hover { background: #2a3548; color: #fff; }
  nav.toc a.gap { color: #d99; }
  main { flex: 1; padding: 24px; min-width: 0; }
  section.screen { margin-bottom: 40px; }
  section.screen h2 { font-size: 16px; margin: 0 0 8px; padding-bottom: 8px; border-bottom: 2px solid #00535b; }
  section.screen .kind { font-size: 11px; color: #888; margin-left: 8px; font-weight: normal; }
  iframe.capture { width: 100%; height: 1400px; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; }
  .gap-note { padding: 16px; border: 1px dashed #d99; border-radius: 6px; background: #fff6f6; color: #a33; font-size: 13px; }
`;

async function buildRoleFile(role, results) {
  const routeEntries = ROUTES.map((route) => ({
    kind: "route",
    slug: route.slug,
    label: route.label,
    entry: findEntry(results, role.slug, route.slug),
  }));

  const applicableModals = MODAL_RECIPES.filter((m) => m.appliesToRoles.includes(role.slug));
  const modalEntries = applicableModals.map((recipe) => ({
    kind: "modal",
    slug: `modal-${recipe.id}`,
    label: recipe.label,
    entry: findEntry(results, role.slug, `modal-${recipe.id}`),
  }));

  const navItems = [];
  const sections = [];

  for (const group of [
    { title: "Pages", items: routeEntries },
    { title: "Modals & Drawers", items: modalEntries },
  ]) {
    if (group.items.length === 0) continue;
    navItems.push(`<h2>${group.title}</h2>`);
    for (const item of group.items) {
      const anchorId = `screen-${item.slug}`;
      const ok = item.entry?.status === "ok";
      navItems.push(`<a href="#${anchorId}"${ok ? "" : ' class="gap"'}>${item.label}${ok ? "" : " ⚠"}</a>`);

      if (ok) {
        const rawPath = path.join(RAW_DIR, role.slug, `${item.slug}.html`);
        let rawHtml;
        try {
          rawHtml = await readFile(rawPath, "utf-8");
        } catch {
          rawHtml = null;
        }
        if (rawHtml) {
          const srcdoc = escapeForSrcdoc(injectBase(rawHtml));
          sections.push(`
<section class="screen" id="${anchorId}">
  <h2>${item.label}<span class="kind">${item.kind}</span></h2>
  <iframe class="capture" srcdoc="${srcdoc}" title="${item.label}"></iframe>
</section>`);
          continue;
        }
      }

      const reason = item.entry?.reason ?? (item.entry ? "capture failed with no recorded reason" : "not attempted");
      sections.push(`
<section class="screen" id="${anchorId}">
  <h2>${item.label}<span class="kind">${item.kind}</span></h2>
  <div class="gap-note">Not captured — ${reason}</div>
</section>`);
    }
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Rudrayani CRM UI Capture — ${role.label}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="layout">
<nav class="toc">
<h1>${role.label}</h1>
${navItems.join("\n")}
</nav>
<main>
${sections.join("\n")}
</main>
</div>
</body>
</html>`;

  await writeFile(path.join(OUT_DIR, `${role.slug}.html`), html, "utf-8");
  return { routeEntries, modalEntries };
}

function countStatuses(results, roleSlug) {
  const counts = { ok: 0, skipped: 0, error: 0 };
  for (const r of results) {
    if (r.role !== roleSlug) continue;
    if (r.item === "login") continue;
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  return counts;
}

async function buildReadme(results) {
  const lines = [];
  lines.push("# Rudrayani CRM — Full UI Capture");
  lines.push("");
  lines.push(
    "Live capture of every route and modal/drawer state in the web app (`frontend/`), taken via Playwright against the running dev server, one file per role.",
  );
  lines.push("");
  lines.push("## Regenerate");
  lines.push("");
  lines.push("```bash");
  lines.push("# Pre-flight: docker compose up -d, backend `npm run dev` (:4000), frontend `npm run dev` (:5173)");
  lines.push("node scripts/capture-ui.mjs   # writes ui-capture/raw/");
  lines.push("node scripts/assemble-ui.mjs  # writes ui-capture/<role>.html + this file");
  lines.push("```");
  lines.push("");
  lines.push("## Files");
  lines.push("");
  for (const role of ROLES) {
    lines.push(`- \`${role.slug}.html\` — ${role.label}`);
  }
  lines.push("- `raw/` — per-screen raw captures + `_capture-results.json` (full ok/skipped/error log)");
  lines.push("- `raw/_public/` — Login and Forgot Password (unauthenticated, captured once)");
  lines.push("");
  lines.push("## Known, accepted gaps (not bugs in this capture)");
  lines.push("");
  lines.push(
    "Nothing here was forced — every gap below is because a trigger genuinely had no data to act on in the live dev database at capture time (e.g. no row to click), not a script failure. No demo/business data was seeded, reallocated, or otherwise mutated to manufacture these states, per the explicit decision to accept gaps rather than touch real data.",
  );
  lines.push("");
  const skipped = results.filter((r) => r.status === "skipped" && r.kind === "modal");
  if (skipped.length === 0) {
    lines.push("- None — every applicable modal/drawer captured successfully for every role it applies to.");
  } else {
    const byItem = new Map();
    for (const s of skipped) {
      const key = `${s.item}::${s.reason}`;
      if (!byItem.has(key)) byItem.set(key, { label: s.label ?? s.item, reason: s.reason, roles: [] });
      byItem.get(key).roles.push(s.role);
    }
    for (const { label, reason, roles } of byItem.values()) {
      lines.push(`- **${label}** — not captured for ${roles.join(", ")}: ${reason}`);
    }
  }
  lines.push("");
  const erroredRoutes = results.filter((r) => r.status === "error" && r.kind === "route");
  if (erroredRoutes.length > 0) {
    lines.push("### Route errors (need investigation, not accepted gaps)");
    lines.push("");
    for (const e of erroredRoutes) {
      lines.push(`- **${e.label ?? e.item}** (${e.role}): ${e.reason}`);
    }
    lines.push("");
  }
  lines.push(
    "## Note on fidelity: charts and same-origin assets",
  );
  lines.push("");
  lines.push(
    "Canvas-based charts (`@ant-design/plots`) are flattened to a static PNG snapshot at capture time (canvases don't serialize into HTML) — they render correctly but are non-interactive. Each captured screen has `<base href=\"http://localhost:5173/\">` injected so any residual same-origin asset reference still resolves — **keep `frontend: npm run dev` running while viewing these files** for full fidelity, even though most Ant Design styling is self-contained (Vite dev-mode injects `<style>` tags directly into the captured DOM).",
  );
  lines.push("");
  lines.push("## Per-role capture counts");
  lines.push("");
  lines.push("| Role | OK | Skipped | Error |");
  lines.push("|---|---|---|---|");
  for (const role of ROLES) {
    const c = countStatuses(results, role.slug);
    lines.push(`| ${role.label} | ${c.ok} | ${c.skipped} | ${c.error} |`);
  }
  lines.push("");

  await writeFile(path.join(OUT_DIR, "README.md"), lines.join("\n"), "utf-8");
}

async function run() {
  const results = await loadResults();
  await mkdir(OUT_DIR, { recursive: true });
  for (const role of ROLES) {
    await buildRoleFile(role, results);
    console.log(`Built ui-capture/${role.slug}.html`);
  }
  await buildReadme(results);
  console.log("Built ui-capture/README.md");
}

run().catch((err) => {
  console.error("Fatal error in assemble step:", err);
  process.exitCode = 1;
});
