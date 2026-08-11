import { test, expect } from "@playwright/test";

// These run against the built app with only dummy Supabase env (see
// playwright.config.ts). With no session, both protected routes must redirect
// to /login, and /login must render the sign-in form. This catches build
// breakage, boot-time crashes, and broken auth-redirect wiring (the page
// guards redirect; the root `proxy.ts` only refreshes the session cookie).

test.describe("smoke: routes boot and auth guards redirect", () => {
  test("login page renders the sign-in form", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("admin /admin redirects an unauthenticated user to /login", async ({ page }) => {
    await page.goto("/admin");

    await page.waitForURL(url => url.pathname === "/login" && url.searchParams.get("next") === "/admin");
  });
});
