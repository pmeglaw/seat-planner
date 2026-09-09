// Phase 5 PR 3 capture + hit-test rig — the names-off marker becomes ● in the footprint.
//
// Proves owner ruling R1 (with Names off an assigned seat is the empty-seat
// footprint carrying the legend's ●), R2 (hover lifts to layer-hover-02 like an
// open seat), R3 (one marker on /admin and /), and the three defects the
// filled block shipped: F-1 selected visible, F-2 the ◇ fully painted, F-3 the
// legend's symbol is the marker's symbol — plus P-1 (legend ● and plan ●
// share one colour) and the 44px touch target.
//
// EVERY geometric claim is a HIT TEST or a computed-style comparison, never a
// visibility check. The one exception is deliberate: the ◇-painted claim is a
// PIXEL SAMPLE from the 3x capture, because `.cds-touch-target::after` is a
// 44×44 absolute box painted after the badge <svg>, so `elementFromPoint` over
// the badge returns the button whatever is painted there (reviewer ruling B).
//
// Usage: node docs/redesign-v2/phase5/audit/pr3-names-off-marker.mjs <baseUrl> <outDir> <adminEmail> <adminPassword> [--baseline <results.json from a run on main>]
// Run against the LOCAL Docker stack only (npm run db:start + db:seed): the
// swap-confirm step WRITES the draft layer to produce the changed-in-draft
// state, which is a production draft edit anywhere else. Seeded local admin:
// e2e-admin@example.test (tests/e2e-auth/auth-helpers.ts). Exit code 1 when any
// claim fails.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const sharp = require("sharp");

const argv = process.argv.slice(2);
const baselineIdx = argv.indexOf("--baseline");
const baselinePath = baselineIdx >= 0 ? argv.splice(baselineIdx, 2)[1] : null;
const [base = "http://localhost:3000", outDir = "out", email, password] = argv;
if (!email || !password) { console.error("admin email + password required (local seed admin)"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const baseline = baselinePath && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;

const THEMES = ["light", "dark"];
const results = [];
let failures = 0;
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function skip(name, detail) { results.push({ name, ok: true, skipped: true, detail }); console.log(`SKIP  ${name} — ${detail}`); }
const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;
const parseRgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); return m ? m[1].split(/[\s,/]+/).filter(Boolean).map(Number) : null; };
const shadowWidth = s => { const m = String(s).match(/0px 0px 0px (\d+(?:\.\d+)?)px inset/); return m ? Number(m[1]) : null; };

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
// A missing element is a FAIL, not a hang: on main (the baseline run) the names-off block has no svg to read.
context.setDefaultTimeout(5000);
const cdp = await context.newCDPSession(page);
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.getByRole("button", { name: "Log in", exact: true }).click();
await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });

async function open(route, theme) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => localStorage.setItem("sp-theme", t), theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("button[data-seat-id]").first().waitFor();
  await page.waitForTimeout(600);
}
const escape = async (n = 1) => { for (let i = 0; i < n; i += 1) { await page.keyboard.press("Escape"); await page.waitForTimeout(250); } };
async function setNames(on) {
  const toggle = page.getByRole("button", { name: "Show occupant names" });
  if (!(await toggle.count())) return false;
  if (((await toggle.getAttribute("aria-pressed")) === "true") !== on) { await toggle.click(); await page.waitForTimeout(400); }
  return true;
}
// Computed values of one element, read in the page.
const styleOf = (loc, props) => loc.evaluate((el, ps) => { const cs = getComputedStyle(el); return Object.fromEntries(ps.map(p => [p, cs.getPropertyValue(p)])); }, props);
const rectOf = loc => loc.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; });
const tokenOf = name => page.evaluate(n => { const el = document.createElement("span"); el.style.color = `var(${n})`; document.body.appendChild(el); const v = getComputedStyle(el).color; el.remove(); return v; }, name);
// 3x crop of a locator, ±pad css px, through CDP Page.captureScreenshot's own clip scale — Playwright's
// screenshot() renders at the CONTEXT's device scale factor (1 here) whatever an emulation override says.
async function crop3x(loc, file, pad = 24) {
  const box = await loc.boundingBox();
  if (!box) return null;
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad };
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 3 }, captureBeyondViewport: false });
  writeFileSync(path.join(outDir, file), Buffer.from(shot.data, "base64"));
  return { clip, file };
}
// Count pixels in a css-rect region of a 3x PNG that sit within tolerance of an rgb triple; split by inside/outside a css box.
async function samplePurple(file, clip, region, rgb, box) {
  const { data, info } = await sharp(path.join(outDir, file)).raw().toBuffer({ resolveWithObject: true });
  const scale = info.width / clip.width;
  let inside = 0, outside = 0;
  for (let cy = region.y; cy < region.y + region.height; cy += 1 / scale) {
    for (let cx = region.x; cx < region.x + region.width; cx += 1 / scale) {
      const px = Math.round((cx - clip.x) * scale), py = Math.round((cy - clip.y) * scale);
      if (px < 0 || py < 0 || px >= info.width || py >= info.height) continue;
      const i = (py * info.width + px) * info.channels;
      const d = Math.abs(data[i] - rgb[0]) + Math.abs(data[i + 1] - rgb[1]) + Math.abs(data[i + 2] - rgb[2]);
      if (d <= 40) { if (cx >= box.x && cx <= box.right && cy >= box.y && cy <= box.bottom) inside += 1; else outside += 1; }
    }
  }
  return { inside, outside, scale };
}

const namesOffPills = () => page.locator("button[data-seat-id].sp-pill--names-off");
const firstOff = () => namesOffPills().first();

// Claims 1–5, 7, 9, 10 on one surface (the admin pass adds 6, 8, 12).
async function surfacePass(route, theme, tag) {
  await open(route, theme);
  if (!(await setNames(false))) { skip(`${tag} ${theme} names toggle`, "no Show occupant names control"); return; }
  await escape();
  // 1 — every names-off pill is 28×28, carries ●, has no text
  const geometry = await namesOffPills().evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, dot: !!el.querySelector("svg.sp-seat-mark circle[data-fill]"), text: el.textContent }; }));
  record(`${tag} ${theme} 1 names-off pills are 28×28 footprints carrying ● with no text (${geometry.length})`,
    geometry.length > 0 && geometry.every(g => Math.abs(g.w - 28) <= 0.75 && Math.abs(g.h - 28) <= 0.75 && g.dot && g.text === ""),
    JSON.stringify(geometry.find(g => !(Math.abs(g.w - 28) <= 0.75 && Math.abs(g.h - 28) <= 0.75 && g.dot && g.text === "")) ?? geometry[0]));
  await page.screenshot({ path: path.join(outDir, `${tag === "admin" ? "01" : "05"}-${tag}-names-off-1920-${theme}.png`) });
  // 2 — rest fill + edge equal an open footprint's
  const pill = firstOff();
  const footprint = page.locator("button[data-seat-id].sp-seat-footprint:not(.sp-seat-footprint--quiet)").first();
  const rest = await styleOf(pill, ["background-color", "box-shadow", "color"]);
  if (await footprint.count()) {
    const fp = await styleOf(footprint, ["background-color", "box-shadow"]);
    record(`${tag} ${theme} 2 rest fill + edge equal the open footprint's`, rest["background-color"] === fp["background-color"] && rest["box-shadow"] === fp["box-shadow"], `${rest["background-color"]} / ${rest["box-shadow"]} vs ${fp["background-color"]} / ${fp["box-shadow"]}`);
  } else {
    const fill = await tokenOf("--sp-seat-footprint-fill"), edge = await tokenOf("--sp-seat-footprint-border");
    record(`${tag} ${theme} 2 rest fill + edge equal the footprint tokens (no open seat on this floor)`, rest["background-color"] === fill && rest["box-shadow"].startsWith(edge), `${rest["background-color"]} / ${rest["box-shadow"]} vs ${fill} / ${edge}`);
  }
  await crop3x(pill, `02-marker-rest-3x-${theme}-${tag}.png`);
  // 3 — hover lifts to the open footprint's hover (R2)
  await pill.hover(); await page.waitForTimeout(250);
  const hov = await styleOf(pill, ["background-color"]);
  let hoverRef = await tokenOf("--sp-layer-hover-02");
  if (await footprint.count()) { await footprint.hover(); await page.waitForTimeout(250); hoverRef = (await styleOf(footprint, ["background-color"]))["background-color"]; await pill.hover(); await page.waitForTimeout(250); }
  record(`${tag} ${theme} 3 hover lifts to layer-hover-02 like an open seat (R2)`, hov["background-color"] === hoverRef && hov["background-color"] !== rest["background-color"], `${hov["background-color"]} vs ${hoverRef} (rest ${rest["background-color"]})`);
  await crop3x(pill, `02-marker-hover-3x-${theme}-${tag}.png`);
  await page.mouse.move(5, 5); await page.waitForTimeout(200);
  // 4 — focus ring: 2px solid terracotta, inset
  await pill.focus(); await page.waitForTimeout(200);
  const foc = await styleOf(pill, ["outline-width", "outline-style", "outline-color", "outline-offset"]);
  record(`${tag} ${theme} 4 focus ring is 2px solid rgb(184, 92, 46) inset`, foc["outline-width"] === "2px" && foc["outline-style"] === "solid" && foc["outline-color"] === "rgb(184, 92, 46)" && foc["outline-offset"] === "-2px", JSON.stringify(foc));
  await crop3x(pill, `02-marker-focus-3x-${theme}-${tag}.png`);
  // 5 — selected is visible (F-1): 2px inset edge in a colour that is not the fill
  await pill.dispatchEvent("click"); await page.waitForTimeout(500);
  const sel = await styleOf(pill, ["box-shadow", "background-color"]);
  const selState = await pill.getAttribute("data-state");
  const selColor = parseRgb(sel["box-shadow"]), selFill = parseRgb(sel["background-color"]);
  record(`${tag} ${theme} 5 selected is visible: data-state=selected, 2px inset edge ≠ fill (F-1)`, selState === "selected" && shadowWidth(sel["box-shadow"]) === 2 && !!selColor && !!selFill && selColor.join() !== selFill.join(), `${selState} / ${sel["box-shadow"]} on ${sel["background-color"]}`);
  await crop3x(pill, `02-marker-selected-3x-${theme}-${tag}.png`);
  await escape(2);
  // 9 — 44px hit target: the four diagonals at ±21 return the button or a descendant
  const r = await rectOf(pill);
  const hits = await page.evaluate(({ cx, cy, id }) => {
    const btn = document.querySelector(`button[data-seat-id="${id}"]`);
    const after = getComputedStyle(btn, "::after");
    return { pseudo: `${after.inlineSize || after.width}×${after.blockSize || after.height} ${after.position}`, hits: [[-21, -21], [21, -21], [-21, 21], [21, 21]].map(([dx, dy]) => { const el = document.elementFromPoint(cx + dx, cy + dy); return { ok: !!el && (el === btn || btn.contains(el)), hit: el ? `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}` : null }; }) };
  }, { cx: r.x + r.width / 2, cy: r.y + r.height / 2, id: await pill.getAttribute("data-seat-id") });
  record(`${tag} ${theme} 9 the 44px touch target answers on all four diagonals`, hits.hits.every(h => h.ok), `::after ${hits.pseudo}; ${hits.hits.map(h => h.hit).join(", ")}`);
  // 10 — the band legend's ● carries the fill class and the marker's colour
  const legendDot = page.locator("li.sp-seat-legend svg.sp-seat-mark.sp-seat-mark--assigned").first();
  if (await legendDot.count()) {
    const lc = (await styleOf(legendDot, ["color"]))["color"];
    const mc = (await pill.locator("svg.sp-seat-mark").count()) ? (await styleOf(pill.locator("svg.sp-seat-mark"), ["color"]))["color"] : null;
    record(`${tag} ${theme} 10 the legend's ● and the plan's ● share one colour (P-1, F-3)`, !!(await legendDot.locator("circle[data-fill]").count()) && lc === mc, `${lc} vs ${mc}`);
    await crop3x(legendDot.locator("xpath=.."), `03-legend-3x-${theme}-${tag}.png`, 8);
  } else record(`${tag} ${theme} 10 the band legend shows ● with the fill class`, false, "no li.sp-seat-legend svg.sp-seat-mark--assigned");
  // 7 — quiet: filter a zone → the quiet names-off pill has the quiet fill and a quiet-text ●
  for (let i = 0; i < 2 && !(await page.locator("#shell-left-panel[data-open]").count()); i += 1) {
    const hamburger = page.locator('#shell-header button[aria-controls="shell-left-panel"]');
    if (!(await hamburger.count())) break;
    await hamburger.click(); await page.waitForTimeout(400);
  }
  const zoneChip = page.locator("#shell-left-panel fieldset").filter({ hasText: "Zone" }).locator('input[type="checkbox"]').first();
  if (await zoneChip.count()) {
    await zoneChip.click(); await page.waitForTimeout(500);
    const quiet = page.locator("button[data-seat-id].sp-pill--names-off.sp-pill--quiet").first();
    if (await quiet.count() && !(await quiet.locator("svg.sp-seat-mark").count())) record(`${tag} ${theme} 7 quiet names-off pill carries ●`, false, "no svg.sp-seat-mark inside the quiet names-off pill (the filled block)");
    else if (await quiet.count()) {
      const q = await styleOf(quiet, ["background-color"]);
      const qDot = (await styleOf(quiet.locator("svg.sp-seat-mark"), ["color"]))["color"];
      const loud = page.locator("button[data-seat-id].sp-pill--names-off:not(.sp-pill--quiet)").first();
      const loudDot = (await loud.count()) && (await loud.locator("svg.sp-seat-mark").count()) ? (await styleOf(loud.locator("svg.sp-seat-mark"), ["color"]))["color"] : null;
      const quietFill = await tokenOf("--sp-pill-quiet-fill"), quietText = await tokenOf("--sp-pill-quiet-text");
      record(`${tag} ${theme} 7 quiet: layer-01 fill and the ● steps to the quiet text colour`, q["background-color"] === quietFill && qDot === quietText && qDot !== loudDot, `${q["background-color"]} / ● ${qDot} vs fill ${quietFill} / text ${quietText} / loud ● ${loudDot}`);
      await crop3x(quiet, `02-marker-quiet-3x-${theme}-${tag}.png`);
    } else skip(`${tag} ${theme} 7 quiet`, "no quiet names-off pill after the zone chip");
    await zoneChip.click(); await page.waitForTimeout(300);
  } else skip(`${tag} ${theme} 7 quiet`, "no zone chip in the left panel");
  await escape();
}

for (const theme of THEMES) {
  await surfacePass("/admin", theme, "admin");
  // 6 — keyboard selection is visible with names off
  await open("/admin", theme); await setNames(false); await escape();
  await firstOff().focus(); await page.waitForTimeout(150);
  // Walk right until the roving focus lands on a names-off pill (the first step may land on an open footprint).
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150);
    if (await page.locator("button[data-seat-id].sp-pill--names-off:focus").count()) break;
  }
  await page.keyboard.press("Enter"); await page.waitForTimeout(500);
  const kb = page.locator('button[data-seat-id][data-state="selected"]').first();
  if (await kb.count()) {
    const s = await styleOf(kb, ["box-shadow", "background-color"]);
    const off = (await kb.getAttribute("class")).includes("sp-pill--names-off");
    record(`admin ${theme} 6 keyboard selection (ArrowRight, Enter) is visible with names off`, off && shadowWidth(s["box-shadow"]) === 2 && parseRgb(s["box-shadow"])?.join() !== parseRgb(s["background-color"])?.join(), `${off ? "names-off pill" : "footprint (no names-off pill reached by ArrowRight)"} / ${s["box-shadow"]} on ${s["background-color"]}`);
  } else record(`admin ${theme} 6 keyboard selection`, false, "nothing selected after ArrowRight + Enter");
  await escape(2);
  // 8 — the ◇ on the names-off footprint is fully painted (F-2). Needs a draft-changed seat: swap two assigned seats once (LOCAL draft write).
  await open("/admin", theme); await setNames(true); await escape();
  let changed = page.locator("button[data-seat-id][data-draft-changed]").first();
  if (!(await changed.count())) try {
    const assigned = page.locator('button[data-seat-id][aria-label*="Assigned seat."]');
    const originCode = (await assigned.nth(0).getAttribute("aria-label")).split(" ")[0];
    const origin = page.locator(`button[data-seat-id][aria-label^="${originCode} "]`).first();
    const target = assigned.nth(1);
    await origin.dispatchEvent("click"); await page.locator("#seat-inspector-panel").waitFor(); await page.waitForTimeout(400);
    await page.getByRole("button", { name: `Swap ${originCode}`, exact: true }).click(); await page.waitForTimeout(400);
    await target.dispatchEvent("click");
    await page.getByRole("heading", { name: "Confirm seat swap" }).waitFor();
    await page.getByRole("button", { name: "Confirm swap" }).click({ timeout: 15000 });
    await page.waitForTimeout(1500);
    await escape(2);
    changed = page.locator("button[data-seat-id][data-draft-changed]").first();
  } catch (error) { console.log(`swap recipe failed on ${theme}: ${String(error).split("\n")[0]}`); await escape(2); }
  if (await changed.count()) {
    await setNames(false); await escape();
    const offChanged = page.locator("button[data-seat-id].sp-pill--names-off[data-draft-changed]").first();
    if (await offChanged.count()) {
      const badge = offChanged.locator("svg.sp-pill-badge");
      const br = await rectOf(badge), pr = await rectOf(offChanged);
      const geometryOk = near(br.width, 8) && near(br.height, 8) && near(br.x, pr.right - 4) && near(br.y, pr.y - 4);
      const badgeColor = parseRgb((await styleOf(badge, ["color"]))["color"]);
      const shot = await crop3x(offChanged, `02-marker-draft-3x-${theme}-admin.png`);
      const sample = await samplePurple(shot.file, shot.clip, { x: br.x, y: br.y, width: br.width, height: br.height }, badgeColor, pr);
      record(`admin ${theme} 8 the ◇ is 8×8 at −4/−4 and PAINTED — ≥12 purple px in its rect, ≥3 outside the 28×28 box (F-2)`, geometryOk && sample.inside + sample.outside >= 12 && sample.outside >= 3, `badge ${JSON.stringify({ w: br.width, h: br.height, dx: br.x - pr.right, dy: br.y - pr.y })} · purple rgb(${badgeColor}) px inside ${sample.inside} / outside ${sample.outside} at ${sample.scale}x`);
    } else record(`admin ${theme} 8 ◇ on the names-off footprint`, false, "no names-off pill carries data-draft-changed");
  } else record(`admin ${theme} 8 ◇ on the names-off footprint`, false, "could not produce a draft-changed seat");
  // 12 — names ON unchanged against a baseline from main
  await setNames(true); await escape(); await page.waitForTimeout(300);
  const onPill = page.locator("button[data-seat-id].sp-pill:not(.sp-pill--names-off)").first();
  const onRect = await rectOf(onPill);
  const onStyle = await styleOf(onPill, ["background-color", "box-shadow", "color", "font", "padding-left", "height"]);
  const onLabel = await onPill.getAttribute("aria-label");
  const snapshot = { label: onLabel, w: Math.round(onRect.width * 100) / 100, h: Math.round(onRect.height * 100) / 100, ...onStyle };
  await crop3x(onPill, `04-marker-names-on-3x-${theme}-admin.png`);
  const baseRow = baseline?.namesOn?.[theme];
  if (baseRow) record(`admin ${theme} 12 names ON unchanged against the baseline from main`, JSON.stringify(baseRow) === JSON.stringify(snapshot), `${JSON.stringify(snapshot)} vs ${JSON.stringify(baseRow)}`);
  else skip(`admin ${theme} 12 names ON unchanged`, `no --baseline given; recorded ${JSON.stringify(snapshot)}`);
  results.namesOn ??= {}; results.namesOn[theme] = snapshot;
  // 11 — the viewer (R3)
  await surfacePass("/", theme, "viewer");
}

const out = { base, generatedAt: new Date().toISOString(), failures, claims: results.filter(r => r.name), namesOn: results.namesOn };
writeFileSync(path.join(outDir, "results.json"), JSON.stringify(out, null, 2) + "\n");
const total = out.claims.length, skipped = out.claims.filter(r => r.skipped).length;
console.log(`\n${total - failures}/${total} claims pass (${skipped} skipped), ${failures} failed — ${outDir}/results.json`);
await browser.close();
process.exit(failures ? 1 : 0);
