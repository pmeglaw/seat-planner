// Phase 4 · PR 5b — the map's seven confirm dialogs on the asset modal (plan
// docs/redesign-v2/phase4/plans/phase4-pr5b-map-dialogs.md, §Verification).
// Drives each dialog on the LOCAL Docker stack in real Chrome at 1920×1080,
// light and dark; records computed values to results.json and captures each.
// Assertions are computed values, never isVisible: the modal's background
// (layer-02: rgb(255,255,255) light / rgb(57,57,57) dark), width 480, the
// 64px footer at 50/50 (25/25/50 on the inspector guard), the primary's
// background (--sp-button-primary terracotta, or --sp-button-danger red 60
// with a white label), the ruled role + a resolving aria-describedby, focus
// on the first control (Cancel), the overlay keeping focus + the dialog on a
// pointer, Esc ignored while the RPC is in flight (a delayed server-action
// route) and the error notification INSIDE the open dialog with focus in it
// (an aborted server-action route).
//
// Mutations on the stack (all local, all undone by the rig itself): one
// custom seat R99 is inserted through the service-role REST API and deleted
// FOR REAL through the Delete confirm at the end; one move is confirmed for
// real so Discard draft changes can open, then Discard everything runs for
// real to converge the draft again. Never run against production.
// Usage: node docs/redesign-v2/phase4/audit/pr5b-dialogs.mjs <baseUrl> <outDir> <adminEmail> <password> <supabaseUrl> <serviceRoleKey>
import { createRequire } from "node:module";
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

const shot = async name => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  return `${name}.png`;
};
const open = async theme => {
  await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
  await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
};
const escape = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
const clickSeat = id => page.locator(`button[data-seat-id="${id}"]`).dispatchEvent("click");
const inspector = () => page.locator("#seat-inspector-panel");
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  return el ? `${el.tagName.toLowerCase()}${el.getAttribute("role") ? "[" + el.getAttribute("role") + "]" : ""}:${(el.textContent || "").trim().slice(0, 40)}` : null;
});

// The open modal (either role) and its computed contract.
const modal = () => page.locator('[data-modal] .cds-modal');
async function readModal() {
  return modal().evaluate(el => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const footer = el.querySelector(".cds-modal-footer");
    const fr = footer.getBoundingClientRect();
    const buttons = [...footer.querySelectorAll(".cds-btn")].map(b => {
      const bs = getComputedStyle(b);
      const br = b.getBoundingClientRect();
      return { text: (b.textContent || "").trim(), cls: b.className, width: Math.round(br.width), height: Math.round(br.height), bg: bs.backgroundColor, color: bs.color, disabled: b.disabled, busy: b.getAttribute("aria-busy") };
    });
    const describedBy = el.getAttribute("aria-describedby");
    const description = describedBy ? document.getElementById(describedBy) : null;
    const overlay = el.closest(".cds-modal-overlay");
    const os = overlay ? getComputedStyle(overlay) : null;
    return {
      role: el.getAttribute("role"),
      labelledBy: el.getAttribute("aria-labelledby"),
      heading: (el.querySelector("h2")?.textContent || "").trim(),
      describedBy,
      descriptionInside: Boolean(description && el.contains(description) && description.textContent.trim()),
      bg: s.backgroundColor,
      width: Math.round(r.width),
      radius: s.borderTopLeftRadius,
      footerHeight: Math.round(fr.height),
      footerClass: footer.className,
      buttons,
      overlayZ: os ? os.zIndex : null,
      closeButtons: el.querySelectorAll('button[aria-label^="Cancel "], button[aria-label^="Close"]').length,
      alert: (() => {
        const a = el.querySelector('[role="alert"]');
        return a ? { cls: a.className, text: (a.textContent || "").trim().slice(0, 160), focused: document.activeElement === a } : null;
      })()
    };
  });
}
function checkModal(m, theme, { role, primary, danger, columns = 2, heading }) {
  const problems = [];
  if (m.role !== role) problems.push(`role ${m.role} ≠ ${role}`);
  if (!m.descriptionInside) problems.push("aria-describedby does not resolve inside the dialog");
  if (m.bg !== LAYER_02[theme]) problems.push(`bg ${m.bg} ≠ layer-02 ${LAYER_02[theme]}`);
  if (m.width !== 480) problems.push(`width ${m.width} ≠ 480`);
  if (m.radius !== "0px") problems.push(`radius ${m.radius}`);
  if (m.footerHeight !== 64) problems.push(`footer ${m.footerHeight} ≠ 64`);
  if (m.buttons.length !== columns) problems.push(`${m.buttons.length} footer buttons ≠ ${columns}`);
  const widths = m.buttons.map(b => b.width);
  if (columns === 2 && Math.abs(widths[0] - widths[1]) > 1) problems.push(`footer not 50/50: ${widths.join("/")}`);
  if (columns === 3 && !(Math.abs(widths[0] - widths[1]) <= 1 && Math.abs(widths[2] - 2 * widths[0]) <= 2)) problems.push(`footer not 25/25/50: ${widths.join("/")}`);
  if (m.buttons.some(b => b.height !== 64)) problems.push(`button heights ${m.buttons.map(b => b.height).join("/")}`);
  const last = m.buttons[m.buttons.length - 1];
  if (last.text !== primary) problems.push(`primary label "${last.text}" ≠ "${primary}"`);
  if (last.bg !== (danger ? RED_60 : TERRACOTTA)) problems.push(`primary bg ${last.bg} ≠ ${danger ? "red 60" : "terracotta"}`);
  if (last.color !== WHITE) problems.push(`primary label colour ${last.color} ≠ white`);
  if (!m.buttons[0].cls.includes("cds-btn--secondary")) problems.push("first footer button is not the secondary");
  if (m.closeButtons !== 0) problems.push(`${m.closeButtons} × / Cancel-labelled icon buttons present`);
  if (m.overlayZ !== "8500") problems.push(`overlay z ${m.overlayZ} ≠ 8500`);
  if (heading && !heading.test(m.heading)) problems.push(`heading "${m.heading}" ≠ ${heading}`);
  return problems;
}
// Focus on open must be the first control; a pointer on the overlay keeps the
// dialog open and focus inside it (mousedown cancelled).
async function checkFocusAndOverlay() {
  const problems = [];
  const first = await active();
  if (!/^button:/.test(first || "")) problems.push(`initial focus ${first} is not a button`);
  const firstLabel = (await modal().locator(".cds-modal-footer .cds-btn").first().textContent()).trim();
  if (!(first || "").endsWith(firstLabel)) problems.push(`initial focus ${first} ≠ the first footer button "${firstLabel}"`);
  await page.mouse.click(40, 540);
  await page.waitForTimeout(200);
  const stillOpen = await modal().count();
  const after = await active();
  const inside = await page.evaluate(() => Boolean(document.querySelector("[data-modal] .cds-modal")?.contains(document.activeElement)));
  if (!stillOpen) problems.push("a pointer on the overlay closed the dialog");
  if (!inside) problems.push(`a pointer on the overlay moved focus to ${after}`);
  return { problems, first, after };
}

// A server-action route double: delay (Esc-while-busy) or abort (in-dialog error).
const isAction = req => req.method() === "POST" && Boolean(req.headers()["next-action"]);
async function withActionRoute(mode, fn) {
  const handler = async route => {
    if (!isAction(route.request())) return route.continue();
    if (mode === "delay") { await new Promise(r => setTimeout(r, 2500)); return route.continue(); }
    return route.abort("failed");
  };
  await page.route("**/*", handler);
  try { return await fn(); } finally { await page.unroute("**/*", handler); }
}

// ---------------------------------------------------------------------------
// Seed facts (the local seed): an assigned seat + an open seat in its zone,
// a second assigned seat (the Swap-them arm), and a throwaway custom seat.
// ---------------------------------------------------------------------------
await db("seats?seat_key=eq.R99", { method: "DELETE" });
const [assigned] = await db("seats?layer=eq.draft&status=eq.assigned&select=id,label,zone,floor,x,y,employee_id&order=label&limit=1");
const [[assignedEmployee], [otherAssigned], [openSeat]] = await Promise.all([
  db(`employees?id=eq.${assigned.employee_id}&select=full_name`),
  // The seed assigns one seat per zone — the Swap-them arm's target is any other assigned seat on the same floor.
  db(`seats?layer=eq.draft&status=eq.assigned&floor=eq.${assigned.floor}&id=neq.${assigned.id}&select=id,label,employee_id&order=label&limit=1`),
  db(`seats?layer=eq.draft&status=eq.available&zone=eq.${encodeURIComponent(assigned.zone)}&select=id,label&order=label&limit=1`)
]);
const insertR99 = async () => (await db("seats", { method: "POST", body: JSON.stringify({ seat_key: "R99", label: "R99", x: Math.min(0.98, assigned.x + 0.015), y: Math.min(0.98, assigned.y + 0.015), status: "available", layer: "draft", zone: assigned.zone, is_custom: true }) }))[0];
const [[otherEmployee], r99First] = await Promise.all([db(`employees?id=eq.${otherAssigned.employee_id}&select=full_name`), insertR99()]);
// Discard everything (step 7) resets the draft to published, which erases the draft-only custom seat — re-inserted after each discard.
let r99 = r99First;
console.log(`seed: ${assigned.label} (${assignedEmployee.full_name}) · ${otherAssigned.label} (${otherEmployee.full_name}) · open ${openSeat.label} · custom R99`);

const themes = ["light", "dark"];
for (const theme of themes) {
  const T = theme;
  const step = async (name, fn) => {
    try { await fn(); } catch (e) {
      const file = await shot(`${name}-crash-${T}`).catch(() => null);
      rec(name, T, false, { focus: await active().catch(() => null) }, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, file ? [file] : []);
      await escape(); await escape();
    }
  };

  // 1 · Vacate — plus Esc-while-busy (delayed route) and the in-dialog error (aborted route).
  await step("01-vacate", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Vacate ${assigned.label}` }).click();
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Vacate seat", danger: true, heading: /^Vacate / });
    const focus = await checkFocusAndOverlay();
    problems.push(...focus.problems);
    const file = await shot(`01-vacate-${T}`);
    rec("01-vacate", T, problems.length === 0, { ...m, focus }, problems.join("; "), [file]);

    // Esc while busy: the RPC is held 2.5s; Esc at 600ms must not close the dialog.
    const busy = await withActionRoute("delay", async () => {
      await modal().getByRole("button", { name: "Vacate seat" }).click();
      await page.waitForTimeout(600);
      const mid = await readModal().catch(() => null);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const stillOpen = await modal().count();
      const file = await shot(`01-vacate-busy-esc-${T}`);
      await page.waitForTimeout(2600);
      return { mid, stillOpen, file };
    });
    // The delayed vacate then SUCCEEDS on the stack: re-assign the seat through REST so the next steps see it occupied.
    await page.waitForTimeout(800);
    const afterBusy = await modal().count();
    const busyProblems = [];
    if (!busy.mid) busyProblems.push("no modal read mid-flight");
    else {
      const p = busy.mid.buttons.find(b => b.text === "Vacating…");
      if (!p) busyProblems.push(`no "Vacating…" primary mid-flight (${busy.mid.buttons.map(b => b.text).join("/")})`);
      else if (!p.disabled || p.busy !== "true") busyProblems.push("Vacating… primary is not disabled + aria-busy");
      if (!busy.mid.buttons[0].disabled) busyProblems.push("Cancel enabled mid-flight");
    }
    if (!busy.stillOpen) busyProblems.push("Esc closed the dialog mid-flight");
    if (afterBusy) busyProblems.push("the dialog did not close once the vacate resolved");
    rec("01b-vacate-esc-while-busy", T, busyProblems.length === 0, busy, busyProblems.join("; "), [busy.file]);
    await db(`seats?id=eq.${assigned.id}`, { method: "PATCH", body: JSON.stringify({ employee_id: assigned.employee_id, status: "assigned" }) });

    // In-dialog error: the action request is aborted → the thrown path renders inside the open dialog with focus.
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
    const errProblems = [];
    if (!err.alert) errProblems.push("no alert inside the dialog");
    else {
      if (!/cds-notification--error/.test(err.alert.cls)) errProblems.push(`alert class ${err.alert.cls}`);
      if (!/^Vacate did not complete\./.test(err.alert.text)) errProblems.push(`alert text "${err.alert.text}"`);
      if (!err.alert.focused) errProblems.push("focus is not in the alert");
    }
    const retry = err.buttons.find(b => b.text === "Retry vacate");
    if (!retry) errProblems.push(`no Retry vacate (${err.buttons.map(b => b.text).join("/")})`);
    else if (retry.disabled) errProblems.push("Retry vacate disabled");
    const file2 = await shot(`01-vacate-error-${T}`);
    rec("01c-vacate-error-in-dialog", T, errProblems.length === 0, err, errProblems.join("; "), [file2]);
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(300);
  });

  // 2 · Delete custom seat (R99) — Cancel here; the real delete is the last step of the dark pass.
  await step("02-delete-seat", async () => {
    await open(T);
    await clickSeat(r99.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: "Delete custom seat R99" }).click();
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Delete seat", danger: true, heading: /^Delete custom seat R99\?$/ });
    const bodyErrorBlocks = await modal().locator('.cds-modal-body [role="alert"], .cds-modal-body .cds-notification').count();
    if (bodyErrorBlocks) problems.push("the scope line renders as an error block");
    const focus = await checkFocusAndOverlay();
    problems.push(...focus.problems);
    const file = await shot(`02-delete-seat-${T}`);
    rec("02-delete-seat", T, problems.length === 0, { ...m, focus }, problems.join("; "), [file]);
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(300);
    const closed = (await modal().count()) === 0;
    const focusBack = await active();
    // The opener: the inspector's danger ghost (text "Delete seat", aria-label "Delete custom seat R99").
    rec("02b-delete-cancel-restores-focus", T, closed && focusBack === "button:Delete seat", { closed, focusBack }, closed ? "" : "Cancel did not close");
  });

  // 3 · Swap (Cancel keeps the mode armed; Esc exits it).
  await step("03-swap", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Swap ${assigned.label}` }).click();
    await clickSeat(openSeat.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Confirm swap", danger: false, heading: /^Confirm seat swap$/ });
    const items = await modal().locator(".cds-modal-body ul li").allTextContents();
    if (items.length !== 2 || !/^Source:/.test(items[0].trim()) || !/^Target:/.test(items[1].trim())) problems.push(`list ${JSON.stringify(items)}`);
    const summary = await modal().locator(".cds-modal-body p").last().textContent();
    if (!/↔/.test(summary)) problems.push("no swap summary line");
    const focus = await checkFocusAndOverlay();
    problems.push(...focus.problems);
    const file = await shot(`03-swap-${T}`);
    rec("03-swap", T, problems.length === 0, { ...m, items, focus }, problems.join("; "), [file]);
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    await escape();
  });

  // 4 · Move (open target) → Cancel; then the Swap-them arm (assigned target) → Cancel.
  await step("04-move", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Move ${assignedEmployee.full_name} to another seat` }).click();
    await clickSeat(openSeat.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Move them", danger: false, heading: new RegExp(`^Move .* to ${openSeat.label}\\?$`) });
    const focus = await checkFocusAndOverlay();
    problems.push(...focus.problems);
    const file = await shot(`04-move-${T}`);
    rec("04-move", T, problems.length === 0, { ...m, focus }, problems.join("; "), [file]);
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    // Same armed mode: an ASSIGNED target offers the swap arm.
    await clickSeat(otherAssigned.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m2 = await readModal();
    const problems2 = checkModal(m2, T, { role: "alertdialog", primary: "Swap them", danger: false, heading: /^Swap .* and .*\?$/ });
    const file2 = await shot(`04-move-swap-arm-${T}`);
    rec("04b-move-swap-them", T, problems2.length === 0, m2, problems2.join("; "), [file2]);
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    await escape();
  });

  // 5 · Inspector guard: dirty the notes, select another seat → the three-button dialog (Keep editing · Discard · Save changes).
  await step("05-inspector-guard", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await inspector().locator("textarea").fill("pr5b rig — never saved");
    await inspector().getByRole("button", { name: /^Save draft changes/ }).waitFor();
    await clickSeat(openSeat.id);
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "dialog", primary: "Save changes", danger: false, columns: 3, heading: /^Unsaved seat edits$/ });
    if (!/sp-modal-footer--3/.test(m.footerClass)) problems.push(`footer class ${m.footerClass}`);
    if (m.buttons[0].text !== "Keep editing" || m.buttons[1].text !== "Discard") problems.push(`secondaries ${m.buttons.map(b => b.text).join("/")}`);
    if (!m.buttons[1].cls.includes("cds-btn--secondary")) problems.push("Discard is not secondary weight");
    const focus = await checkFocusAndOverlay();
    problems.push(...focus.problems);
    const file = await shot(`05-inspector-guard-${T}`);
    rec("05-inspector-guard", T, problems.length === 0, { ...m, focus }, problems.join("; "), [file]);
    // Esc = Keep editing (the dialog closes, the edit survives).
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const kept = (await modal().count()) === 0 && (await inspector().locator("textarea").inputValue()) === "pr5b rig — never saved";
    rec("05b-guard-esc-keeps-editing", T, kept, { kept });
    await clickSeat(openSeat.id);
    await modal().waitFor();
    await modal().getByRole("button", { name: "Discard", exact: true }).click();
    await page.waitForTimeout(400);
  });

  // 6 · Move-conflict from the inspector: assign an already-seated person to the open seat.
  await step("06-move-conflict", async () => {
    await open(T);
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
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Move them", danger: false, heading: new RegExp(`^Move .* to ${openSeat.label}\\?$`) });
    const focus = await checkFocusAndOverlay();
    const file = await shot(`06-move-conflict-${T}`);
    rec("06-move-conflict", T, problems.length === 0, { ...m, overlay: { after: focus.after } }, problems.join("; "), [file]);
    // Recorded apart: this dialog mounts INSIDE the rejected assignment's still-running transition, so its
    // footer is disabled at mount and useDialogFocus falls back to the container; when the transition
    // settles the buttons enable but focus stays on the section (a finding, PHASE4BUILD §1.47 — not a 5b
    // regression: the pre-5b markup used the same hook).
    rec("06b-move-conflict-initial-focus", T, focus.problems.length === 0, { first: focus.first, after: focus.after }, focus.problems.join("; "));
    await modal().getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /^Cancel editing/ }).click().catch(() => {});
    await page.waitForTimeout(300);
  });

  // 7 · Discard draft: a real move first (draft diverges), then the confirm → Keep draft changes; then Discard everything FOR REAL.
  await step("07-discard-draft", async () => {
    await open(T);
    await clickSeat(assigned.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: `Move ${assignedEmployee.full_name} to another seat` }).click();
    await clickSeat(openSeat.id);
    await modal().waitFor();
    await modal().getByRole("button", { name: "Move them" }).click();
    await page.waitForFunction(() => !document.querySelector("[data-modal]"), null, { timeout: 15000 });
    await escape();
    await page.getByRole("button", { name: /^Publish \d+ change/ }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Discard draft changes" }).click();
    await modal().waitFor();
    await page.waitForTimeout(300);
    const m = await readModal();
    const problems = checkModal(m, T, { role: "alertdialog", primary: "Discard everything", danger: true, heading: /^Discard all draft changes\?$/ });
    if (m.buttons[0].text !== "Keep draft changes") problems.push(`secondary "${m.buttons[0].text}"`);
    const focus = await checkFocusAndOverlay();
    problems.push(...focus.problems);
    const file = await shot(`07-discard-draft-${T}`);
    rec("07-discard-draft", T, problems.length === 0, { ...m, focus }, problems.join("; "), [file]);
    await modal().getByRole("button", { name: "Keep draft changes" }).click();
    await page.waitForTimeout(300);
    // Discard for real (local stack): the draft converges again for the next pass / the e2e tier.
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Discard draft changes" }).click();
    await modal().waitFor();
    await modal().getByRole("button", { name: "Discard everything" }).click();
    await page.waitForFunction(() => !document.querySelector("[data-modal]"), null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const converged = (await db(`seats?layer=eq.draft&id=eq.${assigned.id}&select=employee_id`))[0].employee_id === assigned.employee_id;
    const r99Erased = (await db("seats?seat_key=eq.R99&select=id")).length === 0;
    rec("07b-discard-for-real-converges", T, converged && r99Erased, { converged, r99Erased }, r99Erased ? "the draft-only custom seat R99 went with the discard (draft = published again)" : "R99 survived the discard");
    r99 = await insertR99();
  });
}

// Last: Delete R99 FOR REAL through the confirm (the seatProtection path on the stack), dark theme.
await (async () => {
  try {
    await open("dark");
    await clickSeat(r99.id);
    await inspector().waitFor();
    await page.getByRole("button", { name: "Delete custom seat R99" }).click();
    await modal().waitFor();
    await modal().getByRole("button", { name: "Delete seat" }).click();
    await page.waitForFunction(() => !document.querySelector("[data-modal]"), null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const gone = (await db("seats?seat_key=eq.R99&select=id")).length === 0;
    const marker = await page.locator(`button[data-seat-id="${r99.id}"]`).count();
    rec("08-delete-r99-for-real", "dark", gone && marker === 0, { gone, marker });
  } catch (e) {
    rec("08-delete-r99-for-real", "dark", false, {}, `crash: ${String(e).split("\n")[0].slice(0, 220)}`);
    await db("seats?seat_key=eq.R99", { method: "DELETE" }).catch(() => {});
  }
})();

await page.evaluate(() => localStorage.removeItem("sp-theme"));
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed}/${results.length} records pass`);
console.log(`console/page errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  ", e.slice(0, 200));
await browser.close();
process.exit(failed ? 1 : 0);
