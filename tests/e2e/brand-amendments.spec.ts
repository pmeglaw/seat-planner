import { test, expect } from "@playwright/test";

// BR-2 / DS-1: real controls in the built app, including forced-theme precedence.
for (const choice of ["light", "dark", "system-light", "system-dark"] as const) {
  test(`auth brand zones and focus: ${choice}`, async ({ page }) => {
    const dark = choice === "dark" || choice === "system-dark";
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ colorScheme: choice === "light" || choice === "system-dark" ? "dark" : "light" });
    await page.addInitScript(value => {
      if (value.startsWith("system")) localStorage.removeItem("sp-theme");
      else localStorage.setItem("sp-theme", value);
    }, choice);
    await page.goto("/login");
    const focus = dark ? "rgb(255, 255, 255)" : "rgb(184, 92, 46)";
    await expect(page.locator(".sp-zone-chrome")).toHaveCSS("background-color", "rgb(22, 22, 22)");
    await expect(page.locator(".sp-zone-chrome h1")).toHaveCSS("color", "rgb(244, 244, 244)");
    await expect(page.locator("main")).toHaveCSS("background-color", dark ? "rgb(22, 22, 22)" : "rgb(255, 255, 255)");
    await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeEnabled();
    const email = page.locator('input[type="email"]');
    await email.focus();
    const field = email.locator("..");
    await expect(field).toHaveCSS("border-bottom-color", focus);
    await expect(field).toHaveCSS("border-bottom-width", "2px");
    await field.hover();
    await expect(field).toHaveCSS("border-bottom-color", focus);
    const primary = page.getByRole("button", { name: "Log in", exact: true });
    await expect(primary).toBeEnabled();
    await primary.focus();
    await expect(primary).toHaveCSS("background-color", "rgb(184, 92, 46)");
    expect(await primary.evaluate(el => getComputedStyle(el).boxShadow)).toContain(focus);
    await primary.hover();
    await expect(primary).toHaveCSS("background-color", "rgb(143, 69, 33)");
    await page.goto("/auth/update-password");
    await expect(page.locator("main")).toHaveCSS("background-color", dark ? "rgb(22, 22, 22)" : "rgb(255, 255, 255)");
    const password = page.locator('input[type="password"]').first();
    await password.focus();
    await expect(password.locator("..")).toHaveCSS("border-bottom-color", focus);
    await expect(password.locator("..")).toHaveCSS("border-bottom-width", "2px");
  });
}
