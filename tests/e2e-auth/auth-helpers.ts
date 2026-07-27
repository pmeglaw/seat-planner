import { expect, type Page } from "@playwright/test";

// Credentials seeded by supabase/seed.sql into the disposable local stack.
// Local-only: this database is a Docker container that `supabase stop`
// destroys, and these values are never valid against the hosted project.
export const SEEDED_PASSWORD = "e2e-local-password";
export const SEEDED_ADMIN_EMAIL = "e2e-admin@example.test";
export const SEEDED_VIEWER_EMAIL = "e2e-viewer@example.test";

/**
 * Sign in through the real login form.
 *
 * Two traps this works around, both documented in the run-seat-planner skill:
 *
 * 1. The form is NOT a <form>. Submit is a plain onClick button, so there is no
 *    button[type=submit] and Enter does not submit.
 * 2. Filling races hydration. The Sign in button stays disabled until React
 *    state holds both fields; a fill that lands before onChange attaches sets
 *    the DOM value without React ever seeing it, and the button never enables.
 *    So: fill, then wait for enabled, and only then click.
 *
 * The heading is also "Sign in", hence :text-is on the button.
 */
export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  const submit = page.locator('button:text-is("Sign in")');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(SEEDED_PASSWORD);
  await expect(submit).toBeEnabled();
  await submit.click();

  // Landing anywhere other than /login means GoTrue accepted the grant and the
  // session cookie survived the server round-trip.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}
