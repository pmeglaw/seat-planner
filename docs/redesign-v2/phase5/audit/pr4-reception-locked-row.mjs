// Phase 5 PR 4 capture + hit-test rig — Reception's locked row gets its own surface (+ the band→tail gap).
//
// Proves owner ruling R1 (option C: the locked row takes the hit surface — light the O2 tint #FBE8DC, dark
// layer-selected-02 #525252), R2 (hovering the locked row changes nothing), R3 (480 / 640 / 800 / 1024 /
// 1920 × both themes), R4 (sheet amendment K: 24 between the readout column's groups at wide, the band's own
// box unmoved against a build of main) and R5 (the dark bar is #E8A07A — O2's dark-edge shape).
//
// EVERY colour claim is a COMPUTED-STYLE comparison on the live rows; every geometric claim is a rect
// measurement. The 3x crops are for the reviewer's eyes, not for pass / fail.
//
// Usage: node docs/redesign-v2/phase5/audit/pr4-reception-locked-row.mjs <baseUrl> <outDir> <email> <password> [--baseline <results.json from a run on main>]
// Run against the LOCAL Docker stack only (npm run db:start + db:seed; seeded viewer e2e-viewer@example.test,
// tests/e2e-auth/auth-helpers.ts). Reception is read-only, but local dev writes to PRODUCTION — the habit is
// the point. On main (the baseline run, built in a second worktree — reviewer ruling C) the colour claims FAIL
// by design; keep its results.json for --baseline. Exit code 1 when any claim fails.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const argv = process.argv.slice(2);
const baselineIdx = argv.indexOf("--baseline");
const baselinePath = baselineIdx >= 0 ? argv.splice(baselineIdx, 2)[1] : null;
const [base = "http://localhost:3300", outDir = "out", email = "e2e-viewer@example.test", password] = argv;
if (!password) { console.error("viewer email + password required (local seed)"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const baseline = baselinePath && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;

const WIDTHS = [480, 640, 800, 1024, 1920];
const THEMES = ["light", "dark"];
// The ruled values as Chrome serialises them (O4 / R5 in the brand file).
const EXPECT = {
  light: { locked: "rgb(251, 232, 220)", header: "rgb(224, 224, 224)", hover: "rgb(232, 232, 232)", bar: "rgb(184, 92, 46)" },
  dark: { locked: "rgb(82, 82, 82)", header: "rgb(57, 57, 57)", hover: "rgb(51, 51, 51)", bar: "rgb(232, 160, 122)" },
};
const results = [];
const measurements = [];
let failures = 0;
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
context.setDefaultTimeout(10000);
const cdp = await context.newCDPSession(page);

async function signIn() {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^Log in$/ }).click();
  await page.waitForURL(/\/(admin|reception|$)/, { timeout: 30_000 });
}
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
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await page.waitForSelector('li[role=option][aria-selected="true"]');
  await page.waitForTimeout(150);
  return name;
}
// Put the keyboard cursor on a row that is NOT the locked one, with the locked row still listed.
async function cursorOffTheLock() {
  for (const q of ["a", "e", "i", "o", "n", "r"]) {
    await search().fill(q);
    await page.waitForTimeout(120);
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
// 3x crop of a css-px clip through CDP's own clip scale (Playwright's screenshot() renders at the context's DSF).
async function crop3x(clip, file) {
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 3 }, captureBeyondViewport: false });
  writeFileSync(path.join(outDir, file), Buffer.from(shot.data, "base64"));
}
async function cropRows(fromLoc, toLoc, file) {
  const a = await rectOf(fromLoc), b = await rectOf(toLoc);
  const y = Math.min(a.y, b.y), bottom = Math.max(a.bottom, b.bottom);
  await crop3x({ x: a.x, y, width: a.width, height: bottom - y }, file);
}

await signIn();
for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const tag = `${width}-${theme}`;
    const E = EXPECT[theme];
    await openReception(width, theme);
    // Lock row 2 then row 1: "Recent lookups" exists (the column's third child) and row 1 holds the lock.
    await lockRow(1);
    await lockRow(0);

    // 1 — R1: three surfaces, pairwise distinct, at the ruled values.
    const lockedBg = await bg(row(0));
    const headerBg = await bg(header());
    await row(1).hover();
    await page.waitForTimeout(100);
    const hoverBg = await bg(row(1));
    record(`${tag} 1 locked row is the hit surface`, lockedBg === E.locked, `${lockedBg} (want ${E.locked})`);
    record(`${tag} 1 header · locked · hovered are three surfaces`, new Set([lockedBg, headerBg, hoverBg]).size === 3, `header ${headerBg} · locked ${lockedBg} · hover ${hoverBg}`);
    record(`${tag} 1 header and hover surfaces unchanged`, headerBg === E.header && hoverBg === E.hover, `${headerBg} / ${hoverBg}`);
    await cropRows(header(), row(1), `01-header-locked-hover-3x-${tag}.png`);
    await page.screenshot({ path: path.join(outDir, `01-locked-row1-${tag}.png`) });

    // 2 — R2: hovering the locked row leaves it alone.
    await row(0).hover();
    await page.waitForTimeout(100);
    record(`${tag} 2 hovering the locked row changes nothing`, (await bg(row(0))) === lockedBg, await bg(row(0)));
    await page.mouse.move(0, 0);

    // 3 — R5: the 3px bar.
    const sh = await shadow(row(0));
    record(`${tag} 3 the locked row's 3px bar is ${E.bar}`, sh.includes(E.bar) && /3px/.test(sh), sh);

    // 4 — lock on row 1, cursor elsewhere: two visibly different rows.
    const hl = await cursorOffTheLock();
    if (hl) {
      const hlBg = await bg(hl);
      const locked = page.locator('li[role=option][aria-selected="true"]');
      record(`${tag} 4 cursor row is the hover surface, the lock keeps the hit surface`, hlBg === E.hover && (await bg(locked)) === E.locked, `cursor ${hlBg} · locked ${await bg(locked)}`);
      record(`${tag} 4 the cursor row's bar is ${E.bar}`, (await shadow(hl)).includes(E.bar), await shadow(hl));
      await cropRows(locked, hl, `02-locked-and-cursor-3x-${tag}.png`);
    } else {
      record(`${tag} 4 cursor row found off the lock`, false, "no query put the cursor on a second row while the lock stayed listed");
    }
    await page.keyboard.press("Escape"); // clears the query, keeps the lock
    await page.waitForTimeout(120);

    // 5 — R4 (1920 only): 24 between the column's groups; the band's own box equals main's.
    if (width === 1920) {
      const band = await rectOf(page.locator(".sp-recep-band"));
      const tile = await rectOf(page.locator(".sp-recep-band .sp-readout"));
      const tailLoc = page.locator(".sp-recep-tail"), recentLoc = page.locator(".sp-recep-recent");
      let tail = null, recent = null;
      if (await tailLoc.count()) { tail = await rectOf(tailLoc); record(`${tag} 5 band→tail gap is 24`, near(tail.y - band.bottom, 24), `${(tail.y - band.bottom).toFixed(2)}`); }
      else record(`${tag} 5 band→tail gap is 24`, false, "no tail rendered — the locked person needs a seat (Show on map) or same-department fallbacks");
      if (tail && (await recentLoc.count())) { recent = await rectOf(recentLoc); record(`${tag} 5 tail→recents gap is 24`, near(recent.y - tail.bottom, 24), `${(recent.y - tail.bottom).toFixed(2)}`); }
      measurements.push({ tag, band, tile, tail, recent });
      if (baseline) {
        const b = baseline.measurements.find(m => m.tag === tag);
        const same = (p, q) => p && q && ["x", "y", "width", "height"].every(k => near(p[k], q[k], 0.5));
        record(`${tag} 5 the band's box and the tile's box are pixel-identical to main`, same(band, b?.band) && same(tile, b?.tile), JSON.stringify({ band, main: b?.band }));
      }
      await page.screenshot({ path: path.join(outDir, `03-readout-1920-${theme}.png`) });
    }

    // 6 — below the fold the locked row under the pinned band still reads (hit test + capture).
    if (width < 1056) {
      await row(0).scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const r = await rectOf(row(0));
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("li[role=option]")?.getAttribute("aria-selected") ?? null, [r.x + 8, r.y + r.height / 2]);
      record(`${tag} 6 the locked row is hittable under the pinned band`, hit === "true", `elementFromPoint → aria-selected=${hit}`);
      await page.screenshot({ path: path.join(outDir, `04-locked-under-band-${tag}.png`) });
    }
  }
}

writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ generated: new Date().toISOString(), base, passed: results.filter(r => r.ok).length, total: results.length, results, measurements }, null, 2));
console.log(`${results.filter(r => r.ok).length}/${results.length} pass`);
await browser.close();
process.exit(failures ? 1 : 0);
