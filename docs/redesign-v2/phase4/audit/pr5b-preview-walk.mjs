// Phase 4 · PR 5b read-only preview walk (2026-09-07). Drives the Vercel branch preview of PR 5b in a HEADED
// real Chrome at 1920×1080, light + dark: every one of the map's seven confirm dialogs is OPENED AND DISMISSED
// — Esc / Cancel / Keep editing / Discard (the guard's local reset) / Keep draft changes — and NEVER confirmed.
// ZERO WRITES BY CONSTRUCTION: the rig never presses Vacate seat / Delete seat / Confirm swap / Move them /
// Swap them / Save changes / Discard everything; Delete seat opens only if production already has an
// available custom seat, Discard draft only if the production draft already diverges (nothing is created to
// make either appear). The preview reads and writes the PRODUCTION database, so the proof of no write is
// recorded: the header indicator text and the row's Undo state before the walk and after every step
// (identical throughout), every Next-Action POST the browser sends (only the shell's argument-less status
// reads may succeed), and the count of success notices on the canvas (zero).
//
// The owner signs in by hand in the headed window (no password through chat or argv): the rig opens the
// share link, lands on /login and waits up to 20 minutes for the URL to leave /login.
// People data is masked in every capture (public repo): pills, the inspector, the palette, the header name
// and the modal's heading + body (they carry names) render as a soft smudge — text fill only, every measured
// colour and geometry is the real thing; results.json never records a name.
// Usage: node docs/redesign-v2/phase4/audit/pr5b-preview-walk.mjs <baseUrl> <shareUrl> <outDir> <expectedSha>
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const [base, share, outDir = "out", expectedSha] = process.argv.slice(2);
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
const LAYER_02 = { light: "rgb(255, 255, 255)", dark: "rgb(57, 57, 57)" };
const TERRACOTTA = "rgb(184, 92, 46)";
const RED_60 = "rgb(218, 30, 40)";
const WHITE = "rgb(255, 255, 255)";

const browser = await chromium.launch({ channel: "chrome", headless: false });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
// People-data mask: names live in the pills, the inspector, the palette, the header name, and inside the
// modal's question + body. Eyebrow and footer buttons carry no person and stay legible.
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.id = "walk-mask";
    style.textContent = ".sp-pill, [data-seat-id], #seat-inspector-panel, #viewer-find-palette, .sp-roster, .cds-header-name span, .sp-mode-card, .cds-modal h2, .cds-modal-body, .sp-canvas-status { -webkit-text-fill-color: transparent !important; text-shadow: 0 0 9px rgba(128, 128, 128, 0.9) !important; }";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const shot = async name => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  return `${name}.png`;
};
const escape = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
const marker = id => page.locator(`button[data-seat-id="${id}"]`);
const clickSeat = id => marker(id).dispatchEvent("click");
const inspector = () => page.locator("#seat-inspector-panel");
const modal = () => page.locator("[data-modal] .cds-modal");
const indicator = () => page.locator("#shell-header .sp-mode").textContent().then(t => t?.trim() ?? null).catch(() => null);
const undoState = () => page.getByRole("toolbar", { name: "Map controls" }).getByRole("button", { name: /^(Undo |No map changes to undo)/ }).evaluate(el => ({ disabled: el.disabled, label: el.getAttribute("aria-label") })).catch(() => null);
const successNotices = () => page.locator(".sp-canvas-status .cds-notification--success").count();
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  const role = el.getAttribute("role");
  const label = el.getAttribute("aria-label");
  // Never a person: labels that carry a name are reduced to their first token + "…".
  const text = label ?? (el.textContent || "").trim().slice(0, 40);
  return `${el.tagName.toLowerCase()}${role ? "[" + role + "]" : ""}:${/^(Vacate|Swap|Delete custom seat|Assign|Edit assignment)/.test(text) ? text : text.split(" ").slice(0, 1).join(" ") + "…"}`;
});
const centre = async loc => { const b = await loc.boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };
const hit = async pt => page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const target = el.closest("button, a") ?? el;
  return `${target.tagName.toLowerCase()}.${[...target.classList].slice(0, 2).join(".")}`;
}, pt);
const hitAt = async loc => hit(await centre(loc));
const isOverlayHit = h => /^div\.cds-modal-overlay/.test(h || "");
const readModal = () => modal().evaluate(el => {
  const s = getComputedStyle(el);
  const footer = el.querySelector(".cds-modal-footer");
  const buttons = [...footer.querySelectorAll(".cds-btn")].map(b => {
    const bs = getComputedStyle(b); const r = b.getBoundingClientRect();
    return { text: (b.textContent || "").trim(), cls: b.className, width: Math.round(r.width), height: Math.round(r.height), bg: bs.backgroundColor, color: bs.color, disabled: b.disabled };
  });
  const labelledBy = el.getAttribute("aria-labelledby");
  const describedBy = el.getAttribute("aria-describedby");
  const title = labelledBy ? document.getElementById(labelledBy) : null;
  const desc = describedBy ? document.getElementById(describedBy) : null;
  return {
    role: el.getAttribute("role"), labelledBy, describedBy,
    labelInside: Boolean(title && el.contains(title) && title.textContent.trim()),
    descriptionInside: Boolean(desc && el.contains(desc) && desc.textContent.trim()),
    eyebrow: (el.querySelector(".cds-modal-eyebrow")?.textContent || "").trim(),
    bg: s.backgroundColor, width: Math.round(el.getBoundingClientRect().width), radius: s.borderTopLeftRadius,
    footerClass: footer.className, buttons, overlayZ: getComputedStyle(el.closest(".cds-modal-overlay")).zIndex,
    closeButtons: el.querySelectorAll('button[aria-label^="Cancel "], button[aria-label^="Close"]').length,
    firstFocused: document.activeElement === footer.querySelector(".cds-btn")
  };
});
async function checkDialog(theme, { role, primary, danger, columns = 2, eyebrow }) {
  const m = await readModal();
  const problems = [];
  if (m.role !== role) problems.push(`role ${m.role} ≠ ${role}`);
  if (!m.labelInside) problems.push("aria-labelledby does not resolve inside");
  if (!m.descriptionInside) problems.push("aria-describedby does not resolve inside");
  if (eyebrow instanceof RegExp ? !eyebrow.test(m.eyebrow) : m.eyebrow !== eyebrow) problems.push(`eyebrow "${m.eyebrow}" ≠ ${eyebrow}`);
  if (m.bg !== LAYER_02[theme]) problems.push(`bg ${m.bg}`);
  if (m.width !== 480) problems.push(`width ${m.width}`);
  if (m.radius !== "0px") problems.push(`radius ${m.radius}`);
  if (m.buttons.length !== columns) problems.push(`${m.buttons.length} footer buttons`);
  const last = m.buttons[m.buttons.length - 1];
  if (last.text !== primary) problems.push(`primary "${last.text}"`);
  if (last.bg !== (danger ? RED_60 : TERRACOTTA)) problems.push(`primary bg ${last.bg}`);
  if (last.color !== WHITE) problems.push(`primary label ${last.color}`);
  if (m.closeButtons) problems.push("a × is present");
  if (m.overlayZ !== "8500") problems.push(`overlay z ${m.overlayZ}`);
  if (!m.firstFocused) problems.push(`focus is ${await active()}, not the first footer button`);
  // Hit-tests: every footer button's centre → itself; a marker under the overlay → the overlay.
  const footerButtons = modal().locator(".cds-modal-footer .cds-btn");
  const n = await footerButtons.count();
  const hits = [];
  for (let i = 0; i < n; i++) hits.push(await hitAt(footerButtons.nth(i)));
  if (hits.some(h => !/^button\.cds-btn/.test(h || ""))) problems.push(`footer hits ${hits.join(" | ")}`);
  const anyMarker = page.locator("button[data-seat-id]").first();
  const markerHit = await hitAt(anyMarker);
  if (!isOverlayHit(markerHit)) problems.push(`marker hit → ${markerHit}`);
  return { m, problems, hits, markerHit };
}
// Dismiss with a named footer button or Esc, then check the dialog is gone and focus returned to the opener.
async function dismiss(how, openerDescriptor) {
  if (how === "Escape") await page.keyboard.press("Escape");
  else await modal().getByRole("button", { name: how, exact: true }).click();
  await page.waitForTimeout(350);
  const closed = (await modal().count()) === 0;
  const focus = await active();
  return { how, closed, focus, restored: openerDescriptor ? focus === openerDescriptor : null };
}
// The seat inventory from the live canvas (ids only; names are never recorded).
const inventory = () => page.evaluate(() => {
  const all = [...document.querySelectorAll("button[data-seat-id]")].map(b => ({ id: b.getAttribute("data-seat-id"), label: (b.getAttribute("aria-label") || ""), pressed: b.getAttribute("aria-pressed") }));
  const code = l => l.split(" ")[0];
  const assigned = all.filter(s => /Assigned seat\./.test(s.label));
  const open = all.filter(s => /Open seat\./.test(s.label));
  return { total: all.length, assigned: assigned.map(s => ({ id: s.id, code: code(s.label) })), open: open.map(s => ({ id: s.id, code: code(s.label) })) };
});
const step = async (name, frame, fn) => {
  currentStep = name;
  try { await fn(); } catch (e) {
    const file = await shot(`${name.split(" ")[0]}-crash-${frame}`).catch(() => null);
    rec(name, frame, false, { focus: await active().catch(() => null) }, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, file ? [file] : []);
    await escape(); await escape();
    await page.getByRole("button", { name: /^Cancel editing/ }).click({ timeout: 1000 }).catch(() => {});
  }
};
const hygiene = async (name, frame, before) => {
  const ind = await indicator();
  const undo = await undoState();
  const notices = await successNotices();
  const ok = ind === before.indicator && JSON.stringify(undo) === JSON.stringify(before.undo) && notices === 0;
  return { ok, indicator: ind, undo, successNotices: notices };
};

// ---------------------------------------------------------------------------
// Entry: the share link (Vercel Authentication), then the owner signs in by hand.
// ---------------------------------------------------------------------------
await page.goto(share, { waitUntil: "networkidle" });
const buildId = await page.evaluate(async () => { try { return (await (await fetch("/api/build-id")).json()); } catch { return null; } });
const shaMatches = JSON.stringify(buildId).includes(expectedSha.slice(0, 7));
rec("0 deployment", "both", shaMatches, { buildId, expectedSha }, shaMatches ? "" : "the preview does not serve the expected commit — stop");
if (!shaMatches) { await browser.close(); process.exit(1); }
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
console.log("\n>>> Sign in by hand in the Chrome window (up to 20 minutes). The walk starts once /login is left.\n");
await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 20 * 60 * 1000 });
await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
await page.locator("button[data-seat-id]").first().waitFor({ timeout: 30000 });
await page.waitForTimeout(800);

const setTheme = async theme => {
  // The Account panel's Theme radio (the real control), then the panel closed.
  await page.locator('#shell-header button[aria-label="Account"]').click();
  await page.locator("#shell-panel-account").waitFor();
  await page.locator("#shell-panel-account").getByRole("radio", { name: theme === "dark" ? "Dark" : "Light" }).check();
  await page.waitForTimeout(300);
  await escape();
  return page.evaluate(() => document.documentElement.getAttribute("data-carbon-theme"));
};

const start = { indicator: await indicator(), undo: await undoState() };
const inv = await inventory();
rec("0 start", "both", Boolean(start.indicator) && inv.assigned.length > 0 && inv.open.length > 0, { indicator: start.indicator, undo: start.undo, seats: inv.total, assigned: inv.assigned.length, open: inv.open.length }, "");

for (const T of ["light", "dark"]) {
  consoleErrors = [];
  const attr = await setTheme(T);
  rec(`theme ${T}`, T, attr === (T === "dark" ? "g100" : "white"), { attr }, "Account panel → Theme");
  const assigned = inv.assigned[0];
  const other = inv.assigned[1] ?? null;
  const open = inv.open[0];

  await step("1 Vacate", T, async () => {
    await clickSeat(assigned.id);
    await inspector().waitFor();
    const opener = page.getByRole("button", { name: `Vacate ${assigned.code}` });
    await opener.click();
    await modal().waitFor();
    await page.waitForTimeout(300);
    const { m, problems, hits, markerHit } = await checkDialog(T, { role: "alertdialog", primary: "Vacate seat", danger: true, eyebrow: "Vacate seat" });
    const file = await shot(`01-vacate-${T}`);
    const esc = await dismiss("Escape", `button:Vacate ${assigned.code}`);
    if (!esc.closed || !esc.restored) problems.push(`Esc: ${JSON.stringify(esc)}`);
    await opener.click();
    await modal().waitFor();
    const cancel = await dismiss("Cancel", `button:Vacate ${assigned.code}`);
    if (!cancel.closed || !cancel.restored) problems.push(`Cancel: ${JSON.stringify(cancel)}`);
    const h = await hygiene("1", T, start);
    if (!h.ok) problems.push(`hygiene ${JSON.stringify(h)}`);
    rec("1 Vacate", T, problems.length === 0, { ...m, hits, markerHit, esc, cancel, hygiene: h }, problems.join("; "), [file]);
  });

  await step("2 Delete seat", T, async () => {
    // Only an AVAILABLE CUSTOM seat shows Delete; probe the open seats (the first 12) for one.
    let found = null;
    for (const s of inv.open.slice(0, 12)) {
      await clickSeat(s.id);
      await inspector().waitFor();
      const del = page.getByRole("button", { name: `Delete custom seat ${s.code}` });
      if ((await del.count()) === 1 && await del.isEnabled()) { found = s; break; }
    }
    if (!found) { rec("2 Delete seat", T, true, { probed: Math.min(12, inv.open.length) }, "N/A — production has no available custom seat among the probed open seats"); return; }
    const opener = page.getByRole("button", { name: `Delete custom seat ${found.code}` });
    await opener.click();
    await modal().waitFor();
    await page.waitForTimeout(300);
    const { m, problems, hits, markerHit } = await checkDialog(T, { role: "alertdialog", primary: "Delete seat", danger: true, eyebrow: "Delete seat" });
    const file = await shot(`02-delete-seat-${T}`);
    const cancel = await dismiss("Cancel", `button:Delete custom seat ${found.code}`);
    if (!cancel.closed || !cancel.restored) problems.push(`Cancel: ${JSON.stringify(cancel)}`);
    const h = await hygiene("2", T, start);
    if (!h.ok) problems.push(`hygiene ${JSON.stringify(h)}`);
    rec("2 Delete seat", T, problems.length === 0, { ...m, hits, markerHit, cancel, hygiene: h }, problems.join("; "), [file]);
  });

  await step("3 Swap", T, async () => {
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Swap ${assigned.code}` }).click();
    await page.waitForTimeout(400);
    await clickSeat(open.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const { m, problems, hits, markerHit } = await checkDialog(T, { role: "alertdialog", primary: "Confirm swap", danger: false, eyebrow: "Swap seats" });
    const items = await modal().locator(".cds-modal-body ul li").count();
    if (items !== 2) problems.push(`${items} list items`);
    const file = await shot(`03-swap-${T}`);
    const cancel = await dismiss("Cancel", null);
    if (!cancel.closed) problems.push("Cancel did not close");
    await page.getByRole("button", { name: /^Exit swap/ }).click();
    await page.waitForTimeout(400);
    const h = await hygiene("3", T, start);
    if (!h.ok) problems.push(`hygiene ${JSON.stringify(h)}`);
    rec("3 Swap", T, problems.length === 0, { ...m, hits, markerHit, items, cancel, hygiene: h }, problems.join("; "), [file]);
  });

  await step("4 Move", T, async () => {
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: /^Move .* to another seat$/ }).click();
    await page.waitForTimeout(400);
    await clickSeat(open.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const a = await checkDialog(T, { role: "alertdialog", primary: "Move them", danger: false, eyebrow: "Move employee" });
    const file = await shot(`04-move-${T}`);
    const cancel1 = await dismiss("Cancel", null);
    const problems = [...a.problems];
    if (!cancel1.closed) problems.push("Cancel (open target) did not close");
    let b = null, file2 = null, cancel2 = null;
    if (other) {
      await clickSeat(other.id);
      await modal().waitFor();
      await page.waitForTimeout(300);
      b = await checkDialog(T, { role: "alertdialog", primary: "Swap them", danger: false, eyebrow: "Move employee" });
      problems.push(...b.problems.map(p => `swap arm: ${p}`));
      file2 = await shot(`04-move-swap-arm-${T}`);
      cancel2 = await dismiss("Cancel", null);
      if (!cancel2.closed) problems.push("Cancel (swap arm) did not close");
    }
    await page.getByRole("button", { name: /^Exit move/ }).click();
    await page.waitForTimeout(400);
    const h = await hygiene("4", T, start);
    if (!h.ok) problems.push(`hygiene ${JSON.stringify(h)}`);
    rec("4 Move", T, problems.length === 0, { open: a.m, swapArm: b?.m ?? "N/A — one assigned seat on the floor", hits: a.hits, markerHit: a.markerHit, cancel1, cancel2, hygiene: h }, problems.join("; "), [file, file2].filter(Boolean));
  });

  await step("5 Move-conflict", T, async () => {
    // A person seated elsewhere: the first assigned marker's accessible name carries "<code> <name>. Assigned seat."
    const person = await marker(assigned.id).evaluate(el => (el.getAttribute("aria-label") || "").replace(/^\S+\s+/, "").replace(/\. Assigned seat\..*$/, ""));
    await clickSeat(open.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Assign an employee to ${open.code}` }).click();
    const combobox = page.getByRole("combobox", { name: "Employee name" });
    await combobox.fill(person.split(" ")[0]);
    await page.getByRole("option", { name: new RegExp(person.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
    await page.getByRole("button", { name: `Assign employee for ${open.code}` }).click();
    await modal().waitFor({ timeout: 15000 });
    await modal().getByRole("button", { name: "Move them" }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    const m = await readModal();
    const problems = [];
    const { m: mm, problems: p2, hits, markerHit } = await checkDialog(T, { role: "alertdialog", primary: "Move them", danger: false, eyebrow: "Move employee" });
    // Initial focus on the section is the R-5 finding (recorded, not failed) — drop that one problem.
    problems.push(...p2.filter(p => !/^focus is section/.test(p)));
    const initialFocus = await active();
    const file = await shot(`05-move-conflict-${T}`);
    const cancel = await dismiss("Cancel", null);
    if (!cancel.closed) problems.push("Cancel did not close");
    await page.getByRole("button", { name: /^Cancel editing/ }).click().catch(() => {});
    await page.waitForTimeout(400);
    const h = await hygiene("5", T, start);
    if (!h.ok) problems.push(`hygiene ${JSON.stringify(h)}`);
    rec("5 Move-conflict", T, problems.length === 0, { ...mm, initialFocus, hits, markerHit, cancel, hygiene: h }, [problems.join("; "), /section\[alertdialog\]/.test(initialFocus || "") ? "initial focus on the section — R-5, recorded" : ""].filter(Boolean).join(" · "), [file]);
  });

  await step("6 Inspector guard", T, async () => {
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await inspector().locator("textarea").fill("preview walk — never saved");
    await inspector().getByRole("button", { name: /^Save draft changes/ }).waitFor();
    await clickSeat(open.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const { m, problems, hits, markerHit } = await checkDialog(T, { role: "dialog", primary: "Save changes", danger: false, columns: 3, eyebrow: new RegExp(`^Seat ${assigned.code} · `) });
    const widths = m.buttons.map(b => b.width);
    if (!(widths[0] === 120 && widths[1] === 120 && widths[2] === 240)) problems.push(`footer ${widths.join("/")}`);
    const file = await shot(`06-inspector-guard-${T}`);
    const keep = await dismiss("Keep editing", null);
    if (!keep.closed) problems.push("Keep editing did not close");
    const stillDirty = (await inspector().locator("textarea").inputValue()) === "preview walk — never saved";
    if (!stillDirty) problems.push("Keep editing lost the edit");
    // The guard again → Esc IS Keep editing (the host's onEscape); the edit survives.
    await clickSeat(open.id);
    await modal().waitFor();
    const esc = await dismiss("Escape", null);
    if (!esc.closed) problems.push("Esc did not close");
    const stillDirtyAfterEsc = (await inspector().locator("textarea").inputValue()) === "preview walk — never saved";
    if (!stillDirtyAfterEsc) problems.push("Esc lost the edit");
    // The guard once more → Discard (a local reset: nothing is sent).
    const postsBefore = actionPosts.length;
    await clickSeat(open.id);
    await modal().waitFor();
    const discard = await dismiss("Discard", null);
    await page.waitForTimeout(600);
    if (!discard.closed) problems.push("Discard did not close");
    const postsDuring = actionPosts.length - postsBefore;
    if (postsDuring !== 0) problems.push(`${postsDuring} action POST(s) during Discard`);
    const h = await hygiene("6", T, start);
    if (!h.ok) problems.push(`hygiene ${JSON.stringify(h)}`);
    const shownAfter = (await inspector().locator(".sp-slot-eyebrow").textContent().catch(() => "")) || "";
    if (!shownAfter.includes(open.code)) problems.push(`after Discard the inspector shows "${shownAfter.split("·")[0].trim()}"`);
    rec("6 Inspector guard", T, problems.length === 0, { ...m, widths, hits, markerHit, keep, stillDirty, esc, stillDirtyAfterEsc, discard, postsDuring, shownAfter: shownAfter.split("·")[0].trim(), hygiene: h }, problems.join("; "), [file]);
  });

  await step("7 Discard draft", T, async () => {
    const ind = await indicator();
    if (!/Draft — \d+ change/.test(ind || "")) { rec("7 Discard draft", T, true, { indicator: ind }, `N/A — the production draft has no change ("${ind}"); nothing is created to make the dialog appear`); return; }
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Discard draft changes" }).click();
    await modal().waitFor();
    await page.waitForTimeout(300);
    const { m, problems, hits, markerHit } = await checkDialog(T, { role: "alertdialog", primary: "Discard everything", danger: true, eyebrow: "Discard draft changes" });
    const file = await shot(`07-discard-draft-${T}`);
    const keep = await dismiss("Keep draft changes", "button:More…");
    if (!keep.closed) problems.push("Keep draft changes did not close");
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Discard draft changes" }).click();
    await modal().waitFor();
    const esc = await dismiss("Escape", null);
    if (!esc.closed) problems.push("Esc did not close");
    const h = await hygiene("7", T, start);
    if (!h.ok) problems.push(`hygiene ${JSON.stringify(h)}`);
    rec("7 Discard draft", T, problems.length === 0, { ...m, hits, markerHit, keep, esc, hygiene: h }, problems.join("; "), [file]);
  });

  await escape();
  rec(`frame ${T} hygiene`, T, true, { consoleErrors: consoleErrors.filter(e => !/speed-insights/.test(e)).length, actionPosts: actionPosts.length }, "");
}

const end = { indicator: await indicator(), undo: await undoState() };
const nonStatus = actionPosts.filter(p => p.body !== "[]");
// The ONE non-status POST the walk sends by design: step 5's "Assign employee" submit, which the server
// answers with EMPLOYEE_ALREADY_ASSIGNED as data (the double-booking offer) — no row changes until "Move
// them", which the walk never presses. The indicator + Undo before / after are the proof it wrote nothing.
const unexpected = nonStatus.filter(p => p.step !== "5 Move-conflict");
const other = failedResponses.filter(e => !/speed-insights/.test(e));
rec("indicator + Undo before/after, writes", "both",
  end.indicator === start.indicator && JSON.stringify(end.undo) === JSON.stringify(start.undo) && unexpected.length === 0 && (await successNotices()) === 0 && other.length === 0,
  { start, end, actionPosts: actionPosts.length, statusReads: actionPosts.filter(p => p.body === "[]").length, moveConflictAssignPosts: nonStatus.filter(p => p.step === "5 Move-conflict").length, unexpectedPosts: unexpected.map(p => ({ step: p.step, body: p.body.slice(0, 60), status: p.status })), otherFailedResponses: [...new Set(other)].slice(0, 6) },
  `${nonStatus.filter(p => p.step === "5 Move-conflict").length} × the move-conflict's Assign employee submit (the server's refusal as data; nothing changed)`);

await browser.close();
writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ results, actionPosts }, null, 2) + "\n");
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pass; ${failed.length} fail${failed.length ? ": " + failed.map(f => `${f.step} (${f.frame})`).join(", ") : ""}`);
process.exit(failed.length ? 1 : 0);
