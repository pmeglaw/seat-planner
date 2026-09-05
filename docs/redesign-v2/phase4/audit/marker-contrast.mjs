// Phase 4 marker-state contrast audit (rerun on every PR that touches the pill or its tokens):
// drives the REAL seat marker into every interaction state on both map surfaces, in both themes,
// and measures text-vs-fill contrast on the rendered pill. A same-colour pair is 1:1 — the
// PR 1 preview-walk defect (selected = white text on the white Phase 3 pill fill) is exactly
// what this catches; a static class grep cannot, because the pair only collides once the
// bridge resolves both sides to the same token.
//
// Usage: node docs/redesign-v2/phase4/audit/marker-contrast.mjs <baseUrl> <outDir> <adminEmail> <adminPassword>
// Run against the LOCAL Docker stack only (npm run db:start + db:seed; .env.local pointed at it):
// the swap-confirm step WRITES the draft layer to produce the changed-in-draft state, which is a
// production draft edit anywhere else. Seeded local admin: e2e-admin@example.test
// (tests/e2e-auth/auth-helpers.ts). Exit code 1 when any measured state is under 4.5:1.
//
// Method. For each text span in the pill: its computed colour is composited over the pill fill
// at the span's own opacity chain (the code eyebrow renders at opacity-70/90), the fill is
// composited over the page backdrop (--sp-background; a translucent color-mix fill needs one),
// and the marker's ancestor opacity chain (filtered-out = opacity-45 on the button) blends BOTH
// sides toward that backdrop before the WCAG ratio is taken. Hover's brightness(1.05) filter is
// ignored (it moves both sides the same way). Each state also gets a 320×160 crop under
// <outDir>/marker-<state>-<theme>.png so the PR can show the state, not just the number.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base = "http://localhost:3000", outDir = "out", email, password] = process.argv.slice(2);
if (!email || !password) { console.error("admin email + password required (local seed admin)"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const MIN = 4.5;
// Ledgered failures: states the SHIPPED component cannot pass until the PR named here rebuilds
// them. Shrink-only, like the token test's HEX_LEDGER: a ledgered state that PASSES fails the run
// (stale row), and a failure outside the ledger fails the run. PR 3 deletes the row it closes.
const LEDGER = {
  "filtered-out": "PR 3 — the opacity-45 dim retires for the Phase 3 quiet pill (sp-components.css §12: text-secondary on layer-01, no opacity)",
};

// Runs in the page against one marker <button data-seat-id>.
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

  const root = document.documentElement;
  const backdrop = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const pill = button.firstElementChild;
  const pillStyle = getComputedStyle(pill);
  const fill = over(parse(pillStyle.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 }, backdrop);
  const markerOpacity = opacityChain(pill.parentElement, document.body); // button and above
  const spans = Array.from(pill.querySelectorAll("span")).filter(s => s.childElementCount === 0 && s.textContent.trim() && getComputedStyle(s).display !== "none");
  const results = spans.map(s => {
    const cs = getComputedStyle(s);
    const textOnFill = over(parse(cs.color), fill, opacityChain(s, pill));
    const textFinal = over({ ...textOnFill, a: 1 }, backdrop, markerOpacity);
    const fillFinal = over({ ...fill, a: 1 }, backdrop, markerOpacity);
    return { text: s.textContent.trim().slice(0, 24), fontPx: parseFloat(cs.fontSize), textColor: hex(textFinal), fillColor: hex(fillFinal), ratio: Math.round(ratio(textFinal, fillFinal) * 100) / 100 };
  });
  return { label: button.getAttribute("aria-label"), fillRaw: pillStyle.backgroundColor, markerOpacity, theme: root.getAttribute("data-theme"), spans: results };
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
let failures = 0;
async function record(state, theme, locator) {
  const handle = await locator.elementHandle();
  const r = await page.evaluate(measureInPage, handle);
  const box = await locator.boundingBox();
  if (box) {
    const clip = { x: Math.max(0, box.x + box.width / 2 - 160), y: Math.max(0, box.y + box.height / 2 - 80), width: 320, height: 160 };
    await page.screenshot({ path: path.join(outDir, `marker-${state}-${theme}.png`), clip });
  }
  const worst = r.spans.reduce((a, b) => (a.ratio <= b.ratio ? a : b), r.spans[0]);
  const passes = worst.ratio >= MIN;
  const ledgered = Object.hasOwn(LEDGER, state);
  const ok = passes !== ledgered; // passes and not ledgered, or fails and ledgered
  if (!ok) failures += 1;
  rows.push({ state, theme, ...worst, spans: r.spans.length, opacity: r.markerOpacity, ok });
  console.log(`${passes ? (ledgered ? "STALE" : "ok   ") : (ledgered ? "known" : "FAIL ")} ${theme.padEnd(5)} ${state.padEnd(22)} ${String(worst.ratio).padStart(5)}:1  text ${worst.textColor} on ${worst.fillColor}  "${worst.text}" ${worst.fontPx}px${r.markerOpacity < 1 ? ` (marker opacity ${r.markerOpacity})` : ""}${r.spans.length > 1 ? ` [${r.spans.length} spans, worst shown]` : ""}`);
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

for (const theme of ["light", "dark"]) {
  // ---- viewer surface (/): rest, hover, keyboard focus, selected, search hit, search-selected, filtered-out
  await open("/", theme);
  const assigned = marker("Assigned seat.");
  const available = marker("Open seat.");
  await record("rest-assigned", theme, assigned);
  await record("rest-available", theme, available);
  if (await marker("Reserved seat.").count()) await record("rest-reserved", theme, marker("Reserved seat."));
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
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
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
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.locator("#viewer-seat-search").fill("");
  await page.waitForTimeout(300);
  // Filtered-out: open the shell's left panel (hamburger) and check the first Zone item; non-matching markers dim.
  // The open state is a remembered per-user preference: a second theme pass
  // finds it already open, so toggle until the host carries data-open.
  for (let i = 0; i < 2 && !(await page.locator("#shell-left-panel[data-open]").count()); i += 1) {
    await page.locator('#shell-header button[aria-controls="shell-left-panel"]').click();
    await page.waitForTimeout(400);
  }
  const zoneChip = page.locator('#shell-left-panel fieldset').filter({ hasText: "Zone" }).locator('input[type="checkbox"]').first();
  if (await zoneChip.count()) {
    await zoneChip.click();
    await page.waitForTimeout(500);
    const dimmed = page.locator("button[data-seat-id].opacity-45").first();
    if (await dimmed.count()) await record("filtered-out", theme, dimmed);
    else console.log(`skip ${theme} filtered-out (no dimmed marker after the zone chip)`);
  } else console.log(`skip ${theme} filtered-out (no zone chip)`);

  // ---- admin surface (/admin): selected, move origin, swap origin, candidate hover, swap target, changed-in-draft
  // Origin/target = the first two ASSIGNED seats in the seed (an open seat has no Move action).
  await open("/admin", theme);
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
    await target.hover(); await page.waitForTimeout(250);
    await record("move-candidate-hover", theme, target);
    await page.mouse.move(5, 5);
    await open("/admin", theme);
    await selectOrigin();
  } else console.log(`skip ${theme} move-origin (no Move action on ${originCode})`);
  // exact: the row's Undo ("Undo Swap CW01 · Ctrl Z", PR 3a) also contains the phrase once a swap is in the history.
  await page.getByRole("button", { name: `Swap ${originCode}`, exact: true }).click();
  await page.waitForTimeout(400);
  await record("swap-origin", theme, origin);
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
  }
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  const changed = marker("Draft changed.");
  if (await changed.count()) await record("changed-in-draft", theme, changed);
  else console.log(`skip ${theme} changed-in-draft (no draft-changed marker)`);
}

console.log(`\n${rows.length} measurements, ${rows.filter(r => r.ratio < MIN).length} under ${MIN}:1, ${failures} outside the ledger. Ledger: ${Object.entries(LEDGER).map(([k, v]) => `${k} (${v})`).join("; ") || "empty"}. Not driven: invalid-target (SeatMap never passes invalidTarget), planner-highlight (needs Ask Planner; its viewer arm reuses the move-origin text/fill pair).`);
await browser.close();
process.exit(failures ? 1 : 0);
