// Phase 4 marker-state contrast audit (rerun on every PR that touches the pill or its tokens):
// drives the REAL seat marker into every interaction state on both map surfaces, in both themes,
// and measures the rendered pill — text on fill for the name pill (4.5:1), the status mark on the
// footprint and the ◇ badge on the pill for the graphic states (3:1). A same-colour pair is 1:1 —
// the PR 1 preview-walk defect (selected = white text on the white Phase 3 pill fill) is exactly
// what this catches; a static class grep cannot, because the pair only collides once the tokens
// resolve both sides to the same value.
//
// PR 3b (the Phase 3 pill): the marker IS the button (`button.sp-pill` / `button.sp-seat-footprint`,
// SeatMarker.tsx) — no inner token, no opacity dim (the quiet pill is a fill/edge/text step), and
// the seat code is the tooltip. New measures: `filtered-out` reads the quiet pill (the PR 1 ledger
// row closed with it), `invalid-target` reads a reserved seed seat refusing a move (O4),
// `planner-highlight` submits a real Ask Planner question (needs OPENAI_API_KEY on the server —
// SKIPPED otherwise), and the Draft-mark crops record the ◇ beside the terracotta focus ring at 1x
// and 3x with the colour math (ΔE2000 + contrast between the two) — the O3 evidence.
//
// Usage: node docs/redesign-v2/phase4/audit/marker-contrast.mjs <baseUrl> <outDir> <adminEmail> <adminPassword>
// Run against the LOCAL Docker stack only (npm run db:start + db:seed; .env.local pointed at it):
// the swap-confirm step WRITES the draft layer to produce the changed-in-draft state, which is a
// production draft edit anywhere else. Seeded local admin: e2e-admin@example.test
// (tests/e2e-auth/auth-helpers.ts). Exit code 1 when any measured state is under its floor.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base = "http://localhost:3000", outDir = "out", email, password] = process.argv.slice(2);
if (!email || !password) { console.error("admin email + password required (local seed admin)"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const TEXT_MIN = 4.5;
const GRAPHIC_MIN = 3;
// Ledgered failures: states the SHIPPED component cannot pass until the PR named here rebuilds
// them. Shrink-only, like the token test's HEX_LEDGER: a ledgered state that PASSES fails the run
// (stale row), and a failure outside the ledger fails the run. PR 3b emptied it: the quiet pill
// replaced the opacity dim, and every Phase 3 state measures.
const LEDGER = {};

// Runs in the page against one marker <button data-seat-id>. Returns the worst text-on-fill pair
// for a name pill, or the mark-on-fill pair for a footprint / names-off pill, plus the ◇ badge pair.
function measureInPage(button) {
  const parse = s => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bottom, extraAlpha = 1) => {
    const a = top.a * extraAlpha;
    return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const hex = c => "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  const opacityChain = (from, until) => { let o = 1; for (let e = from; e && e !== until; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const round = n => Math.round(n * 100) / 100;

  const backdrop = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const cs = getComputedStyle(button);
  const fill = over(parse(cs.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 }, backdrop);
  const markerOpacity = opacityChain(button, document.body);
  const fillFinal = over({ ...fill, a: 1 }, backdrop, markerOpacity);
  const isPill = button.classList.contains("sp-pill");
  const namesOff = button.classList.contains("sp-pill--names-off");
  const pairs = [];
  if (isPill && !namesOff) {
    const textColor = over(parse(cs.color), fill);
    const textFinal = over({ ...textColor, a: 1 }, backdrop, markerOpacity);
    pairs.push({ kind: "text", what: `"${button.textContent.trim().slice(0, 24)}"`, fg: hex(textFinal), bg: hex(fillFinal), ratio: round(ratio(textFinal, fillFinal)), min: 4.5 });
  }
  const mark = button.querySelector("svg.sp-seat-mark");
  if (mark) {
    const stroke = over(parse(getComputedStyle(mark).color), fill);
    pairs.push({ kind: "graphic", what: "status mark", fg: hex(stroke), bg: hex(fillFinal), ratio: round(ratio(stroke, fillFinal)), min: 3 });
  }
  if (namesOff) {
    // The filled footprint: its fill against the canvas mat behind it is the mark.
    const parent = button.closest(".sp-canvas, [data-map-stage], main") || document.body;
    const mat = over(parse(getComputedStyle(parent).backgroundColor) || backdrop, backdrop);
    pairs.push({ kind: "graphic", what: "names-off footprint on the mat", fg: hex(fillFinal), bg: hex(mat), ratio: round(ratio(fillFinal, mat)), min: 3 });
  }
  const badge = button.querySelector("svg.sp-pill-badge");
  let badgeColor = null;
  if (badge) {
    const bs = getComputedStyle(badge);
    const stroke = over(parse(bs.color), fill);
    badgeColor = hex(stroke);
    pairs.push({ kind: "graphic", what: "◇ badge", fg: hex(stroke), bg: hex(fillFinal), ratio: round(ratio(stroke, fillFinal)), min: 3 });
  }
  const outline = parse(cs.outlineColor);
  return {
    label: button.getAttribute("aria-label"),
    classes: button.className,
    fill: hex(fillFinal),
    outline: outline ? hex(over(outline, fillFinal)) : null,
    badgeColor,
    pairs
  };
}

// CIEDE2000, for the Draft-mark crops (O3 evidence). Inputs are hex.
function deltaE2000(hexA, hexB) {
  const toLab = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    const [r, g, b] = c;
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return { L: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
  };
  const p = toLab(hexA), q = toLab(hexB);
  const rad = d => (d * Math.PI) / 180, deg = r => (r * 180) / Math.PI;
  const C1 = Math.hypot(p.a, p.b), C2 = Math.hypot(q.a, q.b), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))));
  const a1 = p.a * (1 + G), a2 = q.a * (1 + G);
  const C1p = Math.hypot(a1, p.b), C2p = Math.hypot(a2, q.b);
  const h = (a, b) => { if (a === 0 && b === 0) return 0; let v = deg(Math.atan2(b, a)); return v < 0 ? v + 360 : v; };
  const h1 = h(a1, p.b), h2 = h(a2, q.b);
  const dL = q.L - p.L, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh) / 2);
  const Lm = (p.L + q.L) / 2, Cmp = (C1p + C2p) / 2;
  let Hm = h1 + h2;
  if (C1p * C2p !== 0) { if (Math.abs(h1 - h2) > 180) Hm += h1 + h2 < 360 ? 360 : -360; Hm /= 2; }
  const T = 1 - 0.17 * Math.cos(rad(Hm - 30)) + 0.24 * Math.cos(rad(2 * Hm)) + 0.32 * Math.cos(rad(3 * Hm + 6)) - 0.2 * Math.cos(rad(4 * Hm - 63));
  const dTheta = 30 * Math.exp(-Math.pow((Hm - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cmp, 7) / (Math.pow(Cmp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lm - 50, 2)) / Math.sqrt(20 + Math.pow(Lm - 50, 2));
  const Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T, Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.round(Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * (dC / Sc) * (dH / Sh)) * 10) / 10;
}
function contrastHex(a, b) {
  const lum = hex => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(parseInt(hex.slice(1, 3), 16)) + 0.7152 * f(parseInt(hex.slice(3, 5), 16)) + 0.0722 * f(parseInt(hex.slice(5, 7), 16)); };
  const la = lum(a), lb = lum(b);
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.getByRole("button", { name: "Log in", exact: true }).click();
await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });

const rows = [];
const crops = [];
let failures = 0;
async function record(state, theme, locator) {
  const handle = await locator.elementHandle();
  const r = await page.evaluate(measureInPage, handle);
  const box = await locator.boundingBox();
  if (box) {
    const clip = { x: Math.max(0, box.x + box.width / 2 - 160), y: Math.max(0, box.y + box.height / 2 - 80), width: 320, height: 160 };
    await page.screenshot({ path: path.join(outDir, `marker-${state}-${theme}.png`), clip });
  }
  const ledgered = Object.hasOwn(LEDGER, state);
  for (const pair of r.pairs) {
    const passes = pair.ratio >= pair.min;
    const ok = passes !== ledgered;
    if (!ok) failures += 1;
    rows.push({ state, theme, ...pair, fill: r.fill, ok });
    console.log(`${passes ? (ledgered ? "STALE" : "ok   ") : (ledgered ? "known" : "FAIL ")} ${theme.padEnd(5)} ${state.padEnd(22)} ${String(pair.ratio).padStart(5)}:1 (${pair.kind} ≥ ${pair.min})  ${pair.fg} on ${pair.bg}  ${pair.what}`);
  }
  if (r.pairs.length === 0) console.log(`skip ${theme} ${state} (nothing measurable on ${r.classes})`);
  return r;
}

async function open(route, theme) {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => localStorage.setItem("sp-theme", t), theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("button[data-seat-id]").first().waitFor();
  await page.waitForTimeout(600);
}
const marker = label => page.locator(`button[data-seat-id][aria-label*="${label}"]`).first();
const markerByCode = code => page.locator(`button[data-seat-id][aria-label^="${code} "]`).first();
const escape = async (n = 1) => { for (let i = 0; i < n; i += 1) { await page.keyboard.press("Escape"); await page.waitForTimeout(250); } };

// The Draft-mark crops (O3): a focused pill wearing the ◇ beside the terracotta ring, at 1x and 3x,
// plus the header's Draft indicator ◇ beside the current bar. Colour math from the computed values.
async function draftBadgeCrops(theme, button) {
  const r = await page.evaluate(measureInPage, await button.elementHandle());
  const box = await button.boundingBox();
  if (!box) return;
  const clip = { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 24), width: box.width + 80, height: box.height + 48 };
  await page.screenshot({ path: path.join(outDir, `badge-focus-1x-${theme}.png`), clip });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 3, mobile: false });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `badge-focus-3x-${theme}.png`), clip, scale: "device" });
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await cdp.detach();
  const header = page.locator("#shell-header");
  const indicator = page.locator(".sp-mode--draft, [data-mode-indicator]").first();
  const ibox = await indicator.count() ? await indicator.boundingBox() : await header.boundingBox();
  if (ibox) await page.screenshot({ path: path.join(outDir, `badge-header-indicator-${theme}.png`), clip: { x: Math.max(0, ibox.x - 8), y: ibox.y, width: Math.min(560, ibox.width + 16), height: ibox.height } });
  const indicatorMark = await page.evaluate(() => {
    const mark = document.querySelector(".sp-mode--draft .sp-mode-mark") || document.querySelector(".sp-mode-mark");
    const bar = document.querySelector("#shell-header [aria-current], #shell-header .sp-header-current") || null;
    const hexOf = el => { if (!el) return null; const m = getComputedStyle(el).color.match(/\d+/g); return m ? "#" + m.slice(0, 3).map(v => Number(v).toString(16).padStart(2, "0")).join("") : null; };
    const barHex = (() => { const el = bar || document.querySelector("#shell-header"); const v = getComputedStyle(el).getPropertyValue("--sp-shell-current-bar").trim(); return v || null; })();
    return { mark: hexOf(mark), bar: barHex };
  });
  const focus = r.outline;
  const badge = r.badgeColor;
  const line = { theme, badge, focus, fill: r.fill, deltaE_badge_vs_focus: badge && focus ? deltaE2000(badge, focus) : null, contrast_badge_vs_focus: badge && focus ? contrastHex(badge, focus) : null, contrast_badge_on_fill: badge ? contrastHex(badge, r.fill) : null, header_indicator: indicatorMark };
  crops.push(line);
  console.log(`crop  ${theme.padEnd(5)} draft badge ${badge} vs focus ring ${focus}: ΔE2000 ${line.deltaE_badge_vs_focus}, ${line.contrast_badge_vs_focus}:1 between them; badge on fill ${line.contrast_badge_on_fill}:1; header ◇ ${indicatorMark.mark} beside bar ${indicatorMark.bar}`);
}

for (const theme of ["light", "dark"]) {
  // ---- viewer surface (/): rest, hover, keyboard focus, selected, search hit, search-selected, filtered-out, names-off
  await open("/", theme);
  // Names ON for the text states (the viewer remembers names off by default); the names-off
  // footprint is measured on its own below by toggling off and back.
  const viewerNames = page.getByRole("button", { name: "Show occupant names" });
  if (await viewerNames.count() && (await viewerNames.getAttribute("aria-pressed")) !== "true") { await viewerNames.click(); await page.waitForTimeout(400); }
  const assigned = marker("Assigned seat.");
  const available = marker("Open seat.");
  await record("rest-assigned", theme, assigned);
  await record("rest-available", theme, available);
  if (await marker("Reserved seat.").count()) await record("rest-reserved", theme, marker("Reserved seat."));
  if (await marker("Unavailable seat.").count()) await record("rest-unavailable", theme, marker("Unavailable seat."));
  await assigned.hover();
  await page.waitForTimeout(250);
  await record("hover-assigned", theme, assigned);
  await page.mouse.move(5, 5);
  // Keyboard focus: real Tab presses so :focus-visible matches.
  let focused = false;
  for (let i = 0; i < 80 && !focused; i += 1) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate(() => document.activeElement?.hasAttribute("data-seat-id"));
  }
  if (focused) await record("focus-keyboard", theme, page.locator("button[data-seat-id]:focus"));
  else console.log(`skip ${theme} focus-keyboard (no marker reached by Tab)`);
  await assigned.dispatchEvent("click");
  await page.locator("#seat-inspector-panel").waitFor();
  await page.waitForTimeout(400);
  await record("selected", theme, assigned);
  await escape();
  // Search hit: type the selected seat's occupant into Find, then click the hit for search-selected.
  const name = (await assigned.getAttribute("aria-label")).split(".")[0].split(" ").slice(1, 2)[0];
  await page.locator("#viewer-seat-search").click();
  await page.locator("#viewer-seat-search").fill(name);
  await page.waitForTimeout(600);
  const hit = marker("Search result.");
  if (await hit.count()) {
    await record("search-hit", theme, hit);
    await hit.dispatchEvent("click");
    await page.waitForTimeout(400);
    await record("search-selected", theme, hit);
  } else console.log(`skip ${theme} search-hit (query "${name}" matched no marker)`);
  await escape(2);
  await page.locator("#viewer-seat-search").fill("");
  await page.waitForTimeout(300);
  // Filtered-out = the QUIET pill (PR 3b): open the shell's left panel (hamburger) and check the first Zone item.
  for (let i = 0; i < 2 && !(await page.locator("#shell-left-panel[data-open]").count()); i += 1) {
    await page.locator('#shell-header button[aria-controls="shell-left-panel"]').click();
    await page.waitForTimeout(400);
  }
  const zoneChip = page.locator('#shell-left-panel fieldset').filter({ hasText: "Zone" }).locator('input[type="checkbox"]').first();
  if (await zoneChip.count()) {
    await zoneChip.click();
    await page.waitForTimeout(500);
    const quiet = page.locator("button[data-seat-id].sp-pill--quiet").first();
    if (await quiet.count()) await record("filtered-out", theme, quiet);
    else console.log(`skip ${theme} filtered-out (no quiet pill after the zone chip)`);
    const quietFootprint = page.locator("button[data-seat-id].sp-seat-footprint--quiet").first();
    if (await quietFootprint.count()) await record("filtered-out-footprint", theme, quietFootprint);
    await zoneChip.click();
    await page.waitForTimeout(300);
  } else console.log(`skip ${theme} filtered-out (no zone chip)`);
  // Names off: the filled footprint (graphic — fill vs the mat).
  const namesToggle = page.getByRole("button", { name: "Show occupant names" });
  if (await namesToggle.count() && (await namesToggle.getAttribute("aria-pressed")) === "true") {
    await namesToggle.click();
    await page.waitForTimeout(400);
    const off = page.locator("button[data-seat-id].sp-pill--names-off").first();
    if (await off.count()) await record("names-off", theme, off);
    await namesToggle.click();
    await page.waitForTimeout(300);
  }

  // ---- admin surface (/admin): selected, move origin / target / invalid, swap origin / candidate / target, changed-in-draft, planner highlight
  await open("/admin", theme);
  // Names ON for the admin pass: the O3 crops record the purple ◇ on a NAME pill beside the ring
  // (the admin surface remembers names off by default; the names-off ◇ is measured on the viewer pass).
  const adminNames = page.getByRole("button", { name: "Show occupant names" });
  if (await adminNames.count() && (await adminNames.getAttribute("aria-pressed")) !== "true") { await adminNames.click(); await page.waitForTimeout(400); }
  const assignedLabels = page.locator('button[data-seat-id][aria-label*="Assigned seat."]');
  const originCode = (await assignedLabels.nth(0).getAttribute("aria-label")).split(" ")[0];
  const targetCode = (await assignedLabels.nth(1).getAttribute("aria-label")).split(" ")[0];
  const origin = markerByCode(originCode);
  const target = markerByCode(targetCode);
  const selectOrigin = async () => {
    await origin.dispatchEvent("click");
    await page.locator("#seat-inspector-panel").waitFor();
    await page.waitForTimeout(400);
  };
  await selectOrigin();
  await record("admin-selected", theme, origin);
  const move = page.locator('#seat-inspector-panel button[aria-label^="Move "]');
  if (await move.count()) {
    await move.click();
    await page.waitForTimeout(400);
    await record("move-origin", theme, origin);
    await record("move-target", theme, target);
    await target.hover(); await page.waitForTimeout(250);
    await record("move-target-hover", theme, target);
    await page.mouse.move(5, 5);
    // O4: a reserved / unavailable seat refuses the move — the invalid pill (seed: NE09 reserved, NE10 unavailable).
    const invalid = page.locator('button[data-seat-id][aria-disabled="true"]').first();
    if (await invalid.count()) await record("invalid-target", theme, invalid);
    else console.log(`skip ${theme} invalid-target (no reserved/unavailable seat in the seed — supabase/seed.sql Q4)`);
    await open("/admin", theme);
    await selectOrigin();
  } else console.log(`skip ${theme} move-origin (no Move action on ${originCode})`);
  // exact: the row's Undo ("Undo Swap CW01 · Ctrl Z", PR 3a) also contains the phrase once a swap is in the history.
  await page.getByRole("button", { name: `Swap ${originCode}`, exact: true }).click();
  await page.waitForTimeout(400);
  await record("swap-origin", theme, origin);
  await record("swap-candidate", theme, target);
  await target.hover(); await page.waitForTimeout(250);
  await record("swap-candidate-hover", theme, target);
  await page.mouse.move(5, 5);
  await target.dispatchEvent("click");
  await page.getByRole("heading", { name: "Confirm seat swap" }).waitFor();
  await page.waitForTimeout(400);
  await record("swap-target", theme, target);
  if (theme === "light") {
    // Confirm once (LOCAL draft write) so both seats carry the changed-in-draft badge.
    await page.getByRole("dialog").getByRole("button", { name: "Confirm swap" }).click();
    await page.waitForTimeout(1500);
  } else {
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(300);
  }
  await escape();
  const changed = marker("Draft changed.");
  if (await changed.count()) {
    await record("changed-in-draft", theme, changed);
    // Focus it with the keyboard for the Draft-mark crops (ring + ◇ in one 28px).
    await changed.focus();
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    const focusedChanged = page.locator("button[data-seat-id]:focus");
    if (await focusedChanged.count()) {
      await record("changed-in-draft-focus", theme, focusedChanged);
      await draftBadgeCrops(theme, focusedChanged);
    }
  } else console.log(`skip ${theme} changed-in-draft (no draft-changed marker)`);
  await escape();

  // Ask Planner highlight (a real OpenAI call — needs OPENAI_API_KEY on the server; skipped otherwise).
  const openAsk = page.getByRole("button", { name: /^Open Ask Planner AI/ });
  if (await openAsk.count()) {
    await openAsk.click();
    await page.locator("#ask-planner-drawer").waitFor();
    await page.locator("#ask-planner-question").fill("Which seats are in the North Pod?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    let highlighted = null;
    for (let i = 0; i < 40; i += 1) {
      await page.waitForTimeout(500);
      const done = await page.locator('#ask-planner-drawer [role="status"], #ask-planner-drawer [role="alert"]').filter({ hasNotText: "Checking saved draft map data" }).count();
      const hl = marker("Highlighted by Ask Planner.");
      if (await hl.count()) { highlighted = hl; break; }
      if (done && !(await page.locator("#ask-planner-drawer .sp-drawer-loading").count())) break;
    }
    if (highlighted) await record("planner-highlight", theme, highlighted);
    else {
      const notice = await page.locator('#ask-planner-drawer .cds-notification').first().textContent().catch(() => "");
      console.log(`SKIPPED ${theme} planner-highlight (${/not set up|couldn't|could not/i.test(notice ?? "") ? "no OPENAI_API_KEY" : "no highlighted seat"}: ${(notice ?? "").trim().slice(0, 80)})`);
    }
    await escape();
  }
}

writeFileSync(path.join(outDir, "marker-measurements.json"), JSON.stringify({ rows, crops }, null, 2));
console.log(`\n${rows.length} measurements, ${rows.filter(r => r.ratio < r.min).length} under their floor, ${failures} outside the ledger. Ledger: ${Object.keys(LEDGER).length ? Object.entries(LEDGER).map(([k, v]) => `${k} (${v})`).join("; ") : "empty"}.`);
await browser.close();
process.exit(failures ? 1 : 0);
