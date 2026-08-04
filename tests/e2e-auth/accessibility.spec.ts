import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { formatAxeViolations, WCAG_A_AA_TAGS } from "../e2e/axe-helpers";
import { SEEDED_ADMIN_EMAIL, signIn } from "./auth-helpers";

// Runtime accessibility assertions for the ADMIN surfaces.
//
// Why here and not in tests/e2e: that tier is deliberately backend-free, so
// /admin* only ever redirects to /login and the admin surfaces were invisible
// to every automated check. They were audited by hand during the v12 a11y pass
// (slice 9) — which is exactly how a serious colour-contrast violation reached
// main in the first place, and how it would have stayed there if nobody had
// thought to run axe manually that week. This tier already has a real session
// against a disposable local stack, so the scan belongs here.
//
// Read-only on purpose. The tier runs workers: 1 against one shared database
// alongside publish-flow.spec.ts, so these specs open dialogs but never confirm
// anything — no seat is edited, nothing is published, nothing is reset.

test.describe("admin surfaces have no WCAG A/AA violations", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_ADMIN_EMAIL);
  });

  test("Management", async ({ page }) => {
    await page.goto("/admin/management");
    await expect(page.getByRole("heading", { name: "Management", level: 1 })).toBeVisible();
    // The directory is windowed and measures itself from the live table, so
    // scanning before rows paint would scan an empty tbody.
    await expect(page.locator("[data-directory-row]").first()).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
    expect(formatAxeViolations(violations)).toEqual([]);
  });

  // Dialogs are where modal semantics actually fail: a labelledby pointing at
  // an id that no longer renders, a trap with nothing focusable, contrast on a
  // surface no static scan reaches. Opening is client-only — this saves nothing.
  test("Management with the employee form open", async ({ page }) => {
    await page.goto("/admin/management");
    await page.getByRole("button", { name: /Add employee/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add employee" })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
    expect(formatAxeViolations(violations)).toEqual([]);
  });

  test("Settings", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
    expect(formatAxeViolations(violations)).toEqual([]);
  });

  // NOT COVERED HERE, deliberately: Settings' three review dialogs.
  //
  // They are worth scanning — a review is the last thing an admin reads before
  // replacing the whole draft — but each is reached through a useTransition,
  // and a scan that lands while it is pending sees the shared Button primitive
  // in its DISABLED palette: --sp-color-text-muted on --sp-color-state-disabled
  // is 4.40:1, which axe reports as a serious color-contrast violation. WCAG
  // 1.4.3 exempts inactive controls, so that is a false positive — but it made
  // the test pass or fail on scan timing (observed 1 pass in 3 runs).
  //
  // Two other traps found while trying: openResetReview() early-returns with a
  // notice when the draft already matches published, so driving it depends on
  // whether publish-flow.spec.ts ran first; and a setInputFiles that lands
  // before React attaches onChange is silently lost, the same pre-hydration
  // race signIn works around.
  //
  // Covering them properly needs a settled-state signal to scan against, or an
  // axe rule exclusion for disabled controls. Left out rather than shipped
  // flaky — a test that fails two runs in three teaches people to ignore it.
});

// Liveness guard, mirroring the one in tests/e2e/accessibility.spec.ts. "No
// violations" is also what a scan that examined nothing reports (docs/RISKS.md
// R-04), and an admin route that silently redirected to /login would report
// exactly that while proving nothing about the admin surface.
test("the admin scan actually inspects an admin page", async ({ page }) => {
  await signIn(page, SEEDED_ADMIN_EMAIL);
  await page.goto("/admin/management");
  await expect(page.getByRole("heading", { name: "Management", level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(results.passes.length).toBeGreaterThan(0);
  // The one class of defect the source guardrails structurally cannot see.
  expect(results.passes.map(rule => rule.id)).toContain("color-contrast");
  // And prove we are on the admin surface, not a redirect to the login form.
  await expect(page).toHaveURL(/\/admin\/management/);
});
