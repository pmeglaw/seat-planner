// Phase 4 · PR 4 read-only preview walk (2026-09-05). Drives the Vercel branch preview of PR 4 in real
// Chrome at 1920×1080 light + dark and 1280 light, opening every dialog and closing it with Esc / Cancel
// only. ZERO WRITES BY CONSTRUCTION: the rig never fills a field, never picks a file, never presses Save /
// Add / Rename-commit / Delete / Deactivate / Import / Restore / Publish / Discard. The preview reads and
// writes the PRODUCTION database, so every Next-Action POST the browser sends is logged to results.json as
// evidence, and the header indicator is compared before and after (it must read the same).
// Usage: node docs/redesign-v2/phase4/audit/pr4-preview-walk.mjs <baseUrl> <shareUrl> <outDir> <email> <password>
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const [base, share, outDir = "out", email, password] = process.argv.slice(2);
if (!base || !share || !email || !password) {
  console.error("usage: <baseUrl> <shareUrl> <outDir> <email> <password>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const results = [];
const actionPosts = [];
const rec = (step, frame, ok, values = {}, note = "", files = []) => {
  results.push({ step, frame, ok, values, note, files });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} (${frame})${note ? " — " + note : ""}`);
  if (!ok) console.log("  values:", JSON.stringify(values).slice(0, 1500));
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ results, actionPosts }, null, 2) + "\n");
};
const IBM_BLUES = ["rgb(15, 98, 254)", "rgb(3, 83, 233)", "rgb(0, 67, 206)", "rgb(69, 137, 255)", "rgb(120, 169, 255)", "rgb(166, 200, 255)"];

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
// People-data mask (owner ruling 2026-09-05: the repo is public, the preview shows the live directory):
// name / position / extension cells and the panel's people fields render as a soft smudge in every capture.
// Text fill only — layout, borders, focus rings and every measured colour stay exact (the seat link is not masked).
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.id = "walk-mask";
    style.textContent = "[data-directory-row] td:nth-child(1), [data-directory-row] td:nth-child(3), [data-directory-row] td:nth-child(4), .cds-side-panel input:not([role='combobox']), .cds-side-panel .sp-block-reason { -webkit-text-fill-color: transparent !important; text-shadow: 0 0 9px rgba(128, 128, 128, 0.9) !important; }";
    document.head.appendChild(style);
  });
});
const page = await context.newPage();
let consoleErrors = [];
page.on("pageerror", e => consoleErrors.push(String(e)));
page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("request", req => {
  if (req.method() === "POST" && req.headers()["next-action"]) {
    actionPosts.push({ at: new Date().toISOString(), path: new URL(req.url()).pathname, body: (req.postData() || "").slice(0, 160) });
  }
});

const shot = async (name, clip) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false, ...(clip ? { clip } : {}) });
  return `${name}.png`;
};
const clipOf = async (locator, pad = 8, extra = {}) => {
  const b = await locator.boundingBox();
  const vp = page.viewportSize();
  const x = Math.max(0, b.x - pad - (extra.left || 0));
  const y = Math.max(0, b.y - pad - (extra.top || 0));
  return { x, y, width: Math.min(vp.width - x, b.width + 2 * pad + (extra.left || 0) + (extra.right || 0)), height: Math.min(vp.height - y, b.height + 2 * pad + (extra.top || 0) + (extra.bottom || 0)) };
};
const open = async (route, theme, width, height) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
};
const css = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  return el ? { tag: el.tagName.toLowerCase(), label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || "", id: el.id, inPanel: !!el.closest(".cds-side-panel") } : null;
});
const indicator = () => page.locator("#shell-header .sp-mode").textContent().then(t => t?.trim());
const themeAttr = () => page.evaluate(() => document.documentElement.getAttribute("data-carbon-theme"));
const dialogs = () => page.locator("[role='dialog'],[role='alertdialog']").count();
const blueScan = () => page.evaluate(blues => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    for (const p of ["color", "backgroundColor", "borderColor", "outlineColor", "boxShadow"]) {
      if (blues.some(b => s[p].includes(b))) out.push(`${el.tagName.toLowerCase()}.${(typeof el.className === "string" ? el.className : "").split(" ")[0]} ${p}=${s[p]}`);
    }
  }
  return out;
}, IBM_BLUES);
const panel = () => page.getByRole("dialog", { name: /employee$/ });
// "Visible" for a tooltip is a hit test — a clipped box still reports visibility: visible (the first walk).
const tip = row => row.locator(".sp-has-tooltip").evaluate(host => {
  const el = host.querySelector(".sp-tooltip"); const button = host.querySelector("button");
  const r = el.getBoundingClientRect(); const b = button.getBoundingClientRect();
  const prev = el.style.pointerEvents; el.style.pointerEvents = "auto"; // the tooltip is pointer-events: none
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  el.style.pointerEvents = prev;
  return { text: el.textContent, painted: !!hit && (hit === el || el.contains(hit)), inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, above: r.bottom <= b.top, below: r.top >= b.bottom, right: Math.round(r.right), placement: host.getAttribute("data-tooltip-placement") };
});
const step = async (name, frame, fn) => {
  try { await fn(); } catch (e) {
    const file = await shot(`${name.split(" ")[0]}-crash-${frame}`).catch(() => null);
    rec(name, frame, false, { dialogs: await dialogs().catch(() => null), focus: await active().catch(() => null) }, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, file ? [file] : []);
    for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(200); }
    const cancel = page.locator("[role='dialog'] .cds-btn--secondary, [role='alertdialog'] .cds-btn--secondary").last();
    if (await cancel.count()) await cancel.click().catch(() => {});
  }
};

// Sign in once (the share link sets the Vercel Authentication cookie first).
await page.goto(share, { waitUntil: "networkidle" });
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.getByRole("button", { name: "Log in", exact: true }).click();
await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });

const FRAMES = [
  { tag: "light", theme: "light", w: 1920, h: 1080 },
  { tag: "dark", theme: "dark", w: 1920, h: 1080 },
  { tag: "1280-light", theme: "light", w: 1280, h: 800 }
];
let indicatorAtStart = null;

for (const F of FRAMES) {
  const T = F.tag;
  consoleErrors = [];
  await open("/admin/management", F.theme, F.w, F.h);
  await page.locator("[data-directory-row]").first().waitFor();
  const postsAtFrameStart = actionPosts.length;

  // ---------------------------------------------------------------- 1 Management at rest, hover, tooltip, tab focus
  await step("1 Management at rest", T, async () => {
    const files = [await shot(`01-management-rest-${T}`)];
    const theme = await themeAttr();
    const ind = await indicator();
    if (indicatorAtStart === null) indicatorAtStart = ind;
    const primary = page.locator(".sp-page .cds-page-header .cds-btn--primary");
    const primaryCount = await primary.count();
    const primaryText = await primary.first().textContent();
    const primaryBg = await css(primary.first(), "backgroundColor");
    await primary.first().hover();
    await page.waitForTimeout(250);
    const primaryHover = await css(primary.first(), "backgroundColor");
    await page.mouse.move(F.w / 2, F.h - 40);
    await page.waitForTimeout(250);
    const tabs = await page.locator('nav[aria-label="Management sections"] [role="tab"]').allTextContents();
    const selectedBar = await css(page.getByRole("tab", { name: "Employees" }), "boxShadow");
    const stripH = await page.locator(".sp-tabs").evaluate(el => Math.round(el.getBoundingClientRect().height));
    const rows = await page.locator("[data-directory-row]").count();
    const count = await page.locator(".cds-toolbar-count").textContent();
    // Row with a seat: hover the row away from the link.
    const seatRow = page.locator("[data-directory-row]").filter({ has: page.locator("a.sp-seat-link") }).first();
    const seatLabel = (await seatRow.locator("a.sp-seat-link").textContent())?.trim();
    const linkRest = await css(seatRow.locator("a.sp-seat-link"), "color");
    const rowRestBg = await css(seatRow, "backgroundColor");
    const box = await seatRow.boundingBox();
    await page.mouse.move(box.x + 300, box.y + box.height / 2);
    await page.waitForTimeout(300);
    const rowHoverBg = await css(seatRow, "backgroundColor");
    const linkHover = await css(seatRow.locator("a.sp-seat-link"), "color");
    files.push(await shot(`01-row-hover-${T}`, await clipOf(seatRow, 4)));
    await page.mouse.move(F.w / 2, F.h - 40);
    // Edit tooltip on keyboard focus.
    const edit = seatRow.locator('button[aria-label^="Edit "]');
    const editLabel = await edit.getAttribute("aria-label");
    await edit.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    const tipFocus = await tip(seatRow);
    files.push(await shot(`01-edit-tooltip-focus-${T}`, await clipOf(edit, 8, { left: 300, top: 40, bottom: 40 })));
    const focusOnEdit = await active();
    // The last row (amendment D): scroll the pane to the end, focus its Edit — the tooltip flips above.
    await page.evaluate(() => { const r = document.querySelector('[role="region"][aria-label="Management"]'); if (r) r.scrollTop = r.scrollHeight; else window.scrollTo(0, document.body.scrollHeight); });
    await page.waitForTimeout(600);
    const lastRow = page.locator("[data-directory-row]").last();
    await lastRow.scrollIntoViewIfNeeded();
    const lastVindex = await lastRow.getAttribute("data-vindex");
    const lastEdit = lastRow.locator('button[aria-label^="Edit "]');
    await lastEdit.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    const tipLast = await tip(lastRow);
    files.push(await shot(`01-edit-tooltip-focus-last-${T}`, await clipOf(lastEdit, 8, { left: 300, top: 40, bottom: 40 })));
    await page.evaluate(() => { document.activeElement?.blur(); const r = document.querySelector('[role="region"][aria-label="Management"]'); if (r) r.scrollTop = 0; else window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    // Employees tab focused.
    await page.getByRole("tab", { name: "Employees" }).focus();
    await page.waitForTimeout(200);
    const ring = await page.getByRole("tab", { name: "Employees" }).evaluate(el => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} offset ${s.outlineOffset}`; });
    files.push(await shot(`01-tab-focus-${T}`, await clipOf(page.locator(".sp-tabs"), 8)));
    await page.evaluate(() => document.activeElement?.blur());
    const blues = await blueScan();
    const ok = primaryCount === 1 && primaryText === "Add employee" && primaryBg === "rgb(184, 92, 46)" && primaryHover === "rgb(143, 69, 33)" && tabs.join("·") === "Employees·Departments·Zones" && selectedBar.includes("rgb(184, 92, 46)") && /inset/.test(selectedBar) && stripH === 40 && /^Draft — /.test(ind || "") && rowHoverBg !== rowRestBg && linkHover !== linkRest && tipFocus.painted && tipFocus.inViewport && tipFocus.below && tipFocus.text === "Edit" && focusOnEdit?.label === editLabel && tipLast.painted && tipLast.inViewport && tipLast.above && tipLast.placement === "above" && ring.startsWith("solid 2px rgb(184, 92, 46)") && blues.length === 0;
    rec("1 Management at rest", T, ok, { theme, indicator: ind, primaryBg, primaryHover, tabs, selectedBar, stripH, rows, count, seatLabel, linkRest, linkHover, rowRestBg, rowHoverBg, tipFocus, tipLast, lastVindex, focusOnEdit, ring, blues }, "", files);
  });

  // ---------------------------------------------------------------- 2 Edit panel + combobox list, closed by Esc
  await step("2 Edit panel and combobox", T, async () => {
    const seatRow = page.locator("[data-directory-row]").filter({ has: page.locator("a.sp-seat-link") }).first();
    const edit = seatRow.locator('button[aria-label^="Edit "]');
    const editLabel = await edit.getAttribute("aria-label");
    await edit.click();
    const dlg = panel();
    await dlg.waitFor();
    await page.waitForTimeout(400);
    const width = await dlg.evaluate(el => Math.round(el.getBoundingClientRect().width));
    const bg = await css(dlg, "backgroundColor");
    const titleText = await page.locator(`#${await dlg.getAttribute("aria-labelledby")}`).textContent();
    const closeX = await dlg.getByRole("button", { name: /close/i }).count();
    const focus = await active();
    const fact = (await dlg.locator(".sp-fact-row").textContent().catch(() => ""))?.replace(/\s+/g, " ").trim();
    const footer = await dlg.locator(".cds-side-panel-footer .cds-btn").evaluateAll(els => els.map(el => ({ text: el.textContent, cls: el.className.match(/cds-btn--(primary|secondary|ghost)/)?.[1], w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) })));
    const danger = await dlg.getByRole("button", { name: "Deactivate…" }).getAttribute("class");
    const files = [await shot(`02-panel-edit-${T}`)];
    // Open the department list by focusing the combobox (no typing).
    const combo = dlg.locator(".sp-combobox input[role='combobox']");
    await combo.focus();
    await page.waitForTimeout(300);
    const expanded = await combo.getAttribute("aria-expanded");
    const options = await dlg.locator(".sp-listbox [role='option']").count();
    const listBg = await css(dlg.locator(".sp-listbox"), "backgroundColor").catch(() => null);
    files.push(await shot(`02-panel-combobox-${T}`));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const expandedAfterEsc = await combo.getAttribute("aria-expanded").catch(() => "gone");
    const panelAfterListEsc = await dlg.count();
    if (panelAfterListEsc) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
    const ask = await page.getByRole("alertdialog").count();
    const left = await dialogs();
    const focusBack = await active();
    const ok = width === 480 && titleText === "Edit employee" && closeX === 0 && focus?.id === "management-employee-name" && footer.length === 2 && footer[0].text === "Cancel" && footer[0].cls === "secondary" && footer[1].text === "Save employee" && footer[1].cls === "primary" && footer[0].w === footer[1].w && /danger-ghost/.test(danger || "") && expanded === "true" && options > 0 && expandedAfterEsc !== "true" && ask === 0 && left === 0 && focusBack?.label === editLabel;
    rec("2 Edit panel and combobox", T, ok, { width, bg, titleText, closeX, focus, fact, footer, danger, expanded, options, listBg, expandedAfterEsc, panelAfterListEsc, ask, dialogsLeft: left, focusBack }, "", files);
  });

  // ---------------------------------------------------------------- 3 Departments / Zones lists, rename field, overflow, create modal
  await step("3 Departments and zones", T, async () => {
    const postsBefore = actionPosts.length;
    await page.getByRole("tab", { name: "Departments" }).click();
    await page.waitForTimeout(500);
    const primaryText = await page.locator(".sp-page .cds-page-header .cds-btn--primary").textContent();
    const files = [await shot(`03-departments-rest-${T}`)];
    const rows = page.locator(".sp-list-row");
    const rowCount = await rows.count();
    const rowH = rowCount ? await rows.first().evaluate(el => Math.round(el.getBoundingClientRect().height)) : null;
    const first = rows.first();
    const name = (await first.locator(".sp-list-name").textContent())?.trim();
    // Rename: field + Save · Cancel, then Esc restores the label. No commit.
    await first.getByRole("button", { name: "Rename" }).click();
    await page.waitForTimeout(300);
    const field = page.getByLabel("Department name");
    const value = await field.inputValue();
    const selected = await field.evaluate(el => el.selectionStart === 0 && el.selectionEnd === el.value.length);
    const editBtns = await page.locator(".sp-list-row--editing .cds-btn").evaluateAll(els => els.map(el => ({ text: el.textContent, cls: el.className.match(/cds-btn--(primary|secondary|ghost)/)?.[1], h: Math.round(el.getBoundingClientRect().height), disabled: el.disabled })));
    files.push(await shot(`03-rename-editing-${T}`, await clipOf(page.locator(".sp-list-row--editing"), 8)));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const editingLeft = await page.locator(".sp-list-row--editing").count();
    const restored = (await rows.first().locator(".sp-list-name").textContent())?.trim();
    // Overflow menu → Esc.
    await first.getByRole("button", { name: /^More actions for/ }).click();
    await page.waitForTimeout(250);
    const items = await page.getByRole("menuitem").evaluateAll(els => els.map(el => ({ text: el.textContent, label: el.getAttribute("aria-label"), cls: el.className })));
    files.push(await shot(`03-overflow-${T}`, await clipOf(first, 8, { bottom: 80 })));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const menuLeft = await page.getByRole("menuitem").count();
    // Zones at rest.
    await page.getByRole("tab", { name: "Zones" }).click();
    await page.waitForTimeout(500);
    const zonePrimary = await page.locator(".sp-page .cds-page-header .cds-btn--primary").textContent();
    const zoneRows = await page.locator(".sp-list-row").count();
    files.push(await shot(`03-zones-rest-${T}`));
    // Add department modal → Cancel.
    await page.getByRole("tab", { name: "Departments" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Add department", exact: true }).first().click();
    const modal = page.getByRole("dialog", { name: "Add department" });
    await modal.waitFor();
    await page.waitForTimeout(300);
    const modalFooter = await modal.locator(".cds-modal-footer .cds-btn").evaluateAll(els => els.map(el => ({ text: el.textContent, cls: el.className.match(/cds-btn--(primary|secondary|ghost)/)?.[1], w: Math.round(el.getBoundingClientRect().width), disabled: el.disabled })));
    const modalFocus = await active();
    files.push(await shot(`03-create-modal-${T}`));
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForTimeout(300);
    const modalLeft = await modal.count();
    const posts = actionPosts.slice(postsBefore).map(p => p.body.slice(0, 80));
    await page.getByRole("tab", { name: "Employees" }).click();
    await page.waitForTimeout(400);
    const ok = primaryText === "Add department" && rowH === 48 && value === name && selected && editBtns[0]?.text === "Save" && editBtns[0]?.cls === "primary" && editBtns[0]?.disabled === true && editBtns[0]?.h === 40 && editBtns[1]?.text === "Cancel" && editBtns[1]?.cls === "ghost" && editingLeft === 0 && restored === name && items.length === 1 && items[0].text === "Delete" && items[0].label === `Delete ${name}` && menuLeft === 0 && zonePrimary === "Add zone" && modalFooter.length === 2 && modalFooter[0].text === "Cancel" && modalFooter[1].text === "Add department" && modalFooter[1].disabled === true && modalFooter[0].w === modalFooter[1].w && modalLeft === 0;
    rec("3 Departments and zones", T, ok, { primaryText, rowCount, rowH, name, value, selected, editBtns, editingLeft, restored, items, menuLeft, zonePrimary, zoneRows, modalFooter, modalFocus, modalLeft, actionPostsDuring: posts }, "", files);
  });

  // ---------------------------------------------------------------- 7 Indicator + seat link soft navigation (a read)
  await step("7 Indicator and seat link", T, async () => {
    const indBefore = await indicator();
    const link = page.locator("[data-directory-row] a.sp-seat-link").first();
    const label = (await link.textContent())?.trim();
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL(u => u.pathname === "/admin", { timeout: 20000 });
    const landed = new URL(page.url());
    const navEntries = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    const inspector = await page.locator("#seat-inspector-panel").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    const inspectorText = (await page.locator("#seat-inspector-panel").textContent().catch(() => "")) || "";
    await page.goBack({ waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const back = new URL(page.url());
    const navEntriesBack = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    await page.locator("[data-directory-row]").first().waitFor();
    const ok = /^Draft — /.test(indBefore || "") && href === `/admin?seat=${label}` && landed.searchParams.get("seat") === label && navEntries === 1 && inspector && inspectorText.includes(label) && back.pathname === "/admin/management" && navEntriesBack === 1;
    rec("7 Indicator and seat link", T, ok, { indicator: indBefore, label, href, landed: landed.pathname + landed.search, navEntries, inspector, back: back.pathname + back.search, navEntriesBack }, "", []);
  });
  const managementErrors = consoleErrors.slice();

  // ---------------------------------------------------------------- 4 Settings at rest
  consoleErrors = [];
  await step("4 Settings at rest", T, async () => {
    await open("/admin/settings", F.theme, F.w, F.h);
    const files = [await shot(`04-settings-rest-${T}`)];
    const theme = await themeAttr();
    const ind = await indicator();
    const h1 = await page.getByRole("heading", { name: "Settings", level: 1 }).isVisible();
    const headerBtns = await page.locator(".sp-page .cds-page-header .cds-btn").count();
    const callout = page.locator(".sp-callout");
    const calloutFirst = await page.locator(".sp-settings > *:not(.sr-only)").first().evaluate(el => el.className);
    const calloutText = (await callout.textContent())?.replace(/\s+/g, " ").trim();
    const calloutW = await callout.evaluate(el => Math.round(el.getBoundingClientRect().width));
    const calloutInner = await callout.locator("svg, button, a").count();
    const columnW = await page.locator(".sp-settings").evaluate(el => Math.round(el.getBoundingClientRect().width));
    const csvRow = await page.getByRole("region", { name: "CSV assignments" }).locator(".sp-action-row .cds-btn").evaluateAll(els => els.map(el => `${el.textContent}|${el.className.match(/cds-btn--(primary|tertiary|ghost)/)?.[1]}`));
    const csvLine = (await page.getByRole("region", { name: "CSV assignments" }).locator(".sp-file-line").textContent())?.replace(/\s+/g, " ").trim();
    const snapRow = await page.getByRole("region", { name: "Draft working-copy snapshots" }).locator(".sp-action-row .cds-btn").evaluateAll(els => els.map(el => `${el.textContent}|${el.className.match(/cds-btn--(primary|tertiary|ghost)/)?.[1]}`));
    const snapLine = (await page.getByRole("region", { name: "Draft working-copy snapshots" }).locator(".sp-file-line").textContent())?.trim();
    const resetInDom = await page.evaluate(() => /Reset/.test(document.body.innerText));
    const fileInputs = await page.locator("input[type='file']").evaluateAll(els => els.map(el => ({ accept: el.accept, tabindex: el.getAttribute("tabindex"), ariaHidden: el.getAttribute("aria-hidden"), hidden: el.hidden })));
    const primaryBg = await css(page.locator(".sp-settings .cds-btn--primary").first(), "backgroundColor");
    const blues = await blueScan();
    const ok = h1 && headerBtns === 0 && /sp-callout/.test(calloutFirst) && /never touched until you publish/.test(calloutText || "") && calloutInner === 0 && csvRow.join(";") === "Import CSV · .csv up to 5 MB|primary;Export CSV|tertiary;Download CSV template|ghost" && /^Columns: .* — e\.g\. /.test(csvLine || "") && snapRow.join(";") === "Export draft snapshot|primary;Restore draft snapshot…|tertiary" && snapLine === ".json up to 5 MB — a file exported from this page." && !resetInDom && fileInputs.length === 2 && fileInputs.every(f => f.tabindex === "-1" && f.ariaHidden === "true") && /^Draft — /.test(ind || "") && primaryBg === "rgb(184, 92, 46)" && blues.length === 0;
    rec("4 Settings at rest", T, ok, { theme, indicator: ind, headerBtns, calloutFirst, calloutText, calloutW, columnW, calloutInner, csvRow, csvLine, snapRow, snapLine, resetInDom, fileInputs, primaryBg, blues }, "", files);
  });
  const settingsErrors = consoleErrors.slice();

  // ---------------------------------------------------------------- 6 Console
  {
    // Preview-only noise: Speed Insights, and the Vercel Toolbar's feedback script (vercel.live) that the app's
    // CSP (`script-src 'self' 'unsafe-inline'`, next.config.js) refuses on preview deployments — absent on
    // production and on the Docker stack. Everything else is a real error.
    const filter = e => !/speed-insights|_vercel\/speed-insights|_vercel\/insights|vercel\.live\/_next-live/.test(e);
    const m = managementErrors.filter(filter);
    const s = settingsErrors.filter(filter);
    rec("6 Console", T, m.length === 0 && s.length === 0, { management: m.slice(0, 10), settings: s.slice(0, 10), noise: { management: managementErrors.length - m.length, settings: settingsErrors.length - s.length } }, "", []);
  }
  rec("0 Server-action POSTs this frame", T, true, { count: actionPosts.length - postsAtFrameStart, bodies: actionPosts.slice(postsAtFrameStart).map(p => p.body.slice(0, 100)) }, "recorded, not judged — reads through server actions are allowed; no mutation was triggered by construction", []);
}

// Net-zero evidence: the indicator reads the same at the end as at the start.
await open("/admin/management", "light", 1920, 1080);
const indicatorAtEnd = await indicator();
rec("8 Indicator net-zero", "all", indicatorAtEnd === indicatorAtStart, { indicatorAtStart, indicatorAtEnd, actionPosts: actionPosts.length }, "", []);

writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ results, actionPosts }, null, 2) + "\n");
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pass; ${failed.length} fail${failed.length ? ": " + failed.map(f => `${f.step} (${f.frame})`).join(", ") : ""}`);
await browser.close();
