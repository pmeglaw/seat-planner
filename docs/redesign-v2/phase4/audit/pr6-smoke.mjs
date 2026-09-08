// Phase 4 · PR 6 pre-merge smoke — reviewer-ordered (2026-09-08). Six steps that no other rig
// reaches, driven in real Chrome at 1920×1080 (step 05 at 820×900), the whole run light then dark,
// recording step · theme · pass/fail · computed values to results.json with a capture per state.
// Every geometric claim is a HIT-TEST (document.elementFromPoint), never a visibility check.
//
// Why it exists: the Dependabot merge moved @supabase/supabase-js (2.112.3 → 2.115.0) and next
// (16.3.3 → 16.3.4). Row 2's refusal rides on the supabase-js error object exposing the guard's
// SQLSTATE as `.code` (lib/actionRefusals.ts), so both arms of that refusal are smoked against the
// NEW client — the positive arm (the guard's written reason returned) and the negative arm (a
// transport failure must NOT render as a refusal, finding F-2).
//
// Steps: 01 row 2 refusal · 02 row 2 negative arm (aborted action route) · 03 row 3 Ask Planner
// popover → shell Help panel · 04 row 9 the raster (dark chain + the light dim, both now in
// globals.css) · 05 row 4 below the retired 900 tier (the slot, the centring, the band; plus the
// viewer's own 900 palette rule, deliberately kept) · 06 the publish regression + the end-of-plan
// greps' runtime half (one real publish on the local stack).
//
// Local Docker stack ONLY (reset + reseed first): step 06 publishes FOR REAL — on the local stack
// that is the flow under test, on production it would be a deploy. The rig refuses a non-local
// Supabase URL.
// Usage: node docs/redesign-v2/phase4/audit/pr6-smoke.mjs <baseUrl> <outDir> <adminEmail> <password> <supabaseUrl> <serviceRoleKey>
//   SMOKE_ONLY=01,05 limits the steps (by number); SMOKE_THEMES=light limits the themes.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
// fileURLToPath, not `new URL(...).pathname`: on Windows the latter is "/E:/..." and path.resolve
// turns it into "E:\E:\..." (the trap in the repo's Windows/CI path note).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
// The committed PR 6 dark captures row 9 is compared against (runtime-audit.mjs output).
const BASELINE_DIR = path.join(repoRoot, "docs/redesign-v2/phase4/screenshots/pr6/runtime");

const results = [];
const rec = (step, theme, ok, values = {}, note = "", files = []) => {
  results.push({ step, theme, ok, values, note, files });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} (${theme})${note ? " — " + note : ""}`);
  if (!ok) console.log("  values:", JSON.stringify(values).slice(0, 1500));
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
};

// app/globals.css — the three-state raster chain, dim folded in (0.45 × 0.8 = 0.36).
const RASTER_FILTER = {
  light: { base: "none", dim: "saturate(0.8)" },
  dark: {
    base: "invert(0.93) hue-rotate(180deg) saturate(0.45) contrast(0.95)",
    dim: "invert(0.93) hue-rotate(180deg) saturate(0.36) contrast(0.95)"
  }
};

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const shot = async (name, clip) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false, ...(clip ? { clip } : {}) });
  return `${name}.png`;
};
const open = async (theme, route, width = 1920, height = 1080) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
};
const escape = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
const row = () => page.getByRole("toolbar", { name: "Map controls" });
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  return { tag: el.tagName.toLowerCase(), id: el.id || null, label: el.getAttribute("aria-label"), text: (el.textContent || "").trim().slice(0, 40) };
});
const centre = async loc => { const b = await loc.boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };
// Hit-test: what element sits at a point (tag + classes + the nearest control's label/text).
const hit = async pt => page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const control = el.closest("button, a");
  const target = control ?? el;
  return {
    tag: target.tagName.toLowerCase(),
    cls: [...target.classList].slice(0, 3).join("."),
    text: (target.getAttribute("aria-label") ?? (target.textContent || "").trim()).slice(0, 40),
    inBand: Boolean(el.closest("[data-map-status-band]")),
    inSlot: Boolean(el.closest("[data-slot-host]")),
    inHelpPanel: Boolean(el.closest("#shell-panel-help"))
  };
}, pt);
const hitAt = async loc => hit(await centre(loc));
const box = async loc => { const b = await loc.boundingBox(); return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null; };
// Aborting the server action's POST is how PR 5b's vacate-error step forced a transport failure.
const isAction = req => req.method() === "POST" && Boolean(req.headers()["next-action"]);
async function withAbortedActions(fn) {
  const handler = async route => (isAction(route.request()) ? route.abort("failed") : route.continue());
  await page.route("**/*", handler);
  try { return await fn(); } finally { await page.unroute("**/*", handler); }
}
// Block-mean comparison of the SAME region of two 1920×1080 captures (data: URLs do not taint the
// canvas, file:// images would). Used for row 9 against the committed pr6 dark capture.
const compareRegion = async (livePng, baselinePng, region) => {
  if (!existsSync(baselinePng)) return { missingBaseline: baselinePng };
  const toDataUrl = f => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  return page.evaluate(async ({ a, b, r }) => {
    const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("image load")); im.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: `${ia.width}×${ia.height} vs ${ib.width}×${ib.height}` };
    const w = Math.min(r.w, ia.width - r.x), h = Math.min(r.h, ia.height - r.y);
    const pixels = im => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(im, r.x, r.y, w, h, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h).data;
    };
    const da = pixels(ia), dbb = pixels(ib);
    const bs = 16;
    let maxBlock = 0, sum = 0, n = 0;
    for (let by = 0; by + bs <= h; by += bs) {
      for (let bx = 0; bx + bs <= w; bx += bs) {
        const sa = [0, 0, 0], sb = [0, 0, 0];
        for (let y = 0; y < bs; y += 1) {
          for (let x = 0; x < bs; x += 1) {
            const i = ((by + y) * w + bx + x) * 4;
            sa[0] += da[i]; sa[1] += da[i + 1]; sa[2] += da[i + 2];
            sb[0] += dbb[i]; sb[1] += dbb[i + 1]; sb[2] += dbb[i + 2];
          }
        }
        const cnt = bs * bs;
        const d = Math.max(Math.abs(sa[0] - sb[0]), Math.abs(sa[1] - sb[1]), Math.abs(sa[2] - sb[2])) / cnt;
        if (d > maxBlock) maxBlock = d;
        sum += d; n += 1;
      }
    }
    return { region: `${r.x},${r.y} ${w}×${h}`, blocks: n, maxBlockDelta: Math.round(maxBlock * 100) / 100, meanBlockDelta: Math.round((sum / n) * 100) / 100 };
  }, { a: toDataUrl(livePng), b: toDataUrl(baselinePng), r: region });
};

// ---------------------------------------------------------------------------
// Seed facts
// ---------------------------------------------------------------------------
// Row 2 needs a person who holds a PUBLISHED seat (the guard's condition) and a DRAFT one (the
// danger zone's seat link). Row 4 needs a seat the 0.5 anchor can actually centre.
const [publishedSeat] = await db("seats?layer=eq.published&employee_id=not.is.null&select=id,label,employee_id&order=label&limit=1");
const [refusalPerson] = await db(`employees?id=eq.${publishedSeat.employee_id}&select=id,full_name,active`);
const [refusalDraftSeat] = await db(`seats?layer=eq.draft&employee_id=eq.${refusalPerson.id}&select=id,label&limit=1`);
const [centreSeat] = await db("seats?layer=eq.draft&floor=eq.3&y=gte.0.35&y=lte.0.65&x=gte.0.3&x=lte.0.7&select=id,label,x,y&order=label&limit=1");
const [vacateSeat] = await db(`seats?layer=eq.draft&status=eq.assigned&employee_id=neq.${refusalPerson.id}&select=id,label,employee_id&order=label&limit=1`);
console.log(`seed: refusal ${refusalPerson.full_name} (published ${publishedSeat.label} · draft ${refusalDraftSeat?.label}) · centre seat ${centreSeat.label} (${centreSeat.x}, ${centreSeat.y}) · publish victim ${vacateSeat.label}`);

const panel = () => page.getByRole("dialog", { name: /employee$/ });
const dangerAlert = () => page.locator(".sp-danger-zone [role='alert']");
const openEdit = async person => {
  await page.getByRole("button", { name: `Edit ${person}`, exact: true }).click();
  await panel().waitFor();
  await page.waitForTimeout(300);
};
const confirmDeactivate = async () => {
  await page.getByRole("button", { name: "Deactivate…", exact: true }).click();
  await page.getByRole("dialog", { name: /^Deactivate / }).waitFor();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Deactivate employee", exact: true }).click();
};

for (const T of THEMES) {
  const step = async (name, fn) => {
    if (ONLY && !ONLY.has(name.split("-")[0])) return;
    try { await fn(); } catch (e) {
      const file = await shot(`${name}-crash-${T}`).catch(() => null);
      rec(name, T, false, { focus: await active().catch(() => null) }, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, file ? [file] : []);
      await escape(); await escape();
    }
  };

  // -------------------------------------------------------------------------
  // 01 — row 2, the refusal: the guard's written reason, returned (not thrown).
  // -------------------------------------------------------------------------
  await step("01-refusal", async () => {
    await open(T, "/admin/management");
    await openEdit(refusalPerson.full_name);
    const before = errors.length;
    await confirmDeactivate();
    await dangerAlert().waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const alertText = (await dangerAlert().textContent() || "").replace(/\s+/g, " ").trim();
    const link = dangerAlert().getByRole("link");
    const linkText = (await link.textContent() || "").trim();
    const linkHref = await link.getAttribute("href");
    const linkHit = await hitAt(link);
    const rowStillThere = await page.locator("[data-directory-row]").filter({ hasText: refusalPerson.full_name }).count();
    const [dbRow] = await db(`employees?id=eq.${refusalPerson.id}&select=active`);
    const [draftAfter] = await db(`seats?id=eq.${refusalDraftSeat.id}&select=employee_id,status`);
    // The written reason can only be here if the action RETURNED it: a thrown error is
    // digest-stripped in a production build and could never carry the seat label.
    const reason = `This employee is still on the published map at ${publishedSeat.label}.`;
    const ok = alertText.includes(reason)
      && alertText.includes("Remove them from draft and publish before deleting.")
      && linkText === `Open ${refusalDraftSeat.label} on the map`
      && linkHref === `/admin?seat=${refusalDraftSeat.label}`
      && linkHit?.tag === "a"
      && rowStillThere === 1
      && dbRow.active === true
      && draftAfter.employee_id === refusalPerson.id
      && errors.length === before;
    rec("01-refusal", T, ok, { alertText, linkText, linkHref, linkHit, rowStillThere, active: dbRow.active, draftSeatKept: draftAfter.employee_id === refusalPerson.id, newErrors: errors.length - before }, "the reason text IS the proof the action returned rather than threw", [await shot(`01-refusal-${T}`)]);
    await escape();
  });

  // -------------------------------------------------------------------------
  // 02 — row 2, the negative arm (F-2): a transport failure is NOT a refusal.
  // -------------------------------------------------------------------------
  await step("02-transport-not-refusal", async () => {
    await open(T, "/admin/management");
    await openEdit(refusalPerson.full_name);
    await withAbortedActions(async () => {
      await confirmDeactivate();
      await dangerAlert().waitFor({ timeout: 20000 });
      await page.waitForTimeout(600);
    });
    const alertText = (await dangerAlert().textContent() || "").replace(/\s+/g, " ").trim();
    const [dbRow] = await db(`employees?id=eq.${refusalPerson.id}&select=active`);
    const showsRefusal = /published map/i.test(alertText);
    const ok = !showsRefusal && alertText.includes("Could not deactivate employee.") && dbRow.active === true;
    rec("02-transport-not-refusal", T, ok, { alertText, showsRefusal, active: dbRow.active }, showsRefusal ? "STOP: a transport error rendered as a refusal — the F-2 guard is not working against the new client" : "the generic error arm, not the guard's reason", [await shot(`02-transport-${T}`)]);
    await escape();
  });

  // -------------------------------------------------------------------------
  // 03 — row 3: the Ask Planner popover's Help link opens the shell's Help panel.
  // -------------------------------------------------------------------------
  await step("03-help-link", async () => {
    await open(T, "/admin");
    await row().getByRole("button", { name: /^Open Ask Planner AI/ }).click();
    await page.locator("#ask-planner-drawer").waitFor();
    await page.waitForTimeout(400);
    // Drawer state that must survive the panel round-trip.
    const typed = "PR 6 smoke — state that must survive Help";
    await page.locator("#ask-planner-question").fill(typed);
    await page.locator("#ask-planner-drawer .sp-ai-label").click();
    await page.waitForTimeout(300);
    const helpLink = page.locator("#ask-planner-explain").getByRole("button", { name: "How Ask Planner works" });
    const linkHit = await hitAt(helpLink);
    await helpLink.click();
    await page.locator("#shell-panel-help").waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    const panelBox = await box(page.locator("#shell-panel-help"));
    const panelHit = await hitAt(page.locator("#shell-panel-help"));
    const focusOnOpen = await active();
    const files = [await shot(`03-help-open-${T}`)];
    await escape();
    await page.waitForTimeout(400);
    const panelGone = (await page.locator("#shell-panel-help").count()) === 0;
    const drawerStillOpen = (await page.locator("#ask-planner-drawer").count()) === 1;
    const keptText = await page.locator("#ask-planner-question").inputValue().catch(() => null);
    const focusAfterEsc = await active();
    files.push(await shot(`03-help-closed-drawer-intact-${T}`));
    const ok = linkHit?.tag === "button" && /How Ask Planner works/.test(linkHit?.text || "")
      && Boolean(panelBox) && panelHit?.inHelpPanel === true
      && focusOnOpen?.id === "shell-panel-help-title"
      && panelGone && drawerStillOpen && keptText === typed;
    rec("03-help-link", T, ok, { linkHit, panelBox, panelHit, focusOnOpen, panelGone, drawerStillOpen, keptText, focusAfterEsc }, "focus lands on the panel's own heading (ShellPanels' rule); Esc closes it and leaves the drawer", files);
    await escape();
  });

  // -------------------------------------------------------------------------
  // 04 — row 9: the raster chain, now all in globals.css.
  // -------------------------------------------------------------------------
  await step("04-raster", async () => {
    const readFilter = () => page.locator("img.map-raster").first().evaluate(el => getComputedStyle(el).filter);
    // The dim state is INDUCED by adding the class (a live highlight needs an Ask Planner answer,
    // i.e. a model call): what is under test is whether the two rules fight in the cascade.
    const readDimFilter = async () => {
      // /admin's raster carries `transition-[filter] duration-200`: an immediate read returns the
      // in-flight value (saturate(1) at t=0), not the rule's.
      const value = await page.locator("img.map-raster").first().evaluate(el => new Promise(resolve => {
        el.classList.add("map-raster-dim");
        setTimeout(() => resolve(getComputedStyle(el).filter), 400);
      }));
      await page.locator("img.map-raster").first().evaluate(el => el.classList.remove("map-raster-dim"));
      await page.waitForTimeout(300);
      return value;
    };
    const measured = {};
    const files = [];
    for (const route of ["/", "/admin"]) {
      await open(T, route);
      const rasterBox = await box(page.locator("img.map-raster").first());
      measured[route] = { base: await readFilter(), dim: await readDimFilter(), rasterBox };
      const name = `04-raster-${route === "/" ? "home" : "admin"}-${T}`;
      files.push(await shot(name));
      if (T === "dark") {
        const baseline = path.join(BASELINE_DIR, route === "/" ? "home-dark-1920.png" : "admin-dark-1920.png");
        measured[route].vsBaseline = await compareRegion(path.join(outDir, `${name}.png`), baseline, rasterBox ?? { x: 0, y: 0, w: 1920, h: 1080 });
      }
    }
    // The drawer open with no highlight: the base rule still applies (nothing dims on open alone).
    await row().getByRole("button", { name: /^Open Ask Planner AI/ }).click();
    await page.locator("#ask-planner-drawer").waitFor();
    await page.waitForTimeout(500);
    const withDrawer = await readFilter();
    files.push(await shot(`04-raster-admin-ask-open-${T}`));
    // The LIVE dim: a real Ask Planner answer highlights seats (needs OPENAI_API_KEY on the
    // server — .env.local carries one here). If no highlight lands, the dim is induced by adding
    // the class instead, and the record says so.
    let liveDim = null;
    try {
      await page.locator("#ask-planner-question").fill(`Where does ${refusalPerson.full_name} sit?`);
      await page.getByRole("button", { name: "Ask", exact: true }).click();
      const highlighted = page.locator('button[data-seat-id][aria-label*="Highlighted by Ask Planner"]');
      await highlighted.first().waitFor({ timeout: 25000 });
      await page.waitForTimeout(400);
      liveDim = { filter: await readFilter(), highlightedSeats: await highlighted.count() };
      files.push(await shot(`04-raster-live-dim-${T}`));
    } catch {
      const notice = await page.locator("#ask-planner-drawer .cds-notification").first().textContent().catch(() => "");
      liveDim = { skipped: (notice || "").trim().slice(0, 120) || "no highlighted seat within 25s" };
    }
    await escape();
    const expect = RASTER_FILTER[T];
    const baselineOk = T !== "dark" || ["/", "/admin"].every(r => {
      const c = measured[r].vsBaseline;
      return c && !c.missingBaseline && !c.sizeMismatch && c.maxBlockDelta <= 8;
    });
    const liveDimOk = !liveDim?.filter || liveDim.filter === expect.dim;
    const ok = measured["/"].base === expect.base && measured["/admin"].base === expect.base
      && measured["/"].dim === expect.dim && measured["/admin"].dim === expect.dim
      && withDrawer === expect.base && baselineOk && liveDimOk;
    rec("04-raster", T, ok, { expected: expect, measured, withDrawerOpen: withDrawer, liveDim }, `${T === "dark" ? "dark chain + block-mean compare against screenshots/pr6/runtime (≤8/255 per 16×16 block); " : ""}${liveDim?.filter ? "the dim measured on a LIVE Ask Planner highlight" : "no live highlight — the dim state was induced by adding .map-raster-dim"}`, files);
  });

  // -------------------------------------------------------------------------
  // 05 — row 4: below the retired 900 `panel` tier.
  // -------------------------------------------------------------------------
  await step("05-below-900", async () => {
    await open(T, "/admin", 820, 900);
    // Zoom in first: at Fit the plan fits the frame (maxTop = maxLeft = 0), so every anchor —
    // the 0.5 one and the retired 0.28 sheet anchor alike — clamps to 0 and the centring claim
    // would pass vacuously. Three zoom steps give the viewport ~230px of vertical travel.
    for (let i = 0; i < 3; i += 1) {
      await page.locator('[data-map-status-band] button[aria-label="Zoom in"]').click();
      await page.waitForTimeout(400);
    }
    // Select the seat from the palette (D1-d: ⌘/Ctrl-K focuses the search and opens it).
    await page.keyboard.press("Control+k");
    await page.locator("#viewer-find-palette").waitFor({ timeout: 10000 });
    // Fill through the field rather than the keyboard: the shortcut opens the palette even when
    // focus did not land in the input, and a blind type would then go nowhere.
    await page.locator('.sp-search input[type="search"]').first().fill(centreSeat.label);
    await page.waitForTimeout(900);
    const paletteRow = page.locator(`#viewer-find-palette .sp-palette-row[aria-label*="${centreSeat.label.toUpperCase()}."]`).first();
    await paletteRow.waitFor({ timeout: 10000 });
    const paletteRowHit = await hitAt(paletteRow);
    await paletteRow.click();
    await page.locator("#seat-inspector-panel").waitFor({ timeout: 10000 });
    const inspectorText = (await page.locator("#seat-inspector-panel").textContent() || "").slice(0, 200);
    // Smooth scroll + the two rAFs queueCenterSeatInMap waits on.
    await page.waitForTimeout(1500);
    const slotHost = page.locator("[data-slot-host][data-open]");
    const viewport = page.locator('[aria-label^="Admin seat map viewport"]').first();
    const band = page.locator("[data-map-status-band]");
    const slotBox = await box(slotHost);
    const viewportBox = await box(viewport);
    const bandBox = await box(band);
    const bandHit = await hitAt(band);
    const marker = page.locator(`button[data-seat-id="${centreSeat.id}"]`);
    // The anchor claim, measured as the achieved scroll against the ideal 0.5 target (clamped) —
    // and against the retired 0.28 sheet anchor.
    const anchor = await page.evaluate(({ seatId }) => {
      const el = document.querySelector(`button[data-seat-id="${seatId}"]`);
      const vp = document.querySelector('[aria-label^="Admin seat map viewport"]');
      if (!el || !vp) return null;
      const er = el.getBoundingClientRect(), vr = vp.getBoundingClientRect();
      const pointY = er.top + er.height / 2 - vr.top + vp.scrollTop;
      const pointX = er.left + er.width / 2 - vr.left + vp.scrollLeft;
      const maxTop = vp.scrollHeight - vp.clientHeight, maxLeft = vp.scrollWidth - vp.clientWidth;
      const clamp = (v, max) => Math.max(0, Math.min(max, v));
      return {
        scrollTop: Math.round(vp.scrollTop), scrollLeft: Math.round(vp.scrollLeft),
        maxTop: Math.round(maxTop), maxLeft: Math.round(maxLeft),
        ideal05Top: Math.round(clamp(pointY - vp.clientHeight * 0.5, maxTop)),
        ideal05Left: Math.round(clamp(pointX - vp.clientWidth * 0.5, maxLeft)),
        retired028Top: Math.round(clamp(pointY - vp.clientHeight * 0.28, maxTop)),
        markerCentreY: Math.round(er.top + er.height / 2), markerCentreX: Math.round(er.left + er.width / 2),
        viewportCentreY: Math.round(vr.top + vr.height / 2), viewportCentreX: Math.round(vr.left + vr.width / 2)
      };
    }, { seatId: centreSeat.id });
    const markerHit = await hitAt(marker);
    const files = [await shot(`05-slot-820-${T}`)];
    // The slot overlays from the RIGHT of the canvas column and reserves no width there.
    const overlaysRight = Boolean(slotBox && viewportBox) && Math.abs((slotBox.x + slotBox.w) - (viewportBox.x + viewportBox.w)) <= 4 && slotBox.x > viewportBox.x;
    const slotWidthOk = Boolean(slotBox) && Math.abs(slotBox.w - Math.min(400, viewportBox.w)) <= 4;
    const bandClear = bandHit?.inBand === true && bandHit?.inSlot === false;
    const bandBelowSlot = Boolean(slotBox && bandBox) && slotBox.y + slotBox.h <= bandBox.y + 1;
    const centred = Boolean(anchor) && Math.abs(anchor.scrollTop - anchor.ideal05Top) <= 8 && Math.abs(anchor.scrollLeft - anchor.ideal05Left) <= 8;
    // Only meaningful while the viewport can actually travel — see the zoom above.
    const scrollable = Boolean(anchor) && anchor.maxTop > 20;
    const notUpperStrip = scrollable && Math.abs(anchor.scrollTop - anchor.retired028Top) > 8;
    await escape();
    await page.waitForTimeout(300);
    // The viewer's OWN 900 rule, deliberately kept: full-width sheet below, 560 anchored above.
    const paletteFrame = async (width) => {
      await open(T, "/", width, 900);
      await page.keyboard.press("Control+k");
      await page.locator("#viewer-find-palette").waitFor({ timeout: 10000 });
      await page.waitForTimeout(600);
      const b = await box(page.locator("#viewer-find-palette"));
      await escape();
      return b;
    };
    const below = await paletteFrame(880);
    const above = await paletteFrame(1200);
    files.push(await shot(`05-viewer-palette-1200-${T}`));
    // bandClear / bandBelowSlot are RECORDED here but are not this step's pass criteria (step 05b),
    // and neither is the viewer palette's own 900 rule (step 05c).
    const ok = overlaysRight && slotWidthOk && centred && scrollable && notUpperStrip
      && paletteRowHit?.tag === "button" && inspectorText.includes(centreSeat.label.toUpperCase());
    rec("05-below-900", T, ok, { paletteRowHit, inspectorSeat: inspectorText.slice(0, 60), slotBox, viewportBox, bandBox, bandHit, markerHit, anchor, overlaysRight, slotWidthOk, bandClear, bandBelowSlot, centred, scrollable, notUpperStrip, viewerPalette: { below880: below, above1200: above } }, "zoomed in 3 steps so the viewport can travel: the achieved scroll IS the 0.5 target and is NOT the retired 0.28 sheet anchor", files);
  });

  // -------------------------------------------------------------------------
  // 05b — "the band spans the canvas, not the slot" (PHASE2UX §1M.2): hit-test the
  // band's own zoom control with the slot closed and open, at 820x900 and at the
  // owner's 1920x1080 target. This is finding F-8's fix under assertion (sheet
  // amendment G): with the slot open the band takes the slot's push, so its right
  // edge stops at the slot's left edge and the zoom group stays hit-testable.
  // -------------------------------------------------------------------------
  await step("05b-band-slot-push", async () => {
    const probe = async () => page.evaluate(() => {
      // At 820x900 the band sits below the fold - scroll it into view before hit-testing.
      const scroller = document.scrollingElement;
      scroller.scrollTop = scroller.scrollHeight;
      const band = document.querySelector("[data-map-status-band]");
      const host = document.querySelector("[data-slot-host][data-open]");
      const zoomIn = band?.querySelector('button[aria-label="Zoom in"]');
      const describe = el => (el ? { tag: el.tagName.toLowerCase(), cls: [...el.classList].slice(0, 2).join("."), inBand: Boolean(el.closest("[data-map-status-band]")), inSlot: Boolean(el.closest("[data-slot-host]")) } : null);
      const b = band?.getBoundingClientRect();
      const z = zoomIn?.getBoundingClientRect();
      const at = (x, y) => describe(document.elementFromPoint(x, y));
      const hostRect = host ? host.getBoundingClientRect() : null;
      return {
        band: b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null,
        host: hostRect ? { x: Math.round(hostRect.x), bottom: Math.round(hostRect.bottom) } : null,
        zoomInCentre: z ? { x: Math.round(z.x + z.width / 2), y: Math.round(z.y + z.height / 2) } : null,
        zoomInHit: z ? at(z.x + z.width / 2, z.y + z.height / 2) : null,
        bandLeftHit: b ? at(b.x + 200, b.y + b.height / 2) : null,
        // Amendment G: the band's content must end before the slot's left edge.
        bandPaddingRight: band ? getComputedStyle(band).paddingRight : null,
        slotOpenAttr: band ? band.hasAttribute("data-slot-open") : null,
        zoomRightOfSlot: z && hostRect ? Math.round(z.right - hostRect.x) : null
      };
    });
    const measured = {};
    const files = [];
    for (const [name, width, height] of [["at820", 820, 900], ["at1920", 1920, 1080]]) {
      await open(T, "/admin", width, height);
      measured[name] = { closed: await probe() };
      files.push(await shot(`05b-band-${name}-slot-closed-${T}`));
      await page.keyboard.press("Control+k");
      await page.locator("#viewer-find-palette").waitFor({ timeout: 10000 });
      await page.locator('.sp-search input[type="search"]').first().fill(centreSeat.label);
      await page.waitForTimeout(900);
      await page.locator(`#viewer-find-palette .sp-palette-row[aria-label*="${centreSeat.label.toUpperCase()}."]`).first().click();
      await page.locator("#seat-inspector-panel").waitFor({ timeout: 10000 });
      await page.waitForTimeout(1200);
      measured[name].open = await probe();
      files.push(await shot(`05b-band-${name}-slot-open-${T}`));
      await escape();
    }
    // The claim under test (PHASE2UX §1M.2, built as amendment G): with the slot open the band is
    // still the band at its own controls, and its zoom group sits clear of the slot's left edge.
    const holds = ["at820", "at1920"].every(k => {
      const { closed, open } = measured[k];
      return closed.zoomInHit?.inBand === true && closed.slotOpenAttr === false
        && open.zoomInHit?.inBand === true && open.zoomInHit?.inSlot === false
        && open.slotOpenAttr === true
        && typeof open.zoomRightOfSlot === "number" && open.zoomRightOfSlot <= 0;
    });
    rec("05b-band-slot-push", T, holds, measured, holds ? "amendment G (F-8): with the slot open the band takes the slot's push — its zoom control hit-tests to itself and its right edge clears the slot" : "F-8: the band's zoom control is still under the slot while the slot is open", files);
  });

  // -------------------------------------------------------------------------
  // 05c — the viewer's OWN 900 palette rule (deliberately kept by row 4).
  // Below 900 computeFrame returns width:null and the element takes `right-3`,
  // meaning to span the viewport as a sheet; at 900+ it is 560 anchored.
  // -------------------------------------------------------------------------
  await step("05c-viewer-palette-900-carried", async () => {
    const frameAt = async width => {
      await open(T, "/", width, 900);
      await page.keyboard.press("Control+k");
      await page.locator("#viewer-find-palette").waitFor({ timeout: 10000 });
      await page.waitForTimeout(700);
      const out = await page.locator("#viewer-find-palette").evaluate(el => {
        const b = el.getBoundingClientRect();
        return { innerWidth: window.innerWidth, x: Math.round(b.x), w: Math.round(b.width), right: Math.round(b.right),
          cssWidth: getComputedStyle(el).width, sheetClass: el.className.includes("right-3"),
          overflowsViewport: b.right > window.innerWidth + 1, clippedPx: Math.max(0, Math.round(b.right - window.innerWidth)) };
      });
      await escape();
      return out;
    };
    const at880 = await frameAt(880);
    const at1200 = await frameAt(1200);
    const at390 = await frameAt(390);
    const files = [await shot(`05c-viewer-palette-390-${T}`)];
    // F-9 is CARRIED, not fixed (owner ruling 2026-09-08, DECISIONS §7): phone-width only, off the
    // 1920 hardware target. So this step pins the CARRIED state rather than the intent — a change
    // here means the carried finding moved, which is what a future run needs to hear.
    const sheetIntent = at880.sheetClass && at880.x === 12;         // the below-900 branch does fire…
    const sheetWidthWins = at880.w === 560 && at880.right === 572;  // …and `.sp-palette`'s 560 wins
    const anchored = at1200.w === 560 && at1200.x === 240;          // the >= 900 branch, correct
    const phoneClip = at390.overflowsViewport && at390.clippedPx === 182;
    const asCarried = sheetIntent && sheetWidthWins && anchored && phoneClip;
    rec("05c-viewer-palette-900-carried", T, asCarried, { at880, at1200, at390, sheetIntent, sheetWidthWins, anchored, phoneClip },
      asCarried
        ? "F-9 as ruled CARRIED (DECISIONS §7): the below-900 branch fires (left 12, `right-3`) but `.sp-palette`'s 560 wins — 560 wide at 880, 560 anchored at 1200, 182px clipped at 390. Not a regression; not fixed by owner ruling"
        : "F-9's measurement MOVED from the state DECISIONS §7 carries — re-read the ruling before treating this as a pass or a failure", files);
  });
}

// ---------------------------------------------------------------------------
// 06 — the publish regression: ONE real publish on the local stack.
// ---------------------------------------------------------------------------
if (!ONLY || ONLY.has("06")) {
  try {
    const eventsBefore = (await db("publish_events?select=id")).length;
    // A draft change the review must see: vacate one assigned draft seat through the service role
    // (the flow under test is publish, not the edit).
    await db(`seats?id=eq.${vacateSeat.id}`, { method: "PATCH", body: JSON.stringify({ employee_id: null, status: "available" }) });
    await open("light", "/admin");
    const publishButton = row().getByRole("button", { name: /^Publish \d+ change/ });
    await publishButton.waitFor({ timeout: 15000 });
    const buttonLabel = (await publishButton.textContent() || "").trim();
    await publishButton.click();
    const sheet = page.getByRole("dialog", { name: "Review draft before publishing" });
    await sheet.waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
    const facts = (await page.locator(".sp-tearsheet-facts").textContent() || "").trim();
    const primary = sheet.locator(".sp-tearsheet-footer .cds-btn--primary");
    const primaryLabel = (await primary.textContent() || "").trim();
    const files = [await shot("06-publish-review")];
    await primary.click();
    await page.waitForFunction(() => !document.querySelector("[data-tearsheet-host]"), null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    files.push(await shot("06-publish-done"));
    const eventsAfter = (await db("publish_events?select=id")).length;
    const [publishedAfter] = await db(`seats?layer=eq.published&label=eq.${vacateSeat.label}&select=label,employee_id,status`);
    const publishStillOffered = await row().getByRole("button", { name: /^Publish \d+ change/ }).count();
    const ok = eventsAfter === eventsBefore + 1
      && publishedAfter.employee_id === null
      && publishedAfter.status === "available"
      && publishStillOffered === 0
      && /^Publish \d+ change/.test(primaryLabel);
    rec("06-publish", "light", ok, { buttonLabel, facts, primaryLabel, eventsBefore, eventsAfter, publishedAfter, publishStillOffered }, "one real publish on the LOCAL stack — the draft change was made through the service role, the publish through the UI", files);
  } catch (e) {
    rec("06-publish", "light", false, {}, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, []);
  }
}

// ---------------------------------------------------------------------------
// 06b — the brand checklist (brand-system skill), measured in both themes.
// ---------------------------------------------------------------------------
if (!ONLY || ONLY.has("06")) {
  const TERRACOTTA = "rgb(184, 92, 46)", HOVER = "rgb(143, 69, 33)";
  const LINK = { light: "rgb(143, 69, 33)", dark: "rgb(232, 160, 122)" };
  for (const T of THEMES) {
    try {
      await open(T, "/admin/management");
      const primary = page.getByRole("button", { name: "Add employee", exact: true });
      const primaryBg = await primary.evaluate(el => getComputedStyle(el).backgroundColor);
      await primary.hover();
      await page.waitForTimeout(200);
      const primaryHover = await primary.evaluate(el => getComputedStyle(el).backgroundColor);
      await primary.focus();
      const ring = await primary.evaluate(el => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`; });
      const link = page.locator(".cds-table a").first();
      const linkColor = await link.evaluate(el => getComputedStyle(el).color);
      // The rail's current-section bar (the shell's active item).
      const currentBar = await page.locator('[aria-current="page"]').first().evaluate(el => {
        const s = getComputedStyle(el);
        return [s.boxShadow, s.borderBottomColor, s.borderLeftColor, s.color,
          getComputedStyle(el, "::before").backgroundColor, getComputedStyle(el, "::after").backgroundColor].join(" | ");
      });
      const ok = primaryBg === TERRACOTTA && primaryHover === HOVER
        && ring.startsWith("solid 2px rgb(184, 92, 46)") && ring.endsWith("-2px")
        && linkColor === LINK[T] && currentBar.includes("rgb(184, 92, 46)");
      rec("06b-brand", T, ok, { primaryBg, primaryHover, focusRing: ring, linkColor, expectedLink: LINK[T], currentBar }, "brand-system checklist: primary · hover · focus ring · link · current-section bar", [await shot(`06b-brand-${T}`)]);
    } catch (e) {
      rec("06b-brand", T, false, {}, `crash: ${String(e).split("\n")[0].slice(0, 220)}`, []);
    }
  }
}

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} records pass`);
const noise = errors.filter(e => !/speed-insights|Failed to load resource/.test(e));
console.log(`console/page errors: ${errors.length} (${noise.length} not the local Speed Insights 404)`);
noise.slice(0, 10).forEach(e => console.log("   " + e.slice(0, 200)));
await browser.close();
process.exit(passed === results.length ? 0 : 1);
