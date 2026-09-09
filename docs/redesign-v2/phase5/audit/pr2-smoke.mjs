// Phase 5 · PR 2 pre-merge smoke — reviewer-ordered (2026-09-09). Drives /reception in
// REAL Chrome (`channel: "chrome"`) on the LOCAL Docker stack only, light and dark,
// across the widths R2 names plus the seam and the 1920 ruling frame. Every geometric
// claim is a HIT TEST — `document.elementFromPoint` at the element's own box, or its
// bounding box against another's — never a visibility check (PR 4's amendment D is the
// precedent: a tooltip passed `toBeVisible()` while it was clipped).
//
// The sixteen steps are the reviewer's gate, in the reviewer's order; the 1920 rubric
// critique substitutes for none of them.
//
// Usage: node docs/redesign-v2/phase5/audit/pr2-smoke.mjs <baseUrl> <outDir> <viewerEmail> <password>
//   MAIN_BASE=http://localhost:3301  a `next start` of main, for step 7's side-by-side + pixel diff
//   SMOKE_NO_RESET=1                 skip the stack reset (iterating on the rig only)
//   SMOKE_ONLY=3,8                   run only those steps
//
// The stack is reset + reseeded once at the start (`supabase db reset --no-seed` →
// `scripts/seed-local-db.mjs`), then pr2-smoke-fixture.sql gives ONE department a second
// extension (the seed has none), so a locked extension-holder can have a fallback roster. Step 12 revokes SELECT on public.seats from the API
// roles for one page load and grants it back in a finally — the one write this rig
// makes, spelled as constants, addressed to the local container by name only.
import { createRequire } from "node:module";
import { execFileSync, execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base = "http://localhost:3300", outDir = "out", email = "e2e-viewer@example.test", password] = process.argv.slice(2);
if (!password) {
  console.error("the seeded viewer's password is required");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const ONLY = process.env.SMOKE_ONLY ? new Set(process.env.SMOKE_ONLY.split(",").map(x => x.trim())) : null;
const MAIN_BASE = process.env.MAIN_BASE || null;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const HEADER_H = 48;
const NARROW_H = 900;

const results = [];
const rec = (step, theme, ok, values = {}, note = "", files = []) => {
  results.push({ step, theme, ok, values, note, files });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} (${theme})${note ? " — " + note : ""}`);
  if (!ok) console.log("  values:", JSON.stringify(values).slice(0, 2000));
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ base, head: headSha(), results }, null, 2) + "\n");
};
const headSha = () => { try { return execSync("git rev-parse HEAD", { cwd: repoRoot }).toString().trim(); } catch { return "?"; } };

// ---- the local container, by name, constants only ---------------------------------
const CONTAINER = "supabase_db_seat-planner";
const psql = sql => execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });
const HIDE_SEATS = "revoke select on public.seats from anon, authenticated";
const SHOW_SEATS = "grant select on public.seats to anon, authenticated";
// Step 14: hold the snapshot table for ten seconds so the directory query blocks and the loading boundary streams.
const HOLD_DIRECTORY = "begin; lock table public.published_employees in access exclusive mode; select pg_sleep(5); commit;";   // under the authenticated role's 8s statement_timeout, or the page errors instead of loading
const FIXTURE = path.join(repoRoot, "docs/redesign-v2/phase5/audit/pr2-smoke-fixture.sql");
const loadFixture = () => execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], { input: readFileSync(FIXTURE, "utf8"), stdio: ["pipe", "ignore", "inherit"] });
const resetStack = () => {
  execSync("npx supabase db reset --no-seed", { cwd: repoRoot, stdio: "ignore" });
  execSync("node scripts/seed-local-db.mjs", { cwd: repoRoot, stdio: "ignore" });
  loadFixture();
};

// ---- brand values (brand-system skill) --------------------------------------------
const BRAND = {
  primary: "rgb(184, 92, 46)",
  hover: "rgb(143, 69, 33)",
  link: { light: "rgb(143, 69, 33)", dark: "rgb(232, 160, 122)" },
  focus: "rgb(184, 92, 46)"
};
const IBM_BLUES = ["rgb(15, 98, 254)", "rgb(3, 83, 233)", "rgb(0, 67, 206)", "rgb(69, 137, 255)", "rgb(120, 169, 255)", "rgb(166, 200, 255)", "rgb(0, 45, 156)", "rgb(0, 29, 108)", "rgb(0, 17, 65)", "rgb(237, 245, 255)", "rgb(208, 226, 255)"];

const browser = await chromium.launch({ channel: "chrome" });
let context;
let page;
let consoleErrors = [];

const signIn = async (target = base) => {
  if (context) await context.close();
  consoleErrors = [];
  context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  page = await context.newPage();
  page.on("pageerror", e => consoleErrors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.goto(`${target}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });
};
const open = async (theme, width, height = width >= 1056 ? 1080 : NARROW_H, target = base) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${target}/reception`, { waitUntil: "networkidle" });
  await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("li[role=option]", { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
};
const shot = async name => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  return `${name}.png`;
};

// ---- geometry ---------------------------------------------------------------------
const rect = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
}, sel);
// What is painted at the centre of `sel`'s box — the element's own subtree, or something over it?
const hitCentre = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return { ok: false, why: "no element" };
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const own = Boolean(hit && (hit === el || el.contains(hit)));
  const inRow = Boolean(hit && hit.closest("li[role=option]"));
  return { ok: own, inRow, hit: hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].slice(0, 2).join(".")}` : null };
}, sel);
// All four corners inside the viewport AND painted by the element itself.
const hitCorners = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return { ok: false, why: "no element" };
  const r = el.getBoundingClientRect();
  const inside = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
  const pts = [[r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]];
  const hits = pts.map(([x, y]) => { const h = document.elementFromPoint(x, y); return Boolean(h && (h === el || el.contains(h))); });
  return { ok: inside && hits.every(Boolean), inside, hits, rect: { top: Math.round(r.top), bottom: Math.round(r.bottom) } };
}, sel);
const css = (sel, prop) => page.evaluate(([s, p]) => { const el = document.querySelector(s); return el ? getComputedStyle(el)[p] : null; }, [sel, prop]);
const scrollState = () => page.evaluate(() => ({
  win: Math.round(window.scrollY),
  pane: Math.round(document.querySelector('[aria-label="Reception directory"]')?.scrollTop ?? 0)
}));
const scrollToEnd = async () => {
  await page.evaluate(() => {
    const pane = document.querySelector('[aria-label="Reception directory"]');
    if (pane && pane.scrollHeight > pane.clientHeight) pane.scrollTop = pane.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(250);
};
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  return {
    label: `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}`,
    id: el.id,
    inBand: Boolean(el.closest(".sp-recep-band")),
    inList: Boolean(el.closest(".sp-recep-rows")),
    inTail: Boolean(el.closest(".sp-recep-tail")),
    inRecents: Boolean(el.closest(".sp-recep-recent")),
    isClear: el.getAttribute("aria-label") === "Clear search",
    outline: getComputedStyle(el).outline,
    outlineOffset: getComputedStyle(el).outlineOffset
  };
});

// ---- the directory ----------------------------------------------------------------
const rowNames = () => page.evaluate(() => [...document.querySelectorAll("li[role=option]")].map(li => ({
  name: li.querySelector(".sp-recep-name").textContent.trim(),
  ext: (li.querySelector(".sp-recep-ext")?.textContent ?? "").trim()
})));
const lock = async name => {
  await page.locator("#reception-main").fill(name);
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await page.waitForSelector('li[role=option][aria-selected="true"]', { timeout: 10000 });
  await page.waitForTimeout(150);
};
const firstWithExt = async () => (await rowNames()).find(r => r.ext)?.name;
const withFallback = async () => {
  for (const r of (await rowNames()).filter(r => r.ext)) {
    await lock(r.name);
    if ((await page.locator(".sp-recep-tail .sp-recep-fallback").count()) === 1) return r.name;
  }
  return null;
};
// F-1's person: no extension, but a same-department colleague who has one.
const noExtWithFallback = async () => {
  for (const r of (await rowNames()).filter(r => !r.ext)) {
    await lock(r.name);
    if ((await page.locator(".sp-recep-tail .sp-recep-fallback button").count()) >= 1) return r.name;
  }
  return null;
};
const bandText = () => page.evaluate(() => document.querySelector(".sp-recep-band")?.textContent ?? "");

// ---- brand sweep on every capture (step 15) ---------------------------------------
const sweep = async (theme, label) => {
  const s = await page.evaluate(blues => {
    const blueHits = [];
    for (const el of document.querySelectorAll("body *")) {
      const c = getComputedStyle(el);
      for (const p of ["color", "backgroundColor", "borderTopColor", "borderLeftColor", "outlineColor", "boxShadow"]) {
        const v = c[p];
        if (blues.some(b => v.includes(b))) blueHits.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")} ${p}=${v}`);
      }
    }
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("a");
    probe.className = "cds-link"; probe.href = "#"; probe.textContent = "x";
    document.body.appendChild(probe);
    const linkColor = getComputedStyle(probe).color;
    probe.remove();
    const btn = document.createElement("button");
    btn.className = "cds-btn cds-btn--primary"; btn.textContent = "x";
    document.body.appendChild(btn);
    const primaryBg = getComputedStyle(btn).backgroundColor;
    btn.remove();
    const showOnMap = [...document.querySelectorAll(".sp-recep-tail a")].find(a => /Show on map/.test(a.textContent));
    return {
      blueHits: blueHits.slice(0, 5),
      blueCount: blueHits.length,
      buttonPrimary: root.getPropertyValue("--cds-button-primary").trim(),
      focus: root.getPropertyValue("--cds-focus").trim(),
      linkPrimary: root.getPropertyValue("--cds-link-primary").trim(),
      linkColor,
      primaryBg,
      showOnMapColor: showOnMap ? getComputedStyle(showOnMap).color : null,
      currentBar: (() => { const el = document.querySelector('.cds-header-nav a[aria-current="page"]'); return el ? getComputedStyle(el, "::after").backgroundColor || getComputedStyle(el).borderBottomColor : null; })()
    };
  }, IBM_BLUES);
  const ok = s.blueCount === 0 && s.primaryBg === BRAND.primary && s.linkColor === BRAND.link[theme] && (s.showOnMapColor === null || s.showOnMapColor === BRAND.link[theme]);
  rec(`15 brand-sweep · ${label}`, theme, ok, s, `blue ${s.blueCount} · primary ${s.primaryBg} · link ${s.linkColor}`);
};
const capture = async (name, theme) => { const f = await shot(name); await sweep(theme, name); return f; };

const want = n => !ONLY || ONLY.has(String(n));
const both = ["light", "dark"];

try {
  if (!process.env.SMOKE_NO_RESET) { console.log("resetting + reseeding the local stack…"); resetStack(); } else { loadFixture(); }
  await signIn();

  // ---- 1 · 640, locked, list scrolled to its end --------------------------------------
  // ---- 2 · the 1024–1055 seam at 1030: same, and the sticky offset resolves to 0 ------
  for (const [step, width] of [[1, 640], [2, 1030]]) {
    if (!want(step)) continue;
    for (const theme of both) {
      await open(theme, width);
      await lock(await firstWithExt());
      const restBand = await rect(".sp-recep-band");
      await scrollToEnd();
      const numeral = await hitCorners(".sp-recep-band .sp-readout-numeral");
      const band = await rect(".sp-recep-band");
      const header = await rect("header");
      const centre = await hitCentre(".sp-recep-band");
      const top = await css(".sp-recep-band", "top");
      const scrolled = await scrollState();
      const file = await capture(`${String(step).padStart(2, "0")}-${width}-locked-scrolled-${theme}`, theme);
      const base1 = numeral.ok && band.top === header.bottom && band.top === HEADER_H && centre.ok && !centre.inRow && band.top < restBand.top;
      if (step === 1) {
        rec("1 640-locked-scrolled", theme, base1 && top === `${HEADER_H}px` && scrolled.win > 0,
          { numeral, band, headerBottom: header.bottom, centre, top, scrolled, restBandTop: restBand.top },
          `numeral ${numeral.rect.top}-${numeral.rect.bottom} · band top ${band.top} = header bottom ${header.bottom} · centre → ${centre.hit} · offset ${top}`, [file]);
      } else {
        // Proved, not inferred: the PANE scrolled (window did not), the computed offset is 0,
        // and the band still sits at the pane's top edge, which is the header's bottom.
        const paneTop = (await rect('[aria-label="Reception directory"]')).top;
        rec("2 seam-1030", theme, base1 && top === "0px" && scrolled.pane > 0 && scrolled.win === 0 && paneTop === HEADER_H,
          { numeral, band, headerBottom: header.bottom, centre, top, scrolled, paneTop },
          `offset ${top} · pane scrolled ${scrolled.pane}, window ${scrolled.win} · band top ${band.top} · centre → ${centre.hit}`, [file]);
      }
    }
  }

  // ---- 3 · scroll-margin-top in BOTH scroll models ----------------------------------------
  if (want(3)) {
    for (const width of [640, 1030]) {
      await open("light", width);
      await lock(await firstWithExt());
      // The cursor exists only while a query is typed (ReceptionScreen: `cursor = searching ? … : null`),
      // so type the single letter that keeps the most rows, then walk that list with ↓ and ↑.
      const all = await rowNames();
      const letter = [..."aeinorst"].map(l => [l, all.filter(r => r.name.toLowerCase().includes(l)).length]).sort((x, y) => y[1] - x[1])[0][0];
      await page.locator("#reception-main").fill(letter);
      await page.waitForTimeout(150);
      const n = (await rowNames()).length;
      const steps = [];
      const check = async dir => {
        const v = await page.evaluate(() => {
          const cur = document.querySelector("li[role=option][data-highlight]");
          const band = document.querySelector(".sp-recep-band");
          if (!cur || !band) return null;
          const c = cur.getBoundingClientRect(); const b = band.getBoundingClientRect();
          const hit = document.elementFromPoint(c.left + c.width / 2, c.top + 4);
          return { name: cur.querySelector(".sp-recep-name").textContent.trim(), top: Math.round(c.top), bandBottom: Math.round(b.bottom), painted: Boolean(hit && cur.contains(hit)), ok: c.top >= b.bottom - 1 && Boolean(hit && cur.contains(hit)) };
        });
        steps.push({ dir, ...(v ?? { ok: false, why: "no cursor" }) });
      };
      await check("start");
      for (let i = 1; i < n; i += 1) { await page.keyboard.press("ArrowDown"); await page.waitForTimeout(120); await check("↓"); }
      for (let i = 1; i < n; i += 1) { await page.keyboard.press("ArrowUp"); await page.waitForTimeout(120); await check("↑"); }
      const file = await capture(`03-${width}-cursor-under-band-light`, "light");
      const ok = n >= 6 && steps.length === 2 * n - 1 && steps.every(s => s.ok);
      rec(`3 scroll-margin-${width}`, "light", ok, { letter, n, steps }, `"${letter}" keeps ${n} rows · ${steps.filter(s => s.ok).length}/${steps.length} cursor steps at or below the band's bottom (${steps[0]?.bandBottom})`, [file]);
      await page.keyboard.press("Escape");
    }
  }

  // ---- 4 · O-4: the loop, not the pixels ---------------------------------------------------
  if (want(4)) {
    await open("light", 640);
    const name = await firstWithExt();
    await scrollToEnd();
    const before = await scrollState();
    await lock(name);
    const a = await active();
    const during = await scrollState();
    await page.keyboard.type("a");
    await page.waitForTimeout(150);
    const count = (await page.locator(".sp-recep-count").textContent()).trim();
    const band = await hitCorners(".sp-recep-band");
    const stillField = await active();
    const file = await capture("04-640-o4-loop-light", "light");
    rec("4 o4-loop", "light", a?.id === "reception-main" && /match/.test(count) && band.ok && stillField?.id === "reception-main",
      { focusAfterLock: a, count, band, scroll: { before, during } },
      `focus ${a?.id} · "${count}" · band corners ${band.hits?.join("")} · no rig scroll after the lock`, [file]);
  }

  // ---- 5 · O-3: the live region is the band ------------------------------------------------
  if (want(5)) {
    for (const width of [1920, 640]) {
      await open("light", width);
      const name = await withFallback();
      const live = await page.evaluate(() => {
        const all = [...document.querySelectorAll("[aria-live]")].map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`);
        const band = document.querySelector(".sp-recep-band");
        const inReadout = document.querySelectorAll(".sp-recep-readout [aria-live]");
        const fallback = document.querySelector(".sp-recep-fallback");
        const map = [...document.querySelectorAll(".sp-recep-tail a")].find(a => /Show on map/.test(a.textContent));
        return {
          all, count: all.length,
          bandIsLive: band?.getAttribute("aria-live") === "polite",
          readoutLive: inReadout.length, readoutLiveIsBand: inReadout.length === 1 && inReadout[0] === band,
          text: band?.textContent ?? "",
          fallbackInLive: Boolean(fallback?.closest("[aria-live]")),
          mapInLive: Boolean(map?.closest("[aria-live]")),
          countLive: document.querySelector(".sp-recep-count")?.getAttribute("aria-live"),
          numeral: document.querySelector(".sp-recep-band .sp-readout-numeral")?.textContent ?? "",
          seatline: document.querySelector(".sp-recep-band .sp-recep-seatline")?.textContent ?? ""
        };
      });
      const ok = Boolean(name) && live.count === 2 && live.bandIsLive && live.readoutLiveIsBand && live.text.includes(name) && live.numeral && live.text.includes(live.numeral) && /Seat|Floor|voicemail/.test(live.seatline) && live.text.includes(live.seatline) && !live.fallbackInLive && !live.mapInLive && live.countLive === "polite";
      rec(`5 o3-live-region-${width}`, "light", ok, live, `${name}: live = [${live.all.join(", ")}] · band carries name + ${live.numeral} + "${live.seatline.slice(0, 32)}" · fallback/map outside`);
    }
  }

  // ---- 6 · O-1: zero focusables in the band, then a REAL Tab walk ------------------------------
  if (want(6)) {
    for (const width of [480, 640, 800, 1024, 1920]) {
      await open("light", width);
      const names = await rowNames();
      const first = names.find(r => r.ext).name;
      await lock(first);                                   // → recents will hold this one
      const second = await withFallback();                 // detail with a tail
      if (second === first) { const alt = names.filter(r => r.ext && r.name !== first); if (alt.length) await lock(alt[0].name); }
      const focusables = await page.evaluate(() => document.querySelector(".sp-recep-band").querySelectorAll("a, button, input, select, textarea, [tabindex], [contenteditable]").length);
      // Type the locked person's first three letters so the field shows a clear ×, the
      // list filters, and the readout previews the same person (tail stays).
      const lockedName = await page.evaluate(() => document.querySelector(".sp-recep-band h2")?.textContent.trim() ?? "");
      await page.locator("#reception-main").fill(lockedName.slice(0, 3));
      await page.waitForTimeout(150);
      // The list's stop is the roving cursor: while a query is typed, aria-activedescendant
      // names a row and ↓ / ↑ move it while focus stays in the combobox (PHASE2UX §1R.7).
      // Walk ↓ then ↑ so the cursor is back on the first row — the locked person — before
      // the Tab walk, so the tail under test is theirs.
      const readCursor = () => page.evaluate(() => {
        const f = document.getElementById("reception-main");
        const id = f.getAttribute("aria-activedescendant");
        return { focusIsField: document.activeElement === f, activeDescendant: id, resolves: Boolean(id && document.getElementById(id)?.matches("li[role=option]")), preview: document.querySelector(".sp-recep-band h2")?.textContent.trim() };
      });
      const at0 = await readCursor();
      await page.keyboard.press("ArrowDown"); await page.waitForTimeout(100);
      const at1 = await readCursor();
      await page.keyboard.press("ArrowUp"); await page.waitForTimeout(100);
      const back = await readCursor();
      const rows = await page.locator("li[role=option]").count();
      const roving = { ...back, moved: rows < 2 || at1.activeDescendant !== at0.activeDescendant, returned: back.activeDescendant === at0.activeDescendant, previewIsLocked: back.preview === lockedName, rows };
      await page.locator("#reception-main").focus();
      const walk = [];
      for (let i = 0; i < 14; i += 1) {
        await page.keyboard.press("Tab");
        const a = await active();
        if (!a) break;
        walk.push(a);
        if (a.inRecents) break;   // the walk ends at the first Recent-lookups stop
      }
      const labels = walk.map(w => w.label);
      const idx = { clear: walk.findIndex(w => w.isClear), tail: walk.findIndex(w => w.inTail), recents: walk.findIndex(w => w.inRecents) };
      const ok = focusables === 0 && roving.focusIsField && roving.resolves && roving.moved && roving.returned && roving.previewIsLocked && idx.clear === 0 && idx.tail > idx.clear && idx.recents > idx.tail && walk.every(w => !w.inBand && !w.inList);
      const file = await capture(`06-${width}-tab-walk-light`, "light");
      rec(`6 o1-tab-walk-${width}`, "light", ok, { focusables, roving, walk, idx }, `band focusables ${focusables} · ↓ → ${roving.activeDescendant} · Tab: ${labels.join(" → ")}`, [file]);
    }
  }

  // ---- 7 · ≥1056 proof at 1920, side by side with main --------------------------------------------
  if (want(7)) {
    const measure = async () => page.evaluate(() => {
      const r = s => document.querySelector(s)?.getBoundingClientRect();
      const readout = r(".sp-recep-readout"); const list = r(".sp-recep-list");
      const map = [...document.querySelectorAll(".sp-recep-readout a")].find(a => /Show on map/.test(a.textContent));
      const order = [
        ["who", r(".sp-recep-who")], ["tile", r(".sp-readout")], ["seatline", r(".sp-recep-seatline")],
        ["fallback", r(".sp-recep-fallback")], ["map", map?.getBoundingClientRect()], ["recents", r(".sp-recep-recent")]
      ].map(([k, b]) => [k, b ? Math.round(b.top) : null]);
      return { readout: Math.round(readout.width), list: Math.round(list.width), gutter: Math.round(readout.left - list.right), order };
    });
    for (const theme of both) {
      await open(theme, 1920);
      const names = await rowNames();
      const first = names.find(r => r.ext).name;
      await lock(first);
      const second = await withFallback();
      const m = await measure();
      const tops = m.order.map(([, t]) => t);
      const ordered = tops.every(t => t !== null) && tops.every((t, i) => i === 0 || t > tops[i - 1]);
      const branchFile = await capture(`07-1920-branch-${theme}`, theme);
      let diff = null;
      if (MAIN_BASE) {
        const mainPage = await context.newPage();
        const swap = page; page = mainPage;
        try {
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.goto(`${MAIN_BASE}/reception`, { waitUntil: "networkidle" });
          // The main app is another origin: sign in there, same seeded viewer.
          if (page.url().includes("/login")) {
            await page.fill('input[type="email"]', email);
            await page.fill('input[type="password"]', password);
            await page.getByRole("button", { name: "Log in", exact: true }).click();
            await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });
          }
          await open(theme, 1920, 1080, MAIN_BASE);
          await lock(first);
          if (second) await lock(second);
          const mm = await measure();
          const mainFile = await shot(`07-1920-main-${theme}`);
          diff = await pixelDiff(path.join(outDir, branchFile), path.join(outDir, mainFile), path.join(outDir, `07-1920-side-by-side-${theme}.png`));
          diff.mainMeasure = mm;
        } finally { await mainPage.close(); page = swap; }
      }
      const ok = m.readout === 480 && m.gutter === 32 && m.list === 1008 && ordered && (diff === null || diff.ok);
      rec("7 wide-1920-unchanged", theme, ok, { ...m, diff }, `readout ${m.readout} · gutter ${m.gutter} · list ${m.list} · order ${m.order.map(([k, t]) => `${k}@${t}`).join(" < ")}${diff ? ` · vs main: ${diff.differentPixels} px differ of ${diff.total}` : " · (no MAIN_BASE)"}`, [branchFile]);
    }
  }

  // ---- 8 · F-1 at 480, both themes ----------------------------------------------------------------
  if (want(8)) {
    for (const theme of both) {
      await open(theme, 480);
      const who = await noExtWithFallback();
      const none = await page.evaluate(() => {
        const el = document.querySelector(".sp-recep-band .sp-readout-none");
        const band = document.querySelector(".sp-recep-band");
        if (!el || !band) return { ok: false };
        const r = el.getBoundingClientRect(); const b = band.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { ok: Boolean(hit && (hit === el || el.contains(hit))) && el.scrollWidth <= el.clientWidth + 1 && r.left >= b.left && r.right <= b.right && r.right <= window.innerWidth, text: el.textContent, rect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) } };
      });
      const colleague = await page.evaluate(() => {
        const b = document.querySelector(".sp-recep-tail .sp-recep-fallback button");
        return b ? { name: b.childNodes[0].textContent.trim(), ext: b.querySelector(".sp-row-button-ext").textContent.trim() } : null;
      });
      const file1 = await capture(`08-480-f1-no-extension-${theme}`, theme);
      // Keyboard only, from the field: the first Tab stop is the fallback (no query → no clear ×).
      await page.locator("#reception-main").focus();
      await page.keyboard.press("Tab");
      const stop = await active();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => ({
        name: document.querySelector(".sp-recep-band h2")?.textContent.trim(),
        numeral: document.querySelector(".sp-recep-band .sp-readout-numeral")?.textContent.trim() ?? null
      }));
      const numeralHit = await hitCorners(".sp-recep-band .sp-readout-numeral");
      const file2 = await capture(`08-480-f1-after-fallback-${theme}`, theme);
      const ok = Boolean(who) && none.ok && Boolean(colleague) && stop?.inTail && /button/.test(stop.label) && after.name === colleague.name && after.numeral === colleague.ext && numeralHit.ok;
      rec("8 f1-480", theme, ok, { who, none, colleague, stop, after, numeralHit }, `${who}: "${none.text}" unclipped · Tab → ${stop?.label} · ↵ → ${after.name} ${after.numeral}`, [file1, file2]);
    }
  }

  // ---- 9 · the wrap: 410 / 420 stacked, 460 / 480 side by side ----------------------------------------
  if (want(9)) {
    for (const width of [410, 420, 460, 480]) {
      await open("light", width);
      await lock(await firstWithExt());
      const who = await rect(".sp-recep-who"); const tile = await rect(".sp-readout");
      const stacked = who.top >= tile.bottom;
      const overlap = who.top < tile.bottom && tile.top < who.bottom;
      const expectStacked = width <= 420;
      const file = await capture(`09-${width}-wrap-light`, "light");
      rec(`9 wrap-${width}`, "light", expectStacked ? stacked : overlap, { who, tile }, `${expectStacked ? "stacked" : "side by side"}: who ${who.top}-${who.bottom} · tile ${tile.top}-${tile.bottom}`, [file]);
    }
  }

  // ---- 10 · no horizontal scroll 320 → 480 -------------------------------------------------------------
  if (want(10)) {
    for (const width of [320, 360, 390, 420, 460, 480]) {
      await open("light", width);
      await lock(await firstWithExt());
      const o = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
        bodyScroll: document.body.scrollWidth,
        offEdge: [...document.querySelectorAll(".sp-recep-band, .sp-recep-band *")].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5); }).map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`)
      }));
      const ok = o.scrollWidth === o.clientWidth && o.bodyScroll <= o.clientWidth && o.offEdge.length === 0;
      rec(`10 no-x-scroll-${width}`, "light", ok, o, `scrollWidth ${o.scrollWidth} === clientWidth ${o.clientWidth} · ${o.offEdge.length} off-edge`);
      if (width === 320 || width === 480) await capture(`10-${width}-reflow-light`, "light");
    }
  }

  // ---- 11 · zero matches at 640, both themes ----------------------------------------------------------------
  if (want(11)) {
    for (const theme of both) {
      await open(theme, 640);
      const name = await withFallback();
      const numeral = await page.evaluate(() => document.querySelector(".sp-recep-band .sp-readout-numeral")?.textContent.trim());
      await page.locator("#reception-main").fill("zzzzqq");
      await page.waitForTimeout(200);
      const v = await page.evaluate(() => {
        const r = s => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
        const empty = document.querySelector(".sp-recep-list > .cds-empty");
        const eb = empty?.getBoundingClientRect();
        const hit = eb ? document.elementFromPoint(eb.left + eb.width / 2, eb.top + eb.height / 2) : null;
        return {
          empty: r(".sp-recep-list > .cds-empty"), emptyPainted: Boolean(hit && empty.contains(hit)),
          header: r(".sp-recep-header"), band: r(".sp-recep-band"), tail: r(".sp-recep-tail"),
          rows: document.querySelectorAll("li[role=option]").length,
          count: document.querySelector(".sp-recep-count")?.textContent.trim(),
          bandName: document.querySelector(".sp-recep-band h2")?.textContent.trim(),
          bandNumeral: document.querySelector(".sp-recep-band .sp-readout-numeral")?.textContent.trim(),
          heading: empty?.querySelector("h3")?.textContent
        };
      });
      const file = await capture(`11-640-zero-matches-${theme}`, theme);
      const ok = Boolean(name) && v.empty && v.emptyPainted && v.rows === 0 && v.empty.top >= v.header.bottom - 1 && v.band.bottom <= v.header.top + 1 && v.count === "0 matches" && v.bandName === name && v.bandNumeral === numeral && v.tail && v.tail.top >= v.empty.bottom - 1;
      rec("11 zero-matches-640", theme, ok, v, `"${v.count}" · card ${v.empty?.top} under header ${v.header?.bottom} · band keeps ${v.bandName} ${v.bandNumeral} · tail ${v.tail?.top} below card ${v.empty?.bottom}`, [file]);
    }
  }

  // ---- 12 · partial state at 640 (seats query fails) ------------------------------------------------------
  if (want(12)) {
    psql(HIDE_SEATS);
    try {
      await open("light", 640);
      const name = await firstWithExt();
      await lock(name);
      const v = await page.evaluate(() => {
        const r = s => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
        return { note: r(".cds-notification--warning"), noteText: document.querySelector(".cds-notification--warning")?.textContent.trim().slice(0, 60), band: r(".sp-recep-band"), search: r(".sp-search-lg"), seatline: document.querySelector(".sp-recep-band .sp-recep-partial")?.textContent.trim() ?? null };
      });
      const bandCentre = await hitCentre(".sp-recep-band");
      const file1 = await capture("12-640-partial-light", "light");
      await scrollToEnd();
      const pinned = await rect(".sp-recep-band");
      const pinnedCentre = await hitCentre(".sp-recep-band");
      const noteCentre = await hitCentre(".cds-notification--warning");
      const file2 = await capture("12-640-partial-scrolled-light", "light");
      const ok = v.note && v.note.top >= v.search.bottom - 1 && v.note.bottom <= v.band.top + 1 && bandCentre.ok && v.seatline === "Seat unknown right now — the map is still loading." && pinned.top === HEADER_H && pinnedCentre.ok && !pinnedCentre.inRow;
      rec("12 partial-640", "light", ok, { ...v, bandCentre, pinned, pinnedCentre, noteUnderBandWhenScrolled: noteCentre }, `notification ${v.note?.top}-${v.note?.bottom} above band ${v.band?.top} · seat line "${v.seatline}" · pinned at ${pinned.top}`, [file1, file2]);
    } finally { psql(SHOW_SEATS); }
  }

  // ---- 13 · waiting state at 480, both themes ---------------------------------------------------------------
  if (want(13)) {
    for (const theme of both) {
      await open(theme, 480);
      const v = await page.evaluate(() => {
        const band = document.querySelector(".sp-recep-band"); const w = band.querySelector(".sp-recep-waiting");
        const b = band.getBoundingClientRect(); const r = w?.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(band).paddingLeft) + parseFloat(getComputedStyle(band).paddingRight);
        return { hasWaiting: Boolean(w), tiles: band.querySelectorAll(".sp-readout").length, children: band.children.length, waitingWidth: r ? Math.round(r.width) : 0, contentWidth: Math.round(b.width - pad), text: w?.textContent.trim().slice(0, 40) };
      });
      const painted = await hitCentre(".sp-recep-band .sp-recep-waiting");
      const file = await capture(`13-480-waiting-${theme}`, theme);
      const ok = v.hasWaiting && v.tiles === 0 && v.children === 1 && v.waitingWidth >= v.contentWidth - 1 && painted.ok;
      rec("13 waiting-480", theme, ok, { ...v, painted }, `"${v.text}" spans ${v.waitingWidth}/${v.contentWidth} · ${v.tiles} tile columns beside it`, [file]);
    }
  }

  // ---- 14 · loading skeleton at 640 matches the new order ---------------------------------------------------
  // Two things this step learned: a DOCUMENT load streams the root app/loading.tsx, never the
  // section's own skeleton (the shell layout is still resolving), and the shell's section links
  // are prefetch={false}, so a client navigation shows nothing until its RSC stream starts —
  // stalling that request from the browser proves nothing. So: stand on another shell route
  // (/admin — the viewer's 403 card, same mounted shell), have the LOCAL database hold an
  // exclusive lock on the snapshot table for five seconds, and navigate client-side; the page's
  // query blocks while the layout (which reads profiles, not this table) streams reception's
  // loading boundary. That is the real streaming path, at the width the skeleton must match.
  if (want(14)) {
    try {
      await open("light", 640);
      await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
      const holder = spawn("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-q", "-c", HOLD_DIRECTORY], { stdio: "ignore", detached: false });
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelector('a[href="/reception"]').click());
      await page.waitForSelector('[role="status"][aria-busy="true"] .sp-recep-band', { timeout: 15000 });
      await page.waitForTimeout(300);
      const v = await page.evaluate(() => {
        const r = s => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
        return { search: r('[aria-busy="true"] .sp-search-lg'), band: r('[aria-busy="true"] .sp-recep-band'), header: r('[aria-busy="true"] .sp-recep-header'), firstRow: r('[aria-busy="true"] .sp-recep-skeleton-row'), tail: r('[aria-busy="true"] .sp-recep-tail'), rows: document.querySelectorAll('[aria-busy="true"] .sp-recep-skeleton-row').length, bandSkeletons: document.querySelectorAll('[aria-busy="true"] .sp-recep-band .sp-skeleton').length, liveRows: document.querySelectorAll("li[role=option]").length };
      });
      const bandPainted = await hitCentre('[aria-busy="true"] .sp-recep-band');
      const file = await capture("14-640-loading-light", "light");
      await new Promise(res => { holder.on("exit", res); holder.on("error", res); });
      await page.waitForSelector("li[role=option]", { timeout: 30000 });
      const ok = v.band && v.band.top >= v.search.bottom - 1 && v.band.bottom <= v.header.top + 1 && v.firstRow.top >= v.header.bottom - 1 && v.tail && v.tail.top >= v.firstRow.bottom && v.rows === 6 && v.bandSkeletons === 2 && bandPainted.ok && v.liveRows === 0;
      rec("14 loading-640", "light", ok, { ...v, bandPainted }, `search ${v.search?.bottom} < band ${v.band?.top}-${v.band?.bottom} < header ${v.header?.top} < rows (${v.rows}) < tail ${v.tail?.top}`, [file]);
    } catch (e) {
      rec("14 loading-640", "light", false, { error: String(e).slice(0, 300) }, "rig error");
    }
  }

  // ---- 16 · lockstep sheet + no product file moved by this smoke -------------------------------------------
  if (want(16)) {
    const a = readFileSync(path.join(repoRoot, "app/styles/sp-components.css"));
    const b = readFileSync(path.join(repoRoot, "docs/redesign-v2/phase3/components/sp-components.css"));
    const identical = a.equals(b);
    // Porcelain lines are "XY path" — two status columns, a space, the path. Never trim the block first:
    // a modified file's first column is a space and trimming it shifts the path.
    const status = execSync("git status --porcelain", { cwd: repoRoot }).toString().split(/\r?\n/).filter(l => l.length > 3);
    const moved = status.map(l => l.slice(3).trim()).filter(f => !f.startsWith("docs/redesign-v2/phase5/"));
    rec("16 lockstep-and-scope", "n/a", identical && moved.length === 0, { identical, status, moved }, `sheet byte-identical ${identical} · files outside docs/redesign-v2/phase5: ${moved.length}`);
  }

  const known = t => /_vercel\/speed-insights|speed-insights|MIME type|Failed to load resource: the server responded with a status of 404/.test(t);
  const unexplained = consoleErrors.filter(t => !known(t));
  rec("console", "n/a", unexplained.length === 0, { total: consoleErrors.length, unexplained }, `${consoleErrors.length} console errors, ${unexplained.length} unexplained`);
} finally {
  await browser.close();
}

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length}  head ${headSha()}`);
writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ generated: new Date().toISOString(), base, mainBase: MAIN_BASE, head: headSha(), passed, total: results.length, results }, null, 2) + "\n");
process.exitCode = passed === results.length ? 0 : 1;

// Pixel diff + side-by-side composite, done in Chrome itself on a canvas (no image deps).
async function pixelDiff(aPath, bPath, outPath) {
  const p = await browser.newPage({ viewport: { width: 3856, height: 1080 } });
  try {
    const toUrl = f => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
    const r = await p.evaluate(async ([a, b]) => {
      const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.width, h = ia.height;
      const ca = document.createElement("canvas"); ca.width = w; ca.height = h; const xa = ca.getContext("2d"); xa.drawImage(ia, 0, 0);
      const cb = document.createElement("canvas"); cb.width = w; cb.height = h; const xb = cb.getContext("2d"); xb.drawImage(ib, 0, 0);
      const da = xa.getImageData(0, 0, w, h).data, db = xb.getImageData(0, 0, w, h).data;
      let diff = 0; const mask = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (d > 0) { diff += 1; mask[i] = 255; mask[i + 3] = 255; }
      }
      document.body.style.margin = "0"; document.body.style.background = "#fff";
      const out = document.createElement("canvas"); out.width = w * 2 + 16; out.height = h; const ox = out.getContext("2d");
      ox.fillStyle = "#888"; ox.fillRect(0, 0, out.width, out.height);
      ox.drawImage(ia, 0, 0); ox.drawImage(ib, w + 16, 0);
      if (diff) { const cm = document.createElement("canvas"); cm.width = w; cm.height = h; cm.getContext("2d").putImageData(new ImageData(mask, w, h), 0, 0); ox.globalAlpha = 0.9; ox.drawImage(cm, w + 16, 0); }
      document.body.appendChild(out);
      return { differentPixels: diff, total: w * h, width: w, height: h, sameSize: ia.width === ib.width && ia.height === ib.height };
    }, [toUrl(aPath), toUrl(bPath)]);
    await p.setViewportSize({ width: r.width * 2 + 16, height: r.height });
    await p.screenshot({ path: outPath });
    return { ...r, ok: r.sameSize && r.differentPixels === 0 };
  } finally { await p.close(); }
}
