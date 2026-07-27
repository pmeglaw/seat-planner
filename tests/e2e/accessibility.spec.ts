import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { formatAxeViolations, WCAG_A_AA_TAGS } from "./axe-helpers";

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
// which mounts the real SeatMap. Authenticated a11y coverage stays manual until
// the smoke tier gets a seeded project.

test("the sign-in page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(formatAxeViolations(violations)).toEqual([]);
});

// Liveness guard. "No violations" is also what a scan that examined nothing
// reports, which would be exactly the false confidence docs/RISKS.md R-04
// called out. A real scan of a real page passes many rules, so assert it did.
test("the axe scan actually inspects the page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

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

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(formatAxeViolations(violations)).toEqual([]);
});
