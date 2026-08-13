import { expect, type Locator, type Page } from "@playwright/test";

// Credentials seeded by supabase/seed.sql into the disposable local stack.
// Local-only: this database is a Docker container that `supabase stop`
// destroys, and these values are never valid against the hosted project.
export const SEEDED_PASSWORD = "e2e-local-seed-r2-2026";
export const SEEDED_ADMIN_EMAIL = "e2e-admin@example.test";
export const SEEDED_VIEWER_EMAIL = "e2e-viewer@example.test";

/**
 * Sign in through the real login form.
 *
 * The form is PROGRESSIVE (canvas 2a/2b): step 1 takes the work email and
 * Continue, step 2 discloses the password and the "Log in" primary. There is no
 * password field on screen until Continue is pressed, so the sequence below is
 * fill → Continue → fill → Log in, not one combined fill.
 *
 * Two traps this works around, both documented in the run-seat-planner skill:
 *
 * 1. Filling races hydration. The step-1 primary server-renders disabled with a
 *    "Starting up…" label and only becomes a live "Continue" once React mounts
 *    (UX-01, #276), so a fill-then-click right after domcontentloaded finds a
 *    dead control. Fill, wait for enabled, and only then click.
 * 2. The step-2 heading is also "Log in", hence :text-is rather than :has-text
 *    on the button. :text-is binds to the SMALLEST element containing the text,
 *    so each button's label must stay a direct text child — wrapping it in a
 *    span for layout silently drops these locators to zero matches and every
 *    spec in this directory loses its sign-in step. tests/login-form.test.mjs
 *    pins that for both labels.
 */
/**
 * Retry an action until its expected effect renders.
 *
 * The first interaction on a freshly-loaded page races React hydration: every
 * admin control is in the server HTML, but a click (or dispatched event)
 * delivered before React attaches its listeners is silently dropped. The login
 * form ships a disabled "Starting up…" state for exactly this (UX-01, #276);
 * nothing else does, so first clicks go through this loop instead. The
 * effect-visible guard also makes retries idempotent for toggle-style targets:
 * once the effect is up, the action never fires again.
 */
export async function retryUntilVisible(action: () => Promise<void>, effect: Locator, timeout = 20_000) {
  await expect(async () => {
    if (await effect.isVisible()) return;
    await action();
    await expect(effect).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout });
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

  // Step 1 — identity. Wait for the live "Continue" label BEFORE filling:
  // pre-hydration the primary reads "Starting up…", so the label existing is
  // proof React has mounted, and a fill that lands earlier is discarded when
  // the controlled input snaps back to its empty state.
  const advance = page.locator('button:text-is("Continue")');
  await expect(advance).toBeEnabled();
  await page.locator('input[type="email"]').fill(email);
  await advance.click();

  // Step 2 — credential. The password field only mounts after Continue.
  const submit = page.locator('button:text-is("Log in")');
  await page.locator('input[type="password"]').fill(SEEDED_PASSWORD);
  await expect(submit).toBeEnabled();
  await submit.click();

  // Landing anywhere other than /login means GoTrue accepted the grant and the
  // session cookie survived the server round-trip.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}
