import { test, expect } from "@playwright/test";

// These run against the built app with only dummy Supabase env (see
// playwright.config.ts). With no session, both protected routes must redirect
// to /login, and /login must render the sign-in form. This catches build
// breakage, boot-time crashes, and broken auth-redirect wiring (the page
// guards redirect; the root `proxy.ts` only refreshes the session cookie).

test.describe("smoke: routes boot and auth guards redirect", () => {
  // Progressive auth (canvas 2a/2b): step 1 is identity only. The password
  // field must NOT be on screen here — its absence is the guarantee that the
  // form asks one question at a time, and that a pre-hydration native GET has
  // no credential to serialize.
  test("login page renders step 1 of the log-in form", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  });

  test("Continue discloses the password step with the email carried over", async ({ page }) => {
    await page.goto("/login");

    // Enabled BEFORE filling: pre-hydration the primary reads "Starting up…",
    // and a fill landing in that window is discarded when the controlled input
    // snaps back to its empty state.
    const advance = page.getByRole("button", { name: "Continue", exact: true });
    await expect(advance).toBeEnabled();
    await page.locator('input[type="email"]').fill("person@example.test");
    await advance.click();

    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
    // The way back, and the alternative login — step 2 only.
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a sign-in link instead" })).toBeVisible();
  });

  // Since the route-level loading.tsx boundaries landed (UX-01 / #276), the
  // server streams a 200 with the skeleton first and delivers the page's
  // redirect() in-stream (NEXT_REDIRECT directive plus a <meta http-equiv=
  // "refresh"> no-JS fallback), so the URL at `goto` resolution is still the
  // protected route. Wait for the redirect to execute instead of reading
  // page.url() synchronously — the guard being asserted is unchanged: an
  // unauthenticated visit must END at /login.
  test("viewer / redirects an unauthenticated user to /login", async ({ page }) => {
    await page.goto("/");

    await page.waitForURL(url => url.pathname === "/login" && url.searchParams.get("next") === "/");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  });

  test("admin /admin redirects an unauthenticated user to /login", async ({ page }) => {
    await page.goto("/admin");

    await page.waitForURL(url => url.pathname === "/login" && url.searchParams.get("next") === "/admin");
  });
});
