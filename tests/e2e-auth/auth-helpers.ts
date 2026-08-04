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
 * 1. Filling races hydration. The Sign in button server-renders disabled with a
 *    "Starting up…" label and only becomes a live "Sign in" once React mounts
 *    (UX-01, #276), so a fill-then-click right after domcontentloaded finds a
 *    dead control. Fill, wait for enabled, and only then click.
 * 2. The heading is also "Sign in", hence :text-is rather than :has-text on the
 *    button. :text-is binds to the SMALLEST element containing the text, so the
 *    button's label must stay a direct text child — wrapping it in a span for
 *    layout silently drops this locator to zero matches and every spec in this
 *    directory loses its sign-in step. tests/login-form.test.mjs pins that.
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
