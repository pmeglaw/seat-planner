// Phase 4 · PR 6 read-only preview walk (2026-09-08). Drives the Vercel branch preview of PR 6 in a HEADED
// real Chrome at 1920×1080, light + dark, to walk the ONE thing this PR changes on a shipped surface: the
// F-8 fix (sheet amendment G — the status band takes the open slot's push, PHASE2UX §1M.2 "the band spans
// the canvas, not the slot"). Per theme: hit-test the band's Zoom-in with the slot CLOSED, open the
// inspector by selecting a seat, hit-test it again, measure the clearance to the slot's left edge, then
// actually CLICK zoom in and Fit — the owner's "visible and clickable" — and close the inspector again.
//
// ZERO WRITES BY CONSTRUCTION: the preview reads and writes the PRODUCTION database, so nothing here
// mutates. Selecting a seat and zooming are client-side view state; the rig never opens a confirm, never
// presses a primary, never edits a field. The proof is recorded rather than asserted in prose: the header
// draft indicator and the row's Undo state before the walk and after every step (identical throughout),
// every Next-Action POST the browser sends with its status (only the shell's argument-less status reads),
// and the count of success notices on the canvas (zero).
//
// Sign-in. By default the owner signs in BY HAND in the headed window and the rig waits up to 20 minutes
// for the URL to leave /login — that is the rule whenever the preview is wired to PRODUCTION, so no real
// password passes through chat or argv. PR 6 carries a migration, so the Supabase integration gave this
// preview its own BRANCH database (`ynhqcykgkjslzjzkwisy`, seeded from supabase/seed.sql) instead of
// production: the only accounts that exist there are the repo's seeded fixtures, so the optional
// [email] [password] arguments sign in automatically. Pass them ONLY for a fixture on a branch database.
// People data is masked in every capture (public repo): pills, the inspector, the palette and the header
// name render as a soft smudge — text fill only, so every measured colour and geometry is the real thing;
// results.json never records a name.
// A branch-database preview (any PR carrying a migration) has NO accounts at all — `[db.seed]` is
// disabled in supabase/config.toml on purpose — so its GoTrue answers every sign-in with
// `400 invalid_credentials` and the walk cannot run there. On PR 6 that moved the F-8 check to
// PRODUCTION right after the merge (owner ruling 2026-09-08): pass the production base URL TWICE (the
// second argument is the share link, which production does not need) and sign in by hand.
// Usage: node docs/redesign-v2/phase4/audit/pr6-preview-walk.mjs <baseUrl> <shareUrl> <outDir> <expectedSha> [email] [password]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const [base, share, outDir = "out", expectedSha, fixtureEmail, fixturePassword] = process.argv.slice(2);
if (!base || !share || !expectedSha) {
  console.error("usage: <baseUrl> <shareUrl> <outDir> <expectedSha>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const results = [];
const actionPosts = [];
let currentStep = "entry";
const rec = (step, frame, ok, values = {}, note = "", files = []) => {
  results.push({ step, frame, ok, values, note, files });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} (${frame})${note ? " — " + note : ""}`);
  if (!ok) console.log("  values:", JSON.stringify(values).slice(0, 1500));
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ results, actionPosts }, null, 2) + "\n");
};

const browser = await chromium.launch({ channel: "chrome", headless: false });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
// People-data mask: names live in the pills, the inspector, the palette and the header name. The band's own
// text (counts, Fit) carries no person and stays legible — it is the subject of this walk.
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.id = "walk-mask";
    style.textContent = ".sp-pill, [data-seat-id], #seat-inspector-panel, #viewer-find-palette, .sp-roster, .cds-header-name span { -webkit-text-fill-color: transparent !important; text-shadow: 0 0 9px rgba(128, 128, 128, 0.9) !important; }";
    document.head.appendChild(style);
  });
});
const page = await context.newPage();
let consoleErrors = [];
const failedResponses = [];
page.on("pageerror", e => consoleErrors.push(String(e)));
page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("response", r => { if (r.status() >= 400) failedResponses.push(`${r.status()} ${new URL(r.url()).pathname}`); });
page.on("request", req => {
  if (req.method() === "POST" && req.headers()["next-action"]) {
    const entry = { at: new Date().toISOString(), step: currentStep, path: new URL(req.url()).pathname, body: (req.postData() || "").slice(0, 160), status: null };
    actionPosts.push(entry);
    req.response().then(r => { entry.status = r?.status() ?? null; }).catch(() => {});
  }
});

const shot = async name => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  return `${name}.png`;
};
const escape = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
const row = () => page.getByRole("toolbar", { name: "Map controls" });
const band = () => page.locator("[data-map-status-band]");
const inspector = () => page.locator("#seat-inspector-panel");
const indicator = () => page.locator("#shell-header .sp-mode").textContent().then(t => t?.trim() ?? null).catch(() => null);
const undoState = () => row().getByRole("button", { name: /^(Undo |No map changes to undo)/ }).evaluate(el => ({ disabled: el.disabled, label: el.getAttribute("aria-label") })).catch(() => null);
const successNotices = () => page.locator(".sp-canvas-status .cds-notification--success").count();

// The band under the slot, read as the fix defines it: the attribute that drives the push, the computed
// padding, where the zoom group actually sits, and WHAT IS PAINTED at the Zoom-in button's own centre.
const readBand = () => page.evaluate(() => {
  const scroller = document.scrollingElement;
  scroller.scrollTop = scroller.scrollHeight;
  const el = document.querySelector("[data-map-status-band]");
  const host = document.querySelector("[data-slot-host][data-open]");
  const zoomIn = el?.querySelector('button[aria-label="Zoom in"]');
  const fit = el?.querySelector('button[aria-label*="Fit"], [data-map-status-band] .sp-band-zoom .cds-btn--ghost');
  const describe = node => (node ? { tag: node.tagName.toLowerCase(), cls: [...node.classList].slice(0, 2).join("."), inBand: Boolean(node.closest("[data-map-status-band]")), inSlot: Boolean(node.closest("[data-slot-host]")) } : null);
  const b = el?.getBoundingClientRect();
  const z = zoomIn?.getBoundingClientRect();
  const hostRect = host?.getBoundingClientRect();
  return {
    slotOpen: Boolean(host),
    slotOpenAttr: el ? el.hasAttribute("data-slot-open") : null,
    paddingRight: el ? getComputedStyle(el).paddingRight : null,
    band: b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) } : null,
    host: hostRect ? { x: Math.round(hostRect.x), w: Math.round(hostRect.width) } : null,
    // The count text is the other half of the report: with the bug it clipped mid-word.
    countText: (el?.querySelector(".sp-band-count")?.textContent || el?.querySelector(".sp-band-title")?.textContent || "").trim(),
    zoomCentre: z ? { x: Math.round(z.x + z.width / 2), y: Math.round(z.y + z.height / 2) } : null,
    zoomHit: z ? describe(document.elementFromPoint(z.x + z.width / 2, z.y + z.height / 2)) : null,
    fitLabel: fit ? (fit.getAttribute("aria-label") || fit.textContent || "").trim().slice(0, 30) : null,
    clearanceToSlot: z && hostRect ? Math.round(z.right - hostRect.x) : null
  };
});
const mapScale = () => page.evaluate(() => {
  const img = document.querySelector("img.map-raster");
  return img ? Math.round(img.getBoundingClientRect().width) : null;
});
const step = async (name, frame, fn) => {
  currentStep = name;
  try { await fn(); } catch (e) {
    const file = await shot(`${name.split(" ")[0]}-crash-${frame}`).catch(() => null);
    rec(name, frame, false, {}, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, file ? [file] : []);
    await escape(); await escape();
  }
};

// ---------------------------------------------------------------------------
// Entry: the share link, then the owner's own sign-in.
// ---------------------------------------------------------------------------
await page.goto(share, { waitUntil: "networkidle" });
if (fixtureEmail && fixturePassword) {
  // Branch-database preview: the seeded fixture is the only account that exists there.
  console.log(`\n>>> Signing in as the seeded fixture ${fixtureEmail} (branch database).\n`);
  await page.waitForURL(u => u.pathname.startsWith("/login"), { timeout: 60000 }).catch(() => {});
  await page.locator('input[type="email"]').fill(fixtureEmail);
  await page.locator('input[type="password"]').fill(fixturePassword);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
} else {
  console.log("\n>>> Sign in by hand in the Chrome window that just opened. The walk resumes on its own.\n");
}
await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: fixtureEmail ? 60000 : 20 * 60 * 1000 });
await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
await page.locator("button[data-seat-id]").first().waitFor({ timeout: 60000 });
await page.waitForTimeout(1000);

const buildId = await page.evaluate(async () => {
  try { return (await (await fetch("/api/build-id")).json())?.buildId ?? null; } catch { return null; }
});
const start = { indicator: await indicator(), undo: await undoState() };
// The deployment must be the head this PR is at: /api/build-id serves NEXT_PUBLIC_BUILD_ID (the commit SHA).
const buildMatches = Boolean(buildId) && expectedSha.startsWith(String(buildId).slice(0, 7));
rec("0 entry", "both", Boolean(start.indicator) && buildMatches, {
  buildId, expectedSha, indicator: start.indicator, undo: start.undo
  , signedInAs: fixtureEmail ? "the seeded fixture (branch database)" : "the owner, by hand"
}, buildMatches ? "signed in on the expected deployment; baseline recorded" : "the deployment's build id is not this PR's head — stop and re-mint the share link for the right deployment");

const setTheme = async theme => {
  await page.locator('#shell-header button[aria-label="Account"]').click();
  await page.locator("#shell-panel-account").waitFor();
  await page.locator("#shell-panel-account").getByRole("radio", { name: theme === "dark" ? "Dark" : "Light" }).check();
  await page.waitForTimeout(300);
  await escape();
  return page.evaluate(() => document.documentElement.getAttribute("data-carbon-theme"));
};

for (const T of ["light", "dark"]) {
  consoleErrors = [];
  const attr = await setTheme(T);
  rec(`theme ${T}`, T, attr === (T === "dark" ? "g100" : "white"), { attr }, "Account panel → Theme");

  // 1 — the band with no slot open: the baseline the fix must not disturb.
  await step("1 band closed", T, async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const before = await readBand();
    const files = [await shot(`01-band-closed-${T}`)];
    const ok = before.slotOpen === false && before.slotOpenAttr === false
      && before.zoomHit?.inBand === true && before.zoomHit?.inSlot === false;
    rec("1 band closed", T, ok, { ...before, indicator: await indicator(), undo: await undoState() }, "no slot: the band spans the full canvas and its zoom control is its own", files);
  });

  // 2 — the F-8 fix: with the inspector open the band takes the slot's push.
  await step("2 band under an open slot", T, async () => {
    await page.locator("button[data-seat-id]").first().dispatchEvent("click");
    await inspector().waitFor({ timeout: 20000 });
    await page.waitForTimeout(900);
    const open = await readBand();
    const files = [await shot(`02-band-slot-open-${T}`)];
    const ok = open.slotOpen === true && open.slotOpenAttr === true
      && open.zoomHit?.inBand === true && open.zoomHit?.inSlot === false
      && typeof open.clearanceToSlot === "number" && open.clearanceToSlot <= 0;
    rec("2 band under an open slot", T, ok, { ...open, indicator: await indicator(), undo: await undoState(), successNotices: await successNotices() },
      "amendment G: the band's zoom group ends at or before the slot's left edge and hit-tests to itself", files);
  });

  // 3 — "visible AND clickable": press the band's own zoom controls with the slot open.
  //     Zoom is client-side view state — no action POST, no write.
  await step("3 zoom clickable under the slot", T, async () => {
    const postsBefore = actionPosts.length;
    const scaleBefore = await mapScale();
    await band().getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(700);
    const scaleZoomed = await mapScale();
    const files = [await shot(`03-zoomed-under-slot-${T}`)];
    // Fit returns the plan to its resting scale (D2-b's Reset zoom lives only here).
    await band().getByRole("button", { name: /Fit/ }).first().click();
    await page.waitForTimeout(700);
    const scaleAfterFit = await mapScale();
    files.push(await shot(`04-fit-under-slot-${T}`));
    const ok = typeof scaleBefore === "number" && typeof scaleZoomed === "number"
      && scaleZoomed > scaleBefore && scaleAfterFit === scaleBefore
      && actionPosts.length === postsBefore;
    rec("3 zoom clickable under the slot", T, ok, {
      scaleBefore, scaleZoomed, scaleAfterFit, newActionPosts: actionPosts.length - postsBefore,
      indicator: await indicator(), undo: await undoState(), successNotices: await successNotices()
    }, "the zoom group is operable while the inspector is open, and it writes nothing", files);
  });

  // 4 — dismissed: the slot closes and the band takes its width back.
  await step("4 dismissed", T, async () => {
    await page.locator('button[aria-label="Close inspector"]').dispatchEvent("click");
    await page.waitForTimeout(700);
    const after = await readBand();
    const files = [await shot(`05-dismissed-${T}`)];
    const ok = after.slotOpen === false && after.slotOpenAttr === false
      && after.zoomHit?.inBand === true
      && (await indicator()) === start.indicator
      && (await successNotices()) === 0;
    rec("4 dismissed", T, ok, { ...after, indicator: await indicator(), undo: await undoState(), successNotices: await successNotices() },
      "open and dismiss only — the indicator is unchanged from the walk's baseline", files);
  });

  rec(`console ${T}`, T, consoleErrors.filter(e => !/speed-insights|Failed to load resource/.test(e)).length === 0,
    { errors: consoleErrors.slice(0, 6), failedResponses: failedResponses.slice(0, 6) }, "");
}

// ---------------------------------------------------------------------------
// The zero-write proof, restated at the end.
// ---------------------------------------------------------------------------
const end = { indicator: await indicator(), undo: await undoState(), successNotices: await successNotices() };
const wroteNothing = end.indicator === start.indicator
  && JSON.stringify(end.undo) === JSON.stringify(start.undo)
  && end.successNotices === 0;
rec("5 wrote nothing", "both", wroteNothing, { start, end, actionPosts }, "the indicator and Undo are identical to the baseline; no success notice appeared", []);

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} records pass`);
console.log(`action POSTs: ${actionPosts.length}${actionPosts.length ? " — " + actionPosts.map(a => `${a.step}:${a.status}`).join(", ") : ""}`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
