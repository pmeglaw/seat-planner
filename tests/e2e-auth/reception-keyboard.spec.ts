import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { formatAxeViolations, waitForOneShotAnimations, WCAG_A_AA_TAGS } from "../e2e/axe-helpers";
import { SEEDED_VIEWER_EMAIL, signIn } from "./auth-helpers";

// Reception's keyboard loop against the real shell (Phase 4 PR 5; PHASE2UX
// §1R.7; PHASE3DS §5 item 18 as re-worded by owner ruling Q-1; DECISIONS D3-c):
// the skip link lands on the field; typing puts the cursor (`[data-highlight]`)
// on the first result and the readout previews it with the ↵ hint; ↵ locks
// (`aria-selected="true"`), writes `?q=<name>` and flips the hint to Esc; Esc
// clears a typed query first (the lock stays) and unlocks on an empty field
// (the URL goes bare); the zero state keeps the last locked person; a pointer
// never steals focus from the field; Ctrl / ⌘ K refocuses it from anywhere;
// `/reception?q=201` lands locked; the narrow frame is one column with "Back
// to the list". Seed facts (supabase/seed.sql + 002_seed_initial_data.sql):
// Alex Shabazian · Intake · extension 201; Victor Chen · Intake · no
// extension — so Victor's same-department fallback row is Alex.
//
// Read-only: the viewer session, nothing mutated. Assertions are on names and
// extensions, never on seats — the publish-flow spec may move a seat earlier
// in the tier.

const field = (page: Page) => page.getByRole("combobox", { name: "Search the directory" });
const readout = (page: Page) => page.getByRole("region", { name: "Caller detail" });
const lockedRows = (page: Page) => page.locator('li[role="option"][aria-selected="true"]');
const cursorRows = (page: Page) => page.locator("li[role='option'][data-highlight]");

async function activeElementId(page: Page) {
  return page.evaluate(() => document.activeElement?.id ?? "");
}

// Autofocus parks focus in the field, and blur() leaves Chrome's sequential-focus
// starting point ON the field — Tab would then reach the next control, not the
// header's skip link. Focusing <body> moves the starting point to the document
// start, so the next Tab is the first focusable: the skip link.
async function resetFocusStart(page: Page) {
  await page.evaluate(() => {
    const body = document.body;
    body.tabIndex = -1;
    body.focus();
    body.removeAttribute("tabindex");
  });
}

async function expectNoViolations(page: Page) {
  await waitForOneShotAnimations(page);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(formatAxeViolations(violations)).toEqual([]);
}

test.describe("Reception keyboard loop (viewer)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_VIEWER_EMAIL);
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test("the whole loop at 1920: skip link, cursor, lock + ?q=, the Esc rungs, zero state, clear ×, Ctrl K, pointer focus", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/reception");
    await expect(page.getByRole("heading", { name: "Reception", level: 1 })).toBeVisible();
    await expect(field(page)).toBeFocused();
    await expect(page.locator(".sp-recep-count")).toHaveText(/\d+ people/);
    await expect(readout(page)).toContainText("Waiting for a call.");

    // At rest: axe, then the skip link (the header's first focusable) lands
    // on the field itself (PHASE2UX §1R.7) — blur first, since autofocus
    // already parked focus there.
    await expectNoViolations(page);
    await resetFocusStart(page);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => activeElementId(page)).toBe("reception-main");

    // Typing: one cursor, the readout previews it with the ↵ hint, no lock yet.
    await field(page).fill("201");
    await expect(page.locator(".sp-recep-count")).toHaveText("1 match");
    await expect(cursorRows(page)).toHaveCount(1);
    await expect(cursorRows(page)).toContainText("Alex Shabazian");
    await expect(field(page)).toHaveAttribute("aria-activedescendant", await cursorRows(page).getAttribute("id") ?? "");
    await expect(readout(page).locator(".sp-readout-numeral")).toHaveText("201");
    await expect(readout(page).locator(".sp-readout-hint")).toContainText("to lock");
    await expect(lockedRows(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Show on map" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible();

    // ↵ locks: aria-selected on that row only, the query cleared, ?q=<name>, the Esc hint, Show on map.
    await page.keyboard.press("Enter");
    await expect(lockedRows(page)).toHaveCount(1);
    await expect(lockedRows(page)).toContainText("Alex Shabazian");
    await expect(cursorRows(page)).toHaveCount(0);
    await expect(field(page)).toHaveValue("");
    await expect(field(page)).toBeFocused();
    await expect(page).toHaveURL(/\/reception\?q=Alex\+Shabazian$/);
    await expect(readout(page).getByRole("heading", { level: 2 })).toHaveText("Alex Shabazian");
    await expect(readout(page).locator(".sp-readout-hint")).toContainText("to unlock");
    await expect(page.getByRole("link", { name: "Show on map" })).toHaveAttribute("href", "/?q=Alex+Shabazian");
    // The row bar and the focus ring are the brand terracotta through Carbon's
    // interactive-border role — read as painted.
    const bar = await lockedRows(page).evaluate(el => getComputedStyle(el).boxShadow);
    expect(bar, "the locked row's 3px bar is #B85C2E").toContain("rgb(184, 92, 46)");
    await expectNoViolations(page);

    // Zero state while locked: the count says 0, the empty state offers Clear
    // search, the readout keeps the person (the call may still be live).
    await field(page).fill("zzzz");
    await expect(page.locator(".sp-recep-count")).toHaveText("0 matches");
    await expect(page.locator(".sp-recep-list .cds-empty h3")).toHaveText("No matches for ‘zzzz’");
    await expect(readout(page).getByRole("heading", { level: 2 })).toHaveText("Alex Shabazian");
    await page.locator(".sp-recep-list .cds-empty").getByRole("button", { name: "Clear search" }).click();
    await expect(field(page)).toHaveValue("");
    await expect(field(page)).toBeFocused();
    await expect(lockedRows(page)).toHaveCount(1);
    await expect(page).toHaveURL(/\?q=Alex\+Shabazian$/);

    // Esc, first rung: a typed query clears, the lock stays.
    await field(page).fill("Mar");
    await expect(readout(page).getByRole("heading", { level: 2 })).toHaveText("Maria Lopez");
    await page.keyboard.press("Escape");
    await expect(field(page)).toHaveValue("");
    await expect(readout(page).getByRole("heading", { level: 2 })).toHaveText("Alex Shabazian");
    await expect(lockedRows(page)).toHaveCount(1);
    await expect(page).toHaveURL(/\?q=Alex\+Shabazian$/);

    // Esc, second rung: an empty field unlocks and the URL goes bare.
    await page.keyboard.press("Escape");
    await expect(lockedRows(page)).toHaveCount(0);
    await expect(readout(page)).toContainText("Waiting for a call.");
    await expect(page).toHaveURL(/\/reception$/);

    // A pointer never steals focus: mousedown on a row leaves the field focused; the click locks.
    const row = page.locator('li[role="option"]', { hasText: "Maria Lopez" });
    const box = (await row.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => activeElementId(page)).toBe("reception-main");
    await page.mouse.up();
    await expect(lockedRows(page)).toContainText("Maria Lopez");
    await expect(field(page)).toBeFocused();

    // Ctrl / ⌘ K from a focused row-button refocuses the field. Victor Chen
    // (Intake, no extension) reads "No extension on file" and offers Alex.
    await field(page).fill("Victor");
    await page.keyboard.press("Enter");
    await expect(readout(page).locator(".sp-readout-none")).toHaveText("No extension on file");
    const fallbackRow = readout(page).locator(".sp-recep-fallback").getByRole("button", { name: /Alex Shabazian/ });
    await expect(fallbackRow).toBeVisible();
    await fallbackRow.focus();
    await expect(fallbackRow).toBeFocused();
    await page.keyboard.press("Control+k");
    await expect(field(page)).toBeFocused();
    // Recent lookups: the earlier locks, the current person excluded, its own landmark.
    const recents = page.getByRole("complementary", { name: "Recent lookups" });
    await expect(recents).toBeVisible();
    await expect(recents.getByRole("button").first()).toContainText("Maria Lopez");
    await expect(recents).not.toContainText("Victor Chen");
  });

  test("/reception?q=201 lands locked on the unique match and rewrites ?q= to the name", async ({ page }) => {
    await page.goto("/reception?q=201");
    await expect(lockedRows(page)).toHaveCount(1);
    await expect(lockedRows(page)).toContainText("Alex Shabazian");
    await expect(readout(page).locator(".sp-readout-numeral")).toHaveText("201");
    await expect(field(page)).toHaveValue("");
    await expect(page).toHaveURL(/\/reception\?q=Alex\+Shabazian$/);
  });

  test("/reception?q=<several> keeps the query with the cursor on the first row", async ({ page }) => {
    await page.goto("/reception?q=Litigation");
    await expect(field(page)).toHaveValue("Litigation");
    await expect(cursorRows(page)).toHaveCount(1);
    await expect(lockedRows(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\?q=Litigation$/);
  });

  // Phase 5 PR 2 (owner ruling R1, sheet amendment I, DECISIONS D3-f) re-points
  // this from amendment E's stacked readout. The one column stands; the single
  // readout block and the back path do not. What the keyboard tier owns here is
  // the loop: the answer is pinned above the list, the field never loses focus,
  // and the ↑ cursor is never left underneath the pinned band.
  test("1024: one column, the band pinned above the list, the field never lost", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/reception?q=201");
    await expect(lockedRows(page)).toHaveCount(1);
    // The streamed page lands in React's hidden pre-swap container while the
    // loading skeleton's own `.sp-recep` is still on screen — measure the live
    // grid inside <main> once it is visible, never the skeleton's.
    await expect(page.locator("main .sp-recep")).toBeVisible();
    const grid = await page.locator("main .sp-recep").evaluate(el => ({ columns: getComputedStyle(el).gridTemplateColumns.trim(), innerWidth: window.innerWidth }));
    expect(grid.columns.split(/\s+/).length, `one grid column under the 1055 fold (sheet amendment I) — got "${grid.columns}" at innerWidth ${grid.innerWidth}`).toBe(1);

    // The labelled landmark has to survive `display: contents` on the section
    // (reviewer condition O-1(c)); it has no box there, so the band is what is
    // measured.
    await expect(readout(page)).toBeAttached();
    const band = page.locator("main .sp-recep-band");
    const searchBox = (await page.locator("main .sp-search-lg").boundingBox())!;
    const bandBox = (await band.boundingBox())!;
    const firstRowBox = (await page.locator('li[role="option"]').first().boundingBox())!;
    expect(bandBox.y, "the band sits under the search").toBeGreaterThanOrEqual(searchBox.y + searchBox.height - 1);
    expect(bandBox.y + bandBox.height, "the band sits above the list").toBeLessThanOrEqual(firstRowBox.y + 1);
    expect(await band.evaluate(el => getComputedStyle(el).position)).toBe("sticky");
    // D3-f: the back path retires with the drill-down it belonged to, which is
    // what leaves the band with nothing focusable (WCAG 2.4.3, ruling O-1).
    await expect(page.getByRole("button", { name: "Back to the list" })).toHaveCount(0);
    expect(await band.evaluate(el => el.querySelectorAll("a, button, input, select, textarea, [tabindex]").length)).toBe(0);

    // The loop (reviewer ruling O-4): the field keeps focus through a lock, so
    // the next lookup is typed without scrolling back up — and the band, with
    // the list scrolled to its end, is still fully on screen.
    await field(page).focus();
    await page.keyboard.type("Litigation");
    await expect(cursorRows(page)).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(field(page)).toBeFocused();
    await page.evaluate(() => {
      const pane = document.querySelector('[aria-label="Reception directory"]');
      if (pane && pane.scrollHeight > pane.clientHeight) pane.scrollTop = pane.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
    });
    // Which colleague "Litigation" locks is a property of the seed, so hit-test
    // the extension SLOT: §1R.4 item 4 makes "No extension on file" a stated
    // state, and either way it is the thing that must not end up under the band
    // or off the bottom of the viewport.
    await expect(page.locator(".sp-recep-band .sp-readout-numeral, .sp-recep-band .sp-readout-none")).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const slot = document.querySelector(".sp-recep-band .sp-readout-numeral, .sp-recep-band .sp-readout-none");
          if (!slot) return false;
          const r = slot.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight) return false;
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return Boolean(hit && (hit === slot || slot.contains(hit)));
        })
      , "the extension is painted on screen with the list scrolled to its end")
      .toBe(true);
  });
});
