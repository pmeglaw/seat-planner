// Phase 4 · PR 5b pre-merge smoke — owner-ordered (2026-09-07). Drives the map's seven confirm dialogs
// on the asset modal through the owner's step list in real Chrome at 1920×1080, the full run in light
// then dark, and records step · theme · pass/fail · computed values to results.json with a capture per
// state. Every geometric claim is a HIT-TEST (document.elementFromPoint), never a visibility check;
// colours, outlines and gaps are computed values.
//
// Local Docker stack ONLY (reset + reseed first): the run confirms Vacate, Delete, Move (the conflict
// arm), a guard Save and Discard everything FOR REAL, inserts / deletes a custom seat R99 through the
// service-role REST API and undoes what it changed. The rig refuses a non-local Supabase URL.
// Usage: node docs/redesign-v2/phase4/audit/pr5b-smoke.mjs <baseUrl> <outDir> <adminEmail> <password> <supabaseUrl> <serviceRoleKey>
//   SMOKE_ONLY=01,05 limits the steps (by number); SMOKE_THEMES=light limits the themes.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base = "http://localhost:3200", outDir = "out", email, password, supabaseUrl, serviceRoleKey] = process.argv.slice(2);
if (!email || !password || !supabaseUrl || !serviceRoleKey) {
  console.error("admin email, password, the local Supabase URL and its service-role key are required (the seeded local stack)");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(supabaseUrl)) {
  console.error(`refusing a non-local Supabase URL: ${supabaseUrl}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const ONLY = process.env.SMOKE_ONLY ? new Set(process.env.SMOKE_ONLY.split(",").map(x => x.trim())) : null;
const THEMES = process.env.SMOKE_THEMES ? process.env.SMOKE_THEMES.split(",") : ["light", "dark"];
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");

const results = [];
const rec = (step, theme, ok, values = {}, note = "", files = []) => {
  results.push({ step, theme, ok, values, note, files });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} (${theme})${note ? " — " + note : ""}`);
  if (!ok) console.log("  values:", JSON.stringify(values).slice(0, 1500));
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
};

const LAYER_02 = { light: "rgb(255, 255, 255)", dark: "rgb(57, 57, 57)" };
const TERRACOTTA = "rgb(184, 92, 46)";
const RED_60 = "rgb(218, 30, 40)";
const WHITE = "rgb(255, 255, 255)";

async function db(p, init = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${p}`, {
    ...init,
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`${response.status} ${p}: ${await response.text()}`);
  return response.status === 204 ? null : await response.json();
}
const insertR99 = async (anchor) => (await db("seats", { method: "POST", body: JSON.stringify({ seat_key: "R99", label: "R99", x: Math.min(0.98, anchor.x + 0.015), y: Math.min(0.98, anchor.y + 0.015), status: "available", layer: "draft", zone: anchor.zone, is_custom: true }) }))[0];

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const errors = [];
const failedResponses = [];
let actionPosts = 0;
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("response", r => { if (r.status() >= 400) failedResponses.push(`${r.status()} ${new URL(r.url()).pathname}`); });
page.on("request", r => { if (r.method() === "POST" && r.headers()["next-action"]) actionPosts += 1; });

await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.getByRole("button", { name: "Log in", exact: true }).click();
await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const shot = async name => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  return `${name}.png`;
};
const open = async (theme, route = "/admin") => {
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
};
const escape = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
const marker = id => page.locator(`button[data-seat-id="${id}"]`);
const clickSeat = id => marker(id).dispatchEvent("click");
const inspector = () => page.locator("#seat-inspector-panel");
const modal = () => page.locator("[data-modal] .cds-modal");
const modalClosed = () => page.waitForFunction(() => !document.querySelector("[data-modal]"), null, { timeout: 20000 });
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  const role = el.getAttribute("role");
  const label = el.getAttribute("aria-label");
  return `${el.tagName.toLowerCase()}${role ? "[" + role + "]" : ""}:${label ?? (el.textContent || "").trim().slice(0, 40)}`;
});
// Hit-test: what element sits at the centre of a locator's box (tag + classes + text/label).
const centre = async loc => { const b = await loc.boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };
const hit = async pt => page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const btn = el.closest("button, a");
  const target = btn ?? el;
  return `${target.tagName.toLowerCase()}.${[...target.classList].slice(0, 3).join(".")}:${target.getAttribute("aria-label") ?? (target.textContent || "").trim().slice(0, 30)}`;
}, pt);
const hitAt = async loc => hit(await centre(loc));
const isOverlayHit = h => /^div\.cds-modal-overlay/.test(h || "");
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el)[p], prop);
const readModal = () => modal().evaluate(el => {
  const s = getComputedStyle(el);
  const footer = el.querySelector(".cds-modal-footer");
  const buttons = [...footer.querySelectorAll(".cds-btn")].map(b => {
    const bs = getComputedStyle(b); const r = b.getBoundingClientRect();
    return { text: (b.textContent || "").trim(), cls: b.className, width: Math.round(r.width), height: Math.round(r.height), bg: bs.backgroundColor, color: bs.color, disabled: b.disabled, busy: b.getAttribute("aria-busy") };
  });
  const labelledBy = el.getAttribute("aria-labelledby");
  const describedBy = el.getAttribute("aria-describedby");
  const title = labelledBy ? document.getElementById(labelledBy) : null;
  const desc = describedBy ? document.getElementById(describedBy) : null;
  const alert = el.querySelector('[role="alert"]');
  return {
    role: el.getAttribute("role"), labelledBy, describedBy,
    labelInside: Boolean(title && el.contains(title)), descriptionInside: Boolean(desc && el.contains(desc) && desc.textContent.trim()),
    eyebrow: (el.querySelector(".cds-modal-eyebrow")?.textContent || "").trim(),
    heading: (el.querySelector("h2")?.textContent || "").trim(),
    bg: s.backgroundColor, width: Math.round(el.getBoundingClientRect().width), radius: s.borderTopLeftRadius,
    footerClass: footer.className, buttons,
    overlayZ: getComputedStyle(el.closest(".cds-modal-overlay")).zIndex,
    alert: alert ? { cls: alert.className, text: (alert.textContent || "").trim().slice(0, 160), focused: document.activeElement === alert } : null
  };
});
const focusOutline = loc => loc.evaluate(el => { const s = getComputedStyle(el); return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor, focused: document.activeElement === el }; });
const brand = [];
function checkModal(m, theme, { role, primary, danger, columns = 2, eyebrow, heading }) {
  const problems = [];
  if (m.role !== role) problems.push(`role ${m.role} ≠ ${role}`);
  if (!m.labelInside) problems.push("aria-labelledby does not resolve inside the dialog");
  if (!m.descriptionInside) problems.push("aria-describedby does not resolve inside the dialog");
  if (eyebrow && (eyebrow instanceof RegExp ? !eyebrow.test(m.eyebrow) : m.eyebrow !== eyebrow)) problems.push(`eyebrow "${m.eyebrow}" ≠ ${eyebrow}`);
  if (heading && !heading.test(m.heading)) problems.push(`heading "${m.heading}" ≠ ${heading}`);
  if (m.bg !== LAYER_02[theme]) problems.push(`bg ${m.bg} ≠ layer-02 ${LAYER_02[theme]}`);
  if (m.width !== 480) problems.push(`width ${m.width} ≠ 480`);
  if (m.radius !== "0px") problems.push(`radius ${m.radius}`);
  if (m.buttons.length !== columns) problems.push(`${m.buttons.length} footer buttons ≠ ${columns}`);
  const last = m.buttons[m.buttons.length - 1];
  if (last.text !== primary) problems.push(`primary "${last.text}" ≠ "${primary}"`);
  if (last.bg !== (danger ? RED_60 : TERRACOTTA)) problems.push(`primary bg ${last.bg}`);
  if (last.color !== WHITE) problems.push(`primary label ${last.color}`);
  if (m.overlayZ !== "8500") problems.push(`overlay z ${m.overlayZ}`);
  brand.push({ theme, dialog: m.labelledBy, primary: last.text, bg: last.bg, color: last.color });
  return problems;
}
const isAction = req => req.method() === "POST" && Boolean(req.headers()["next-action"]);
async function withActionRoute(mode, fn) {
  // A delayed continue must land BEFORE the route is removed (Playwright auto-continues unrouted
  // requests, and a late continue then throws "already handled") — held promises are awaited first.
  const held = [];
  const handler = async route => {
    if (!isAction(route.request())) return route.continue();
    if (mode === "delay") {
      const p = new Promise(r => setTimeout(r, 2500)).then(() => route.continue().catch(() => {}));
      held.push(p);
      return p;
    }
    return route.abort("failed");
  };
  await page.route("**/*", handler);
  try { return await fn(); } finally { await Promise.allSettled(held); await page.unroute("**/*", handler); }
}
const seatRow = async id => (await db(`seats?id=eq.${id}&select=id,label,status,employee_id,notes`))[0];
// The row's Undo (scoped to the toolbar: a canvas notice can also offer an Undo action after a mutation).
const undoRow = async () => { await page.getByRole("toolbar", { name: "Map controls" }).getByRole("button", { name: /^Undo / }).click(); await page.waitForTimeout(1500); };

// ---------------------------------------------------------------------------
// Seed facts: an assigned seat + an open seat in its zone, another assigned seat (Swap-them / conflict).
// ---------------------------------------------------------------------------
await db("seats?seat_key=eq.R99", { method: "DELETE" });
const [assigned] = await db("seats?layer=eq.draft&status=eq.assigned&select=id,label,zone,floor,x,y,employee_id&order=label&limit=1");
const [[assignedEmployee], [otherAssigned], [openSeat], floor2] = await Promise.all([
  db(`employees?id=eq.${assigned.employee_id}&select=full_name`),
  db(`seats?layer=eq.draft&status=eq.assigned&floor=eq.${assigned.floor}&id=neq.${assigned.id}&select=id,label,employee_id&order=label&limit=1`),
  db(`seats?layer=eq.draft&status=eq.available&zone=eq.${encodeURIComponent(assigned.zone)}&select=id,label&order=label&limit=1`),
  db(`seats?layer=eq.draft&floor=neq.${assigned.floor}&select=id,label,floor&limit=1`)
]);
const [otherEmployee] = await db(`employees?id=eq.${otherAssigned.employee_id}&select=full_name`);
console.log(`seed: ${assigned.label} (${assignedEmployee.full_name}) · ${otherAssigned.label} (${otherEmployee.full_name}) · open ${openSeat.label} · other-floor seats: ${floor2.length}`);

for (const T of THEMES) {
  const step = async (name, fn) => {
    if (ONLY && !ONLY.has(name.split("-")[0])) return;
    try { await fn(); } catch (e) {
      const file = await shot(`${name}-crash-${T}`).catch(() => null);
      rec(name, T, false, { focus: await active().catch(() => null) }, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, file ? [file] : []);
      await escape(); await escape();
    }
  };

  // 01 · Vacate — contract, focus outline, hit-tests, Tab trap, Esc restore.
  await step("01-vacate", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    const vacateBtn = page.getByRole("button", { name: `Vacate ${assigned.label}` });
    // Keyboard-open: focus the inspector's Vacate and press Enter, so the focus that lands on Cancel is
    // the keyboard path's (:focus-visible) — the outline is the claim.
    await vacateBtn.focus();
    await page.keyboard.press("Enter");
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Vacate seat", danger: true, eyebrow: "Vacate seat", heading: new RegExp(`^Vacate ${assigned.label}\\?$`) });
    const cancel = modal().getByRole("button", { name: "Cancel", exact: true });
    const primary = modal().getByRole("button", { name: "Vacate seat" });
    const outline = await focusOutline(cancel);
    if (!outline.focused) problems.push(`focus is ${await active()}, not Cancel`);
    if (!(outline.style === "solid" && outline.width === "2px" && outline.offset === "-2px" && outline.color === TERRACOTTA)) problems.push(`Cancel outline ${JSON.stringify(outline)}`);
    const hits = {
      cancel: await hitAt(cancel),
      primary: await hitAt(primary),
      inspectorEdit: await hitAt(page.locator('[aria-label^="Edit assignment for"]')),
      inspectorVacate: await hitAt(vacateBtn),
      marker: await hitAt(marker(openSeat.id))
    };
    if (!/Cancel$/.test(hits.cancel || "")) problems.push(`hit at Cancel → ${hits.cancel}`);
    if (!/Vacate seat$/.test(hits.primary || "")) problems.push(`hit at Vacate seat → ${hits.primary}`);
    if (!isOverlayHit(hits.inspectorEdit)) problems.push(`hit at Edit assignment → ${hits.inspectorEdit}`);
    if (!isOverlayHit(hits.inspectorVacate)) problems.push(`hit at inspector Vacate → ${hits.inspectorVacate}`);
    if (!isOverlayHit(hits.marker)) problems.push(`hit at a canvas marker → ${hits.marker}`);
    await page.keyboard.press("Tab");
    const afterTab1 = await active();
    await page.keyboard.press("Tab");
    const afterTab2 = await active();
    if (!/Vacate seat$/.test(afterTab1 || "")) problems.push(`Tab → ${afterTab1}`);
    if (!/Cancel$/.test(afterTab2 || "")) problems.push(`Tab Tab → ${afterTab2} (trap)`);
    const file = await shot(`01-vacate-${T}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const closed = (await modal().count()) === 0;
    const restored = await active();
    if (!closed) problems.push("Esc did not close");
    if (restored !== `button:Vacate ${assigned.label}`) problems.push(`focus after Esc: ${restored}`);
    rec("01-vacate", T, problems.length === 0, { ...m, outline, hits, afterTab1, afterTab2, restored }, problems.join("; "), [file]);
  });

  // 01b · Vacate mid-flight (delayed route) → resolves; Undo via the row.
  await step("01b-vacate-mid-flight", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Vacate ${assigned.label}` }).click();
    await modal().waitFor();
    const r = await withActionRoute("delay", async () => {
      await modal().getByRole("button", { name: "Vacate seat" }).click();
      await page.waitForTimeout(600);
      const mid = await readModal();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const afterEsc = await modal().count();
      // Mid-flight the clicked primary is disabled, and Chrome drops focus from a control that
      // disables under it — so focus is already on <body> BEFORE the pointer. The claim here is
      // that the pointer changes nothing (dialog open, focus unchanged); the drop itself is
      // recorded as a finding (pre-existing: the old Button disabled while loading too).
      const focusBefore = await active();
      const overlayPt = { x: 40, y: 540 };
      await page.mouse.click(overlayPt.x, overlayPt.y);
      await page.waitForTimeout(200);
      const afterPointer = await modal().count();
      const focusAfter = await active();
      const file = await shot(`01b-vacate-mid-flight-${T}`);
      return { mid, afterEsc, afterPointer, focusBefore, focusAfter, file };
    });
    await modalClosed();
    await page.waitForTimeout(600);
    const label = await marker(assigned.id).getAttribute("aria-label");
    const row = await seatRow(assigned.id);
    const problems = [];
    const p = r.mid.buttons.find(b => b.text === "Vacating…");
    if (!p || !p.disabled || p.busy !== "true") problems.push(`mid-flight primary ${JSON.stringify(r.mid.buttons.map(b => [b.text, b.disabled, b.busy]))}`);
    if (!r.mid.buttons[0].disabled) problems.push("Cancel enabled mid-flight");
    if (!r.afterEsc) problems.push("Esc closed the dialog mid-flight");
    if (!r.afterPointer) problems.push("a pointer on the overlay closed the dialog mid-flight");
    if (r.focusAfter !== r.focusBefore) problems.push(`a pointer on the overlay moved focus: ${r.focusBefore} → ${r.focusAfter}`);
    const focusNote = /^body/.test(r.focusBefore || "") ? "finding: mid-flight focus sits on <body> (the clicked primary disabled under it) — Tab re-anchors via the trap; pre-existing" : "";
    if (!/Open seat\. Draft changed\./.test(label || "")) problems.push(`marker after resolve: "${label}"`);
    if (row.status !== "available" || row.employee_id) problems.push(`row after resolve ${JSON.stringify(row)}`);
    const file2 = await shot(`01b-vacate-resolved-${T}`);
    await undoRow();
    const rowAfterUndo = await seatRow(assigned.id);
    if (rowAfterUndo.employee_id !== assigned.employee_id) problems.push(`Undo did not re-assign: ${JSON.stringify(rowAfterUndo)}`);
    rec("01b-vacate-mid-flight", T, problems.length === 0, { mid: r.mid, afterEsc: r.afterEsc, afterPointer: r.afterPointer, focusBefore: r.focusBefore, focusAfter: r.focusAfter, label, row, rowAfterUndo }, [problems.join("; "), focusNote].filter(Boolean).join(" · "), [r.file, file2]);
  });

  // 01c · Vacate error (aborted route) → in-dialog notification, Retry enabled, Cancel closes with no change.
  await step("01c-vacate-error", async () => {
    // State-independent: the seat is assigned whatever 01b left (REST).
    await db(`seats?id=eq.${assigned.id}`, { method: "PATCH", body: JSON.stringify({ employee_id: assigned.employee_id, status: "assigned" }) });
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Vacate ${assigned.label}` }).click();
    await modal().waitFor();
    const err = await withActionRoute("abort", async () => {
      await modal().getByRole("button", { name: "Vacate seat" }).click();
      await modal().locator('[role="alert"]').waitFor({ timeout: 15000 });
      await page.waitForTimeout(400);
      return readModal();
    });
    const problems = [];
    if (!err.alert) problems.push("no alert inside the dialog");
    else {
      if (!/cds-notification--error/.test(err.alert.cls)) problems.push(`alert class ${err.alert.cls}`);
      if (!/^Vacate did not complete\./.test(err.alert.text)) problems.push(`alert text "${err.alert.text}"`);
      if (!err.alert.focused) problems.push("focus is not in the alert");
    }
    const retry = err.buttons.find(b => b.text === "Retry vacate");
    if (!retry || retry.disabled) problems.push(`Retry vacate ${JSON.stringify(retry)}`);
    const file = await shot(`01c-vacate-error-${T}`);
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(400);
    const row = await seatRow(assigned.id);
    if (await modal().count()) problems.push("Cancel did not close");
    if (row.employee_id !== assigned.employee_id) problems.push(`the seat changed: ${JSON.stringify(row)}`);
    rec("01c-vacate-error", T, problems.length === 0, { alert: err.alert, retry, row }, problems.join("; "), [file]);
  });

  // 02 · Delete seat — the 8px paragraph gap (amendment F), Cancel restores focus, then delete for real.
  await step("02-delete-seat", async () => {
    await db("seats?seat_key=eq.R99", { method: "DELETE" });
    const r99 = await insertR99(assigned);
    await open(T);
    await clickSeat(r99.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: "Delete custom seat R99" }).click();
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Delete seat", danger: true, eyebrow: "Delete seat", heading: /^Delete custom seat R99\?$/ });
    const gap = await modal().evaluate(el => {
      const ps = [...el.querySelectorAll(".cds-modal-body > p")];
      if (ps.length < 2) return null;
      const a = ps[0].getBoundingClientRect(), b = ps[1].getBoundingClientRect();
      return { gap: Math.round(b.top - a.bottom), marginTop: getComputedStyle(ps[1]).marginTop };
    });
    if (!gap || gap.gap !== 8) problems.push(`paragraph gap ${JSON.stringify(gap)} ≠ 8`);
    const file = await shot(`02-delete-seat-${T}`);
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(300);
    const restored = await active();
    if (restored !== "button:Delete custom seat R99") problems.push(`focus after Cancel: ${restored}`);
    await page.getByRole("button", { name: "Delete custom seat R99" }).click();
    await modal().waitFor();
    await modal().getByRole("button", { name: "Delete seat" }).click();
    await modalClosed();
    await page.waitForTimeout(600);
    const markerCount = await marker(r99.id).count();
    const rows = await db("seats?seat_key=eq.R99&select=id");
    if (markerCount !== 0) problems.push("the R99 marker is still on the canvas");
    if (rows.length) problems.push("R99 still in the database");
    const file2 = await shot(`02-delete-seat-deleted-${T}`);
    rec("02-delete-seat", T, problems.length === 0, { ...m, gap, restored, markerCount, rowsLeft: rows.length }, problems.join("; "), [file, file2]);
  });

  // 03 · Swap — mode card owns the slot; the list + summary; overlay mousedown; Cancel (captured, not asserted).
  await step("03-swap", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Swap ${assigned.label}` }).click();
    await page.waitForTimeout(400);
    const modeCard = await page.locator(".sp-mode-card").count();
    const modeCardHit = await hitAt(page.locator(".sp-mode-card-title"));
    await clickSeat(openSeat.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Confirm swap", danger: false, eyebrow: "Swap seats", heading: /^Confirm seat swap$/ });
    if (!modeCard) problems.push("the mode card did not own the slot");
    if (!/sp-mode-card-title/.test(modeCardHit || "")) problems.push(`mode card hit → ${modeCardHit}`);
    const items = await modal().locator(".cds-modal-body ul li").allTextContents();
    const summary = (await modal().locator(".cds-modal-body > p").last().textContent()) || "";
    if (items.length !== 2 || !items[0].includes(assigned.label) || !items[1].includes(openSeat.label)) problems.push(`list ${JSON.stringify(items)}`);
    if (!summary.includes("↔")) problems.push(`summary "${summary}"`);
    await page.mouse.move(40, 540); await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(200);
    const stillOpen = await modal().count();
    const inside = await page.evaluate(() => Boolean(document.querySelector("[data-modal] .cds-modal")?.contains(document.activeElement)));
    if (!stillOpen) problems.push("overlay mousedown closed the dialog");
    if (!inside) problems.push(`overlay mousedown moved focus to ${await active()}`);
    const file = await shot(`03-swap-${T}`);
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(400);
    const after = { modeCard: await page.locator(".sp-mode-card").count(), focus: await active() };
    const file2 = await shot(`03-swap-after-cancel-${T}`);
    rec("03-swap", T, problems.length === 0, { ...m, modeCard, modeCardHit, items, summary, stillOpen, inside, afterCancel: after }, problems.join("; ") || `after Cancel: mode card ${after.modeCard ? "still armed" : "gone"}, focus ${after.focus} (recorded, not asserted)`, [file, file2]);
    await escape();
  });

  // 04 · Move — open target; assigned target (Swap-them arm); cross-floor tag N/A on this seed.
  await step("04-move", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Move ${assignedEmployee.full_name} to another seat` }).click();
    await clickSeat(openSeat.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Move them", danger: false, eyebrow: "Move employee", heading: new RegExp(`^Move .* to ${openSeat.label}\\?$`) });
    const file = await shot(`04-move-${T}`);
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    await clickSeat(otherAssigned.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m2 = await readModal();
    problems.push(...checkModal(m2, T, { role: "alertdialog", primary: "Swap them", danger: false, eyebrow: "Move employee", heading: /^Swap .* and .*\?$/ }));
    const file2 = await shot(`04-move-swap-arm-${T}`);
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    await escape();
    const crossFloor = floor2.length ? "seed carries another floor — not driven (the seed's assigned seats are all floor 3)" : "N/A — the seed has no other-floor seat";
    rec("04-move", T, problems.length === 0, { open: m, swapArm: m2, crossFloorTag: crossFloor }, problems.join("; ") || crossFloor, [file, file2]);
  });

  // 05 · Move-conflict — initial focus recorded (R-5), Tab → Cancel, Esc; reopen → confirm for real → Undo.
  await step("05-move-conflict", async () => {
    const openConflict = async () => {
      await clickSeat(openSeat.id);
      await inspector().waitFor();
      await page.getByRole("button", { name: `Assign an employee to ${openSeat.label}` }).click();
      const combobox = page.getByRole("combobox", { name: "Employee name" });
      await combobox.fill(otherEmployee.full_name.split(" ")[0]);
      await page.getByRole("option", { name: new RegExp(otherEmployee.full_name) }).first().click();
      await page.getByRole("button", { name: `Assign employee for ${openSeat.label}` }).click();
      await modal().waitFor({ timeout: 15000 });
      await modal().getByRole("button", { name: "Move them" }).waitFor({ timeout: 15000 });
      await page.waitForTimeout(400);
    };
    await open(T);
    await openConflict();
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Move them", danger: false, eyebrow: "Move employee", heading: new RegExp(`^Move ${otherEmployee.full_name} to ${openSeat.label}\\?$`) });
    const initialFocus = await active();
    await page.keyboard.press("Tab");
    const afterTab = await active();
    if (!/Cancel$/.test(afterTab || "")) problems.push(`Tab → ${afterTab}`);
    const file = await shot(`05-move-conflict-${T}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    if (await modal().count()) problems.push("Esc did not close");
    await page.getByRole("button", { name: /^Cancel editing/ }).click().catch(() => {});
    await page.waitForTimeout(300);
    await openConflict();
    await modal().getByRole("button", { name: "Move them" }).click();
    await modalClosed();
    await page.waitForTimeout(800);
    const moved = await seatRow(openSeat.id);
    const vacated = await seatRow(otherAssigned.id);
    if (moved.employee_id !== otherAssigned.employee_id) problems.push(`not moved: ${JSON.stringify(moved)}`);
    if (vacated.employee_id) problems.push(`source not freed: ${JSON.stringify(vacated)}`);
    const file2 = await shot(`05-move-conflict-moved-${T}`);
    await undoRow();
    const back = await seatRow(otherAssigned.id);
    if (back.employee_id !== otherAssigned.employee_id) problems.push(`Undo did not restore: ${JSON.stringify(back)}`);
    const note = /^section\[alertdialog\]/.test(initialFocus || "") ? "initial focus on the section — R-5, recorded not failed" : `initial focus ${initialFocus}`;
    rec("05-move-conflict", T, problems.length === 0, { ...m, initialFocus, afterTab, moved, vacated, back }, [problems.join("; "), note].filter(Boolean).join(" · "), [file, file2]);
  });

  // 06 · Inspector guard — three buttons 120/120/240, focus Keep editing, Esc keeps dirty; Discard (no write);
  //      the shell veto (Management link) → Save changes → saved.
  await step("06-inspector-guard", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    const dirty = async () => {
      await inspector().locator("textarea").fill("pr5b smoke note");
      await inspector().getByRole("button", { name: /^Save draft changes/ }).waitFor();
    };
    await dirty();
    await clickSeat(openSeat.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "dialog", primary: "Save changes", danger: false, columns: 3, eyebrow: new RegExp(`^Seat ${assigned.label} · `), heading: /^Unsaved seat edits$/ });
    const widths = m.buttons.map(b => b.width);
    if (!(widths[0] === 120 && widths[1] === 120 && widths[2] === 240)) problems.push(`footer ${widths.join("/")} ≠ 120/120/240`);
    const keep = modal().getByRole("button", { name: "Keep editing" });
    const outline = await focusOutline(keep);
    if (!outline.focused) problems.push(`focus is ${await active()}, not Keep editing`);
    const file = await shot(`06-inspector-guard-${T}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const stillDirty = (await inspector().locator("textarea").inputValue()) === "pr5b smoke note";
    if (!stillDirty) problems.push("Esc lost the edit");
    // Discard → the other seat, no server write.
    const postsBefore = actionPosts;
    await clickSeat(openSeat.id);
    await modal().waitFor();
    await modal().getByRole("button", { name: "Discard", exact: true }).click();
    await page.waitForTimeout(600);
    const eyebrowAfter = (await inspector().locator(".sp-slot-eyebrow").textContent()) || "";
    const postsDuring = actionPosts - postsBefore;
    if (!eyebrowAfter.includes(openSeat.label)) problems.push(`after Discard the inspector shows "${eyebrowAfter}"`);
    if (postsDuring !== 0) problems.push(`${postsDuring} server-action POST(s) during Discard`);
    const file2 = await shot(`06-inspector-guard-discarded-${T}`);
    // Dirty again → the shell's Management link (the registered veto) → guard → Save changes.
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await dirty();
    await page.locator("#shell-header").getByRole("link", { name: "Management" }).click();
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m3 = await readModal();
    if (m3.role !== "dialog" || m3.heading !== "Unsaved seat edits") problems.push(`the shell veto raised ${m3.role} "${m3.heading}"`);
    const file3 = await shot(`06-inspector-guard-veto-${T}`);
    await modal().getByRole("button", { name: "Save changes" }).click();
    await page.waitForFunction(() => !document.querySelector("[data-modal]"), null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const saved = await seatRow(assigned.id);
    if (saved.notes !== "pr5b smoke note") problems.push(`note not saved: ${JSON.stringify(saved)}`);
    const landed = new URL(page.url()).pathname;
    rec("06-inspector-guard", T, problems.length === 0, { ...m, widths, outline, stillDirty, eyebrowAfter, postsDuring, veto: { role: m3.role, heading: m3.heading }, saved: saved.notes, landed }, problems.join("; ") || `Save continued the vetoed navigation to ${landed}`, [file, file2, file3]);
  });

  // 07 · Discard draft — with ≥ 1 change (the saved note): dialog, Esc, then Discard everything for real.
  await step("07-discard-draft", async () => {
    await open(T);
    await page.getByRole("button", { name: /^Publish \d+ change/ }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Discard draft changes" }).click();
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Discard everything", danger: true, eyebrow: "Discard draft changes", heading: /^Discard all draft changes\?$/ });
    const keep = modal().getByRole("button", { name: "Keep draft changes" });
    const outline = await focusOutline(keep);
    if (!outline.focused) problems.push(`focus is ${await active()}, not Keep draft changes`);
    const file = await shot(`07-discard-draft-${T}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    if (await modal().count()) problems.push("Esc did not close");
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Discard draft changes" }).click();
    await modal().waitFor();
    await modal().getByRole("button", { name: "Discard everything" }).click();
    await modalClosed();
    await page.waitForTimeout(1200);
    const indicator = (await page.locator("#shell-header .sp-mode").textContent()) || "";
    const publish = page.getByRole("button", { name: "Publish", exact: true });
    const publishDisabled = await publish.isDisabled().catch(() => null);
    const reasonId = await publish.getAttribute("aria-describedby").catch(() => null);
    const reason = reasonId ? (await page.locator(`#${reasonId}`).textContent()) : null;
    const reasonHit = reasonId ? await hitAt(page.locator(`#${reasonId}`)) : null;
    if (!/Draft — no changes/.test(indicator)) problems.push(`indicator "${indicator.trim()}"`);
    if (publishDisabled !== true) problems.push(`Publish disabled = ${publishDisabled}`);
    if (reason !== "No changes to publish") problems.push(`reason "${reason}"`);
    if (!/sp-control-reason/.test(reasonHit || "")) problems.push(`reason hit → ${reasonHit}`);
    const note = (await seatRow(assigned.id)).notes;
    if (note) problems.push(`the note survived the discard: "${note}"`);
    const file2 = await shot(`07-discard-draft-converged-${T}`);
    rec("07-discard-draft", T, problems.length === 0, { ...m, outline, indicator: indicator.trim(), publishDisabled, reason, reasonHit, note }, problems.join("; "), [file, file2]);
  });

  // 08 · Stacking — Vacate open: a hovered marker under the overlay paints no tooltip; overlay above the slot + row.
  await step("08-stacking", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Vacate ${assigned.label}` }).click();
    await modal().waitFor();
    await page.waitForTimeout(300);
    const target = marker(openSeat.id);
    const pt = await centre(target);
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(400);
    const tip = target.locator("xpath=following-sibling::span[contains(@class,'sp-tooltip')]").first();
    const tipState = await tip.evaluate(el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { display: s.display, visibility: s.visibility, opacity: s.opacity, x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).catch(() => null);
    const tipHit = tipState ? await hit({ x: tipState.x, y: tipState.y }) : null;
    const markerHit = await hit(pt);
    const slotHit = await hitAt(inspector().locator(".sp-slot-eyebrow"));
    const rowHit = await hitAt(page.getByRole("toolbar", { name: "Map controls" }).getByRole("searchbox"));
    const problems = [];
    if (tipState && !(tipState.display === "none" || tipState.visibility === "hidden" || tipState.opacity === "0")) problems.push(`tooltip painted: ${JSON.stringify(tipState)}`);
    if (tipState && tipHit && !isOverlayHit(tipHit)) problems.push(`hit at the tooltip's point → ${tipHit}`);
    if (!isOverlayHit(markerHit)) problems.push(`hit at the hovered marker → ${markerHit}`);
    if (!isOverlayHit(slotHit)) problems.push(`hit at the slot eyebrow → ${slotHit}`);
    if (!isOverlayHit(rowHit)) problems.push(`hit at the control row → ${rowHit}`);
    const file = await shot(`08-stacking-${T}`);
    await escape();
    rec("08-stacking", T, problems.length === 0, { tipState, tipHit, markerHit, slotHit, rowHit }, problems.join("; "), [file]);
  });

  // 09 · Brand line — the primaries collected this theme; no IBM blue in the app's own code.
  await step("09-brand", async () => {
    const mine = brand.filter(b => b.theme === T);
    const problems = [];
    for (const b of mine) {
      const danger = /vacate|delete|discard/.test(b.dialog);
      if (b.bg !== (danger ? RED_60 : TERRACOTTA)) problems.push(`${b.dialog} bg ${b.bg}`);
      if (b.color !== WHITE) problems.push(`${b.dialog} label ${b.color}`);
    }
    const blue = execSync("grep -rli 0f62fe app components lib || true", { cwd: repoRoot }).toString().trim().split("\n").filter(Boolean);
    if (!(blue.length === 1 && /carbon-tokens\.css$/.test(blue[0]))) problems.push(`0f62fe in ${blue.join(", ")}`);
    rec("09-brand", T, problems.length === 0, { primaries: mine, blueFiles: blue }, problems.join("; ") || `${mine.length} primaries; 0f62fe only in ${blue[0]}`);
  });
}

await page.evaluate(() => localStorage.removeItem("sp-theme"));
await db("seats?seat_key=eq.R99", { method: "DELETE" }).catch(() => {});
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} records pass`);
const failedByPath = failedResponses.reduce((acc, line) => { acc[line] = (acc[line] || 0) + 1; return acc; }, {});
console.log(`failed responses: ${JSON.stringify(failedByPath)}`);
const otherErrors = errors.filter(e => !/speed-insights|Failed to load resource/.test(e));
console.log(`console/page errors: ${errors.length} (${errors.length - otherErrors.length} the Speed Insights script under a local next start; ${otherErrors.length} other)`);
for (const e of otherErrors.slice(0, 10)) console.log("  ", e.slice(0, 240));
writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ results, failedResponses: failedByPath, consoleErrors: errors.length, otherConsoleErrors: otherErrors }, null, 2) + "\n");
await browser.close();
process.exit(failed ? 1 : 0);
