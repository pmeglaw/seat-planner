// Phase 4 runtime audit (rerun on every PR): every var(--…) referenced by a stylesheet rule that
// MATCHES an element on the page must resolve on :root or on some element.
// Also captures screenshots at 1920×1080 (both themes) + 1024×768 (light).
// Usage: node docs/redesign-v2/phase4/audit/runtime-audit.mjs <baseUrl> <outDir> [email] [password]
// Run against the LOCAL Docker stack (npm run db:start + db:seed; .env.local pointed at it) — never
// against production: the seeded local admin is e2e-admin@example.test (tests/e2e-auth/auth-helpers.ts).
// Outputs one line per route × theme (referenced count, undefined names), the system-state attribute
// check, console errors, and the screenshots the PR commits under screenshots/<pr>/.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base = "http://localhost:3000", outDir = "out", email, password] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const ROUTES = ["/", "/admin", "/admin/management", "/admin/settings", "/reception", "/login"];

// Runs in the page. A utility emitted for an unshipped prototype (app/concepts)
// is dead CSS here, so only matched rules count; Tailwind's own --tw-* defaults
// are declared empty on purpose and are skipped.
function auditInPage() {
  const els = Array.from(document.querySelectorAll("*"));
  const refs = new Map();
  const varRe = new RegExp("var\\((--(?!tw-)[a-z0-9-]+)", "g");
  const pseudoRe = new RegExp("::?[a-z-]+(\\([^)]*\\))?", "g");
  const walk = list => {
    for (const r of list) {
      if (r.cssRules && r.cssRules.length) { walk(r.cssRules); continue; }
      const sel = r.selectorText;
      if (!sel) continue;
      let matched = false;
      const classRe = new RegExp("^\\.((?:\\\\.|[^\\\\\\s:>+~,\\[])+)");
      try {
        matched = sel.split(",").some(s => {
          s = s.trim();
          // Tailwind utility (escaped class, possibly with a pseudo): match by
          // the decoded class name, which querySelector cannot parse reliably.
          const cls = s.match(classRe);
          if (cls && !/\s/.test(s.slice(cls[0].length).replace(/:[a-z-]+(\([^)]*\))?/g, ""))) {
            return document.getElementsByClassName(cls[1].replace(/\\(.)/g, "$1")).length > 0;
          }
          const clean = s.replace(pseudoRe, "").trim();
          return clean === "" || document.querySelector(clean);
        });
      } catch { matched = true; }
      if (!matched) continue;
      for (const m of (r.cssText || "").matchAll(varRe)) refs.set(m[1], (refs.get(m[1]) || 0) + 1);
    }
  };
  for (const sheet of document.styleSheets) { let rules; try { rules = sheet.cssRules; } catch { continue; } walk(rules); }
  const rootStyle = getComputedStyle(document.documentElement);
  const stillUndefined = [];
  for (const name of refs.keys()) {
    if (rootStyle.getPropertyValue(name).trim() !== "") continue;
    let found = false;
    for (const el of els) { if (getComputedStyle(el).getPropertyValue(name).trim() !== "") { found = true; break; } }
    if (!found) stillUndefined.push(name);
  }
  return { referenced: refs.size, stillUndefined };
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

if (email && password) {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

for (const route of ROUTES) {
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
    await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const attrs = await page.evaluate(() => [document.documentElement.getAttribute("data-theme"), document.documentElement.getAttribute("data-carbon-theme")]);
    const audit = await page.evaluate(auditInPage);
    const name = `${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}-${theme}`;
    await page.screenshot({ path: path.join(outDir, `${name}-1920.png`), fullPage: false });
    if (theme === "light") {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `${name}-1024.png`), fullPage: false });
    }
    console.log(`${route} ${theme} attrs=${attrs.join("/")} referenced=${audit.referenced} undefined=${audit.stillUndefined.length}${audit.stillUndefined.length ? " " + audit.stillUndefined.join(",") : ""}`);
  }
}
await page.evaluate(() => localStorage.removeItem("sp-theme"));
await page.goto(`${base}/`, { waitUntil: "networkidle" });
const sys = await page.evaluate(() => [document.documentElement.getAttribute("data-theme"), document.documentElement.getAttribute("data-carbon-theme")]);
console.log(`system state attrs=${sys.join("/")} (expected null/null)`);
console.log(`console/page errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  ", e.slice(0, 200));
await browser.close();
