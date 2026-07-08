import { test, expect } from "@playwright/test";

// These run against the built app with only dummy Supabase env (see
// playwright.config.ts). With no session, both protected routes must redirect
// to /login, and /login must render the sign-in form. This catches build
// breakage, boot-time crashes, and broken auth-redirect middleware.

test.describe("smoke: routes boot and auth guards redirect", () => {
  test("login page renders the sign-in form", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  });

  test("viewer / redirects an unauthenticated user to /login", async ({ page }) => {
    await page.goto("/");

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("admin /admin redirects an unauthenticated user to /login", async ({ page }) => {
    await page.goto("/admin");

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/admin");
  });
});
