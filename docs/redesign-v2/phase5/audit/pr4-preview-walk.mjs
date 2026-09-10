// Phase 5 PR 4 — read-only preview walk on the #528 Vercel preview, HEADED Chrome, the owner signs in by hand.
//
// Steps (reviewer brief, 2026-09-10), at 1920 and 640, both themes:
//   1 lock row 1, type again, ↓: header / locked / cursor are three surfaces, computed values as EXPECT
//   2 hover the locked row: unchanged
//   3 dark bar rgb(232, 160, 122)
//   4 narrow: the locked row under the pinned band (hit test)
//   5 1920: band→tail and tail→recents 24
// Nothing is written: Reception is read-only and the walk only types into the search field.
//
// Usage: node docs/redesign-v2/phase5/audit/pr4-preview-walk.mjs <baseUrl> <outDir> [email] [password]
// Without credentials the script opens /login HEADED and WAITS (up to 10 min) for the owner to sign in; it never
// touches the owner's credentials. With credentials (the LOCAL stack's seeded viewer only —
// tests/e2e-auth/auth-helpers.ts) it runs headless against a local build of the same commit: the fallback when the
// Vercel preview sits behind Vercel Authentication and the owner is not at the keyboard (2026-09-10).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base, outDir = "out", email, password] = process.argv.slice(2);
if (!base) { console.error("preview url required"); process.exit(2); }
mkdirSync(outDir, { recursive: true });

const WIDTHS = [1920, 640];
const THEMES = ["light", "dark"];
const EXPECT = {
  light: { locked: "rgb(251, 232, 220)", header: "rgb(224, 224, 224)", hover: "rgb(232, 232, 232)", bar: "rgb(184, 92, 46)" },
  dark: { locked: "rgb(82, 82, 82)", header: "rgb(57, 57, 57)", hover: "rgb(51, 51, 51)", bar: "rgb(232, 160, 122)" },
};
const results = [];
let failures = 0;
function record(name, ok, detail) { results.push({ name, ok, detail }); if (!ok) failures += 1; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); }
const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ channel: "chrome", headless: !!password });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
context.setDefaultTimeout(15000);
const cdp = await context.newCDPSession(page);

await page.goto(`${base}/login`, { waitUntil: "networkidle" });
if (password) {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^Log in$/ }).click();
} else {
  console.log("Waiting for the owner to sign in by hand (up to 10 min)…");
}
await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 600_000 });
console.log("Signed in.");

async function setTheme(theme) {
  await page.evaluate(t => {
    localStorage.setItem("sp-theme", t);
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.setAttribute("data-carbon-theme", t === "dark" ? "g100" : "white");
  }, theme);
  await page.waitForTimeout(150);
}
async function openReception(width, theme) {
  await page.setViewportSize({ width, height: width >= 1920 ? 1080 : 900 });
  await page.goto(`${base}/reception`, { waitUntil: "networkidle" });
  await setTheme(theme);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("li[role=option]").first().waitFor();
}
const rows = () => page.locator("li[role=option]");
const row = i => rows().nth(i);
const header = () => page.locator(".sp-recep-header");
const search = () => page.locator("#reception-main");
const bg = loc => loc.evaluate(el => getComputedStyle(el).backgroundColor);
const shadow = loc => loc.evaluate(el => getComputedStyle(el).boxShadow);
const rectOf = loc => loc.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; });
async function lockRow(i) {
  const name = (await row(i).locator(".sp-recep-name").textContent()).trim();
  await search().fill(name);
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  await page.waitForSelector('li[role=option][aria-selected="true"]');
  await page.waitForTimeout(150);
  return name;
}
async function cursorOffTheLock() {
  for (const q of ["a", "e", "i", "o", "n", "r"]) {
    await search().fill(q);
    await page.waitForTimeout(150);
    if ((await rows().count()) < 2 || (await page.locator('li[role=option][aria-selected="true"]').count()) !== 1) continue;
    for (let i = 0; i < 6; i += 1) {
      const hl = page.locator("li[role=option][data-highlight]");
      if ((await hl.count()) === 1 && (await hl.getAttribute("aria-selected")) !== "true") return hl;
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(80);
    }
  }
  return null;
}
async function crop3x(clip, file) {
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 3 }, captureBeyondViewport: false });
  writeFileSync(path.join(outDir, file), Buffer.from(shot.data, "base64"));
}
async function cropRows(fromLoc, toLoc, file) {
  const a = await rectOf(fromLoc), b = await rectOf(toLoc);
  const y = Math.min(a.y, b.y), bottom = Math.max(a.bottom, b.bottom);
  await crop3x({ x: a.x, y, width: a.width, height: bottom - y }, file);
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const tag = `${width}-${theme}`;
    const E = EXPECT[theme];
    await openReception(width, theme);
    await lockRow(1);
    await lockRow(0);

    // 1 — three surfaces
    const lockedBg = await bg(row(0));
    const headerBg = await bg(header());
    const hl = await cursorOffTheLock();
    const hlBg = hl ? await bg(hl) : null;
    record(`${tag} 1 header / locked / cursor are three surfaces at EXPECT`,
      lockedBg === E.locked && headerBg === E.header && hlBg === E.hover && new Set([lockedBg, headerBg, hlBg]).size === 3,
      `header ${headerBg} · locked ${lockedBg} · cursor ${hlBg}`);
    if (hl) await cropRows(header(), hl, `01-header-locked-cursor-3x-${tag}.png`);
    await page.screenshot({ path: path.join(outDir, `01-locked-cursor-${tag}.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);

    // 2 — hover the locked row
    await row(0).hover();
    await page.waitForTimeout(120);
    record(`${tag} 2 hovering the locked row: unchanged`, (await bg(row(0))) === lockedBg, await bg(row(0)));
    await cropRows(header(), row(1), `02-locked-hovered-3x-${tag}.png`);
    await page.mouse.move(0, 0);

    // 3 — the bar
    const sh = await shadow(row(0));
    record(`${tag} 3 the locked row's 3px bar is ${E.bar}`, sh.includes(E.bar) && /3px/.test(sh), sh);

    // 4 — narrow: under the pinned band
    if (width < 1056) {
      await row(0).scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const r = await rectOf(row(0));
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("li[role=option]")?.getAttribute("aria-selected") ?? null, [r.x + 8, r.y + r.height / 2]);
      record(`${tag} 4 the locked row is hittable under the pinned band`, hit === "true", `aria-selected=${hit}`);
      await page.screenshot({ path: path.join(outDir, `04-locked-under-band-${tag}.png`) });
    }

    // 5 — 1920: the gaps
    if (width === 1920) {
      const band = await rectOf(page.locator(".sp-recep-band"));
      const tailLoc = page.locator(".sp-recep-tail"), recentLoc = page.locator(".sp-recep-recent");
      let tail = null;
      if (await tailLoc.count()) { tail = await rectOf(tailLoc); record(`${tag} 5 band→tail gap is 24`, near(tail.y - band.bottom, 24), (tail.y - band.bottom).toFixed(2)); }
      else record(`${tag} 5 band→tail gap is 24`, false, "no tail rendered");
      if (tail && (await recentLoc.count())) { const recent = await rectOf(recentLoc); record(`${tag} 5 tail→recents gap is 24`, near(recent.y - tail.bottom, 24), (recent.y - tail.bottom).toFixed(2)); }
      else record(`${tag} 5 tail→recents gap is 24`, false, "no recents rendered");
      await page.screenshot({ path: path.join(outDir, `05-readout-1920-${theme}.png`) });
    }
  }
}

writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ generated: new Date().toISOString(), base, passed: results.filter(r => r.ok).length, total: results.length, results }, null, 2));
console.log(`${results.filter(r => r.ok).length}/${results.length} pass`);
await browser.close();
process.exit(failures ? 1 : 0);
