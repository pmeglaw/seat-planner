// Phase 4 · PR 2 shell-state captures (rerun on every PR that touches the shell).
// Drives the real shell through its states and screenshots each one, both themes at 1920×1080 and the
// 1024×768 narrow frame, plus every dark-panel component rendered in the LIGHT theme (PHASE3DS §7 item 5 /
// P3-6 gate) and the computed colours of the utilities' hover / pressed / open states for the README's
// contrast table (owner audit add, 2026-09-04).
// Usage: node docs/redesign-v2/phase4/audit/shell-states.mjs <baseUrl> <outDir> <adminEmail> <adminPassword>
// Run against the LOCAL Docker stack only (npm run db:start + db:seed; .env.local pointed at it) — never
// against production: the seeded local admin is e2e-admin@example.test (tests/e2e-auth/auth-helpers.ts).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
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
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
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
  await page.waitForTimeout(600);
};
const utility = label => page.locator(`#shell-header button[aria-label="${label}"]`);
const hamburger = () => page.locator('#shell-header button[aria-controls="shell-left-panel"]');
const headerClip = { x: 0, y: 0, width: 1920, height: 48 };
const rightClip = { x: 1920 - 400, y: 0, width: 400, height: 760 };
const leftClip = { x: 0, y: 0, width: 320, height: 760 };

// Computed colours of a control in one state, for the README contrast table.
const measure = async (locator, label) => {
  const rgb = await locator.evaluate(el => {
    const cs = getComputedStyle(el);
    return { background: cs.backgroundColor, color: cs.color, shadow: cs.boxShadow };
  });
  console.log(`measure ${label}: bg=${rgb.background} fg=${rgb.color} shadow=${rgb.shadow.slice(0, 80)}`);
  return rgb;
};
const measurements = {};

for (const theme of ["light", "dark"]) {
  // /admin — draft indicator, utilities rest / hover / pressed / open, History open.
  await open("/admin", theme);
  await shot(`admin-header-rest-${theme}-1920`, headerClip);
  const bar = await page.locator('#shell-header nav a[aria-current="page"]').evaluate(el => getComputedStyle(el).boxShadow);
  console.log(`current-section bar (${theme}): ${bar}`);
  measurements[`${theme}-current-bar`] = bar;
  measurements[`${theme}-utility-rest`] = await measure(utility("Help"), `${theme} utility rest`);
  await utility("Help").hover();
  await page.waitForTimeout(200);
  await shot(`admin-utility-hover-tooltip-${theme}-1920`, { x: 1920 - 200, y: 0, width: 200, height: 96 });
  measurements[`${theme}-utility-hover`] = await measure(utility("Help"), `${theme} utility hover`);
  await page.mouse.move(960, 600);
  await utility("History").click();
  await page.waitForTimeout(700);
  await shot(`admin-history-open-${theme}-1920`);
  await shot(`admin-history-panel-${theme}-1920`, rightClip);
  measurements[`${theme}-utility-open`] = await measure(utility("History"), `${theme} utility open`);
  measurements[`${theme}-panel-link`] = await measure(page.locator("#shell-panel-history .cds-btn--ghost").first(), `${theme} panel ghost link`).catch(() => null);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // Pressed: hold the pointer on the utility.
  const box = await utility("Account").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  measurements[`${theme}-utility-pressed`] = await measure(utility("Account"), `${theme} utility pressed`);
  await shot(`admin-utility-pressed-${theme}-1920`, { x: 1920 - 200, y: 0, width: 200, height: 48 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await utility("Account").click();
  await page.waitForTimeout(700);
  await shot(`admin-account-open-${theme}-1920`, rightClip);
  await page.keyboard.press("Escape");
  await utility("Help").click();
  await page.waitForTimeout(700);
  await shot(`admin-help-open-${theme}-1920`, rightClip);
  await page.keyboard.press("Escape");
  // Indicator open (outlined) via the indicator itself.
  await page.locator("#shell-header .sp-mode").click();
  await page.waitForTimeout(500);
  await shot(`admin-indicator-open-${theme}-1920`, { x: 760, y: 0, width: 400, height: 96 });
  await page.keyboard.press("Escape");

  // /admin/management — reserved slot + fetched count.
  await open("/admin/management", theme);
  await page.waitForTimeout(800);
  await shot(`management-header-${theme}-1920`, headerClip);

  // / — published indicator, left panel with two filters applied, hamburger focus ring.
  await open("/", theme);
  await shot(`home-header-${theme}-1920`, headerClip);
  await hamburger().click();
  await page.waitForTimeout(500);
  const boxes = page.locator('#shell-left-panel input[type="checkbox"]');
  if (await boxes.count() >= 2) {
    await boxes.nth(0).click();
    await boxes.nth(1).click();
    await page.waitForTimeout(500);
  }
  await shot(`home-left-open-applied-${theme}-1920`);
  await shot(`home-left-panel-${theme}-1920`, leftClip);
  await hamburger().focus();
  await page.waitForTimeout(200);
  await shot(`home-hamburger-focus-${theme}-1920`, { x: 0, y: 0, width: 200, height: 48 });
  await page.keyboard.press("Escape");
  await utility("History").click();
  await page.waitForTimeout(700);
  await shot(`home-history-viewer-${theme}-1920`, rightClip);
  await page.keyboard.press("Escape");
  await utility("Account").click();
  await page.waitForTimeout(700);
  await shot(`home-account-${theme}-1920`, rightClip);
  await page.keyboard.press("Escape");
}

// Narrow frame, light: /admin with History open (compact indicator), / with the left panel open (links above filters).
await open("/admin", "light", 1024, 768);
await utility("History").click();
await page.waitForTimeout(700);
await shot("admin-history-open-light-1024");
await page.keyboard.press("Escape");
await open("/", "light", 1024, 768);
await hamburger().click();
await page.waitForTimeout(600);
await shot("home-left-open-light-1024");

await page.evaluate(() => localStorage.removeItem("sp-theme"));
writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(measurements, null, 2) + "\n");
console.log(`console/page errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  ", e.slice(0, 200));
await browser.close();
