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
 * The form is SINGLE-SURFACE (owner decision 2026-08-15, retiring the #372
 * two-step disclosure): email, password, and the "Log in" primary all render
 * at once, so the sequence below is one combined fill → Log in.
 *
 * Two traps this works around, both documented in the run-seat-planner skill:
 *
 * 1. Filling races hydration. The primary server-renders disabled with a
 *    "Starting up…" label and only becomes a live "Log in" once React mounts
 *    (UX-01, #276), so a fill-then-click right after domcontentloaded finds a
 *    dead control. Wait for enabled, then fill and click.
 * 2. The form heading is also "Log in", hence :text-is rather than :has-text
 *    on the button. :text-is binds to the SMALLEST element containing the text,
 *    so the button's label must stay a direct text child — wrapping it in a
 *    span for layout silently drops this locator to zero matches and every
 *    spec in this directory loses its sign-in step. tests/login-form.test.mjs
 *    pins that.
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

  // Single-surface login (owner decision 2026-08-15 — the two-step disclosure
  // is retired): both fields are on screen at once. Wait for the live
  // "Log in" label BEFORE filling: pre-hydration the primary reads
  // "Starting up…", so the label existing is proof React has mounted, and a
  // fill that lands earlier is discarded when the controlled input snaps back
  // to its empty state. :text-is rather than :has-text because the form
  // heading is ALSO "Log in" — the engine binds to the smallest element.
  const submit = page.locator('button:text-is("Log in")');
  await expect(submit).toBeEnabled();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(SEEDED_PASSWORD);
  await submit.click();

  // Landing anywhere other than /login means GoTrue accepted the grant and the
  // session cookie survived the server round-trip.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}
