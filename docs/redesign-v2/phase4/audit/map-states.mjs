// Phase 4 · PR 3a map-state captures (rerun on every PR that touches the map frame).
// Drives the control row, the Find palette, the band and the roster through their states on both
// surfaces and screenshots each one, both themes at 1920×1080 plus the 1024×768 narrow frame (O6: the
// row wraps) and a 1000px frame for the below-lg read-only band line (D2 / deviation 4).
// Usage: node docs/redesign-v2/phase4/audit/map-states.mjs <baseUrl> <outDir> <adminEmail> <adminPassword>
// Run against the LOCAL Docker stack only (npm run db:start + db:seed; .env.local pointed at it) — never
// against production: the seeded local admin is e2e-admin@example.test (tests/e2e-auth/auth-helpers.ts).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base = "http://localhost:3000", outDir = "out", email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("admin email + password required (the seeded local admin)");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.getByRole("button", { name: "Log in", exact: true }).click();
await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });

const shot = async (name, clip) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false, ...(clip ? { clip } : {}) });
  console.log(`captured ${name}`);
};
const open = async (route, theme, width = 1920, height = 1080) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
};
const row = () => page.getByRole("toolbar", { name: "Map controls" });
const rowClip = { x: 0, y: 48, width: 1920, height: 48 };
const bandClip = async () => {
  const box = await page.locator("[data-map-status-band]").boundingBox();
  return box ? { x: 0, y: Math.round(box.y), width: 1920, height: Math.round(box.height) } : undefined;
};
const searchbox = () => row().getByRole("searchbox");
const escape = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(250); };

for (const theme of ["light", "dark"]) {
  // /admin — the draft row (Publish disabled with its reason on a converged seed), the ⋯ menu, the floor menu.
  await open("/admin", theme);
  await shot(`admin-${theme}-1920`);
  await shot(`admin-row-${theme}-1920`, rowClip);
  await row().getByRole("button", { name: "More actions" }).click();
  await page.waitForTimeout(300);
  await shot(`admin-row-overflow-${theme}-1920`, { x: 900, y: 48, width: 1020, height: 140 });
  await escape();
  await row().getByRole("button", { name: /^Change floor/ }).click();
  await page.waitForTimeout(300);
  await shot(`admin-floor-menu-${theme}-1920`, { x: 0, y: 48, width: 400, height: 180 });
  await escape();
  // Undo tooltip (tier C) on hover.
  await row().getByRole("button", { name: /^(Undo |No map changes to undo)/ }).hover();
  await page.waitForTimeout(300);
  await shot(`admin-row-undo-tooltip-${theme}-1920`, { x: 1000, y: 48, width: 500, height: 110 });
  await page.mouse.move(960, 700);
  // Names off: the legend follows the toggle.
  const namesToggle = row().getByRole("button", { name: "Show occupant names" });
  if ((await namesToggle.getAttribute("aria-pressed")) === "true") await namesToggle.click();
  await page.waitForTimeout(400);
  await shot(`admin-band-names-off-${theme}-1920`, await bandClip());
  await namesToggle.click();
  await page.waitForTimeout(400);
  await shot(`admin-band-names-on-${theme}-1920`, await bandClip());
  // The palette: browse (focus), results (a seeded name), zero + Widen (a query with no hit on this floor).
  await searchbox().focus();
  await page.waitForTimeout(500);
  await shot(`admin-palette-browse-${theme}-1920`, { x: 200, y: 48, width: 640, height: 640 });
  await searchbox().fill("a");
  await page.waitForTimeout(500);
  await shot(`admin-palette-results-${theme}-1920`, { x: 200, y: 48, width: 640, height: 640 });
  await searchbox().fill("zzzz");
  await page.waitForTimeout(400);
  await shot(`admin-palette-zero-${theme}-1920`, { x: 200, y: 48, width: 640, height: 260 });
  await row().getByRole("button", { name: /^Search scope/ }).click();
  await page.waitForTimeout(300);
  await shot(`admin-search-scope-${theme}-1920`, { x: 200, y: 48, width: 640, height: 200 });
  await escape();
  await row().getByRole("button", { name: "Clear search" }).click().catch(() => {});
  await escape();
  // Filters · N from the left panel.
  await page.locator('#shell-header button[aria-controls="shell-left-panel"]').click();
  await page.waitForTimeout(500);
  const boxes = page.locator('#shell-left-panel input[type="checkbox"]');
  if (await boxes.count() >= 1) await boxes.nth(0).click();
  await page.waitForTimeout(500);
  await shot(`admin-filters-applied-${theme}-1920`);
  await shot(`admin-row-filters-${theme}-1920`, { x: 256, y: 48, width: 1664, height: 48 });
  await escape();

  // / — the published row, Find me, the roster floor with Copy link.
  await open("/", theme);
  await shot(`home-${theme}-1920`);
  await shot(`home-row-${theme}-1920`, rowClip);
  await shot(`home-band-${theme}-1920`, await bandClip());
  await row().getByRole("button", { name: "Find me" }).click();
  await page.waitForTimeout(800);
  await shot(`home-find-me-${theme}-1920`);
  await escape();
  await row().getByRole("button", { name: /^Change floor/ }).click();
  await page.getByRole("menuitemradio", { name: /Floor 2/ }).click();
  await page.waitForTimeout(800);
  await shot(`home-roster-${theme}-1920`);
  const copy = page.getByRole("button", { name: /^Copy link for / }).first();
  if (await copy.count()) {
    await copy.hover();
    await page.waitForTimeout(300);
    await shot(`home-roster-copy-hover-${theme}-1920`, { x: 0, y: 96, width: 1920, height: 200 });
    await copy.click();
    await page.waitForTimeout(300);
    await shot(`home-roster-copied-${theme}-1920`, { x: 0, y: 96, width: 1920, height: 200 });
  }
}

// Narrow frames, light: 1024 (the row wraps, O6; editing is lg-and-up so the draft cluster stays) and
// 1000 (below lg: the editor cluster is Hidden and the band says why — D2 / deviation 4).
await open("/admin", "light", 1024, 768);
await shot("admin-light-1024");
await open("/", "light", 1024, 768);
await shot("home-light-1024");
await open("/admin", "light", 1000, 768);
await shot("admin-light-1000-read-only");

await page.evaluate(() => localStorage.removeItem("sp-theme"));
console.log(`console/page errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  ", e.slice(0, 200));
await browser.close();
