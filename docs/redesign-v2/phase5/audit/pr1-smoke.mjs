// Phase 5 · PR 1 pre-merge smoke — reviewer-ordered (2026-09-08). Drives Management →
// Publish history in REAL Chrome at 1024 and 1920, light and dark, on the LOCAL Docker
// stack only. Every geometric claim is a HIT-TEST (document.elementFromPoint), never a
// visibility check; every ordering claim reads the rendered rows, never the props.
//
// The stack is reset + reseeded per theme, then loaded with pr1-log-fixture.sql (the
// seeded stack holds one publish event, which exercises neither sorting nor paging).
//
// Usage: node docs/redesign-v2/phase5/audit/pr1-smoke.mjs <baseUrl> <outDir> <adminEmail> <password>
// SMOKE_ONLY=4,5 runs only those steps inside each theme loop.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base = "http://localhost:3300", outDir = "out", email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("admin email and password required (the seeded local account)");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const ONLY = process.env.SMOKE_ONLY ? new Set(process.env.SMOKE_ONLY.split(",").map(x => x.trim())) : null;
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../../..");
const FIXTURE = path.join(repoRoot, "docs/redesign-v2/phase5/audit/pr1-log-fixture.sql");
const TAB = "/admin/management?tab=publishHistory";

const results = [];
const rec = (step, theme, ok, values = {}, note = "", files = []) => {
  results.push({ step, theme, ok, values, note, files });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} (${theme})${note ? " — " + note : ""}`);
  if (!ok) console.log("  values:", JSON.stringify(values).slice(0, 1600));
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
};

// The one ad-hoc statement this rig runs, spelled as a constant: nothing is
// interpolated into a shell string, and it only ever addresses the local
// container by name (no connection string, no network target).
const emptyLog = () =>
  execSync('docker exec -i supabase_db_seat-planner psql -U postgres -d postgres -q -c "delete from public.publish_events"', {
    stdio: ["ignore", "ignore", "inherit"]
  });
const loadFixture = () =>
  execSync("docker exec -i supabase_db_seat-planner psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f -", {
    input: readFileSync(FIXTURE, "utf8"),
    stdio: ["pipe", "ignore", "inherit"]
  });
const resetStack = () => {
  execSync("npx supabase db reset", { cwd: repoRoot, stdio: "ignore" });
  execSync("node scripts/seed-local-db.mjs", { cwd: repoRoot, stdio: "ignore" });
  loadFixture();
};

const browser = await chromium.launch({ channel: "chrome" });
let context;
let page;
let consoleErrors = [];
let rigAborting = false;   // true only while step 6 is deliberately failing the log action
const newSession = async who => {
  if (context) await context.close();
  consoleErrors = [];
  context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  page = await context.newPage();
  page.on("pageerror", e => consoleErrors.push({ text: String(e), rigInduced: rigAborting }));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push({ text: m.text(), rigInduced: rigAborting }); });
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', who);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });
};

const shot = async name => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  return `${name}.png`;
};
const open = async (route, theme, width = 1920, height = 1080) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
};
const settled = () =>
  page.waitForFunction(
    () => {
      const el = document.querySelector(".sp-log .cds-toolbar-count");
      return !!el && !/^Loading publish history/.test(el.textContent ?? "");
    },
    null,
    { timeout: 25000 }
  );
const openTab = async (theme, width, height) => { await open(TAB, theme, width, height); await settled(); };

// Hit-test: what actually sits at the centre of a locator's box.
const centre = async loc => { const b = await loc.boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };
const hit = async pt => (pt === null ? null : page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const target = el.closest("button, a, th, td") ?? el;
  return `${target.tagName.toLowerCase()}.${[...target.classList].slice(0, 3).join(".")}:${(target.getAttribute("aria-label") ?? target.textContent ?? "").trim().slice(0, 30)}`;
}, pt));
const hitAt = async loc => hit(await centre(loc));
// A route handler that sleeps can outlive its request — a navigation aborts it
// underneath, and continuing an already-handled route throws.
const safeContinue = async r => { try { await r.continue(); } catch { /* already handled */ } };
const safeAbort = async r => { try { await r.abort(); } catch { /* already handled */ } };
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el)[p], prop);
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  const role = el.getAttribute("role");
  return `${el.tagName.toLowerCase()}${role ? "[" + role + "]" : ""}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 34)}`;
});

// Everything the table renders, read from the DOM.
const readTable = () => page.evaluate(() => {
  const root = document.querySelector(".sp-log");
  if (!root) return null;
  const scroller = root.querySelector(".sp-table-scroll");
  const table = root.querySelector(".cds-table");
  const ths = [...root.querySelectorAll("thead th")].map(th => ({
    label: (th.textContent ?? "").trim(),
    className: th.className || "(sentence)",
    ariaSort: th.getAttribute("aria-sort"),
    width: Math.round(th.getBoundingClientRect().width),
    right: Math.round(th.getBoundingClientRect().right),
    clipped: th.scrollWidth > th.clientWidth + 1,
    innerClipped: (() => { const i = th.firstElementChild; return i ? i.scrollWidth > i.clientWidth + 1 : false; })()
  }));
  const rows = [...root.querySelectorAll("tbody tr")].map(tr => ({
    when: tr.querySelector(".sp-col-when")?.textContent ?? "",
    who: tr.querySelector(".sp-col-who")?.textContent ?? "",
    count: tr.querySelector(".sp-col-count")?.textContent ?? "",
    what: tr.lastElementChild?.textContent ?? ""
  }));
  return {
    count: root.querySelector(".cds-toolbar-count")?.textContent ?? null,
    range: root.querySelector(".cds-range")?.textContent ?? null,
    tableWidth: table ? Math.round(table.getBoundingClientRect().width) : null,
    scrollerScrolls: scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : null,
    scrollerOverflowX: scroller ? getComputedStyle(scroller).overflowX : null,
    docScrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ths,
    rows,
    hasPagination: !!root.querySelector(".cds-pagination"),
    emptyHeading: root.querySelector(".cds-empty h3")?.textContent ?? null,
    emptyButtons: root.querySelectorAll(".cds-empty button, .cds-empty a").length,
    skeletonRows: root.querySelectorAll(".cds-skeleton-row").length,
    alertText: root.querySelector('[role="alert"]')?.textContent ?? null
  };
});
const headerActions = () => page.evaluate(() => {
  const header = document.querySelector(".sp-page .cds-page-header");
  const primary = header.querySelector(".cds-btn--primary");
  const focusable = header.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const box = primary?.getBoundingClientRect();
  return {
    primaries: header.querySelectorAll(".cds-btn--primary").length,
    focusableInHeader: focusable.length,
    primaryText: primary?.textContent?.trim() ?? null,
    primaryRight: box ? Math.round(box.right) : null,
    primaryTop: box ? Math.round(box.top) : null,
    subtitle: header.querySelector(".cds-page-subtitle")?.textContent ?? null
  };
});

// The Publish-history read is a server action POST like every other; identify it
// by ELIMINATION (the ids seen on the record tab minus the ids seen on Employees)
// so the error step can abort ONLY it and leave the shell's status healthy.
async function findLogActionId() {
  const seen = new Set();
  const listen = r => { if (r.method() === "POST" && r.headers()["next-action"]) seen.add(r.headers()["next-action"]); };
  page.on("request", listen);
  await open("/admin/management", "light");
  await page.locator("[data-directory-row]").first().waitFor();
  await page.waitForTimeout(800);
  const employeesIds = new Set(seen);
  seen.clear();
  await openTab("light", 1920, 1080);
  await page.waitForTimeout(400);
  page.off("request", listen);
  return [...seen].find(id => !employeesIds.has(id)) ?? null;
}

const step = async (name, theme, fn) => {
  if (ONLY && !ONLY.has(name.split(" ")[0])) return;
  try {
    await fn();
  } catch (e) {
    const file = await shot(`${name.split(" ")[0]}-crash-${theme}`).catch(() => null);
    rec(name, theme, false, { focus: await active().catch(() => null) }, `crash: ${String(e).split("\n")[0].slice(0, 240)}`, file ? [file] : []);
    await page.keyboard.press("Escape").catch(() => {});
  }
};

const EXPECTED_LABELS = ["Published", "Published by", "Changes", "What changed"];
// Off Vercel the Speed-Insights script 404s and is then refused for its MIME
// type — the one console pair that is expected on the local stack.
const KNOWN_CONSOLE = /_vercel\/speed-insights|status of 404/;

for (const theme of ["light", "dark"]) {
  resetStack();
  await newSession(email);

  // ---------------------------------------------------------------- 1 · 1024
  // Amendment H is doing the work here: percentages alone crushed the count
  // column to 86px and ellipsed its LABEL to "hanges" before the min-width.
  await step("1 narrow-1024", theme, async () => {
    await openTab(theme, 1024, 768);
    const t = await readTable();
    const sortBtn = page.locator(".sp-log th.sp-col-count .cds-sort");
    const cell = page.locator(".sp-log tbody tr .sp-col-count").first();
    const hits = { header: await hitAt(sortBtn), cell: await hitAt(cell) };
    const align = { cellAlign: await css(cell, "textAlign"), cellNumeric: await css(cell, "fontVariantNumeric"), headerJustify: await css(sortBtn, "justifyContent") };
    const file = await shot(`01-narrow-1024-${theme}`);

    const problems = [];
    const labels = t.ths.map(th => th.label);
    if (labels.join("|") !== EXPECTED_LABELS.join("|")) problems.push(`labels ${labels.join(" · ")}`);
    for (const th of t.ths) {
      if (th.clipped || th.innerClipped) problems.push(`${th.label} header is clipped`);
    }
    if (t.tableWidth !== 1216) problems.push(`table ${t.tableWidth} ≠ 1216`);
    if (t.scrollerScrolls !== true) problems.push("`.sp-table-scroll` is not the scroller");
    if (t.scrollerOverflowX !== "auto") problems.push(`scroller overflow-x ${t.scrollerOverflowX}`);
    if (t.docScrolls) problems.push("the document scrolls sideways");
    if (!/th\..*sp-col-count|button\.cds-sort/.test(hits.header ?? "")) problems.push(`header hit → ${hits.header}`);
    if (!/td\.sp-col-count/.test(hits.cell ?? "")) problems.push(`cell hit → ${hits.cell}`);
    if (align.cellAlign !== "right") problems.push(`cell text-align ${align.cellAlign}`);
    if (align.cellNumeric !== "tabular-nums") problems.push(`cell numeric ${align.cellNumeric}`);
    if (align.headerJustify !== "flex-end") problems.push(`header justify ${align.headerJustify}`);
    rec("1 narrow-1024", theme, problems.length === 0, { widths: t.ths, tableWidth: t.tableWidth, scroller: { scrolls: t.scrollerScrolls, overflowX: t.scrollerOverflowX }, docScrolls: t.docScrolls, hits, align }, problems.join("; "), [file]);
  });

  // ---------------------------------------------------------------- 2 · 1920
  await step("2 ruling-1920", theme, async () => {
    await openTab(theme, 1920, 1080);
    const t = await readTable();
    const sortBtn = page.locator(".sp-log th.sp-col-count .cds-sort");
    const cell = page.locator(".sp-log tbody tr .sp-col-count").first();
    const hits = { header: await hitAt(sortBtn), cell: await hitAt(cell) };
    const btnRight = await sortBtn.evaluate(el => Math.round(el.getBoundingClientRect().right));
    const countTh = t.ths.find(th => th.className.includes("sp-col-count"));
    const file = await shot(`02-ruling-1920-${theme}`);

    const problems = [];
    if (t.ths.map(th => th.label).join("|") !== EXPECTED_LABELS.join("|")) problems.push("labels");
    for (const th of t.ths) if (th.clipped || th.innerClipped) problems.push(`${th.label} header is clipped`);
    if (t.docScrolls) problems.push("the document scrolls sideways");
    if (btnRight !== countTh.right) problems.push(`sort-button right ${btnRight} ≠ column right ${countTh.right}`);
    if (!/td\.sp-col-count/.test(hits.cell ?? "")) problems.push(`cell hit → ${hits.cell}`);
    if (await css(cell, "textAlign") !== "right") problems.push("cell not right-aligned");
    rec("2 ruling-1920", theme, problems.length === 0, { widths: t.ths, tableWidth: t.tableWidth, sortButtonRight: btnRight, countColumnRight: countTh.right, hits }, problems.join("; "), [file]);
  });

  // -------------------------------------------------- 3 · R1 in both directions
  await step("3 no-primary", theme, async () => {
    await openTab(theme, 1920, 1080);
    const onRecord = await headerActions();
    // Tab from the skip-link landing marker must reach the tablist, with no
    // stray focusable left behind in the emptied action area.
    await page.evaluate(() => document.getElementById("admin-subpage-main")?.focus());
    const tabChain = [];
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const role = el.getAttribute("role");
        return {
          desc: `${el.tagName.toLowerCase()}${role ? "[" + role + "]" : ""}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}`,
          isTab: role === "tab",
          inPageHeader: !!el.closest(".cds-page-header")
        };
      });
      tabChain.push(stop);
      if (stop?.isTab) break;
    }
    const afterMarker = tabChain.map(t => t?.desc).join(" → ");
    const recordFile = await shot(`03-no-primary-${theme}`);

    await page.getByRole("tab", { name: "Employees" }).click();
    await page.locator("[data-directory-row]").first().waitFor();
    const onEmployees = await headerActions();
    const employeesFile = await shot(`03-primary-returns-${theme}`);

    await page.getByRole("tab", { name: "Zones" }).click();
    await page.waitForTimeout(250);
    const onZones = await headerActions();

    const problems = [];
    if (onRecord.primaries !== 0) problems.push(`${onRecord.primaries} primaries on the record tab`);
    if (onRecord.focusableInHeader !== 0) problems.push(`${onRecord.focusableInHeader} focusable nodes in the emptied header`);
    // The shipped chain is marker → the page's focusable scroll region → the
    // tablist. What R1 has to prove is that the emptied action area leaves NO
    // stop of its own behind.
    if (!tabChain.some(t => t?.isTab)) problems.push(`Tab never reached the tablist: ${afterMarker}`);
    if (tabChain.some(t => t?.inPageHeader)) problems.push(`a focus stop survives in the page header: ${afterMarker}`);
    if (onEmployees.primaryText !== "Add employee") problems.push(`Employees primary "${onEmployees.primaryText}"`);
    if (onEmployees.primaryRight !== onZones.primaryRight || onEmployees.primaryTop !== onZones.primaryTop) {
      problems.push(`primary moves between tabs: ${onEmployees.primaryRight},${onEmployees.primaryTop} vs ${onZones.primaryRight},${onZones.primaryTop}`);
    }
    if (onRecord.subtitle !== "People, departments, zones and publish history.") problems.push(`subtitle "${onRecord.subtitle}"`);
    rec("3 no-primary", theme, problems.length === 0, { onRecord, tabChain, afterMarker, onEmployees, onZones }, problems.join("; "), [recordFile, employeesFile]);
  });

  // ----------------------------------------------------------- 4 · real sorting
  await step("4 sorting", theme, async () => {
    await openTab(theme, 1920, 1080);
    const before = await readTable();
    await page.getByRole("button", { name: "Changes", exact: true }).click();
    await page.waitForTimeout(250);
    const desc = await readTable();
    const sortedFile = await shot(`04-sorted-changes-${theme}`);

    // The sort must survive a page change: page 2's largest may not exceed page 1's smallest.
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForTimeout(250);
    const page2 = await readTable();
    await page.getByRole("button", { name: "Previous page" }).click();
    await page.waitForTimeout(250);

    // Keyboard: Enter on the Changes header flips it, Space on Published resets to newest-first.
    await page.locator(".sp-log th.sp-col-count .cds-sort").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    const asc = await readTable();
    await page.locator(".sp-log th.sp-col-when .cds-sort").focus();
    await page.keyboard.press(" ");
    await page.waitForTimeout(250);
    const byDate = await readTable();

    const n = s => (s === "—" ? null : Number(s.replace(/,/g, "")));
    const problems = [];
    if (before.rows[0].count === desc.rows[0].count && before.rows.map(r => r.what).join() === desc.rows.map(r => r.what).join()) {
      problems.push("the order did not actually change");
    }
    if (n(desc.rows[0].count) !== 41) problems.push(`largest first → ${desc.rows[0].count}`);
    if (desc.ths.find(t => t.className.includes("sp-col-count")).ariaSort !== "descending") problems.push("aria-sort did not follow");
    const page1Min = Math.min(...desc.rows.map(r => n(r.count)).filter(v => v !== null));
    const page2Max = Math.max(...page2.rows.map(r => n(r.count)).filter(v => v !== null));
    if (page2Max > page1Min) problems.push(`sort lost across pages: page2 max ${page2Max} > page1 min ${page1Min}`);
    if (page2.ths.find(t => t.className.includes("sp-col-count")).ariaSort !== "descending") problems.push("aria-sort lost on page 2");
    if (asc.ths.find(t => t.className.includes("sp-col-count")).ariaSort !== "ascending") problems.push("Enter did not flip the Changes header");
    if (byDate.ths.find(t => t.className.includes("sp-col-when")).ariaSort !== "descending") problems.push("Space on Published did not return newest-first");
    if (byDate.rows[0].when !== before.rows[0].when) problems.push(`newest-first row "${byDate.rows[0].when}" ≠ "${before.rows[0].when}"`);
    rec("4 sorting", theme, problems.length === 0, {
      firstBefore: before.rows[0], firstDesc: desc.rows[0], page1Min, page2Max,
      firstAsc: asc.rows[0], firstByDate: byDate.rows[0]
    }, problems.join("; "), [sortedFile]);
  });

  // -------------------------------------------------------------- 5 · paging
  await step("5 pagination", theme, async () => {
    await openTab(theme, 1920, 1080);
    const p1 = await readTable();
    const prevDisabled1 = await page.getByRole("button", { name: "Previous page" }).isDisabled();
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForTimeout(250);
    const p2 = await readTable();
    const nextDisabled2 = await page.getByRole("button", { name: "Next page" }).isDisabled();
    const prevDisabled2 = await page.getByRole("button", { name: "Previous page" }).isDisabled();
    const file = await shot(`05-page-2-${theme}`);

    const problems = [];
    if (p1.range !== "1–25 of 30") problems.push(`page 1 range "${p1.range}"`);
    if (p2.range !== "26–30 of 30") problems.push(`page 2 range "${p2.range}"`);
    if (p1.rows[0].when === p2.rows[0].when) problems.push("page 2's first row is page 1's first row");
    if (!prevDisabled1) problems.push("Previous is enabled on page 1");
    if (!nextDisabled2) problems.push("Next is enabled on the last page");
    if (prevDisabled2) problems.push("Previous is disabled on page 2");
    if (p2.count !== p1.count) problems.push(`the toolbar count followed the page: "${p2.count}"`);
    if (!/^30 publishes/.test(p1.count ?? "")) problems.push(`count "${p1.count}" is not the total`);
    rec("5 pagination", theme, problems.length === 0, { p1: { range: p1.range, first: p1.rows[0].when, count: p1.count }, p2: { range: p2.range, first: p2.rows[0].when, count: p2.count }, prevDisabled1, nextDisabled2, prevDisabled2 }, problems.join("; "), [file]);
  });

  // ------------------------------------------- 6 · the error state IN ISOLATION
  // Only getPublishLogAction is aborted, so the shell's own status action still
  // resolves and the header must NOT read "Publish state unavailable".
  await step("6 error-isolated", theme, async () => {
    const logActionId = await findLogActionId();
    if (!logActionId) throw new Error("could not identify the publish-log action id");
    const route = async r => {
      const req = r.request();
      if (req.method() === "POST" && req.headers()["next-action"] === logActionId) return safeAbort(r);
      return safeContinue(r);
    };
    rigAborting = true;
    await page.route("**/*", route);
    await open(TAB, theme, 1920, 1080);
    await page.locator('.sp-log [role="alert"]').waitFor({ timeout: 20000 });
    const errored = await readTable();
    const indicator = (await page.locator("#shell-header .sp-mode").textContent()) ?? "";
    const retry = page.locator('.sp-log [role="alert"] .cds-btn--ghost');
    const retryHit = await hitAt(retry);
    const file = await shot(`06-error-isolated-${theme}`);

    await page.unroute("**/*", route);
    rigAborting = false;
    await retry.click();
    await settled();
    const recovered = await readTable();

    const problems = [];
    if (!/couldn.t load/.test(errored.alertText ?? "")) problems.push(`alert "${errored.alertText}"`);
    if (errored.rows.length !== 0) problems.push("the table is still rendered beside the error");
    if (/unavailable/i.test(indicator)) problems.push(`the shell status broke too: "${indicator}"`);
    if (!/button\.cds-btn/.test(retryHit ?? "")) problems.push(`Retry hit → ${retryHit}`);
    if (recovered.rows.length !== 25) problems.push(`Retry recovered ${recovered.rows.length} rows, expected 25`);
    if (recovered.alertText) problems.push("the error survived Retry");
    rec("6 error-isolated", theme, problems.length === 0, { logActionId: logActionId.slice(0, 12) + "…", alert: errored.alertText, indicator, retryHit, recoveredRows: recovered.rows.length, recoveredRange: recovered.range }, problems.join("; "), [file]);
  });

  // ------------------------------------------------------ 7 · empty and loading
  await step("7a empty", theme, async () => {
    emptyLog();
    await openTab(theme, 1920, 1080);
    const t = await readTable();
    const file = await shot(`07a-empty-${theme}`);
    loadFixture();

    const problems = [];
    if (t.emptyHeading !== "Nothing published yet") problems.push(`heading "${t.emptyHeading}"`);
    if (t.emptyButtons !== 0) problems.push(`${t.emptyButtons} buttons in the empty state`);
    if (t.count !== "No publishes yet") problems.push(`count "${t.count}"`);
    if (t.hasPagination) problems.push("pagination over an empty log");
    rec("7a empty", theme, problems.length === 0, { heading: t.emptyHeading, buttons: t.emptyButtons, count: t.count, hasPagination: t.hasPagination }, problems.join("; "), [file]);
  });

  await step("7b loading", theme, async () => {
    const logActionId = await findLogActionId();
    const route = async r => {
      const req = r.request();
      if (req.method() === "POST" && req.headers()["next-action"] === logActionId) {
        await new Promise(res => setTimeout(res, 6000));
      }
      return safeContinue(r);
    };
    await open("/admin/management", theme, 1920, 1080);   // theme set with no route in place
    await page.route("**/*", route);
    await page.goto(`${base}${TAB}`, { waitUntil: "commit" });
    await page.locator(".sp-log .cds-skeleton-row").first().waitFor({ timeout: 20000 });
    const t = await readTable();
    const file = await shot(`07b-loading-${theme}`);
    await page.unroute("**/*", route);
    await page.goto(`${base}/admin/management`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(300);

    const problems = [];
    if (t.skeletonRows !== 4) problems.push(`${t.skeletonRows} skeleton rows`);
    if (t.ths.map(th => th.label).join("|") !== EXPECTED_LABELS.join("|")) problems.push(`headers ${t.ths.map(th => th.label).join(" · ")}`);
    if (t.count !== "Loading publish history…") problems.push(`count "${t.count}"`);
    rec("7b loading", theme, problems.length === 0, { skeletonRows: t.skeletonRows, headers: t.ths.map(th => th.label), count: t.count }, problems.join("; "), [file]);
  });

  // --------------------------------------- 8 · the History panel is UNTOUCHED
  await step("8 panel-untouched", theme, async () => {
    await open("/admin", theme, 1920, 1080);
    await page.getByRole("button", { name: "History" }).click();
    await page.locator(".sp-panel-body .sp-event").first().waitFor({ timeout: 20000 });
    const first = await page.evaluate(() => {
      const body = document.querySelector(".sp-panel-body");
      return {
        segments: [...body.querySelectorAll(".sp-switch button")].map(b => b.textContent?.trim()),
        status: body.querySelector(".sp-panel-status")?.textContent?.trim() ?? null,
        events: body.querySelectorAll(".sp-event").length,
        showMore: [...body.querySelectorAll(".cds-btn--ghost")].map(b => b.textContent?.trim()),
        caption: body.querySelector(".sp-panel-caption")?.textContent?.trim() ?? null,
        eventLines: [...body.querySelectorAll(".sp-event")][0]?.children.length ?? 0
      };
    });
    const beforeFile = await shot(`08-panel-10-${theme}`);
    await page.getByRole("button", { name: "Show more" }).click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const body = document.querySelector(".sp-panel-body");
      return {
        events: body.querySelectorAll(".sp-event").length,
        caption: body.querySelector(".sp-panel-caption")?.textContent?.trim() ?? null,
        showMore: [...body.querySelectorAll(".cds-btn--ghost")].map(b => b.textContent?.trim())
      };
    });
    const afterFile = await shot(`08-panel-25-${theme}`);

    const problems = [];
    if (first.segments.join("|") !== "Published|Draft") problems.push(`switch ${first.segments.join(" ")}`);
    if (!first.status) problems.push("no status line");
    if (first.events !== 10) problems.push(`${first.events} events before Show more, expected 10`);
    if (first.eventLines !== 3) problems.push(`${first.eventLines} lines per event, expected 3`);
    if (!first.showMore.includes("Show more")) problems.push("no Show more");
    if (after.events !== 25) problems.push(`${after.events} events after Show more, expected the 25 cap`);
    if (after.caption !== "Showing the 25 most recent publishes.") problems.push(`caption "${after.caption}"`);
    if (after.showMore.includes("Show more")) problems.push("Show more survived the cap");
    rec("8 panel-untouched", theme, problems.length === 0, { first, after }, problems.join("; "), [beforeFile, afterFile]);
  });

  // -------------------------------------------- 9 · deep link and the nav veto
  await step("9 deeplink-veto", theme, async () => {
    await openTab(theme, 1920, 1080);
    const landed = await page.getByRole("tab", { name: "Publish history" }).getAttribute("aria-selected");
    const directoryRows = await page.locator("[data-directory-row]").count();

    // From /admin with a dirty inspector, a rail/nav click to Management still
    // goes through the unsaved-edits guard (the guarded set matches by pathname,
    // so ?tab=publishHistory is inside it).
    await open("/admin", theme, 1920, 1080);
    const seat = page.locator("button[data-seat-id]").first();
    await seat.waitFor({ timeout: 20000 });
    await seat.dispatchEvent("click");
    await page.locator("#seat-inspector-panel").waitFor({ timeout: 20000 });
    const notes = page.locator("#seat-inspector-panel textarea").first();
    await notes.fill("smoke — dirty inspector");
    await page.waitForTimeout(300);
    await page.locator('#shell-header a[href="/admin/management"]').click();
    await page.waitForTimeout(600);
    const guarded = await page.evaluate(() => {
      const d = document.querySelector('[role="alertdialog"], [role="dialog"]');
      return { open: !!d, text: (d?.textContent ?? "").slice(0, 120), path: location.pathname };
    });
    const file = await shot(`09-veto-${theme}`);
    const keep = page.getByRole("button", { name: "Keep editing" });
    if (await keep.count()) await keep.click();
    await page.waitForTimeout(300);

    const problems = [];
    if (landed !== "true") problems.push("?tab=publishHistory did not select the record tab");
    if (directoryRows !== 0) problems.push("the legacy Employees redirect still fires");
    if (!guarded.open) problems.push("the dirty inspector did not veto the nav click");
    if (guarded.path !== "/admin") problems.push(`navigation happened anyway → ${guarded.path}`);
    rec("9 deeplink-veto", theme, problems.length === 0, { landed, directoryRows, guarded }, problems.join("; "), [file]);
  });

  // ------------------------------------------------------------------ 10 · sweep
  await step("10 sweep", theme, async () => {
    await open("/admin/management", theme, 1920, 1080);
    await page.locator("[data-directory-row]").first().waitFor();
    const primary = page.locator(".sp-page .cds-page-header .cds-btn--primary");
    const primaryBg = await css(primary, "backgroundColor");
    await primary.hover();
    await page.waitForTimeout(250);
    const primaryHoverBg = await css(primary, "backgroundColor");
    await page.getByRole("tab", { name: "Publish history" }).click();
    await settled();
    // The bar and the ring are transitioned (fast-02); read them after they
    // land, or the sample is a mid-transition rgba() and a UA-default outline.
    await page.waitForTimeout(900);
    const brand = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const tab = [...document.querySelectorAll('[role="tab"]')].find(t => t.getAttribute("aria-selected") === "true");
      const navCurrent = document.querySelector("#shell-header [aria-current]");
      return {
        selectedTabBar: getComputedStyle(tab).boxShadow,
        navCurrentBar: navCurrent ? getComputedStyle(navCurrent).boxShadow : null,
        focusToken: root.getPropertyValue("--sp-focus").trim(),
        linkToken: root.getPropertyValue("--cds-link-primary").trim()
      };
    });
    // Reach the sort button the way a keyboard user does. Chrome's
    // :focus-visible heuristic deliberately withholds the ring from a
    // PROGRAMMATIC focus that follows a mouse click, so `.focus()` here would
    // measure the UA default and say nothing about the brand ring.
    await page.evaluate(() => document.getElementById("admin-subpage-main")?.focus());
    let focusRing = null;
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      const found = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || !el.classList.contains("cds-sort")) return null;
        const s = getComputedStyle(el);
        return { label: (el.textContent ?? "").trim(), color: s.outlineColor, width: s.outlineWidth, focusVisible: el.matches(":focus-visible") };
      });
      if (found) { focusRing = found; break; }
    }
    if (!focusRing) throw new Error("Tab never reached a sortable column header");
    const focusOutline = focusRing.color;
    const file = await shot(`10-sweep-${theme}`);

    const sheetIdentical = readFileSync(path.join(repoRoot, "app/styles/sp-components.css"), "utf8") ===
      readFileSync(path.join(repoRoot, "docs/redesign-v2/phase3/components/sp-components.css"), "utf8");
    const newSource = readFileSync(path.join(repoRoot, "components/admin-management/PublishLogTable.tsx"), "utf8");
    const rigInduced = consoleErrors.filter(e => e.rigInduced).length;
    const unknownConsole = consoleErrors.filter(e => !e.rigInduced && !KNOWN_CONSOLE.test(e.text)).map(e => e.text);

    const TERRACOTTA = "rgb(184, 92, 46)";
    const problems = [];
    if (!sheetIdentical) problems.push("sp-components.css differs from the docs copy");
    if (/#[0-9a-fA-F]{3,8}\b/.test(newSource)) problems.push("a hex literal reached the new component");
    if (/--cds-/.test(newSource)) problems.push("a --cds-* reference reached the new component");
    if (primaryBg !== TERRACOTTA) problems.push(`primary background ${primaryBg}`);
    if (primaryHoverBg !== "rgb(143, 69, 33)") problems.push(`primary hover ${primaryHoverBg}`);
    if (!brand.selectedTabBar.includes(TERRACOTTA)) problems.push(`selected tab bar ${brand.selectedTabBar}`);
    if (focusRing.width !== "2px") problems.push(`focus ring width ${focusRing.width}`);
    if (!focusRing.focusVisible) problems.push("the sort button did not match :focus-visible");
    if (brand.navCurrentBar && !brand.navCurrentBar.includes(TERRACOTTA)) problems.push(`nav current bar ${brand.navCurrentBar}`);
    if (focusOutline !== TERRACOTTA) problems.push(`focus ring ${focusOutline}`);
    const expectedLink = theme === "dark" ? "#E8A07A" : "#8F4521";
    if (brand.linkToken.toUpperCase() !== expectedLink) problems.push(`--cds-link-primary ${brand.linkToken} ≠ ${expectedLink}`);
    if (unknownConsole.length) problems.push(`${unknownConsole.length} unexpected console errors`);
    rec("10 sweep", theme, problems.length === 0, { sheetIdentical, primaryBg, primaryHoverBg, ...brand, focusRing, consoleTotal: consoleErrors.length, rigInduced, unknownConsole: unknownConsole.slice(0, 4) }, problems.join("; "), [file]);
  });
}

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  FAIL ${f.step} (${f.theme}) — ${f.note}`);
if (failed.length) process.exitCode = 1;
