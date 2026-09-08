// Phase 5 PR 1 capture + measure rig — Management → Publish history.
//
// Captures the record tab at the 1920 ruling frame and the 1024 narrow frame in
// both themes, plus every route state the tab can be in (loading, error, empty,
// the Changes sort, page 2), and MEASURES the amendment-H column widths as
// rendered so the 13 / 20 / 9 percentages are judged from pixels rather than on
// paper (reviewer ruling, 2026-09-08).
//
// Usage: node docs/redesign-v2/phase5/audit/pr1-publish-history.mjs <baseUrl> <outDir> <email> <password>
// Run against the LOCAL Docker stack only (npm run db:start; the seeded admin is
// e2e-admin@example.test). Local dev writes to production — never point this at
// seats.megeredchianlaw.com.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base = "http://localhost:3300", outDir = "out", email, password] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const TAB_URL = `${base}/admin/management?tab=publishHistory`;
const results = [];
const consoleErrors = new Set();

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function setTheme(page, theme) {
  await page.evaluate(t => {
    localStorage.setItem("sp-theme", t);
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.setAttribute("data-carbon-theme", t === "dark" ? "g100" : "white");
  }, theme);
  await page.waitForTimeout(150);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

async function settled(page) {
  await page.waitForSelector(".sp-log .cds-toolbar-count", { timeout: 20_000 });
  await page.waitForFunction(
    () => !/^Loading publish history/.test(document.querySelector(".sp-log .cds-toolbar-count")?.textContent ?? ""),
    null,
    { timeout: 20_000 }
  );
}

// The amendment-H measurement: the four columns as the browser lays them out,
// plus whether the sentence column actually truncates its longest row.
async function measureColumns(page, label) {
  const measured = await page.evaluate(() => {
    const table = document.querySelector(".sp-log .cds-table");
    if (!table) return null;
    const head = [...table.querySelectorAll("thead th")];
    const cols = head.map(th => ({
      label: th.textContent.trim(),
      className: th.className || "(sentence)",
      width: Math.round(th.getBoundingClientRect().width)
    }));
    const cells = [...table.querySelectorAll("tbody tr")].map(row => row.lastElementChild);
    const truncated = cells.filter(cell => cell.scrollWidth > cell.clientWidth + 1).length;
    const widest = Math.max(...cells.map(cell => cell.scrollWidth));
    return {
      tableWidth: Math.round(table.getBoundingClientRect().width),
      cols,
      sentenceCells: cells.length,
      truncated,
      widestSentenceContent: Math.round(widest)
    };
  });
  console.log(`\n[widths ${label}] table ${measured.tableWidth}px`);
  for (const col of measured.cols) console.log(`   ${col.label.padEnd(14)} ${String(col.width).padStart(5)}px  ${col.className}`);
  console.log(
    `   sentence: ${measured.truncated}/${measured.sentenceCells} rows truncated; widest content ${measured.widestSentenceContent}px\n`
  );
  return { label, ...measured };
}

// EMPTY=1 captures only the empty state: the caller empties the local log
// first and restores it after, so the rig never writes to any database itself.
const EMPTY_ONLY = process.env.EMPTY === "1";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.add(message.text());
  });
  page.on("pageerror", error => consoleErrors.add(String(error)));

  // Sign in the way tests/e2e-auth/auth-helpers.ts does: the inputs are
  // name-less by contract, and the live "Log in" label (not "Starting up…") is
  // the proof React has mounted, so a fill before it would be discarded.
  await page.goto(`${base}/login`);
  const submit = page.locator('button:text-is("Log in")');
  await submit.waitFor({ state: "visible", timeout: 30_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await submit.click();
  await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  record("sign-in", true, "seeded local admin");

  if (EMPTY_ONLY) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(TAB_URL);
      await setTheme(page, theme);
      await settled(page);
      await shot(page, `state-empty-1920-${theme}`);
      const count = await page.locator(".sp-log .cds-toolbar-count").textContent();
      record(`empty ${theme}: the count is published at zero`, count === "No publishes yet", count ?? "(none)");
      const heading = await page.getByRole("heading", { name: "Nothing published yet" }).count();
      record(`empty ${theme}: names the real state, not a failed search`, heading === 1, "");
      const pagination = await page.locator(".sp-log .cds-pagination").count();
      record(`empty ${theme}: no pagination over an empty log`, pagination === 0, "");
    }
    await browser.close();
    const emptyFailed = results.filter(result => !result.ok);
    writeFileSync(path.join(outDir, "results-empty.json"), JSON.stringify({ base, when: new Date().toISOString(), results }, null, 2));
    console.log(`${results.length - emptyFailed.length}/${results.length} checks passed (empty state)`);
    if (emptyFailed.length) process.exitCode = 1;
    return;
  }

  const widths = [];

  for (const [width, height] of [[1920, 1080], [1024, 768]]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height });
      await page.goto(TAB_URL);
      await setTheme(page, theme);
      await settled(page);

      const frame = `${width}-${theme}`;
      await shot(page, `tab-${frame}`);

      // The tab is selected straight off the legacy ?tab= link (the Phase 4
      // redirect is retired), the header action area is EMPTY (R1), and the
      // subtitle is the ruled one (R2).
      const selected = await page.getByRole("tab", { name: "Publish history" }).getAttribute("aria-selected");
      record(`${frame}: the legacy ?tab= link selects the record tab`, selected === "true", `aria-selected=${selected}`);

      const primaries = await page.locator(".sp-page .cds-page-header .cds-btn--primary").count();
      record(`${frame}: the header action area is empty`, primaries === 0, `${primaries} primaries`);

      const subtitle = await page.locator(".sp-page .cds-page-subtitle").textContent();
      record(
        `${frame}: the ruled subtitle`,
        subtitle === "People, departments, zones and publish history.",
        JSON.stringify(subtitle)
      );

      const tabs = await page.getByRole("navigation", { name: "Management sections" }).getByRole("tab").count();
      record(`${frame}: four tabs in the strip`, tabs === 4, `${tabs} tabs`);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      record(
        `${frame}: the document never scrolls sideways`,
        overflow.scrollWidth <= overflow.clientWidth,
        `${overflow.scrollWidth} ≤ ${overflow.clientWidth}`
      );

      widths.push(await measureColumns(page, frame));
    }
  }

  // --- The states, at 1920 light -------------------------------------------
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(TAB_URL);
  await setTheme(page, "light");
  await settled(page);

  // Default order: newest first.
  const whenSort = await page.locator(".sp-log th.sp-col-when").getAttribute("aria-sort");
  record("default sort is newest first", whenSort === "descending", `aria-sort=${whenSort}`);

  const range = await page.locator(".sp-log .cds-range").textContent();
  record("pagination replaces the 25 cap", range === "1–25 of 30", range ?? "(none)");

  // The Changes sort must surface the big publish that lives on the LAST page.
  const lastPageTopBefore = await page.locator(".sp-log tbody tr .sp-col-count").first().textContent();
  await page.getByRole("button", { name: "Changes", exact: true }).click();
  await page.waitForTimeout(200);
  const topAfter = await page.locator(".sp-log tbody tr .sp-col-count").first().textContent();
  await shot(page, "state-sorted-by-changes-1920-light");
  record(
    "Changes ranks the whole log, not the page",
    Number(topAfter) === 41,
    `top row ${lastPageTopBefore} → ${topAfter} (the 41-change publish is 12 days back, on page 1 only after sorting)`
  );

  // Page 2.
  await page.goto(TAB_URL);
  await settled(page);
  await page.getByRole("button", { name: "Next page" }).click();
  await page.waitForTimeout(200);
  const range2 = await page.locator(".sp-log .cds-range").textContent();
  await shot(page, "state-page-2-1920-light");
  record("page 2 of the log", range2 === "26–30 of 30", range2 ?? "(none)");

  // The summary-less publish is the OLDEST, so its dash is on page 2 — which is
  // also where the "Initial publish · N seats" sentence carries seat_count.
  const dashRows = await page.locator(".sp-log tbody tr .sp-col-count").filter({ hasText: /^—$/ }).count();
  record("an unreadable summary reads a dash, not 0 (page 2, the oldest publish)", dashRows === 1, `${dashRows} dash row(s)`);
  const initialSentence = await page.locator(".sp-log tbody tr").filter({ hasText: "Initial publish" }).textContent();
  record(
    "seat_count appears ONLY inside the sentence that names it",
    /Initial publish · 60 seats/.test(initialSentence ?? ""),
    initialSentence?.trim()
  );

  await page.goto(TAB_URL);
  await settled(page);
  const anAdminRows = await page.locator(".sp-log tbody tr .sp-col-who").filter({ hasText: "an admin" }).count();
  record("an unresolved publisher reads 'an admin'", anAdminRows > 0, `${anAdminRows} rows on page 1`);
  const hasSeatsColumn = (await page.locator(".sp-log thead").textContent())?.includes("Seats");
  record("there is no Seats column", hasSeatsColumn === false, "seat_count lives only in the sentence");

  // Loading: block the action's POST so the skeleton holds.
  const slow = await context.newPage();
  await slow.route("**/admin/management**", async route => {
    if (route.request().method() === "POST") {
      await new Promise(resolve => setTimeout(resolve, 6000));
    }
    await route.continue();
  });
  await slow.setViewportSize({ width: 1920, height: 1080 });
  await slow.goto(TAB_URL);
  await slow.waitForSelector(".sp-log .cds-skeleton-row", { timeout: 20_000 });
  await slow.screenshot({ path: path.join(outDir, "state-loading-1920-light.png") });
  const headers = await slow.locator(".sp-log thead th").allTextContents();
  record(
    "loading: skeleton rows under REAL headers",
    headers.map(h => h.trim()).join("|") === "Published|Published by|Changes|What changed",
    headers.join(" · ")
  );
  await slow.close();

  // Error: fail the action outright.
  const broken = await context.newPage();
  await broken.route("**/admin/management**", async route => {
    if (route.request().method() === "POST") return route.abort();
    await route.continue();
  });
  await broken.setViewportSize({ width: 1920, height: 1080 });
  await broken.goto(TAB_URL);
  await broken.waitForSelector('.sp-log [role="alert"]', { timeout: 20_000 });
  await broken.screenshot({ path: path.join(outDir, "state-error-1920-light.png") });
  const alertText = await broken.locator('.sp-log [role="alert"]').textContent();
  record("error: inline, with Retry, tab strip alive", /Publish history couldn.t load/.test(alertText ?? ""), alertText?.trim());
  record("error: no dialog blocks the page", (await broken.getByRole("dialog").count()) === 0, "");
  await broken.close();

  await browser.close();

  const failed = results.filter(result => !result.ok);
  writeFileSync(
    path.join(outDir, "results.json"),
    JSON.stringify({ base, when: new Date().toISOString(), results, widths, consoleErrors: [...consoleErrors] }, null, 2)
  );
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`console errors: ${consoleErrors.size}`);
  for (const error of consoleErrors) console.log(`   ${error}`);
  if (failed.length) process.exitCode = 1;
})();
