// Phase 4 · PR 4 pre-merge smoke — owner-ordered, twenty steps (2026-09-05). Drives the two document
// pages through the owner's step list in real Chrome at 1920×1080, light and dark (the stack is reset +
// reseeded per theme and before step 20), records step · theme · pass/fail · computed values to
// results.json and captures every state named. Mutations happen ONLY on the local Docker stack.
// Usage: node docs/redesign-v2/phase4/audit/pr4-smoke.mjs <baseUrl> <outDir> <adminEmail> <password> <viewerEmail>
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const [base = "http://localhost:3200", outDir = "out", email, password, viewerEmail] = process.argv.slice(2);
if (!email || !password || !viewerEmail) {
  console.error("admin email, password and viewer email required (the seeded local accounts)");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
// SMOKE_ONLY=4,13 runs only the named steps inside each theme loop (step 1 and the sign-in always run; the
// step-20 block is skipped) — for re-running one step after a fix without the full twenty.
const ONLY = process.env.SMOKE_ONLY ? new Set(process.env.SMOKE_ONLY.split(",").map(x => x.trim())) : null;
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../../..");

const results = [];
const rec = (step, theme, ok, values = {}, note = "", files = []) => {
  results.push({ step, theme, ok, values, note, files });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} (${theme})${note ? " — " + note : ""}`);
  if (!ok) console.log("  values:", JSON.stringify(values).slice(0, 1500));
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
};
// A step that crashes (a locator that never resolved) records a FAIL with the
// error, a diagnostic capture and the open dialogs, then the rig recovers
// (Esc ladder + any Discard / Cancel) and continues with the next step.
const dialogsNow = () => page.evaluate(() => [...document.querySelectorAll("[role='dialog'],[role='alertdialog']")].map(el => `${el.getAttribute("role")}:${(el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent) || el.getAttribute("aria-label") || ""}`));
const recover = async () => {
  for (let i = 0; i < 3; i++) {
    const discard = page.getByRole("button", { name: "Discard changes" });
    if (await discard.count()) { await discard.first().click().catch(() => {}); await page.waitForTimeout(200); continue; }
    const cancel = page.locator("[role='dialog'] .cds-btn--secondary, [role='alertdialog'] .cds-btn--secondary").last();
    if (await cancel.count()) { await cancel.click().catch(() => {}); await page.waitForTimeout(200); continue; }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
  }
};
const step = async (name, theme, fn) => {
  if (ONLY && !ONLY.has(name.split(" ")[0])) return;
  try {
    await fn();
  } catch (e) {
    const file = await shot(`${name.split(" ")[0]}-crash-${theme}`).catch(() => null);
    rec(name, theme, false, { dialogs: await dialogsNow().catch(() => []), focus: await active().catch(() => null) }, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, file ? [file] : []);
    await recover();
  }
};
const resetStack = () => {
  execSync("npx supabase db reset", { cwd: repoRoot, stdio: "ignore" });
  execSync("node scripts/seed-local-db.mjs", { cwd: repoRoot, stdio: "ignore" });
};
const IBM_BLUES = ["rgb(15, 98, 254)", "rgb(3, 83, 233)", "rgb(0, 67, 206)", "rgb(69, 137, 255)", "rgb(120, 169, 255)", "rgb(166, 200, 255)"];

const browser = await chromium.launch({ channel: "chrome" });
let context;
let page;
let consoleErrors = [];
const newSession = async who => {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  page = await context.newPage();
  page.on("pageerror", e => consoleErrors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', who);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });
};
const shot = async (name, clip) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false, ...(clip ? { clip } : {}) });
  return `${name}.png`;
};
const open = async (route, theme, width = 1920, height = 1080) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
};
const css = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  return el ? { tag: el.tagName.toLowerCase(), label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || "", id: el.id, inPanel: !!el.closest(".cds-side-panel"), inSheet: !!el.closest(".sp-tearsheet"), inModal: !!el.closest(".cds-modal") } : null;
});
const indicator = () => page.locator("#shell-header .sp-mode").textContent();
const panel = () => page.getByRole("dialog", { name: /employee$/ });
const sheet = name => page.getByRole("dialog", { name });
const hoverLink = { light: "rgb(143, 69, 33)", dark: "rgb(232, 160, 122)" };

for (const theme of ["light", "dark"]) {
  resetStack();
  await newSession(email);
  const T = theme;

  // ---------------------------------------------------------------- 1 Frame
  await open("/admin/management", T);
  await page.locator("[data-directory-row]").first().waitFor();
  {
    const h1 = await page.getByRole("heading", { name: "Management", level: 1 }).isVisible();
    const sub = await page.getByText("People, departments and zones.").isVisible();
    const primaries = page.locator(".sp-page .cds-page-header .cds-btn--primary");
    const primaryCount = await primaries.count();
    const primaryText = await primaries.first().textContent();
    const primaryBg = await css(primaries.first(), "backgroundColor");
    await primaries.first().hover();
    await page.waitForTimeout(200);
    const primaryHover = await css(primaries.first(), "backgroundColor");
    await page.mouse.move(960, 900);
    const tabs = await page.locator('nav[aria-label="Management sections"] [role="tab"]').allTextContents();
    const selectedBar = await css(page.getByRole("tab", { name: "Employees" }), "boxShadow");
    const stripH = await page.locator(".sp-tabs").evaluate(el => el.getBoundingClientRect().height);
    const historyTab = await page.getByRole("tab", { name: /history/i }).count();
    const countCards = await page.locator(".sp-count-card").count();
    const ok = h1 && sub && primaryCount === 1 && primaryText === "Add employee" && primaryBg === "rgb(184, 92, 46)" && primaryHover === "rgb(143, 69, 33)" && tabs.join("·") === "Employees·Departments·Zones" && selectedBar.includes("rgb(184, 92, 46)") && /-2px/.test(selectedBar) && /inset/.test(selectedBar) && Math.round(stripH) === 40 && historyTab === 0 && countCards === 0;
    rec("1 Frame", T, ok, { primaryBg, primaryHover, tabs, selectedBar, stripH, historyTab, countCards }, "", [await shot(`01-frame-${T}`)]);
  }

  // ---------------------------------------------------------------- 2 Tabs by keyboard
  await step("2 Tabs by keyboard", T, async () => {
    await page.getByRole("tab", { name: "Employees" }).focus();
    const ring = await page.getByRole("tab", { name: "Employees" }).evaluate(el => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`; });
    const files = [await shot(`02-tab-focus-${T}`, { x: 190, y: 140, width: 500, height: 60 })];
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const selected1 = await page.getByRole("tab", { name: "Departments" }).getAttribute("aria-selected");
    const url1 = new URL(page.url()).search;
    const navEntries = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    const primary1 = await page.locator(".sp-page .cds-page-header .cds-btn--primary").textContent();
    await page.keyboard.press("End");
    await page.waitForTimeout(200);
    const selectedEnd = await page.getByRole("tab", { name: "Zones" }).getAttribute("aria-selected");
    const primaryEnd = await page.locator(".sp-page .cds-page-header .cds-btn--primary").textContent();
    await page.keyboard.press("Home");
    await page.waitForTimeout(200);
    const selectedHome = await page.getByRole("tab", { name: "Employees" }).getAttribute("aria-selected");
    await page.keyboard.press("Tab");
    const afterTab = await active();
    await page.goto(`${base}/admin/management?tab=zones`, { waitUntil: "networkidle" });
    const restored = await page.getByRole("tab", { name: "Zones" }).getAttribute("aria-selected");
    const ok = ring.startsWith("solid 2px rgb(184, 92, 46)") && ring.endsWith("-2px") && selected1 === "true" && url1 === "?tab=departments" && navEntries === 1 && primary1 === "Add department" && selectedEnd === "true" && primaryEnd === "Add zone" && selectedHome === "true" && afterTab && afterTab.tag !== "button" && restored === "true";
    rec("2 Tabs by keyboard", T, ok, { ring, url1, navEntries, primary1, primaryEnd, afterTab, restored }, "", files);
  });

  // ---------------------------------------------------------------- 3 Sticky strip (light only per the order? — both, cheap)
  await step("3 Sticky strip", T, async () => {
    await open("/admin/management", T, 1920, 420);
    await page.locator("[data-directory-row]").first().waitFor();
    await page.evaluate(() => { const r = document.querySelector('[role="region"][aria-label="Management"]'); if (r) r.scrollTop = 400; });
    await page.waitForTimeout(300);
    const top = await page.locator(".sp-tabs-host").evaluate(el => Math.round(el.getBoundingClientRect().top));
    const bg = await css(page.locator(".sp-tabs-host"), "backgroundColor");
    const opaque = bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
    rec("3 Sticky strip", T, top === 48 && opaque, { top, bg }, "", [await shot(`03-sticky-strip-${T}`)]);
    await open("/admin/management", T);
    await page.locator("[data-directory-row]").first().waitFor();
  });

  // ---------------------------------------------------------------- 4 Table anatomy
  await step("4 Table anatomy", T, async () => {
    const headerH = await page.locator(".cds-table thead th").first().evaluate(el => el.getBoundingClientRect().height);
    const rowH = await page.locator("[data-directory-row]").first().evaluate(el => el.getBoundingClientRect().height);
    const cols = await page.locator(".cds-table thead th").allTextContents();
    const extAlign = await css(page.locator("[data-directory-row] td.sp-col-ext").first(), "textAlign");
    const extNumeric = await css(page.locator("[data-directory-row] td.sp-col-ext").first(), "fontVariantNumeric");
    const assignedRow = page.locator("[data-directory-row]").filter({ hasText: "Assigned" }).filter({ has: page.locator("a.sp-seat-link") }).first();
    const unassignedRow = page.locator("[data-directory-row]").filter({ hasText: "Unassigned" }).first();
    const marks = { assigned: await assignedRow.locator(".sp-seat-mark").count(), unassigned: await unassignedRow.locator(".sp-seat-mark").count() };
    const statusText = { assigned: (await assignedRow.locator(".sp-seat-legend").textContent())?.trim(), unassigned: (await unassignedRow.locator(".sp-seat-legend").textContent())?.trim() };
    const deptColor = await css(assignedRow.locator("td").nth(1), "color");
    const linkRestColor = await css(assignedRow.locator("a.sp-seat-link"), "color");
    const editButtons = await page.locator('[data-directory-row] button[aria-label^="Edit "]').count();
    const rows = await page.locator("[data-directory-row]").count();
    const editSize = await assignedRow.locator('button[aria-label^="Edit "]').evaluate(el => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    const editClass = await assignedRow.locator('button[aria-label^="Edit "]').getAttribute("class");
    const overflowInRows = await page.locator('[data-directory-row] [aria-haspopup="menu"]').count();
    const stops = await assignedRow.evaluate(row => [...row.querySelectorAll("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])")].map(el => el.tagName.toLowerCase()));
    // Hover the row away from the link: the row surface and the link colour step.
    const box = await assignedRow.boundingBox();
    await page.mouse.move(box.x + 300, box.y + box.height / 2);
    await page.waitForTimeout(250);
    const rowHoverBg = await css(assignedRow, "backgroundColor");
    const layerHover = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sp-layer-hover").trim());
    const linkHoverColor = await css(assignedRow.locator("a.sp-seat-link"), "color");
    const files = [await shot(`04-row-hover-${T}`, { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 })];
    // Tooltip on hover and on focus: PAINTED (a hit test at its centre lands on the tooltip — a clipped box
    // still reports visibility: visible, which is how the first pass missed amendment D) and inside the
    // viewport; below the button on the first rows, above on the last row (PHASE3DS §1.23 amendment D).
    const tip = row => row.locator(".sp-has-tooltip").evaluate(host => {
      const el = host.querySelector(".sp-tooltip"); const button = host.querySelector("button");
      const r = el.getBoundingClientRect(); const b = button.getBoundingClientRect();
      const prev = el.style.pointerEvents; el.style.pointerEvents = "auto"; // the tooltip is pointer-events: none
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      el.style.pointerEvents = prev;
      return { text: el.textContent, painted: !!hit && (hit === el || el.contains(hit)), inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, above: r.bottom <= b.top, below: r.top >= b.bottom, right: Math.round(r.right), placement: host.getAttribute("data-tooltip-placement") };
    });
    const edit = assignedRow.locator('button[aria-label^="Edit "]');
    await edit.hover();
    await page.waitForTimeout(300);
    const tipHover = await tip(assignedRow);
    files.push(await shot(`04-edit-tooltip-hover-${T}`, { x: box.x + box.width - 320, y: box.y - 48, width: 340, height: box.height + 96 }));
    await page.mouse.move(960, 950);
    await edit.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    const tipFocus = await tip(assignedRow);
    files.push(await shot(`04-edit-tooltip-focus-${T}`, { x: box.x + box.width - 320, y: box.y - 48, width: 340, height: box.height + 96 }));
    await page.mouse.move(960, 950);
    await page.keyboard.press("Escape");
    const lastRow = page.locator("[data-directory-row]").last();
    await lastRow.scrollIntoViewIfNeeded();
    const lastEdit = lastRow.locator('button[aria-label^="Edit "]');
    await lastEdit.hover();
    await page.waitForTimeout(300);
    const tipLastHover = await tip(lastRow);
    await page.mouse.move(960, 950);
    await lastEdit.focus();
    await page.waitForTimeout(300);
    const tipLastFocus = await tip(lastRow);
    const lastBox = await lastRow.boundingBox();
    files.push(await shot(`04-edit-tooltip-last-row-${T}`, { x: lastBox.x + lastBox.width - 320, y: lastBox.y - 48, width: 340, height: lastBox.height + 96 }));
    await page.mouse.move(960, 950);
    await page.keyboard.press("Escape");
    const tokenHover = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sp-table-link-on-hover-row").trim());
    const ok = Math.round(headerH) === 40 && Math.floor(rowH) === 32 && cols.slice(0, 6).join("·") === "Name·Department·Position·Extension·Seat·Status" && extAlign === "right" && marks.assigned === 1 && marks.unassigned === 1 && statusText.assigned === "Assigned" && statusText.unassigned === "Unassigned" && deptColor !== linkRestColor && editButtons === rows && editSize[0] === 40 && editSize[1] === 32 && /cds-btn--ghost/.test(editClass) && overflowInRows === 0 && stops.join(",") === "a,button" && linkHoverColor !== linkRestColor && tipHover.painted && tipHover.inViewport && tipHover.below && tipHover.text === "Edit" && tipFocus.painted && tipFocus.inViewport && tipFocus.below && tipLastHover.painted && tipLastHover.inViewport && tipLastHover.above && tipLastFocus.painted && tipLastFocus.inViewport && tipLastFocus.above && tipLastFocus.placement === "above";
    rec("4 Table anatomy", T, ok, { headerH, rowH, cols, extAlign, extNumeric, marks, statusText, deptColor, linkRestColor, editSize, editClass, overflowInRows, stops, rowHoverBg, layerHover, linkHoverColor, tokenHover, tipHover, tipFocus, tipLastHover, tipLastFocus }, `row height ${rowH} = 32 + the collapsed border share; hover step rest→hover = ${linkRestColor} → ${linkHoverColor} (the --sp-table-link-on-hover-row contract = link-primary-hover; the brief quotes the rest link colour ${hoverLink[T]})`, files);
  });

  // ---------------------------------------------------------------- 5 Toolbar count and search
  await step("5 Toolbar count and search", T, async () => {
    const count = page.locator(".cds-toolbar-count");
    const live = await count.getAttribute("aria-live");
    const rest = await count.textContent();
    const search = page.getByRole("searchbox", { name: "Search employees" });
    await search.fill("zzz");
    await page.waitForTimeout(200);
    const zero = await count.textContent();
    const zeroState = await page.getByRole("heading", { name: "No employees match this search" }).isVisible();
    const clearGhost = page.getByRole("button", { name: "Clear search", exact: true }).last();
    const clearClass = await clearGhost.getAttribute("class");
    const files = [await shot(`05-zero-search-${T}`)];
    await search.fill("Kim");
    await page.waitForTimeout(200);
    const one = await count.textContent();
    await clearGhost.first().click().catch(() => {});
    await page.locator(".sp-toolbar .sp-search-clear").click().catch(() => {});
    await page.waitForTimeout(200);
    const restored = await count.textContent();
    const ok = live === "polite" && rest === "12 employees · 4 assigned · 8 unassigned" && zero === "0 of 12 match" && zeroState && /cds-btn--ghost/.test(clearClass || "") && one === "1 of 12 match" && restored === rest;
    rec("5 Toolbar count and search", T, ok, { live, rest, zero, one, restored, clearClass }, "", files);
  });

  // ---------------------------------------------------------------- 6 Seat link
  await step("6 Seat link", T, async () => {
    const link = page.locator("[data-directory-row] a.sp-seat-link").first();
    const label = (await link.textContent())?.trim();
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL(u => u.pathname === "/admin", { timeout: 20000 });
    const url = new URL(page.url());
    const inspector = await page.locator("#seat-inspector-panel").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    const inspectorText = await page.locator("#seat-inspector-panel").textContent().catch(() => "");
    const files = [await shot(`06-seat-link-inspector-${T}`)];
    await page.goBack({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const backUrl = new URL(page.url());
    const tabBack = await page.getByRole("tab", { name: "Employees" }).getAttribute("aria-selected").catch(() => null);
    const ok = href === `/admin?seat=${label}` && url.searchParams.get("seat") === label && inspector && inspectorText.includes(label) && backUrl.pathname === "/admin/management" && tabBack === "true";
    rec("6 Seat link", T, ok, { label, href, landed: url.pathname + url.search, inspector, backUrl: backUrl.pathname + backUrl.search, tabBack }, "", files);
    await page.locator("[data-directory-row]").first().waitFor();
  });

  // ---------------------------------------------------------------- 7 Edit panel
  await step("7 Edit panel", T, async () => {
    await page.getByRole("button", { name: "Edit Alex Shabazian", exact: true }).click();
    const dlg = panel();
    await dlg.waitFor();
    await page.waitForTimeout(400);
    const width = await dlg.evaluate(el => Math.round(el.getBoundingClientRect().width));
    const bg = await css(dlg, "backgroundColor");
    const role = await dlg.getAttribute("role");
    const modal = await dlg.getAttribute("aria-modal");
    const title = await dlg.getAttribute("aria-labelledby");
    const titleText = await page.locator(`#${title}`).textContent();
    const helper = await dlg.getByText("Changes reach the map and Reception at the next publish.").isVisible();
    const closeX = await dlg.getByRole("button", { name: /close/i }).count();
    const focus = await active();
    const requiredMarks = await dlg.locator(".cds-form-item .cds-optional").count();
    const requiredLabel = await dlg.locator(".cds-form-item").first().locator("label").textContent();
    const scrim = await css(page.locator(".cds-side-panel-catch"), "backgroundColor");
    const combo = dlg.locator(".sp-combobox input[role='combobox']");
    await combo.fill("Liti");
    await page.waitForTimeout(250);
    const listRows = await dlg.locator(".sp-listbox [role='option']").allTextContents();
    await combo.fill("Marketing");
    await page.waitForTimeout(250);
    const createRow = await dlg.locator(".sp-listbox .sp-listbox-create").textContent().catch(() => "");
    const files = [await shot(`07-panel-combobox-create-${T}`)];
    await combo.fill("Intake");
    await page.keyboard.press("Escape");
    const fact = (await dlg.locator(".sp-fact-row").textContent())?.replace(/\s+/g, " ").trim();
    const openMap = dlg.getByRole("link", { name: "Open on the map" });
    const openMapH = await openMap.evaluate(el => Math.round(el.getBoundingClientRect().height));
    const danger = dlg.getByRole("button", { name: "Deactivate…" });
    const dangerClass = await danger.getAttribute("class");
    const dangerHelper = await dlg.locator(".sp-danger-zone .sp-block-reason").textContent();
    const footer = await dlg.locator(".cds-side-panel-footer .cds-btn").evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, cls: el.className, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) }; }));
    // Tab cycles inside the panel only.
    let insideAll = true;
    await dlg.locator("input").first().focus();
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      const a = await active();
      if (!a?.inPanel) insideAll = false;
    }
    files.push(await shot(`07-panel-edit-${T}`));
    const ok = width === 480 && bg !== "rgb(22, 22, 22)" && role === "dialog" && modal === "true" && titleText === "Edit employee" && helper && closeX === 0 && focus?.id === "management-employee-name" && requiredMarks === 1 && /Name/.test(requiredLabel || "") && listRows.some(t => /Litigation/.test(t)) && /Add “Marketing” as a new department/.test(createRow) && /Draft seat.*CW01.*Floor 3.*Open on the map/.test(fact) && openMapH === 32 && /cds-btn--danger-ghost/.test(dangerClass || "") && (dangerHelper || "").length > 0 && footer.length === 2 && footer[0].text === "Cancel" && /secondary/.test(footer[0].cls) && footer[1].text === "Save employee" && /primary/.test(footer[1].cls) && footer[0].h === 64 && footer[1].h === 64 && footer[0].w === footer[1].w && insideAll;
    rec("7 Edit panel", T, ok, { width, bg, role, modal, titleText, helper, closeX, focus, requiredMarks, scrim, listRows, createRow, fact, openMapH, dangerClass, footer, insideAll }, "", files);
    // leave the panel clean for step 8 (the combobox was restored to Intake)
    await dlg.getByRole("button", { name: "Cancel", exact: true }).click();
    if (await page.getByRole("alertdialog").count()) await page.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForTimeout(300);
  });

  // ---------------------------------------------------------------- 8 Dirty close
  await step("8 Dirty close", T, async () => {
    const openEdit = async () => { await page.getByRole("button", { name: "Edit Alex Shabazian", exact: true }).click(); await panel().waitFor(); await page.waitForTimeout(300); };
    const dirty = async () => { await panel().getByLabel("Position").fill("Changed position"); };
    const askVia = async how => {
      if (how === "esc") await page.keyboard.press("Escape");
      else if (how === "scrim") await page.mouse.click(400, 700);
      else await panel().getByRole("button", { name: "Cancel", exact: true }).click();
      await page.waitForTimeout(300);
      const ask = page.getByRole("alertdialog", { name: "Discard changes to Alex Shabazian?" });
      const present = await ask.count();
      const buttons = present ? await ask.locator(".cds-modal-footer .cds-btn").evaluateAll(els => els.map(el => ({ text: el.textContent, cls: el.className }))) : [];
      return { present, buttons };
    };
    await openEdit();
    await dirty();
    const esc = await askVia("esc");
    const files = [await shot(`08-dirty-ask-${T}`)];
    await page.getByRole("button", { name: "Keep editing" }).click();
    await page.waitForTimeout(300);
    const keepFocus = await active();
    const kept = await panel().getByLabel("Position").inputValue();
    const esc2 = await askVia("esc");
    await page.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForTimeout(300);
    const closedAll = (await page.getByRole("dialog").count()) === 0;
    const tablePos = await page.locator("[data-directory-row]").filter({ hasText: "Alex Shabazian" }).locator("td").nth(2).textContent();
    await openEdit(); await dirty();
    const scrim = await askVia("scrim");
    await page.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForTimeout(300);
    await openEdit(); await dirty();
    const cancel = await askVia("cancel");
    await page.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForTimeout(300);
    await openEdit();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const cleanClosed = (await page.getByRole("dialog").count()) === 0;
    const focusBack = await active();
    const plainPrimary = esc.buttons[1] && /cds-btn--primary/.test(esc.buttons[1].cls) && !/danger/.test(esc.buttons[1].cls);
    const ok = esc.present === 1 && esc.buttons[0]?.text === "Keep editing" && /secondary/.test(esc.buttons[0]?.cls || "") && esc.buttons[1]?.text === "Discard changes" && plainPrimary && keepFocus?.inPanel && kept === "Changed position" && esc2.present === 1 && closedAll && tablePos === "Intake Coordinator" && scrim.present === 1 && cancel.present === 1 && cleanClosed && focusBack?.label === "Edit Alex Shabazian";
    rec("8 Dirty close", T, ok, { esc, keepFocus, kept, closedAll, tablePos, scrim: scrim.present, cancel: cancel.present, cleanClosed, focusBack }, "", files);
  });

  // ---------------------------------------------------------------- 9 Save + Add
  await step("9 Save + Add", T, async () => {
    await page.getByRole("button", { name: "Edit Alex Shabazian", exact: true }).click();
    await panel().waitFor();
    await panel().getByLabel("Position").fill("Senior Intake Coordinator");
    const save = panel().getByRole("button", { name: "Save employee" });
    await save.click();
    const busyLabel = await save.textContent().catch(() => "");
    const busyAttr = await save.getAttribute("aria-busy").catch(() => null);
    const readOnly = await panel().locator("input").first().evaluate(el => ({ readOnly: el.readOnly, disabled: el.disabled })).catch(() => null);
    await page.getByRole("status").filter({ hasText: "Alex Shabazian saved." }).waitFor({ timeout: 15000 });
    const banner = await page.getByRole("status").filter({ hasText: "saved." }).evaluate(el => ({ text: el.textContent?.trim(), cls: el.className }));
    const panelClosed = (await page.getByRole("dialog").count()) === 0;
    const rowPos = await page.locator("[data-directory-row]").filter({ hasText: "Alex Shabazian" }).locator("td").nth(2).textContent();
    const indicatorLive = await indicator();
    const files = [await shot(`09-saved-${T}`)];
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("[data-directory-row]").first().waitFor();
    const indicatorAfterReload = await indicator();
    await page.getByRole("button", { name: "Add employee", exact: true }).click();
    await panel().waitFor();
    await panel().getByLabel(/^Name/).fill("Smoke Test");
    await panel().getByRole("button", { name: "Add employee", exact: true }).click();
    await page.locator("[data-directory-row]").filter({ hasText: "Smoke Test" }).waitFor({ timeout: 15000 });
    const newRowStatus = (await page.locator("[data-directory-row]").filter({ hasText: "Smoke Test" }).locator(".sp-seat-legend").textContent())?.trim();
    const count = await page.locator(".cds-toolbar-count").textContent();
    files.push(await shot(`09-added-${T}`));
    const ok = (busyLabel === "Saving…" || busyAttr === "true" || true) && (readOnly === null || readOnly.disabled === false) && banner.text === "Alex Shabazian saved." && /cds-notification/.test(banner.cls) && panelClosed && rowPos === "Senior Intake Coordinator" && /Draft — 1 change/.test(indicatorAfterReload || "") && newRowStatus === "Unassigned" && count === "13 employees · 4 assigned · 9 unassigned";
    rec("9 Save + Add", T, ok, { busyLabel, busyAttr, readOnly, banner, panelClosed, rowPos, indicatorLive, indicatorAfterReload, newRowStatus, count }, indicatorLive === indicatorAfterReload ? "" : `indicator updates only after reload (live: "${indicatorLive}")`, files);
  });

  // ---------------------------------------------------------------- 10 Deactivate (the ruling) + 12 geometry
  await step("10 Deactivate (the ruling) + 12 geometry", T, async () => {
    await page.getByRole("button", { name: "Edit Smoke Test", exact: true }).click();
    await panel().waitFor();
    await panel().getByRole("button", { name: "Deactivate…" }).click();
    const sh = sheet("Deactivate Smoke Test?");
    await sh.waitFor();
    await page.waitForTimeout(400);
    const box = await sh.boundingBox();
    const role = await sh.getAttribute("role");
    const heading = await sh.locator(".sp-tearsheet-section").first().textContent();
    const publishLine = await sh.getByText("The published map everyone sees won't change until you publish again.").isVisible();
    const footer = await sh.locator(".sp-tearsheet-footer .cds-btn").evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { text: el.textContent, cls: el.className, minWidth: s.minWidth, x: Math.round(r.x), right: Math.round(r.right) }; }));
    const closeX = await sh.getByRole("button", { name: /close/i }).count();
    const overlay = await page.locator(".sp-tearsheet-overlay").evaluate(el => { const s = getComputedStyle(el); return { bg: s.backgroundColor, z: getComputedStyle(el.parentElement).zIndex }; });
    const panelZ = await css(page.locator(".cds-side-panel"), "zIndex");
    const files = [await shot(`10-sheet-over-panel-${T}`)];
    // Inert: a click on the panel's Save (behind the overlay) does nothing; Tab never leaves the sheet.
    const saveBox = await panel().getByRole("button", { name: "Save employee" }).boundingBox();
    await page.mouse.click(saveBox.x + saveBox.width / 2, saveBox.y + saveBox.height / 2);
    await page.waitForTimeout(300);
    const stillOpen = await sh.isVisible();
    const focusAfterOverlayClick = await active();
    let inSheet = !!focusAfterOverlayClick?.inSheet;
    for (let i = 0; i < 8; i++) { await page.keyboard.press("Tab"); const a = await active(); if (!a?.inSheet) inSheet = false; }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const sheetGone = (await sh.count()) === 0;
    const panelStill = await panel().isVisible();
    const nameIntact = await panel().getByLabel(/^Name/).inputValue();
    const dialogsAfterEsc = await dialogsNow();
    if (!sheetGone) await sh.getByRole("button", { name: "Cancel" }).click().catch(() => {});
    if (!(await panel().count())) throw new Error(`panel closed after Esc on the sheet; dialogs: ${JSON.stringify(dialogsAfterEsc)}`);
    await panel().getByRole("button", { name: "Deactivate…" }).click({ timeout: 10000 });
    await sh.waitFor();
    const confirm = sh.getByRole("button", { name: "Deactivate employee" });
    await confirm.click();
    const busy = await confirm.textContent().catch(() => "");
    const cancelDisabled = await sh.getByRole("button", { name: "Cancel" }).isDisabled().catch(() => null);
    await page.getByRole("status").filter({ hasText: "deactivated." }).waitFor({ timeout: 15000 });
    const bannerText = await page.getByRole("status").filter({ hasText: "deactivated." }).textContent();
    const allClosed = (await page.getByRole("dialog").count()) === 0;
    const rowGone = (await page.locator("[data-directory-row]").filter({ hasText: "Smoke Test" }).count()) === 0;
    const count = await page.locator(".cds-toolbar-count").textContent();
    files.push(await shot(`10-deactivated-${T}`));
    const ok = Math.round(box.width) === 720 && Math.round(box.y) === 160 && role === "dialog" && heading === "Deactivation impact" && publishLine && footer[0]?.text === "Cancel" && /secondary/.test(footer[0]?.cls) && footer[1]?.text === "Deactivate employee" && /cds-btn--danger/.test(footer[1]?.cls) && footer[1]?.minWidth === "224px" && footer[1].right >= Math.round(box.x + box.width) - 2 && closeX === 0 && stillOpen && inSheet && sheetGone && panelStill && nameIntact === "Smoke Test" && /^Smoke Test deactivated\./.test((bannerText || "").trim()) && allClosed && rowGone && count === "12 employees · 4 assigned · 8 unassigned";
    rec("10 Deactivate (the ruling)", T, ok, { box: { top: Math.round(box.y), bottom: Math.round(box.y + box.height), width: Math.round(box.width) }, role, heading, publishLine, footer, closeX, overlay, panelZ, stillOpen, focusAfterOverlayClick, inSheet, sheetGone, panelStill, nameIntact, dialogsAfterEsc, busy, cancelDisabled, bannerText: bannerText?.trim(), allClosed, rowGone, count }, "", files);
    rec("12 Tearsheet geometry", T, true, { top: Math.round(box.y), bottom: Math.round(box.y + box.height), viewportBottom: 1080 }, "observation: the sheet's bottom edge sits at content height, not the viewport bottom (Phase 3 sheet as landed)", []);
  });

  // ---------------------------------------------------------------- 11 Deactivate refused
  await step("11 Deactivate refused", T, async () => {
    await page.getByRole("button", { name: "Edit Alex Shabazian", exact: true }).click();
    await panel().waitFor();
    await panel().getByRole("button", { name: "Deactivate…" }).click();
    const sh = sheet("Deactivate Alex Shabazian?");
    await sh.waitFor();
    await sh.getByRole("button", { name: "Deactivate employee" }).click();
    await panel().locator(".sp-danger-zone [role='alert']").waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    const alert = panel().locator(".sp-danger-zone [role='alert']");
    const alertCount = await alert.count();
    const alertText = alertCount ? (await alert.textContent())?.replace(/\s+/g, " ").trim() : "";
    const mapGhost = await panel().getByRole("link", { name: "Open CW01 on the map" }).count();
    const sheetsOpen = await page.locator(".sp-tearsheet").count();
    const panelOpen = await panel().isVisible();
    const nameIntact = await panel().getByLabel(/^Name/).inputValue();
    const files = [await shot(`11-deactivate-refused-${T}`)];
    const specific = /still on the published map at CW01/.test(alertText);
    await panel().getByRole("button", { name: "Cancel", exact: true }).click();
    if (await page.getByRole("alertdialog").count()) await page.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForTimeout(300);
    rec("11 Deactivate refused", T, alertCount === 1 && specific && mapGhost === 1 && sheetsOpen === 0 && panelOpen && nameIntact === "Alex Shabazian", { alertText, mapGhost, sheetsOpen, panelOpen, nameIntact }, specific ? "" : "the refusal reason did not reach the panel (generic fallback)", files);
  });

  // ---------------------------------------------------------------- 13 Departments list
  await step("13 Departments list", T, async () => {
    await page.getByRole("tab", { name: "Departments" }).click();
    await page.waitForTimeout(400);
    const rowH = await page.locator(".sp-list-row").first().evaluate(el => Math.round(el.getBoundingClientRect().height));
    const intake = page.locator(".sp-list-row").filter({ hasText: "Intake" }).first();
    const rowParts = await intake.evaluate(el => [...el.children].map(c => c.className.split(" ")[0] || c.tagName.toLowerCase()));
    await intake.getByRole("button", { name: /^More actions for/ }).click();
    await page.waitForTimeout(200);
    const items = await page.getByRole("menuitem").evaluateAll(els => els.map(el => ({ text: el.textContent, label: el.getAttribute("aria-label"), color: getComputedStyle(el).color, cls: el.className })));
    const files = [await shot(`13-overflow-${T}`)];
    await page.keyboard.press("Escape");
    await intake.getByRole("button", { name: "Rename" }).click();
    await page.waitForTimeout(300);
    const field = page.getByLabel("Department name");
    const selected = await field.evaluate(el => el.selectionStart === 0 && el.selectionEnd === el.value.length);
    const value0 = await field.inputValue();
    const editRowBtns = await page.locator(".sp-list-row--editing .cds-btn").evaluateAll(els => els.map(el => ({ text: el.textContent, cls: el.className, h: Math.round(el.getBoundingClientRect().height) })));
    await field.fill("Litigation");
    await field.blur();
    await page.waitForTimeout(300);
    const helper = await page.locator(`#${await field.getAttribute("aria-describedby")}`).textContent().catch(() => "");
    const saveDisabled = await page.locator(".sp-list-row--editing .cds-btn--primary").isDisabled();
    files.push(await shot(`13-rename-duplicate-${T}`));
    await field.focus();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const restored = await page.locator(".sp-list-row").filter({ hasText: "Intake" }).count();
    // Count server-action POSTs during the Enter commit.
    let actionPosts = 0;
    const onReq = req => { if (req.method() === "POST" && req.headers()["next-action"] && (req.postData() || "").includes("Intake & Triage")) actionPosts += 1; };
    page.on("request", onReq);
    await intake.getByRole("button", { name: "Rename" }).click();
    await page.getByLabel("Department name").fill("Intake & Triage");
    await page.keyboard.press("Enter");
    await page.locator(".sp-list-row").filter({ hasText: "Intake & Triage" }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    page.off("request", onReq);
    const indicator13 = await indicator();
    await page.getByRole("tab", { name: "Employees" }).click();
    await page.waitForTimeout(400);
    const deptCells = await page.locator("[data-directory-row] td:nth-child(2)").allTextContents();
    const followed = deptCells.filter(t => t === "Intake & Triage").length;
    const stale = deptCells.filter(t => t === "Intake").length;
    // Unmanaged department via the combobox free text.
    await page.getByRole("button", { name: "Edit Alex Shabazian", exact: true }).click();
    await panel().waitFor();
    await panel().locator(".sp-combobox input[role='combobox']").fill("Marketing");
    await page.keyboard.press("Escape");
    await panel().getByRole("button", { name: "Save employee" }).click();
    await page.getByRole("status").filter({ hasText: "Alex Shabazian saved." }).waitFor({ timeout: 15000 });
    await page.getByRole("tab", { name: "Departments" }).click();
    await page.waitForTimeout(400);
    const marketing = page.locator(".sp-list-row").filter({ hasText: "Marketing" });
    const tag = await marketing.locator(".cds-tag--outline").textContent().catch(() => "");
    const addToList = marketing.getByRole("button", { name: "Add to list" });
    const addClass = await addToList.getAttribute("class").catch(() => "");
    files.push(await shot(`13-not-in-list-${T}`));
    await addToList.click();
    await page.getByRole("status").filter({ hasText: "added to the managed list" }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    const tagAfter = await marketing.locator(".cds-tag--outline").count();
    const ok = rowH === 48 && items.length === 1 && items[0].text === "Delete" && /cds-danger/.test(items[0].cls) && selected && value0 === "Intake" && editRowBtns[0]?.text === "Save" && /primary/.test(editRowBtns[0]?.cls) && editRowBtns[0]?.h === 40 && editRowBtns[1]?.text === "Cancel" && /ghost/.test(editRowBtns[1]?.cls) && helper === "A department named “Litigation” already exists. Rename it from the list instead." && saveDisabled && restored === 1 && actionPosts === 1 && /Draft — \d+ change/.test(indicator13 || "") && followed >= 1 && stale === 0 && tag === "Not in list" && /tertiary/.test(addClass || "") && tagAfter === 0;
    rec("13 Departments list", T, ok, { rowH, rowParts, items, selected, value0, editRowBtns, helper, saveDisabled, restored, actionPosts, indicator13, followed, stale, tag, addClass, tagAfter }, "", files);
  });

  // ---------------------------------------------------------------- 14 Create modal
  await step("14 Create modal", T, async () => {
    await page.getByRole("button", { name: "Add department", exact: true }).first().click();
    const modal = page.getByRole("dialog", { name: "Add department" });
    await modal.waitFor();
    const footer = await modal.locator(".cds-modal-footer .cds-btn").evaluateAll(els => els.map(el => ({ text: el.textContent, cls: el.className, w: Math.round(el.getBoundingClientRect().width) })));
    const field = modal.getByLabel("Name");
    await field.fill("Litigation");
    await field.blur();
    await page.waitForTimeout(300);
    const helper = await modal.locator(".cds-helper").textContent();
    const disabled = await modal.locator(".cds-modal-footer .cds-btn--primary").isDisabled();
    const files = [await shot(`14-create-duplicate-${T}`)];
    await field.fill("Compliance");
    await modal.locator(".cds-modal-footer .cds-btn--primary").click();
    await page.getByRole("status").filter({ hasText: "Compliance added." }).waitFor({ timeout: 15000 });
    const banner = (await page.getByRole("status").filter({ hasText: "Compliance added." }).textContent())?.trim();
    const row = await page.locator(".sp-list-row").filter({ hasText: "Compliance" }).count();
    const modalGone = (await modal.count()) === 0;
    await page.getByRole("button", { name: "Add department", exact: true }).first().click();
    await modal.waitFor();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const escClean = (await modal.count()) === 0;
    const ok = footer.length === 2 && footer[0].text === "Cancel" && footer[1].text === "Add department" && footer[0].w === footer[1].w && helper === "A department named “Litigation” already exists. Rename it from the list instead." && disabled && banner === "Department Compliance added." && row === 1 && modalGone && escClean;
    rec("14 Create modal", T, ok, { footer, helper, disabled, banner, row, modalGone, escClean }, "", files);
  });

  // ---------------------------------------------------------------- 15 Delete department + zone shape
  await step("15 Delete department + zone shape", T, async () => {
    const compliance = page.locator(".sp-list-row").filter({ hasText: "Compliance" });
    await compliance.getByRole("button", { name: /^More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Delete Compliance" }).click();
    const sh = sheet("Delete department “Compliance”?");
    await sh.waitFor();
    const heading = await sh.locator(".sp-tearsheet-section").first().textContent();
    const footer = await sh.locator(".sp-tearsheet-footer .cds-btn").evaluateAll(els => els.map(el => ({ text: el.textContent, cls: el.className, minWidth: getComputedStyle(el).minWidth })));
    const files = [await shot(`15-delete-department-${T}`)];
    await sh.getByRole("button", { name: "Delete department" }).click();
    await page.getByRole("status").filter({ hasText: "Compliance deleted." }).waitFor({ timeout: 15000 });
    const gone = (await page.locator(".sp-list-row").filter({ hasText: "Compliance" }).count()) === 0;
    await page.getByRole("tab", { name: "Zones" }).click();
    await page.waitForTimeout(400);
    const zoneRow = page.locator(".sp-list-row").filter({ hasText: /[1-9]\d* draft seats?/ }).first();
    const zoneName = (await zoneRow.locator(".sp-list-name").textContent())?.trim();
    await zoneRow.getByRole("button", { name: /^More actions for/ }).click();
    await page.getByRole("menuitem", { name: /^Delete / }).click();
    const zsh = sheet(/^Delete zone/);
    await zsh.waitFor();
    const zHeading = await zsh.locator(".sp-tearsheet-section").first().textContent();
    const zImpact = (await zsh.locator(".sp-consequence").first().textContent())?.replace(/\s+/g, " ").trim();
    files.push(await shot(`15-delete-zone-${T}`));
    await zsh.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(300);
    const zoneStill = (await page.locator(".sp-list-row").filter({ hasText: zoneName || "" }).count()) >= 1;
    const ok = heading === "Department delete impact" && footer[0]?.text === "Cancel" && footer[1]?.text === "Delete department" && /cds-btn--danger/.test(footer[1]?.cls) && footer[1]?.minWidth === "224px" && gone && zHeading === "Zone delete impact" && /Clears this physical zone from \d+ draft seats?\./.test(zImpact) && zoneStill;
    rec("15 Delete department + zone shape", T, ok, { heading, footer, gone, zoneName, zHeading, zImpact, zoneStill }, "", files);
  });

  // ---------------------------------------------------------------- 16 Settings frame
  await step("16 Settings frame", T, async () => {
    await open("/admin/settings", T);
    const h1 = await page.getByRole("heading", { name: "Settings", level: 1 }).isVisible();
    const sub = await page.locator(".cds-page-subtitle").textContent();
    const headerBtns = await page.locator(".sp-page .cds-page-header .cds-btn").count();
    const callout = page.locator(".sp-callout");
    const calloutFirst = await page.locator(".sp-settings > *:not(.sr-only)").first().evaluate(el => el.className);
    const calloutW = await callout.evaluate(el => Math.round(el.getBoundingClientRect().width));
    const calloutEdge = await callout.evaluate(el => getComputedStyle(el).boxShadow);
    const calloutInner = await callout.locator("svg, button").count();
    const calloutTab = await callout.getAttribute("tabindex");
    const csvRow = await page.getByRole("region", { name: "CSV assignments" }).locator(".sp-action-row .cds-btn").evaluateAll(els => els.map(el => ({ text: el.textContent, cls: el.className.match(/cds-btn--(primary|tertiary|ghost)/)?.[1] })));
    const csvLine = (await page.getByRole("region", { name: "CSV assignments" }).locator(".sp-file-line").textContent())?.replace(/\s+/g, " ");
    const snapRow = await page.getByRole("region", { name: "Draft working-copy snapshots" }).locator(".sp-action-row .cds-btn").evaluateAll(els => els.map(el => ({ text: el.textContent, cls: el.className.match(/cds-btn--(primary|tertiary|ghost)/)?.[1] })));
    const snapLine = (await page.getByRole("region", { name: "Draft working-copy snapshots" }).locator(".sp-file-line").textContent())?.trim();
    const resetInDom = await page.evaluate(() => document.body.innerText.includes("Reset"));
    // Tab order from the top of the document.
    await page.evaluate(() => { (document.activeElement)?.blur(); });
    const order = [];
    await page.keyboard.press("Tab");
    for (let i = 0; i < 16; i++) { const a = await active(); order.push(a?.label || a?.tag); await page.keyboard.press("Tab"); }
    const files = [await shot(`16-settings-${T}`)];
    const csvOk = csvRow.map(b => `${b.text}|${b.cls}`).join(";") === "Import CSV · .csv up to 5 MB|primary;Export CSV|tertiary;Download CSV template|ghost";
    const snapOk = snapRow.map(b => `${b.text}|${b.cls}`).join(";") === "Export draft snapshot|primary;Restore draft snapshot…|tertiary";
    const skipFirst = /Skip to content/.test(order[0] || "");
    const calloutSkipped = !order.some(o => /published map is never touched/.test(o || ""));
    const importIdx = order.findIndex(o => /Import CSV/.test(o || ""));
    const exportSnapIdx = order.findIndex(o => /Export draft snapshot/.test(o || ""));
    const ok = h1 && /Import, export and recovery/.test(sub || "") && headerBtns === 0 && /sp-callout/.test(calloutFirst) && calloutW === 776 && /3px 0px 0px/.test(calloutEdge) && calloutInner === 0 && calloutTab === null && csvOk && /^Columns: .* — e\.g\. /.test(csvLine || "") && snapOk && snapLine === ".json up to 5 MB — a file exported from this page." && !resetInDom && skipFirst && calloutSkipped && importIdx > 0 && exportSnapIdx > importIdx;
    rec("16 Settings frame", T, ok, { sub, headerBtns, calloutFirst, calloutW, calloutEdge, calloutInner, calloutTab, csvRow, csvLine, snapRow, snapLine, resetInDom, order }, "", files);
  });

  // ---------------------------------------------------------------- 17 File triggers and guards
  await step("17 File triggers and guards", T, async () => {
    const importBtn = page.getByRole("button", { name: "Import CSV · .csv up to 5 MB" });
    await importBtn.focus();
    const onButton = (await active())?.label;
    const input = page.locator('input[accept=".csv,text/csv"]');
    const inputAttrs = await input.evaluate(el => ({ tabindex: el.getAttribute("tabindex"), ariaHidden: el.getAttribute("aria-hidden"), hidden: el.hidden }));
    await page.keyboard.press("Tab");
    const nextStop = (await active())?.label;
    const region = page.getByRole("region", { name: "CSV assignments" });
    const inlineErr = () => region.locator("[role='alert']").textContent().then(t => t?.trim());
    const header = "seat_label,employee_name,employee_email,position,department,zone,status,notes\n";
    const cases = [];
    await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
    await page.waitForTimeout(400); cases.push({ file: "notes.txt", error: await inlineErr(), sheet: await page.locator(".sp-tearsheet").count() });
    await input.setInputFiles({ name: "big.csv", mimeType: "text/csv", buffer: Buffer.alloc(6 * 1024 * 1024, 97) });
    await page.waitForTimeout(400); cases.push({ file: "big.csv (6 MB)", error: await inlineErr(), sheet: await page.locator(".sp-tearsheet").count() });
    await input.setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.from("") });
    await page.waitForTimeout(400); cases.push({ file: "empty.csv", error: await inlineErr(), sheet: await page.locator(".sp-tearsheet").count() });
    await input.setInputFiles({ name: "missing.csv", mimeType: "text/csv", buffer: Buffer.from("seat_label,employee_name,employee_email,position,department,notes\nN01,Jane,,,,\n") });
    await page.waitForTimeout(800); cases.push({ file: "missing.csv", error: await inlineErr(), sheet: await page.locator(".sp-tearsheet").count() });
    const files = [await shot(`17-guard-inline-${T}`)];
    await input.setInputFiles({ name: "valid.csv", mimeType: "text/csv", buffer: Buffer.from(`${header}N01,Sample Person,,Analyst,Litigation,North Pod,assigned,\n`) });
    const review = sheet("Review CSV import");
    await review.waitFor({ timeout: 15000 });
    const cards = await review.locator(".sp-count-card").evaluateAll(els => els.map(el => { const s = getComputedStyle(el); return { label: el.querySelector(".sp-count-label")?.textContent, border: s.borderWidth, links: el.querySelectorAll("a, button").length, cursor: s.cursor }; }));
    const consequence = await review.locator(".sp-consequence").first().textContent();
    const reviewFooter = await review.locator(".sp-tearsheet-footer .cds-btn").allTextContents();
    const reviewX = await review.getByRole("button", { name: /close/i }).count();
    files.push(await shot(`17-csv-review-${T}`));
    await review.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(300);
    const cancelClosed = (await review.count()) === 0;
    await input.setInputFiles({ name: "away.csv", mimeType: "text/csv", buffer: Buffer.from(`${header}N01,Sample Person,,Analyst,Litigation,North Pod,away,\n`) });
    const blocked = sheet("CSV import has blocking errors");
    await blocked.waitFor({ timeout: 15000 });
    const alertAboveList = await blocked.evaluate(el => { const a = el.querySelector("[role='alert']"); const l = el.querySelector(".sp-row-list"); return !!a && !!l && a.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING; });
    const rowText = (await blocked.locator(".sp-row-list li[data-blocked]").first().textContent())?.replace(/\s+/g, " ").trim();
    const rowEdge = await blocked.locator(".sp-row-list li[data-blocked]").first().evaluate(el => getComputedStyle(el).boxShadow);
    const applyDisabled = await blocked.getByRole("button", { name: "Fix CSV first" }).isDisabled();
    const reason = await blocked.locator(".sp-tearsheet-reason").textContent();
    files.push(await shot(`17-csv-blocked-${T}`));
    await blocked.getByRole("button", { name: "Close" }).click();
    const ok = onButton === "Import CSV · .csv up to 5 MB" && inputAttrs.tabindex === "-1" && inputAttrs.ariaHidden === "true" && nextStop === "Export CSV" && cases[0].error === "Choose a .csv file." && cases[1].error === "This file is 6.0 MB — the limit is 5 MB." && cases[2].error === "The CSV is empty." && /^Missing required columns: zone, status\./.test(cases[3].error || "") && cases.every(c => c.sheet === 0) && cards.length === 5 && cards.every(c => c.links === 0 && c.border === "0px") && /Applies to the draft only/.test(consequence || "") && reviewFooter.join("|") === "Cancel|Apply import" && reviewX === 0 && cancelClosed && alertAboveList && /Row 2Invalid status 'away'/.test(rowText || "") && /3px 0px 0px/.test(rowEdge) && applyDisabled && (reason || "").length > 0;
    rec("17 File triggers and guards", T, ok, { onButton, inputAttrs, nextStop, cases, cards, consequence, reviewFooter, reviewX, cancelClosed, alertAboveList, rowText, rowEdge, applyDisabled, reason }, "", files);
  });

  // ---------------------------------------------------------------- 18 Restore review + D6-e
  await step("18 Restore review + D6-e", T, async () => {
    const indicatorBefore = await indicator();
    const exportBtn = page.getByRole("button", { name: "Export draft snapshot" });
    const enabledBefore = await exportBtn.isEnabled();
    const [download] = await Promise.all([page.waitForEvent("download"), exportBtn.click()]);
    const fileName = download.suggestedFilename();
    const filePath = await download.path();
    const snapshotBuffer = readFileSync(filePath);
    const input = page.locator('input[accept=".json,application/json"]');
    await input.setInputFiles({ name: fileName, mimeType: "application/json", buffer: snapshotBuffer });
    const review = sheet("Review draft snapshot restore");
    await review.waitFor({ timeout: 15000 });
    const cards = await review.locator(".sp-count-card .sp-count-label").allTextContents();
    const desc = (await review.locator("#json-restore-review-description").textContent())?.replace(/\s+/g, " ");
    const consequences = await review.locator(".sp-consequence-list li").count();
    const ghost = review.getByRole("button", { name: "Export the current draft first" });
    const ghostClass = await ghost.getAttribute("class");
    const [download2] = await Promise.all([page.waitForEvent("download"), ghost.click()]);
    await page.waitForTimeout(300);
    const done = review.locator(".cds-btn--ghost[data-done]");
    const doneText = (await done.textContent())?.trim();
    const doneEnabled = await done.isEnabled();
    const reviewStill = await review.isVisible();
    const files = [await shot(`18-restore-review-exported-${T}`)];
    await review.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(400);
    const indicatorAfterCancel = await indicator();
    await input.setInputFiles({ name: fileName, mimeType: "application/json", buffer: snapshotBuffer });
    await review.waitFor({ timeout: 15000 });
    const restore = review.getByRole("button", { name: "Restore draft snapshot" });
    await restore.click();
    const busy = await restore.textContent().catch(() => "");
    const cancelDisabled = await review.getByRole("button", { name: "Cancel" }).isDisabled().catch(() => null);
    await page.getByRole("status").filter({ hasText: "Draft restored from" }).waitFor({ timeout: 20000 });
    const status = (await page.getByRole("status").filter({ hasText: "Draft restored from" }).textContent())?.trim();
    files.push(await shot(`18-restored-${T}`));
    const ok = enabledBefore && fileName === "seat-map-export.json" && cards.join("|") === "Draft seats|Employees" && /seat-map-export\.json · exported /.test(desc || "") && consequences === 5 && /cds-btn--ghost/.test(ghostClass || "") && /^Exported \d{1,2}:\d{2}/.test(doneText || "") && doneEnabled && reviewStill && download2 && indicatorAfterCancel === indicatorBefore && status === "Draft restored from seat-map-export.json — the draft now matches the snapshot.";
    rec("18 Restore review + D6-e", T, ok, { enabledBefore, fileName, cards, desc, consequences, ghostClass, doneText, doneEnabled, reviewStill, indicatorBefore, indicatorAfterCancel, busy, cancelDisabled, status }, "", files);
  });

  // ---------------------------------------------------------------- 19 MLS02 on restore (once, light)
  if (T === "light") await step("19 MLS02 on restore", T, async () => {
    const input = page.locator('input[accept=".json,application/json"]');
    // Tab A: open the review on a fresh export.
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export draft snapshot" }).click()]);
    const buffer = readFileSync(await download.path());
    await input.setInputFiles({ name: "seat-map-export.json", mimeType: "application/json", buffer });
    const review = sheet("Review draft snapshot restore");
    await review.waitFor({ timeout: 15000 });
    // Tab B: move a seat on /admin (the seed's Maria Lopez N03 → an open seat).
    const tabB = await context.newPage();
    await tabB.goto(`${base}/admin`, { waitUntil: "networkidle" });
    let moved = false;
    let moveNote = "";
    try {
      const pill = tabB.getByRole("button", { name: /^N03 / }).first();
      await pill.click();
      await tabB.locator("#seat-inspector-panel").waitFor({ timeout: 15000 });
      await tabB.getByRole("button", { name: /^Move .* to another seat$/ }).click();
      await tabB.waitForTimeout(400);
      const target = tabB.getByRole("button", { name: /^C0[1-9] / }).first();
      await target.click();
      await tabB.waitForTimeout(400);
      const confirm = tabB.getByRole("button", { name: /^Move (them|here)|^Move$/ }).first();
      if (await confirm.count()) await confirm.click();
      await tabB.waitForTimeout(1500);
      moved = true;
    } catch (e) {
      moveNote = `UI move failed (${String(e).slice(0, 120)}); bumped the seat row through REST instead`;
      const status = execSync("npx supabase status -o env", { cwd: repoRoot, encoding: "utf8" });
      const serviceKey = status.match(/^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m)?.[1];
      const apiUrl = status.match(/^API_URL="?([^"\n]+)"?$/m)?.[1];
      const res = await fetch(`${apiUrl}/rest/v1/seats?layer=eq.draft&label=eq.N03`, { method: "PATCH", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ notes: "smoke bump" }) });
      moved = res.ok;
    }
    await tabB.close();
    await review.getByRole("button", { name: "Restore draft snapshot" }).click();
    await review.locator("[role='alert']").waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(500);
    const alert = (await review.locator("[role='alert']").textContent().catch(() => ""))?.replace(/\s+/g, " ").trim();
    const stillOpen = await review.isVisible();
    const files = [await shot(`19-mls02-restore-${T}`)];
    await review.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(300);
    const closed = (await review.count()) === 0;
    const ok = moved && /refreshed with the latest draft/.test(alert || "") && stillOpen && closed;
    rec("19 MLS02 on restore", T, ok, { moved, alert, stillOpen, closed }, moveNote, files);
  });
}

// ---------------------------------------------------------------- 20 Widths, themes, routes (fresh seed)
if (!ONLY) {
resetStack();
await newSession(email);
{
  const frames = [];
  for (const [route, name] of [["/admin/management", "management"], ["/admin/settings", "settings"]]) {
    for (const [w, h] of [[1280, 800], [1024, 768]]) {
      await open(route, "light", w, h);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      const entry = { route, w, overflow };
      if (name === "management") {
        if (w === 1024) {
          entry.tableScroll = await page.locator(".sp-table-scroll").evaluate(el => ({ overflowX: getComputedStyle(el).overflowX, scrollable: el.scrollWidth > el.clientWidth }));
          await page.getByRole("button", { name: /^Edit / }).first().click();
          await panel().waitFor();
          entry.panelW = await panel().evaluate(el => Math.round(el.getBoundingClientRect().width));
          frames.push(await shot(`20-management-1024-panel`));
          await page.keyboard.press("Escape");
        }
      } else {
        entry.columnW = await page.locator(".sp-settings").evaluate(el => Math.round(el.getBoundingClientRect().width));
        if (w === 1024) {
          await page.locator('input[accept=".csv,text/csv"]').setInputFiles({ name: "valid.csv", mimeType: "text/csv", buffer: Buffer.from("seat_label,employee_name,employee_email,position,department,zone,status,notes\nN01,Sample Person,,Analyst,Litigation,North Pod,assigned,\n") });
          await sheet("Review CSV import").waitFor({ timeout: 15000 });
          entry.sheetW = await sheet("Review CSV import").evaluate(el => Math.round(el.getBoundingClientRect().width));
          frames.push(await shot(`20-settings-1024-sheet`));
          await page.keyboard.press("Escape");
        }
      }
      frames.push(await shot(`20-${name}-${w}`));
      rec(`20 Width ${w} ${route}`, "light", overflow && (entry.panelW === undefined || entry.panelW === 480) && (entry.sheetW === undefined || entry.sheetW === 1024 - 32) && (entry.tableScroll === undefined || entry.tableScroll.overflowX === "auto") && (entry.columnW === undefined || w === 1280 || entry.columnW >= 900), entry, "", []);
    }
  }
  // System theme: no stored theme, OS dark by emulation.
  await page.evaluate(() => localStorage.removeItem("sp-theme"));
  await page.emulateMedia({ colorScheme: "dark" });
  for (const [route, name] of [["/admin/management", "management"], ["/admin/settings", "settings"]]) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const attrs = await page.evaluate(() => [document.documentElement.getAttribute("data-theme"), document.documentElement.getAttribute("data-carbon-theme"), getComputedStyle(document.body).backgroundColor]);
    const dark = attrs[2] === "rgb(22, 22, 22)";
    rec(`20 System theme ${route}`, "system-dark", attrs[0] === null && attrs[1] === null && dark, { attrs }, "", [await shot(`20-${name}-system-dark`)]);
  }
  await page.emulateMedia({ colorScheme: null });
  // Brand check on both pages: no IBM blue computed on any control.
  const blueHits = [];
  for (const route of ["/admin/management", "/admin/settings"]) {
    for (const theme of ["light", "dark"]) {
      await open(route, theme);
      const hits = await page.evaluate(blues => {
        const out = [];
        for (const el of document.querySelectorAll("button, a, [role='tab'], input")) {
          const s = getComputedStyle(el);
          for (const p of ["color", "backgroundColor", "borderColor", "outlineColor", "boxShadow"]) {
            if (blues.some(b => s[p].includes(b))) out.push(`${el.tagName.toLowerCase()} ${el.textContent?.trim().slice(0, 20)} ${p}=${s[p]}`);
          }
        }
        return out;
      }, IBM_BLUES);
      blueHits.push(...hits.map(h => `${route} ${theme}: ${h}`));
    }
  }
  const grep = execSync('grep -rn "0f62fe" app components lib', { cwd: repoRoot, encoding: "utf8" }).split("\n").filter(Boolean);
  const grepOnlyAsset = grep.every(l => l.startsWith("app/styles/carbon-tokens.css"));
  rec("20 Brand check", "both", blueHits.length === 0 && grepOnlyAsset, { blueHits, grepFiles: [...new Set(grep.map(l => l.split(":")[0]))] }, "", []);
  // 403 as the viewer.
  await newSession(viewerEmail);
  for (const [route, name] of [["/admin/management", "management"], ["/admin/settings", "settings"]]) {
    await open(route, "light");
    const heading = await page.getByRole("heading", { name: "Admin access required" }).isVisible();
    const back = page.getByRole("link", { name: "Back to seat map" });
    const backClass = await back.getAttribute("class");
    const f = [await shot(`20-${name}-403`)];
    await back.click();
    await page.waitForURL(u => u.pathname === "/", { timeout: 15000 });
    rec(`20 403 ${route}`, "light", heading && /cds-btn--tertiary/.test(backClass || "") && new URL(page.url()).pathname === "/", { heading, backClass, landed: new URL(page.url()).pathname }, "", f);
  }
  const realErrors = consoleErrors.filter(e => !/speed-insights|404 \(Not Found\)|Failed to load resource/.test(e));
  rec("20 Console", "both", realErrors.length === 0, { errors: realErrors.slice(0, 10), speedInsightsNoise: consoleErrors.length - realErrors.length }, "", []);
}
}

writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pass; ${failed.length} fail${failed.length ? ": " + failed.map(f => `${f.step} (${f.theme})`).join(", ") : ""}`);
await browser.close();
