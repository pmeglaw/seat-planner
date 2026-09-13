import { test, expect } from "@playwright/test";
import { SEEDED_ADMIN_EMAIL, signIn, retryUntilVisible } from "./auth-helpers";

const subtitle = "Manage people, departments, zones and publish history.";

test("Management density persists across all tabs, reloads and responsive fallback", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signIn(page, SEEDED_ADMIN_EMAIL);
  await page.goto("/admin/management");
  const compact = page.getByRole("radio", { name: "Compact", exact: true });
  const normal = page.getByRole("radio", { name: "Normal", exact: true });
  await expect(compact).toBeEnabled();
  await expect(normal).toBeChecked();
  await expect(page.getByText("Seat status", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("management-normal.png") });
  await compact.check();
  for (const tab of ["Departments", "Zones", "Publish history", "Employees"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(compact).toBeChecked();
    await expect(page.locator(".cds-page-subtitle")).toHaveText(subtitle);
    if (tab === "Publish history") await expect(page.locator(".cds-page-header .cds-btn--primary")).toHaveCount(0);
  }
  await page.reload();
  await expect(compact).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("management-compact.png") });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; document.documentElement.dataset.carbonTheme = "g100"; });
  await page.screenshot({ path: testInfo.outputPath("management-compact-dark.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(normal).toBeChecked(); await expect(compact).toBeDisabled();
  await expect(page.locator(".sp-management-density")).toHaveAttribute("data-density", "compact");
  await page.screenshot({ path: testInfo.outputPath("management-phone.png"), fullPage: true });
  await expect.poll(() => page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))).toEqual({ width: 390, viewport: 390 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(compact).toBeChecked();
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
  await expect(page.getByText("Find an extension, then transfer the caller.", { exact: true })).toBeVisible();
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
    await expect(page.getByRole("radio", { name: "Compact", exact: true })).toBeEnabled();
    await expect(page.locator(".cds-page-subtitle")).toHaveCSS("color", dark ? "rgb(198, 198, 198)" : "rgb(82, 82, 82)");
    await page.screenshot({ path: testInfo.outputPath(`management-${preference}.png`) });
    await page.goto("/admin");
    const palette = page.locator("#viewer-find-palette");
    await retryUntilVisible(() => page.locator('input[name="seat-search"]').first().click(), palette);
    await expect(palette).toHaveCSS("background-color", dark ? "rgb(57, 57, 57)" : "rgb(255, 255, 255)");
    await page.screenshot({ path: testInfo.outputPath(`palette-${preference}.png`) });
  }
});
