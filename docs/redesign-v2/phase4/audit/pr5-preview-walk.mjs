// Phase 4 · PR 5 read-only preview walk (2026-09-07). Drives the Vercel branch preview of PR 5 in real
// Chrome at 1920×1080 light + dark and 1280 light (1024 for the fold): Reception at rest, typing, locked,
// the two Esc rungs, a no-extension person, the ?q=201 landing, Show on map → the viewer landing, the
// narrow frame with Back to the list; /admin (the 403 card for a viewer — or the map for an admin
// account, recorded as such); a 404 URL. ZERO WRITES BY CONSTRUCTION: Reception is read-only, the map is
// only landed on (nothing selected by hand, nothing edited); the rig never presses Save / Publish /
// Discard / Restore / Import / Delete. The preview reads the PRODUCTION database, so every Next-Action POST
// the browser sends is logged to results.json as evidence and the header indicator is compared before and
// after. People data is masked in every capture (public repo): the rows' name / meta / extension cells, the
// readout's name, role, numeral, fallback and recents render as a soft smudge — text fill only, every
// measured colour and geometry is the real thing.
// Usage: node docs/redesign-v2/phase4/audit/pr5-preview-walk.mjs <baseUrl> <shareUrl> <outDir> <email> <password>
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
const IBM_BLUES = ["rgb(15, 98, 254)", "rgb(3, 83, 233)", "rgb(0, 67, 206)", "rgb(69, 137, 255)", "rgb(120, 169, 255)", "rgb(166, 200, 255)", "rgb(208, 226, 255)", "rgb(0, 29, 108)"];
const TERRACOTTA = "rgb(184, 92, 46)";
const LINK = { light: "rgb(143, 69, 33)", dark: "rgb(232, 160, 122)" };

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
// People-data mask (owner ruling 2026-09-05, carried to PR 5): names, roles, extensions and the readout's
// people text render as a smudge. Seat codes, counts, the Floor tag, the hint, headings and buttons that
// carry no person stay legible. Text fill only.
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.id = "walk-mask";
    style.textContent = ".sp-recep-row .sp-recep-name, .sp-recep-row .sp-recep-meta, .sp-recep-row .sp-recep-ext, .sp-recep-readout h2, .sp-recep-readout .sp-recep-role, .sp-readout-numeral, .sp-row-buttons .cds-btn, .sp-recep-recent .cds-btn, .sp-recep-list .cds-empty h3, #viewer-find-palette, .sp-pill, #seat-inspector-panel, #viewer-seat-search, .cds-header-name span, .sp-roster, .sp-inspector-eyebrow, [data-seat-id] { -webkit-text-fill-color: transparent !important; text-shadow: 0 0 9px rgba(128, 128, 128, 0.9) !important; }";
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
    actionPosts.push({ at: new Date().toISOString(), path: new URL(req.url()).pathname, body: (req.postData() || "").slice(0, 160) });
  }
});

const shot = async (name, clip) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false, ...(clip ? { clip } : {}) });
  return `${name}.png`;
};
const open = async (route, theme, width, height) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("main .sp-recep, main .sp-route-card, #viewer-seat-search").first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
};
const css = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);
const active = () => page.evaluate(() => { const el = document.activeElement; return el ? { tag: el.tagName.toLowerCase(), id: el.id, label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || "" } : null; });
const themeAttr = () => page.evaluate(() => document.documentElement.getAttribute("data-carbon-theme"));
const indicator = () => page.locator("#shell-header .sp-mode").textContent().then(t => t?.trim()).catch(() => null);
const field = () => page.locator("#reception-main");
const readout = () => page.getByRole("region", { name: "Caller detail" });
const cursorRow = () => page.locator("main li[role='option'][data-highlight]");
const lockedRow = () => page.locator("main li[role='option'][aria-selected='true']");
const count = () => page.locator("main .sp-recep-count").textContent();
const hintCount = () => page.locator("main .sp-readout-hint").count();
const url = () => { const u = new URL(page.url()); return u.pathname + u.search; };
const blueScan = () => page.evaluate(blues => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    for (const p of ["color", "backgroundColor", "borderTopColor", "outlineColor", "boxShadow"]) {
      if (blues.some(b => s[p].includes(b))) out.push(`${el.tagName.toLowerCase()}.${(typeof el.className === "string" ? el.className : "").split(" ")[0]} ${p}=${s[p]}`);
    }
  }
  return out.slice(0, 5);
}, IBM_BLUES);
const step = async (name, frame, fn) => {
  try { await fn(); } catch (e) {
    const file = await shot(`${name.split(" ")[0]}-crash-${frame}`).catch(() => null);
    rec(name, frame, false, { focus: await active().catch(() => null) }, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, file ? [file] : []);
    await page.keyboard.press("Escape").catch(() => {});
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
let peopleCount = null;
// A person with an extension and one without, read from the live rows (masked in the captures, never logged
// by name: results.json records only "<masked>" and the extension's LENGTH).
const pickPeople = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll("main li[role='option']")].map(li => ({ name: li.querySelector(".sp-recep-name")?.textContent ?? "", ext: li.querySelector(".sp-recep-ext")?.textContent ?? "" }));
  const withExt = rows.find(r => r.ext.trim().length > 0);
  const without = rows.find(r => r.ext.trim().length === 0);
  return { withExt: withExt?.name ?? null, without: without?.name ?? null, extDigits: withExt?.ext.trim().length ?? 0, total: rows.length };
});

for (const F of FRAMES) {
  const T = F.tag;
  consoleErrors = [];
  const posts0 = actionPosts.length;

  await step("1 Reception at rest", T, async () => {
    await open("/reception", F.theme, F.w, F.h);
    await field().waitFor();
    if (indicatorAtStart === null) indicatorAtStart = await indicator();
    const people = await pickPeople();
    peopleCount = people.total;
    const list = await page.locator("main .sp-recep-list").evaluate(el => el.getBoundingClientRect());
    const ro = await readout().evaluate(el => el.getBoundingClientRect());
    const headerBtns = await page.locator("main .cds-page-header .cds-btn").count();
    const ring = await field().evaluate(el => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`; });
    const focus = await active();
    const kbd = await page.locator("main .sp-search-trailing .sp-kbd").textContent();
    const at = await themeAttr();
    const blues = await blueScan();
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    const expectedList = F.w === 1920 ? 1008 : 704;
    const ok = headerBtns === 0 && Math.round(list.width) === expectedList && Math.round(ro.width) === 480 && Math.round(ro.x - (list.x + list.width)) === 32 && ring === `solid 2px ${TERRACOTTA} -2px` && focus?.id === "reception-main" && /K$/.test(kbd) && at === (F.theme === "dark" ? "g100" : "white") && blues.length === 0 && noScroll && (await count()).endsWith(" people");
    rec("1 Reception at rest", T, ok, { theme: at, headerBtns, listWidth: list.width, readoutWidth: ro.width, gap: Math.round(ro.x - (list.x + list.width)), ring, focus, kbd, count: await count(), blues, noScroll }, "", [await shot(`01-rest-${T}`)]);
  });

  await step("2 Typing", T, async () => {
    const people = await pickPeople();
    const target = people.withExt;
    await field().fill(target.slice(0, 4));
    await page.waitForTimeout(400);
    const cursors = await cursorRow().count();
    const bar = await css(cursorRow().first(), "boxShadow");
    const activedesc = await field().getAttribute("aria-activedescendant");
    const cursorId = await cursorRow().first().getAttribute("id");
    const hint = await page.locator("main .sp-readout-hint").textContent().catch(() => null);
    const ok = cursors === 1 && bar.includes(TERRACOTTA) && /3px/.test(bar) && activedesc === cursorId && /to lock/.test(hint ?? "") && /match/.test(await count());
    rec("2 Typing", T, ok, { count: await count(), cursors, bar, activedescMatches: activedesc === cursorId, hint }, "", [await shot(`02-typing-${T}`)]);
  });

  await step("3 Lock", T, async () => {
    const before = await page.evaluate(() => history.length);
    const people = await pickPeople();
    await field().fill(people.withExt);
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => history.length);
    const locked = await lockedRow().count();
    const bar = await css(lockedRow().first(), "boxShadow");
    const u = url();
    const hint = await page.locator("main .sp-readout-hint").textContent().catch(() => null);
    const map = page.getByRole("link", { name: "Show on map" });
    const mapColor = await css(map, "color");
    const mapHref = await map.getAttribute("href");
    const numeralDigits = (await page.locator("main .sp-readout-numeral").textContent()).trim().length;
    const ok = locked === 1 && bar.includes(TERRACOTTA) && u.startsWith("/reception?q=") && before === after && /to unlock/.test(hint ?? "") && mapColor === LINK[F.theme] && mapHref?.startsWith("/?q=") && numeralDigits > 0 && (await field().inputValue()) === "";
    rec("3 Lock", T, ok, { locked, bar, urlHasQ: u.startsWith("/reception?q="), historyBefore: before, historyAfter: after, hint, mapColor, mapHrefHasQ: mapHref?.startsWith("/?q="), numeralDigits }, "", [await shot(`03-locked-${T}`)]);
  });

  await step("4 Esc rungs", T, async () => {
    await field().fill("zzzzqq");
    await page.waitForTimeout(300);
    // The locked row is not in the (empty) filtered list, so "keeps the person" is read from the readout.
    const zero = { count: await count(), empty: await page.locator("main .sp-recep-list .cds-empty h3").count(), readoutKeepsPerson: (await readout().getByRole("heading", { level: 2 }).count()) === 1, hints: await hintCount() };
    const files = [await shot(`04-zero-${T}`)];
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const rung1 = { value: await field().inputValue(), locked: await lockedRow().count(), urlHasQ: url().includes("?q="), hints: await hintCount() };
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const rung2 = { locked: await lockedRow().count(), waiting: /Waiting for a call\./.test(await readout().textContent()), url: url() };
    files.push(await shot(`04-unlocked-${T}`));
    const ok = zero.count === "0 matches" && zero.empty === 1 && zero.readoutKeepsPerson && zero.hints === 0 && rung1.value === "" && rung1.locked === 1 && rung1.urlHasQ && rung1.hints === 1 && rung2.locked === 0 && rung2.waiting && rung2.url === "/reception";
    rec("4 Esc rungs", T, ok, { zero, rung1, rung2 }, "", files);
  });

  await step("5 No extension", T, async () => {
    const people = await pickPeople();
    if (!people.without) { rec("5 No extension", T, true, { note: "no person without an extension in the live directory" }, "skipped: none in the directory"); return; }
    await field().fill(people.without);
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const none = await page.locator("main .sp-readout-none").textContent().catch(() => null);
    const tileDash = (await page.locator("main .sp-readout").textContent()).includes("—");
    const fb = await page.locator("main .sp-recep-fallback .sp-row-buttons button").count();
    const fbHeights = await page.locator("main .sp-recep-fallback .sp-row-buttons button").evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().height)));
    const ok = none === "No extension on file" && !tileDash && fb <= 3 && fbHeights.every(h => h === 40);
    rec("5 No extension", T, ok, { none, tileDash, fallbackRows: fb, fbHeights }, "", [await shot(`05-no-extension-${T}`)]);
    await page.keyboard.press("Escape");
  });

  await step("6 ?q=201 landing", T, async () => {
    await open("/reception?q=201", F.theme, F.w, F.h);
    const locked = await lockedRow().count();
    const u = url();
    const ok = (locked === 1 && u.startsWith("/reception?q=") && !u.endsWith("q=201")) || (locked === 0 && u === "/reception?q=201");
    rec("6 ?q=201 landing", T, ok, { locked, urlRewritten: locked === 1 && !u.endsWith("q=201"), count: await count() }, locked === 1 ? "" : "201 is not a unique match in the live directory — query kept", [await shot(`06-landing-201-${T}`)]);
  });

  if (F.w === 1920) {
    await step("7 Show on map", T, async () => {
      await open("/reception", F.theme, F.w, F.h);
      const people = await pickPeople();
      await field().fill(people.withExt);
      await page.waitForTimeout(300);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      await page.getByRole("link", { name: "Show on map" }).click();
      await page.waitForURL(u => u.pathname === "/", { timeout: 20000 });
      let pressed = 0, inspector = 0, palette = 0;
      for (let i = 0; i < 25; i++) {
        pressed = await page.locator("button[data-seat-id][aria-pressed='true']").count();
        inspector = await page.locator("#seat-inspector-panel").count();
        palette = await page.locator("#viewer-find-palette").count();
        if (pressed || inspector) break;
        await page.waitForTimeout(200);
      }
      const fieldFilled = ((await page.locator("#viewer-seat-search").inputValue().catch(() => "")) || "").length > 0;
      const files = [await shot(`07-show-on-map-${T}`)];
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      const backLocked = await lockedRow().count();
      const ok = url().startsWith("/reception?q=") && fieldFilled && (pressed === 1 || inspector === 1 || palette === 1) && backLocked === 1;
      rec("7 Show on map", T, ok, { fieldFilled, pressed, inspector, palette, backUrlHasQ: url().startsWith("/reception?q="), backLocked }, pressed || inspector ? "" : "landing left the palette open (no unique match on the live map)", files);
    });

    await step("8 /admin", T, async () => {
      await open("/admin", F.theme, F.w, F.h);
      const card = page.locator("main .sp-route-card");
      const is403 = (await card.count()) === 1 && /Admin access required/.test(await card.textContent());
      const isMap = (await page.locator("#planning-canvas, button[data-seat-id]").count()) > 0;
      const values = { is403, isMap, cardBg: is403 ? await css(card, "backgroundColor") : null, tertiaryColor: is403 ? await css(card.locator("a.cds-btn--tertiary"), "color") : null, raster: await page.locator("main img").count() };
      rec("8 /admin", T, is403 || isMap, values, is403 ? "the 403 card (viewer role)" : "the admin map: this account holds the admin role in production — the 403 card is verified on the local stack (smoke step 16, e2e-auth)", [await shot(`08-admin-${T}`)]);
    });

    await step("9 404", T, async () => {
      const resp = await page.goto(`${base}/definitely-not-a-route-pr5`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const card = page.locator("main .sp-route-card");
      const h2 = await card.locator("h2").textContent().catch(() => null);
      const bg = await css(card, "backgroundColor").catch(() => null);
      const action = await card.locator("a.cds-btn").getAttribute("href").catch(() => null);
      const ok = resp?.status() === 404 && h2 === "This page does not exist" && action === "/";
      rec("9 404", T, ok, { status: resp?.status(), h2, bg, action, theme: await themeAttr() }, "", [await shot(`09-not-found-${T}`)]);
    });
  }

  if (T === "light") {
    await step("10 1024 fold", T, async () => {
      await open("/reception?q=201", F.theme, 1024, 768);
      if ((await lockedRow().count()) === 0) {
        // 201 is not unique in the live directory: clear the kept query, then lock a person with an extension.
        await field().fill("");
        await page.waitForTimeout(300);
        const people = await pickPeople();
        await field().fill(people.withExt);
        await page.waitForTimeout(300);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
      }
      const columns = (await css(page.locator("main .sp-recep"), "gridTemplateColumns")).split(/\s+/).length;
      const position = await css(readout(), "position");
      const back = readout().getByRole("button", { name: "Back to the list" });
      const backBox = await back.boundingBox();
      await back.scrollIntoViewIfNeeded();
      const files = [await shot(`10-1024-readout-${T}`)];
      await back.click();
      await page.waitForTimeout(400);
      const focus = await active();
      const ok = columns === 1 && position === "static" && !!backBox && Math.round(backBox.height) === 40 && focus?.id === "reception-main";
      rec("10 1024 fold", T, ok, { columns, position, backHeight: backBox?.height, focusAfterBack: focus }, "", files);
    });
  }

  rec(`frame ${T} hygiene`, T, true, { newActionPosts: actionPosts.length - posts0, consoleErrors: consoleErrors.filter(e => !/speed-insights/.test(e)).length }, "");
}

const indicatorAtEnd = await (async () => { await open("/reception", "light", 1920, 1080); return indicator(); })();
const other = failedResponses.filter(e => !/speed-insights|definitely-not-a-route/.test(e));
rec("indicator before/after + writes", "both", indicatorAtStart === indicatorAtEnd && actionPosts.every(p => p.body === "[]") && other.length === 0, { indicatorAtStart, indicatorAtEnd, actionPosts: actionPosts.length, nonEmptyActionBodies: actionPosts.filter(p => p.body !== "[]").length, otherFailedResponses: [...new Set(other)].slice(0, 6), peopleCount }, "");

await browser.close();
writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ results, actionPosts }, null, 2) + "\n");
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pass; ${failed.length} fail${failed.length ? ": " + failed.map(f => `${f.step} (${f.frame})`).join(", ") : ""}`);
