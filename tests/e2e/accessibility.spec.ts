import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { formatAxeViolations, waitForOneShotAnimations, WCAG_A_AA_TAGS } from "./axe-helpers";

// Runtime accessibility assertions against the real built app.
//
// Why this exists: the *-source.test.mjs guardrails pin keyboard, focus and
// dialog SEMANTICS by reading source text. That catches a removed `aria-modal`
// but is blind to everything computed — contrast ratios, focus order, an
// aria-labelledby pointing at an id that no longer renders, a control that
// became unreachable. Only a real browser with real CSS can see those.
//
// Scope note: this tier is deliberately backend-free (playwright.config.ts
// boots the app with dummy Supabase env), so /login is the only fully rendered
// surface reachable without a session — `/` and `/admin` redirect to it. The
// map surfaces are scanned structurally in tests/browser/accessibility.spec.ts,
// which mounts the real SeatMap. The ADMIN surfaces are scanned with a real
// session in tests/e2e-auth/accessibility.spec.ts, which has the disposable
// local stack this tier deliberately does without.

test("the sign-in page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  // The 1e entrance fades the whole form column; scan only after it lands.
  await waitForOneShotAnimations(page);

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(formatAxeViolations(violations)).toEqual([]);
});

// Liveness guard. "No violations" is also what a scan that examined nothing
// reports, which would be exactly the false confidence docs/RISKS.md R-04
// called out. A real scan of a real page passes many rules, so assert it did.
test("the axe scan actually inspects the page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await waitForOneShotAnimations(page);

  const results = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(results.passes.length).toBeGreaterThan(0);
  // color-contrast must be among them, or the tier is not covering the one
  // thing the source guardrails structurally cannot see.
  expect(results.passes.map(rule => rule.id)).toContain("color-contrast");
});

// The error alert is a separate rendered state with its own colours, and it is
// the state a user is most likely to be stuck on. app/globals.css records
// measured contrast ratios for these tokens; this is what keeps them honest.
test("the sign-in error state has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/login?error=Invalid%20login%20credentials");
  await expect(page.locator("main [role=alert]")).toBeVisible();
  await waitForOneShotAnimations(page);

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(formatAxeViolations(violations)).toEqual([]);
});

// Progressive auth put half the login behind a button press. Step 2 is its own
// rendered surface — the email summary row, the "or" divider, the secondary
// link button, Forgot password — and scanning only step 1 left all of it
// unmeasured, which is precisely the blindness this tier exists to remove.
test("the log-in password step has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/login");

  // Enabled before filling: the primary ships disabled as "Starting up…", and a
  // fill landing pre-hydration is discarded by the controlled input.
  const advance = page.getByRole("button", { name: "Continue", exact: true });
  await expect(advance).toBeEnabled();
  await page.locator('input[type="email"]').fill("person@example.test");
  await advance.click();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await waitForOneShotAnimations(page);

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(formatAxeViolations(violations)).toEqual([]);
});

// The inline field error is a third colour state — a red rule, a red icon and
// red 12px copy on the field fill — and it is the one a user is most likely to
// be looking at while stuck.
test("the inline field error has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/login");

  const advance = page.getByRole("button", { name: "Continue", exact: true });
  await expect(advance).toBeEnabled();
  await advance.click();
  await expect(page.getByText("Email is required")).toBeVisible();
  await waitForOneShotAnimations(page);

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(formatAxeViolations(violations)).toEqual([]);
});
