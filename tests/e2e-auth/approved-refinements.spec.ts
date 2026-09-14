import { test, expect } from "@playwright/test";
import { SEEDED_ADMIN_EMAIL, signIn, retryUntilVisible } from "./auth-helpers";

const subtitle = "Manage people, departments, zones and publish history.";

test("Management remains compact across tabs and reloads without a density control", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signIn(page, SEEDED_ADMIN_EMAIL);
  await page.goto("/admin/management");
  const management = page.getByRole("region", { name: "Management", exact: true });
  await expect(management).toBeVisible();
  const densityControls = page.getByRole("radio", { name: /Normal|Compact/ });
  await expect(densityControls).toHaveCount(0);
  await expect(page.locator(".sp-management-density")).toHaveCSS("--sp-table-row-h", "32px");
  await expect(management.getByRole("button", { name: "Seat status", exact: true })).toBeVisible();
  for (const tab of ["Departments", "Zones", "Publish history", "Employees"]) {
    await retryUntilVisible(
      () => management.getByRole("tab", { name: tab, exact: true }).click(),
      management.getByRole("tabpanel", { name: tab, exact: true })
    );
    await expect(densityControls).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Management", exact: true }).locator(".cds-page-subtitle")).toHaveText(subtitle);
    if (tab === "Publish history") await expect(management.locator(".cds-page-header .cds-btn--primary")).toHaveCount(0);
  }
  await page.reload();
  await expect(management).toBeVisible();
  await expect(densityControls).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("management-compact.png") });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; document.documentElement.dataset.carbonTheme = "g100"; });
  await page.screenshot({ path: testInfo.outputPath("management-compact-dark.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(densityControls).toHaveCount(0);
  await expect(page.locator(".sp-management-density")).toHaveCSS("--sp-table-row-h", "48px");
  await page.screenshot({ path: testInfo.outputPath("management-phone.png"), fullPage: true });
  await expect.poll(() => page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))).toEqual({ width: 390, viewport: 390 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(densityControls).toHaveCount(0);
});

test("shared palette and Reception copy render on authenticated surfaces", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signIn(page, SEEDED_ADMIN_EMAIL);
  for (const route of ["/", "/admin"]) {
    await page.goto(route);
    const search = page.locator('input[name="seat-search"]').first();
    const palette = page.locator("#viewer-find-palette");
    await retryUntilVisible(() => search.click(), palette);
    await expect(palette.getByRole("heading", { name: "Filter by zone" })).toBeVisible();
    await expect.poll(async () => Math.round((await palette.boundingBox())!.width)).toBe(560);
    await page.screenshot({ path: testInfo.outputPath(route === "/" ? "viewer-palette.png" : "admin-palette.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => Math.round((await palette.boundingBox())!.width)).toBe(366);
    await page.screenshot({ path: testInfo.outputPath(route === "/" ? "viewer-phone.png" : "admin-phone.png") });
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
  await page.goto("/reception");
  await expect(page.getByRole("region", { name: "Reception directory", exact: true }).getByText("Find an extension, then transfer the caller.", { exact: true })).toBeVisible();
});


test("Management palette roles follow explicit and system themes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signIn(page, SEEDED_ADMIN_EMAIL);
  for (const preference of ["light", "dark", "system-light", "system-dark"]) {
    const dark = preference.endsWith("dark");
    await page.emulateMedia({ colorScheme: dark ? "dark" : "light", reducedMotion: "reduce" });
    await page.evaluate(preference => {
      if (preference.startsWith("system")) localStorage.removeItem("sp-theme");
      else localStorage.setItem("sp-theme", preference);
    }, preference);
    await page.goto("/admin/management");
    await expect(page.getByRole("radio", { name: /Normal|Compact/ })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Management", exact: true }).locator(".cds-page-subtitle")).toHaveCSS("color", dark ? "rgb(198, 198, 198)" : "rgb(82, 82, 82)");
    await page.screenshot({ path: testInfo.outputPath(`management-${preference}.png`) });
    await page.goto("/admin");
    const palette = page.locator("#viewer-find-palette");
    await retryUntilVisible(() => page.locator('input[name="seat-search"]').first().click(), palette);
    await expect(palette).toHaveCSS("background-color", dark ? "rgb(57, 57, 57)" : "rgb(255, 255, 255)");
    await page.screenshot({ path: testInfo.outputPath(`palette-${preference}.png`) });
  }
});
