// Phase 4 · PR 5 pre-merge smoke — owner-ordered, eighteen steps (2026-09-06). Drives Reception and the
// route surfaces through the owner's step list in real Chrome at 1920×1080, light and dark (steps 1, 4
// and 9 also in the system state), records step · theme · pass/fail · computed values to results.json
// and captures every state named. Reception is read-only, so the seeded VIEWER drives every Reception
// step; the admin session is used only where the step says so (the /login baseline in step 17 signs in
// as the admin, as the runtime audit does). Assertions are computed values and hit tests, never isVisible.
// Usage: node docs/redesign-v2/phase4/audit/pr5-smoke.mjs <baseUrl> <outDir> <adminEmail> <password> <viewerEmail> [mainBaselineDir]
//   mainBaselineDir: the runtime audit's output for the SAME rig run against a `main` build (step 17's byte-compare).
import { createRequire } from "node:module";
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const { default: AxeBuilder } = require("@axe-core/playwright");
const [base = "http://localhost:3200", outDir = "out", email, password, viewerEmail, baselineDir] = process.argv.slice(2);
if (!email || !password || !viewerEmail) {
  console.error("admin email, password and viewer email required (the seeded local accounts)");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const ONLY = process.env.SMOKE_ONLY ? new Set(process.env.SMOKE_ONLY.split(",").map(x => x.trim())) : null;
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");

const results = [];
const rec = (step, theme, ok, values = {}, note = "", files = []) => {
  results.push({ step, theme, ok, values, note, files });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} (${theme})${note ? " — " + note : ""}`);
  if (!ok) console.log("  values:", JSON.stringify(values).slice(0, 1500));
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
};
const step = async (name, theme, fn) => {
  if (ONLY && !ONLY.has(name.split(" ")[0])) return;
  try {
    await fn();
  } catch (e) {
    const file = await shot(`${name.split(" ")[0]}-crash-${theme}`).catch(() => null);
    rec(name, theme, false, { focus: await active().catch(() => null) }, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, file ? [file] : []);
  }
};
const resetStack = () => {
  execSync("npx supabase db reset", { cwd: repoRoot, stdio: "ignore" });
  execSync("node scripts/seed-local-db.mjs", { cwd: repoRoot, stdio: "ignore" });
};
const IBM_BLUES = ["rgb(15, 98, 254)", "rgb(3, 83, 233)", "rgb(0, 67, 206)", "rgb(69, 137, 255)", "rgb(120, 169, 255)", "rgb(166, 200, 255)", "rgb(208, 226, 255)", "rgb(0, 29, 108)"];
const TERRACOTTA = "rgb(184, 92, 46)";
const LINK = { light: "rgb(143, 69, 33)", dark: "rgb(232, 160, 122)", system: "rgb(232, 160, 122)" };

const browser = await chromium.launch({ channel: "chrome" });
let context;
let page;
let consoleErrors = [];
let failedResponses = [];
const newSession = async who => {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  page = await context.newPage();
  page.on("pageerror", e => consoleErrors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("response", r => { if (r.status() >= 400) failedResponses.push(`${r.status()} ${new URL(r.url()).pathname}`); });
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
// Theme: "light" / "dark" stored; "system" = nothing stored, the OS scheme emulated dark.
const applyTheme = async theme => {
  if (theme === "system") {
    await page.evaluate(() => localStorage.removeItem("sp-theme"));
    await page.emulateMedia({ colorScheme: "dark" });
  } else {
    await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
    await page.emulateMedia({ colorScheme: null });
  }
};
const open = async (route, theme, width = 1920, height = 1080) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await applyTheme(theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("main .sp-recep, main .sp-route-card, #viewer-seat-search, .mss-backdrop").first().waitFor({ state: "attached" }).catch(() => {});
  await page.waitForTimeout(600);
};
const css = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  return { tag: el.tagName.toLowerCase(), id: el.id, label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || "", isField: el.id === "reception-main" };
});
const attrs = () => page.evaluate(() => [document.documentElement.getAttribute("data-theme"), document.documentElement.getAttribute("data-carbon-theme")]);
const field = () => page.locator("#reception-main");
const readout = () => page.getByRole("region", { name: "Caller detail" });
const cursorRow = () => page.locator("main li[role='option'][data-highlight]");
const lockedRow = () => page.locator("main li[role='option'][aria-selected='true']");
const count = () => page.locator("main .sp-recep-count").textContent();
const hint = () => page.locator("main .sp-readout-hint").textContent().catch(() => null);
const hintCount = () => page.locator("main .sp-readout-hint").count();
const readoutName = () => readout().getByRole("heading", { level: 2 }).textContent().catch(() => null);
const url = () => { const u = new URL(page.url()); return u.pathname + u.search; };
const noSidewaysScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const focusBody = () => page.evaluate(() => { const b = document.body; b.tabIndex = -1; b.focus(); b.removeAttribute("tabindex"); });
const lockByTyping = async name => { await field().fill(name); await page.waitForTimeout(150); await page.keyboard.press("Enter"); await page.waitForTimeout(250); };
const blueScan = () => page.evaluate(blues => {
  const hits = [];
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    for (const p of ["color", "backgroundColor", "borderTopColor", "outlineColor", "boxShadow"]) {
      const v = s[p];
      if (blues.some(b => v.includes(b))) hits.push(`${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal === undefined ? el.className : "").toString().split(" ")[0]} ${p}=${v}`);
    }
  }
  return hits.slice(0, 5);
}, IBM_BLUES);
const axe = async () => { const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze(); return r.violations.map(v => `${v.id} (${v.nodes.length})`); };

for (const theme of ["light", "dark", "system"]) {
  const T = theme;
  const full = theme !== "system"; // the system pass runs steps 1, 4, 9 only
  resetStack();
  consoleErrors = [];
  await newSession(viewerEmail);

  // ---------------------------------------------------------------- 1 Frame
  await step("1 Frame", T, async () => {
    await open("/reception", T);
    const h1 = page.getByRole("heading", { name: "Reception", level: 1 });
    const h1Font = await h1.evaluate(el => { const s = getComputedStyle(el); return `${s.fontSize}/${s.lineHeight}`; });
    const sub = await page.locator("main .cds-page-subtitle").textContent();
    const headerBtns = await page.locator("main .cds-page-header .cds-btn").count();
    const list = await page.locator("main .sp-recep-list").evaluate(el => el.getBoundingClientRect());
    const ro = await readout().evaluate(el => el.getBoundingClientRect());
    const gap = Math.round(ro.x - (list.x + list.width));
    const noScroll = await noSidewaysScroll();
    const at = await attrs();
    const bodyBg = await css(page.locator("body"), "backgroundColor");
    const files = [await shot(`01-frame-${T}`)];
    // Sticky: the seed is short, so a squat viewport forces the pane to scroll; the readout's top must
    // stay 16px under the 48px header (the sheet's top: header + 16 with the header offset zeroed at lg).
    await page.setViewportSize({ width: 1920, height: 420 });
    await page.waitForTimeout(300);
    const scrolled = await page.evaluate(() => { const r = document.querySelector('[role="region"][aria-label="Reception directory"]'); if (!r) return -1; r.scrollTop = 300; return r.scrollTop; });
    await page.waitForTimeout(300);
    const roTop = Math.round((await readout().evaluate(el => el.getBoundingClientRect().y)));
    const stickyPos = await css(readout(), "position");
    files.push(await shot(`01-frame-sticky-${T}`));
    await page.setViewportSize({ width: 1920, height: 1080 });
    const ok = h1Font === "28px/36px" && sub === "Front-desk directory — type what the caller gives you, read the extension, transfer." && headerBtns === 0 && Math.round(list.width) === 1008 && Math.round(ro.width) === 480 && gap === 32 && noScroll && scrolled > 0 && roTop === 64 && stickyPos === "sticky" && (T === "system" ? at.join("/") === "/" : true);
    rec("1 Frame", T, ok, { h1Font, sub, headerBtns, listWidth: list.width, readoutWidth: ro.width, gap, noScroll, scrolled, readoutTopAfterScroll: roTop, stickyPos, attrs: at, bodyBg }, "", files);
  });

  if (full) {
    // -------------------------------------------------------------- 2 Search at rest
    await step("2 Search at rest", T, async () => {
      await open("/reception", T);
      const height = await field().evaluate(el => el.getBoundingClientRect().height);
      const glyph = await page.locator("main .sp-search-lg > svg").count();
      const placeholder = await field().getAttribute("placeholder");
      const focus = await active();
      const kbd = await page.locator("main .sp-search-trailing .sp-kbd").textContent();
      const clear = await page.getByRole("button", { name: "Clear search" }).count();
      const ring = await field().evaluate(el => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`; });
      const ok = Math.round(height) === 48 && glyph === 1 && placeholder === "Name, department, seat, or extension…" && focus?.isField === true && kbd === "⌘ K" && clear === 0 && ring === `solid 2px ${TERRACOTTA} -2px`;
      rec("2 Search at rest", T, ok, { height, glyph, placeholder, focus, kbd, clear, ring }, "", [await shot(`02-search-rest-${T}`, { x: 190, y: 140, width: 1030, height: 70 })]);
    });

    // -------------------------------------------------------------- 3 Count and typing
    await step("3 Count and typing", T, async () => {
      const rest = await count();
      await field().fill("Da");
      await page.waitForTimeout(250);
      const typed = await count();
      const cursors = await cursorRow().count();
      const cursorBg = await css(cursorRow(), "backgroundColor");
      const cursorBar = await css(cursorRow(), "boxShadow");
      const hoverSurface = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sp-recep-row-highlight").trim());
      const activedesc = await field().getAttribute("aria-activedescendant");
      const cursorId = await cursorRow().getAttribute("id");
      const cursorName = (await cursorRow().locator(".sp-recep-name").textContent());
      const preview = await readoutName();
      const h = await hint();
      const files = [await shot(`03-typing-${T}`)];
      await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(150);
      const lastName = await cursorRow().locator(".sp-recep-name").textContent();
      const rows = await page.locator("main li[role='option'] .sp-recep-name").allTextContents();
      await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(150);
      const firstName = await cursorRow().locator(".sp-recep-name").textContent();
      const ok = rest === "12 people" && typed === "2 matches" && cursors === 1 && cursorBar.includes(TERRACOTTA) && /3px/.test(cursorBar) && activedesc === cursorId && preview === cursorName && /↵/.test(h ?? "") && /to lock/.test(h ?? "") && lastName === rows[rows.length - 1] && firstName === rows[0];
      rec("3 Count and typing", T, ok, { rest, typed, cursors, cursorBg, hoverSurface, cursorBar, activedesc, cursorId, cursorName, preview, hint: h, rows, lastName, firstName }, "", files);
      await field().fill("");
    });
  }

  // ---------------------------------------------------------------- 4 Lock
  await step("4 Lock", T, async () => {
    if (!full) await open("/reception", T);
    const before = await page.evaluate(() => history.length);
    await field().fill("Da");
    await page.waitForTimeout(200);
    const name = await cursorRow().locator(".sp-recep-name").textContent();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const locked = await lockedRow().count();
    const lockedName = await lockedRow().locator(".sp-recep-name").textContent();
    const lockedBg = await css(lockedRow(), "backgroundColor");
    const selectedSurface = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sp-recep-row-locked").trim());
    const lockedBar = await css(lockedRow(), "boxShadow");
    const after = await page.evaluate(() => history.length);
    const u = url();
    const value = await field().inputValue();
    const h = await hint();
    const map = page.getByRole("link", { name: "Show on map" });
    const mapHref = await map.getAttribute("href");
    const mapColor = await css(map, "color");
    const at = await attrs();
    const ok = locked === 1 && lockedName === name && lockedBar.includes(TERRACOTTA) && u === `/reception?q=${encodeURIComponent(name).replace(/%20/g, "+")}` && before === after && value === "" && /Esc/.test(h ?? "") && /to unlock/.test(h ?? "") && mapHref === `/?q=${encodeURIComponent(name).replace(/%20/g, "+")}` && mapColor === LINK[T] && (T === "system" ? at.join("/") === "/" : T === "dark" ? at[1] === "g100" : at[1] === "white");
    rec("4 Lock", T, ok, { name, locked, lockedBg, selectedSurface, lockedBar, url: u, historyBefore: before, historyAfter: after, value, hint: h, mapHref, mapColor, attrs: at }, "", [await shot(`04-locked-${T}`)]);
  });

  if (full) {
    // -------------------------------------------------------------- 5 Esc, both rungs
    await step("5 Esc both rungs", T, async () => {
      const lockedName = await readoutName();
      await field().fill("zz");
      await page.waitForTimeout(250);
      const zeroCount = await count();
      const empty = page.locator("main .sp-recep-list .cds-empty");
      const emptyH3 = await empty.locator("h3").textContent();
      const clearGhost = await empty.locator("button.cds-btn--ghost").textContent();
      const stillName = await readoutName();
      const hintsZero = await hintCount();
      const files = [await shot(`05-zero-locked-${T}`)];
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const afterEsc1 = { value: await field().inputValue(), locked: await lockedRow().count(), name: await readoutName(), hint: await hint(), url: url() };
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const waiting = await readout().textContent();
      const afterEsc2 = { locked: await lockedRow().count(), waiting: /Waiting for a call\./.test(waiting), url: url(), hints: await hintCount() };
      files.push(await shot(`05-unlocked-${T}`));
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      const afterEnter = { locked: await lockedRow().count(), url: url(), value: await field().inputValue() };
      const ok = zeroCount === "0 matches" && emptyH3 === "No one matches “zz”" && clearGhost === "Clear search" && stillName === lockedName && hintsZero === 0 && afterEsc1.value === "" && afterEsc1.locked === 1 && afterEsc1.name === lockedName && /Esc/.test(afterEsc1.hint ?? "") && afterEsc1.url.includes("?q=") && afterEsc2.locked === 0 && afterEsc2.waiting && afterEsc2.url === "/reception" && afterEsc2.hints === 0 && afterEnter.locked === 0 && afterEnter.url === "/reception" && afterEnter.value === "";
      rec("5 Esc both rungs", T, ok, { lockedName, zeroCount, emptyH3, clearGhost, stillName, hintsZero, afterEsc1, afterEsc2, afterEnter }, "", files);
    });

    // -------------------------------------------------------------- 6 Focus never leaves the field
    await step("6 Focus never leaves the field", T, async () => {
      const pressOn = async locator => {
        const b = await locator.boundingBox();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(100);
        const during = await active();
        await page.mouse.up();
        await page.waitForTimeout(250);
        return during?.isField === true;
      };
      const row = page.locator("main li[role='option']", { hasText: "Maria Lopez" });
      const rowOk = await pressOn(row);
      const rowLocked = (await lockedRow().locator(".sp-recep-name").textContent()) === "Maria Lopez";
      await lockByTyping("Vict");
      const fallback = readout().locator(".sp-recep-fallback button.cds-btn--ghost").first();
      const fallbackName = (await fallback.textContent()).replace(/\d+$/, "");
      const fbOk = await pressOn(fallback);
      const fbLocked = (await lockedRow().locator(".sp-recep-name").textContent()) === fallbackName;
      const recent = page.getByRole("complementary", { name: "Recent lookups" }).getByRole("button").first();
      const recentName = (await recent.textContent()).replace(/\d+$/, "");
      const recentOk = await pressOn(recent);
      const recentLocked = (await lockedRow().locator(".sp-recep-name").textContent()) === recentName;
      await field().fill("x");
      await page.waitForTimeout(150);
      const clearOk = await pressOn(page.getByRole("button", { name: "Clear search" }));
      const cleared = (await field().inputValue()) === "";
      const ok = rowOk && rowLocked && fbOk && fbLocked && recentOk && recentLocked && clearOk && cleared;
      rec("6 Focus never leaves the field", T, ok, { rowOk, rowLocked, fallbackName, fbOk, fbLocked, recentName, recentOk, recentLocked, clearOk, cleared }, "", [await shot(`06-pointer-${T}`)]);
    });

    // -------------------------------------------------------------- 7 Ctrl / ⌘ K
    await step("7 Cmd K", T, async () => {
      await field().fill("Kim");
      await page.waitForTimeout(150);
      await page.keyboard.press("Tab");
      await page.waitForTimeout(100);
      const tabbed = await active();
      await page.keyboard.press("Meta+k");
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => { const el = document.activeElement; return { isField: el?.id === "reception-main", selStart: el?.selectionStart, selEnd: el?.selectionEnd, value: el?.value }; });
      const ok = tabbed?.isField === false && after.isField && after.selStart === 0 && after.selEnd === 3 && after.value === "Kim";
      rec("7 Cmd K", T, ok, { tabbed, after }, "", [await shot(`07-cmd-k-${T}`, { x: 190, y: 140, width: 1030, height: 70 })]);
    });

    // -------------------------------------------------------------- 8 Clear ×
    await step("8 Clear ×", T, async () => {
      await field().fill("");
      await lockByTyping("Alex");
      const lockedBefore = await lockedRow().locator(".sp-recep-name").textContent();
      await field().fill("Kim");
      await page.waitForTimeout(150);
      const shown = await page.getByRole("button", { name: "Clear search" }).count();
      const files = [await shot(`08-clear-x-${T}`, { x: 190, y: 140, width: 1030, height: 70 })];
      await page.getByRole("button", { name: "Clear search" }).click();
      await page.waitForTimeout(200);
      const value = await field().inputValue();
      const focus = await active();
      const gone = await page.getByRole("button", { name: "Clear search" }).count();
      const lockedAfter = await lockedRow().locator(".sp-recep-name").textContent();
      const ok = shown === 1 && value === "" && focus?.isField === true && gone === 0 && lockedAfter === lockedBefore;
      rec("8 Clear ×", T, ok, { shown, value, focus, gone, lockedBefore, lockedAfter }, "", files);
    });
  }

  // ---------------------------------------------------------------- 9 No extension
  await step("9 No extension", T, async () => {
    if (!full) await open("/reception", T);
    await field().fill("");
    await lockByTyping("Victor Chen");
    const tile = readout().locator(".sp-readout");
    const none = tile.locator(".sp-readout-none");
    const noneText = await none.textContent();
    const noneFont = await none.evaluate(el => { const s = getComputedStyle(el); return `${s.fontSize}/${s.lineHeight}`; });
    const tileText = await tile.textContent();
    const seatLine = await readout().locator(".sp-recep-seatline").textContent();
    const fbHeading = await readout().locator(".sp-recep-fallback h3").textContent();
    const fbButtons = readout().locator(".sp-recep-fallback .sp-row-buttons button");
    const fbCount = await fbButtons.count();
    const fbHeights = await fbButtons.evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().height)));
    const fbGhost = await fbButtons.evaluateAll(els => els.every(el => el.classList.contains("cds-btn--ghost")));
    const fbExts = await fbButtons.locator(".sp-row-button-ext").allTextContents();
    const files = [await shot(`09-no-extension-${T}`)];
    await fbButtons.first().click();
    await page.waitForTimeout(250);
    const lockedAfter = await lockedRow().locator(".sp-recep-name").textContent();
    const numeral = await readout().locator(".sp-readout-numeral").textContent();
    const ok = noneText === "No extension on file" && noneFont === "14px/20px" && !tileText.includes("—") && seatLine.length > 0 && fbHeading === "If no answer — same department" && fbCount >= 1 && fbCount <= 3 && fbHeights.every(h => h === 40) && fbGhost && fbExts.every(e => /^\d+$/.test(e)) && lockedAfter === "Alex Shabazian" && numeral === fbExts[0];
    rec("9 No extension", T, ok, { noneText, noneFont, tileHasDash: tileText.includes("—"), seatLine, fbHeading, fbCount, fbHeights, fbGhost, fbExts, lockedAfter, numeral }, "", files);
  });

  if (full) {
    // -------------------------------------------------------------- 10 Recents
    await step("10 Recents", T, async () => {
      await open("/reception", T);
      for (const n of ["Alex", "Maria", "David", "Nina"]) await lockByTyping(n);
      const region = page.getByRole("complementary", { name: "Recent lookups" });
      const names = (await region.getByRole("button").allTextContents()).map(t => t.replace(/\d+$/, ""));
      const outsideLive = await region.evaluate(el => el.closest("[aria-live]") === null);
      const liveInReadout = await readout().locator("[aria-live='polite']").count();
      const files = [await shot(`10-recents-${T}`)];
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const afterReload = await page.getByRole("complementary", { name: "Recent lookups" }).count();
      const ok = names.join("|") === "David Kim|Maria Lopez|Alex Shabazian" && names.length <= 4 && !names.includes("Nina Patel") && outsideLive && liveInReadout === 1 && afterReload === 0;
      rec("10 Recents", T, ok, { names, outsideLive, liveInReadout, afterReload }, "", files);
    });

    // -------------------------------------------------------------- 11 Show on map
    await step("11 Show on map", T, async () => {
      await open("/reception", T);
      await lockByTyping("Alex");
      await page.getByRole("link", { name: "Show on map" }).click();
      await page.waitForURL(u => u.pathname === "/", { timeout: 15000 });
      const mapUrl = url();
      let pressed = 0, inspector = 0, palette = 0;
      for (let i = 0; i < 25; i++) {
        pressed = await page.locator("button[data-seat-id][aria-pressed='true']").count();
        inspector = await page.locator("#seat-inspector-panel").count();
        palette = await page.locator("#viewer-find-palette").count();
        if (pressed || inspector) break;
        await page.waitForTimeout(200);
      }
      const fieldValue = await page.locator("#viewer-seat-search").inputValue().catch(() => null);
      const pressedName = await page.locator("button[data-seat-id][aria-pressed='true']").first().getAttribute("aria-label").catch(() => null);
      const files = [await shot(`11-show-on-map-${T}`)];
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const backUrl = url();
      const backLocked = await lockedRow().count();
      const ok = mapUrl === "/?q=Alex+Shabazian" && fieldValue === "Alex Shabazian" && (pressed === 1 || inspector === 1) && backUrl === "/reception?q=Alex+Shabazian" && backLocked === 1;
      rec("11 Show on map", T, ok, { mapUrl, fieldValue, pressed, pressedName, inspector, palette, backUrl, backLocked }, "", files);
    });

    // -------------------------------------------------------------- 12 ?q= landing, three branches
    await step("12 q landing", T, async () => {
      await open("/reception?q=201", T);
      const a = { locked: await lockedRow().count(), name: await lockedRow().locator(".sp-recep-name").textContent().catch(() => null), url: url() };
      const files = [await shot(`12-landing-201-${T}`)];
      await open("/reception?q=Records", T);
      const b = { cursor: await cursorRow().count(), cursorName: await cursorRow().locator(".sp-recep-name").textContent().catch(() => null), locked: await lockedRow().count(), value: await field().inputValue(), count: await count() };
      files.push(await shot(`12-landing-records-${T}`));
      await open("/reception?q=zzzz", T);
      const c = { count: await count(), value: await field().inputValue(), empty: await page.locator("main .sp-recep-list .cds-empty h3").textContent(), waiting: /Waiting for a call\./.test(await readout().textContent()) };
      files.push(await shot(`12-landing-zero-${T}`));
      const rows = b.cursorName;
      const ok = a.locked === 1 && a.name === "Alex Shabazian" && a.url === "/reception?q=Alex+Shabazian" && b.cursor === 1 && b.locked === 0 && b.value === "Records" && b.count === "2 matches" && !!rows && c.count === "0 matches" && c.value === "zzzz" && c.empty === "No one matches “zzzz”" && c.waiting;
      rec("12 q landing", T, ok, { unique: a, several: b, zero: c }, "", files);
    });

    // -------------------------------------------------------------- 13 Keyboard path + landmarks + axe
    await step("13 Keyboard path and landmarks", T, async () => {
      await open("/reception", T);
      const axeRest = await axe();
      await focusBody();
      await page.keyboard.press("Tab");
      const skip = await active();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);
      const landed = await active();
      // A lock (with recents) so the readout actions and the recents exist; then walk the Tab order.
      for (const n of ["Maria", "Victor"]) await lockByTyping(n);
      const order = [];
      for (let i = 0; i < 5; i++) { await page.keyboard.press("Tab"); order.push(await active()); }
      const listboxStops = await page.evaluate(() => [...document.querySelectorAll("main [role='listbox'], main [role='option']")].filter(el => el.hasAttribute("tabindex")).length);
      const landmarks = await page.evaluate(() => ({ search: document.querySelectorAll("[role='search']").length, main: document.querySelectorAll("main").length, complementary: [...document.querySelectorAll("[role='complementary'], aside")].map(el => el.getAttribute("aria-label")) }));
      const axeLocked = await axe();
      const files = [await shot(`13-keyboard-${T}`)];
      const labels = order.map(o => o?.label);
      const ok = skip?.label === "Skip to content" && landed?.isField === true && labels[0]?.startsWith("Alex Shabazian") && labels[1] === "Show on map" && labels[2]?.startsWith("Maria Lopez") && listboxStops === 0 && landmarks.search === 1 && landmarks.main === 1 && landmarks.complementary.includes("Recent lookups") && axeRest.length === 0 && axeLocked.length === 0;
      rec("13 Keyboard path and landmarks", T, ok, { skip, landed, order: labels, listboxStops, landmarks, axeRest, axeLocked }, "", files);
    });

    // -------------------------------------------------------------- 14 Widths
    await step("14 Widths", T, async () => {
      await open("/reception?q=201", T, 1280, 800);
      const w1280 = { columns: (await css(page.locator("main .sp-recep"), "gridTemplateColumns")).split(/\s+/).length, readout: Math.round((await readout().evaluate(el => el.getBoundingClientRect().width))), noScroll: await noSidewaysScroll() };
      const files = [await shot(`14-1280-${T}`)];
      await open("/reception?q=201", T, 1024, 768);
      const list = await page.locator("main .sp-recep-list").evaluate(el => el.getBoundingClientRect());
      const ro = await readout().evaluate(el => el.getBoundingClientRect());
      const back = readout().getByRole("button", { name: "Back to the list" });
      const backDisplay = await css(back, "display"); // a flex item blockifies the sheet's inline-flex to "flex"
      const backBox = await back.boundingBox();
      const backFirst = await readout().evaluate(el => el.firstElementChild?.textContent?.trim());
      const w1024 = { columns: (await css(page.locator("main .sp-recep"), "gridTemplateColumns")).split(/\s+/).length, position: await css(readout(), "position"), below: ro.y >= list.y + list.height - 1, backDisplay, backAtTop: !!backBox && Math.round(backBox.y) >= Math.round(ro.y) && Math.round(backBox.y) < Math.round(ro.y) + 40, backFirst, noScroll: await noSidewaysScroll() };
      await back.scrollIntoViewIfNeeded();
      files.push(await shot(`14-1024-readout-${T}`));
      await back.click();
      await page.waitForTimeout(400);
      const focus = await active();
      const fieldBox = await field().boundingBox();
      const fieldInView = !!fieldBox && fieldBox.y >= 0 && fieldBox.y + fieldBox.height <= 768;
      files.push(await shot(`14-1024-back-${T}`));
      const ok = w1280.columns === 2 && w1280.readout === 480 && w1280.noScroll && w1024.columns === 1 && w1024.position === "static" && w1024.below && w1024.backDisplay !== "none" && !!backBox && Math.round(backBox.height) === 40 && w1024.backAtTop && w1024.backFirst === "Back to the list" && w1024.noScroll && focus?.isField === true && fieldInView;
      rec("14 Widths", T, ok, { w1280, w1024, focusAfterBack: focus, fieldInView }, "", files);
      await page.setViewportSize({ width: 1920, height: 1080 });
    });
  }

  // ---------------------------------------------------------------- 15 Themes (computed, every pass)
  await step("15 Themes", T, async () => {
    await open("/reception?q=201", T);
    const at = await attrs();
    const bar = await css(lockedRow(), "boxShadow");
    const link = await css(page.getByRole("link", { name: "Show on map" }), "color");
    const blues = await blueScan();
    const bg = await css(page.locator("main"), "backgroundColor");
    const ok = bar.includes(TERRACOTTA) && link === LINK[T] && blues.length === 0 && (T === "light" ? at[1] === "white" && bg === "rgb(255, 255, 255)" : T === "dark" ? at[1] === "g100" && bg === "rgb(22, 22, 22)" : at.join("/") === "/" && bg === "rgb(22, 22, 22)");
    rec("15 Themes", T, ok, { attrs: at, bar, link, blues, mainBg: bg }, "", [await shot(`15-theme-${T}`)]);
  });

  if (full) {
    // -------------------------------------------------------------- 16 Route cards (viewer for the 403; the admin boundary by its anchors)
    await step("16 Route cards", T, async () => {
      await open("/admin", T);
      const card = page.locator("main .sp-route-card");
      const cardBg = await css(card, "backgroundColor");
      const empty = await card.locator(".cds-empty").count();
      const raster = await page.locator("main img").count();
      const h2 = await card.locator("h2").textContent();
      const tertiary = card.locator("a.cds-btn--tertiary");
      const tertiaryText = await tertiary.textContent();
      const tertiaryHref = await tertiary.getAttribute("href");
      const tertiaryColor = await css(tertiary, "color");
      const files = [await shot(`16-admin-403-${T}`)];
      await tertiary.click();
      await page.waitForURL(u => u.pathname === "/", { timeout: 15000 });
      const after403 = url();
      const resp = await page.goto(`${base}/definitely-not-a-route`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const status = resp?.status();
      const nf = page.locator("main .sp-route-card");
      const nfH2 = await nf.locator("h2").textContent();
      const nfBg = await css(nf, "backgroundColor");
      const nfAction = nf.locator("a.cds-btn");
      const nfActionText = await nfAction.textContent();
      files.push(await shot(`16-not-found-${T}`));
      await nfAction.click();
      await page.waitForURL(u => u.pathname === "/", { timeout: 15000 });
      const after404 = url();
      const adminBoundary = readFileSync(path.join(repoRoot, "app/(shell)/admin/error.tsx"), "utf8");
      const anchors = ["planChunkErrorRecovery", 'from "@/lib/chunkLoadRecovery"', "window.location.reload()", "sessionStorage", "onClick={reset}", "sp-route-card", "ErrorGlyph"].filter(a => !adminBoundary.includes(a));
      const expectedCard = T === "light" ? "rgb(255, 255, 255)" : "rgb(57, 57, 57)";
      const ok = cardBg === expectedCard && empty === 1 && raster === 0 && h2 === "Admin access required" && tertiaryText === "Back to seat map" && tertiaryHref === "/" && (T === "light" ? tertiaryColor === TERRACOTTA : tertiaryColor === "rgb(255, 255, 255)") && after403 === "/" && status === 404 && nfH2 === "This page does not exist" && nfBg === expectedCard && nfActionText === "Back to the seat map" && after404 === "/" && anchors.length === 0;
      rec("16 Route cards", T, ok, { cardBg, empty, raster, h2, tertiaryText, tertiaryHref, tertiaryColor, after403, status, nfH2, nfBg, nfActionText, after404, missingAnchors: anchors }, "", files);
    });
  }
}

// ------------------------------------------------------------------ 17 Unchanged surfaces (byte-compare vs the main baseline)
await step("17 Unchanged surfaces", "both", async () => {
  if (!baselineDir || !existsSync(baselineDir)) { rec("17 Unchanged surfaces", "both", false, {}, "no main baseline dir given"); return; }
  const recheck = path.join(outDir, "runtime-recheck");
  execFileSync(process.execPath, ["docs/redesign-v2/phase4/audit/runtime-audit.mjs", base, recheck, email, password, viewerEmail], { cwd: repoRoot, stdio: "ignore" });
  const files = ["login-light-1920.png", "login-dark-1920.png", "login-light-1024.png", "viewer-my-seat-light-1920.png", "viewer-my-seat-dark-1920.png"];
  const compare = {};
  for (const f of files) {
    const a = path.join(baselineDir, f), b = path.join(recheck, f);
    compare[f] = existsSync(a) && existsSync(b) && Buffer.compare(readFileSync(a), readFileSync(b)) === 0 ? "IDENTICAL" : "DIFFERS";
  }
  rec("17 Unchanged surfaces", "both", Object.values(compare).every(v => v === "IDENTICAL"), compare, `baseline ${baselineDir}`, files.map(f => `runtime-recheck/${f}`));
});

// ------------------------------------------------------------------ 18 Hygiene
await step("18 Hygiene", "both", async () => {
  // Console "Failed to load resource" lines carry no URL, so the failed RESPONSES are the record: anything
  // beyond the Speed Insights script 404ing under a local `next start` — and the 404 route step 16 asks for.
  const other = failedResponses.filter(e => !/speed-insights/.test(e) && !/definitely-not-a-route/.test(e));
  const otherConsole = consoleErrors.filter(e => !/speed-insights/.test(e) && !/Failed to load resource/.test(e));
  const grep = cmd => { try { return execSync(cmd, { cwd: repoRoot, encoding: "utf8" }).trim(); } catch (e) { return (e.stdout || "").trim(); } };
  const blue = grep("grep -rln 0f62fe app components lib");
  const shadow = grep("grep -rn shadow-sp app components lib tailwind.config.ts");
  const closeIcon = grep('grep -rn "components/ui/CloseIcon" app components tests');
  const ok = other.length === 0 && otherConsole.length === 0 && blue === "app/styles/carbon-tokens.css" && shadow === "" && closeIcon === "";
  rec("18 Hygiene", "both", ok, { consoleErrorsTotal: consoleErrors.length, failedResponsesTotal: failedResponses.length, speedInsights404s: failedResponses.filter(e => /speed-insights/.test(e)).length, otherFailedResponses: [...new Set(other)].slice(0, 8), otherConsole: otherConsole.slice(0, 5), blueFiles: blue, shadowSp: shadow, closeIcon }, "");
});

await browser.close();
writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pass; ${failed.length} fail${failed.length ? ": " + failed.map(f => `${f.step} (${f.theme})`).join(", ") : ""}`);
