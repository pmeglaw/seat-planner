// Phase 5 PR 5 rig — dark interactive edges carry the hue (brand ruling O5).
//
// Proves the one-line flip: --cds-border-interactive is #E8A07A in the two dark blocks and #B85C2E in light,
// read on the five consumers PR 4's reviewer measured (ruling B) — the left-nav current bar, the floor menu's
// [aria-current] bar, the palette's selected row bar, the selected page tab, the hovered AI label — plus the
// primary fill the flip must NOT touch and the later BR-2 focus amendment and the Reception locked-row bar, which
// now inherits the role instead of PR 4's own override.
//
// EVERY claim is a COMPUTED-STYLE comparison; the 3x crops are for the reviewer's eyes, not for pass / fail.
//
// Usage: node docs/redesign-v2/phase5/audit/pr5-dark-edges.mjs <baseUrl> <outDir> <adminEmail> <adminPassword>
// Run against the LOCAL Docker stack only (npm run db:start + db:seed; seeded admin e2e-admin@example.test,
// tests/e2e-auth/auth-helpers.ts). Read-only: menus and the palette are opened, nothing that writes is pressed.
// Exit code 1 when any claim fails.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base = "http://localhost:3300", outDir = "out", email = "e2e-admin@example.test", password] = process.argv.slice(2);
if (!password) { console.error("admin email + password required (local seed admin)"); process.exit(2); }
mkdirSync(outDir, { recursive: true });

// The ruled values as Chrome serialises them.
const EDGE = { light: "rgb(184, 92, 46)", dark: "rgb(232, 160, 122)" };
const TERRACOTTA = "rgb(184, 92, 46)";
const THEMES = ["dark", "light"];
const results = [];
let failures = 0;
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
context.setDefaultTimeout(8000);
const cdp = await context.newCDPSession(page);

await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.getByRole("button", { name: "Log in", exact: true }).click();
await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });

async function open(route, theme, width = 1920) {
  await page.setViewportSize({ width, height: width >= 1920 ? 1080 : 900 });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => localStorage.setItem("sp-theme", t), theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}
const escape = async (n = 1) => { for (let i = 0; i < n; i += 1) { await page.keyboard.press("Escape"); await page.waitForTimeout(200); } };
const styleOf = (loc, props) => loc.evaluate((el, ps) => { const cs = getComputedStyle(el); return Object.fromEntries(ps.map(p => [p, cs.getPropertyValue(p)])); }, props);
const tokenOf = name => page.evaluate(n => { const el = document.createElement("span"); el.style.color = `var(${n})`; document.body.appendChild(el); const v = getComputedStyle(el).color; el.remove(); return v; }, name);
async function crop3x(loc, file, pad = 24) {
  const box = await loc.boundingBox();
  if (!box) return null;
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad };
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 3 }, captureBeyondViewport: false });
  writeFileSync(path.join(outDir, file), Buffer.from(shot.data, "base64"));
}
// One consumer: the element exists, the named property carries the ruled edge colour, a 3x crop in dark.
async function claim(theme, n, label, loc, prop, file) {
  const want = EDGE[theme];
  if (!(await loc.count())) { record(`${theme} ${n} ${label}`, false, "element not found"); return; }
  const v = (await styleOf(loc.first(), [prop]))[prop];
  record(`${theme} ${n} ${label} carries ${want}`, v.includes(want), `${prop}: ${v}`);
  if (theme === "dark" && file) await crop3x(loc.first(), file);
}

for (const theme of THEMES) {
  // 0 — the role itself, and the two roles the flip must not touch.
  await open("/admin", theme);
  record(`${theme} 0a --cds-border-interactive is ${EDGE[theme]}`, (await tokenOf("--cds-border-interactive")) === EDGE[theme], await tokenOf("--cds-border-interactive"));
  record(`${theme} 0b --cds-button-primary stays ${TERRACOTTA}`, (await tokenOf("--cds-button-primary")) === TERRACOTTA, await tokenOf("--cds-button-primary"));
  const focus = theme === "dark" ? "rgb(255, 255, 255)" : TERRACOTTA;
  record(`${theme} 0c --cds-focus is ${focus} (BR-2)`, (await tokenOf("--cds-focus")) === focus, await tokenOf("--cds-focus"));
  record(`${theme} 0d --cds-interactive (fill role) stays ${TERRACOTTA}`, (await tokenOf("--cds-interactive")) === TERRACOTTA, await tokenOf("--cds-interactive"));
  record(`${theme} 0e --sp-recep-row-bar inherits the role`, (await tokenOf("--sp-recep-row-bar")) === EDGE[theme], await tokenOf("--sp-recep-row-bar"));

  // 1 — left-nav current bar: the panel carries the section links below the lg hinge.
  await open("/admin/management", theme, 1024);
  const hamburger = page.locator('button.sp-header-slot[aria-controls="shell-left-panel"]');
  if (await hamburger.count()) { await hamburger.click(); await page.waitForTimeout(300); }
  await claim(theme, 1, "left-nav current bar (1024, panel open)", page.locator('.sp-left-nav a[aria-current="page"]'), "box-shadow", `01-nav-current-${theme}.png`);
  await escape();

  // 2 — floor menu [aria-current] bar.
  await open("/admin", theme);
  const menuButton = page.locator(".sp-menu-button");
  if (await menuButton.count()) {
    await menuButton.first().click();
    await page.waitForTimeout(250);
    await claim(theme, "2a", "floor menu button open rule", menuButton.first(), "box-shadow", null);
    await claim(theme, "2b", "floor menu [aria-current] bar", page.locator('.sp-menu button[aria-current="true"]'), "box-shadow", `02-floor-menu-${theme}.png`);
    await escape();
  } else record(`${theme} 2 floor menu`, false, ".sp-menu-button not rendered (one floor seeded?)");

  // 3 — palette selected row bar (Ctrl/⌘ K, one character typed).
  await page.locator("button[data-seat-id]").first().waitFor();
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.keyboard.type("a");
  await page.waitForTimeout(400);
  await claim(theme, 3, "palette selected row bar", page.locator('.sp-palette-row[aria-selected="true"], .sp-palette-row[aria-current="true"]'), "box-shadow", `03-palette-row-${theme}.png`);
  await escape(2);

  // 4 — selected page tab.
  await open("/admin/management", theme);
  await claim(theme, 4, "selected page tab bar", page.locator('.sp-tab[aria-selected="true"]'), "box-shadow", `04-tab-${theme}.png`);

  // 5 — hovered AI label: open a seat's inspector, hover its contact row.
  await open("/admin", theme);
  await page.locator("button[data-seat-id]").first().click();
  await page.waitForTimeout(500);
  const aiLabel = page.locator(".sp-ai-label");
  if (await aiLabel.count()) {
    await claim(theme, "5a", "AI label border at rest", aiLabel, "background-image", null);
    await aiLabel.first().hover();
    await page.waitForTimeout(250);
    await claim(theme, "5b", "AI label border, hovered", aiLabel, "background-image", `05-ai-label-hover-${theme}.png`);
  } else record(`${theme} 5 AI label`, false, ".sp-ai-label not rendered (inspector needs an occupied seat in draft mode)");
  await escape();
}

await browser.close();
writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ base, results }, null, 2));
console.log(`${results.length - failures}/${results.length} claims pass`);
process.exit(failures ? 1 : 0);
