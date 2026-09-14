import { test, expect } from "@playwright/test";
import { SEEDED_ADMIN_EMAIL, signIn, retryUntilVisible } from "./auth-helpers";

for (const theme of ["light", "dark"] as const) {
  test(`admin responsive toolbar and read-only inspector in ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await signIn(page, SEEDED_ADMIN_EMAIL);
    await page.goto("/admin");
    const toolbar = page.getByRole("toolbar", { name: "Map controls" });
    await expect(toolbar).toBeVisible();
    await expect(page.locator('[data-seat-id]').first()).toBeVisible();

    for (const width of [1920, 1280, 1056, 1024, 1023, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1080 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await expect(toolbar).toHaveCSS("padding-left", "16px");
      await expect(toolbar).toHaveCSS("column-gap", width < 600 ? "8px" : "16px");
      await expect(page.getByRole("group", { name: "Find and filter", exact: true })).toHaveCSS("gap", "8px");
      await expect.poll(() => toolbar.evaluate(el => {
        const host = el.getBoundingClientRect();
        return [...el.querySelectorAll("button, input")].filter(node => (node as HTMLElement).offsetParent !== null).every(node => {
          const r = node.getBoundingClientRect();
          return r.left >= host.left && r.right <= host.right && r.top >= host.top && r.bottom <= host.bottom;
        });
      })).toBe(true);
      if (width >= 1024) await expect(page.getByRole("group", { name: "Draft actions", exact: true })).toBeVisible();
      else await expect(page.getByRole("group", { name: "Draft actions", exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`toolbar-${theme}-${width}.png`) });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin?seat=N01");
    const details = page.getByRole("region", { name: "Draft seat details", exact: true });
    await expect(details).toBeVisible();
    await expect(details.getByText("Editing needs a wider window.", { exact: true })).toBeVisible();
    await expect(page.locator("#seat-inspector-form")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`inspector-${theme}-390.png`) });
    await page.getByRole("button", { name: "Close inspector", exact: true }).click();

    const navigation = page.getByRole("button", { name: "Navigation and filters", exact: true });
    await retryUntilVisible(() => navigation.click(), page.locator('#shell-left-panel[data-open="true"]'));
    await expect(page.locator(".sp-filter-item").first()).toHaveCSS("height", "48px");
    await expect(page.locator(".sp-left-nav a").first()).toHaveCSS("height", "48px");
    await page.screenshot({ path: testInfo.outputPath(`filters-${theme}-390.png`) });
    await page.keyboard.press("Escape");
    await expect(navigation).toBeFocused();

    for (const mode of ["Add seat", "Move", "Swap"] as const) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/admin");
      await expect(toolbar).toBeVisible();
      if (mode === "Add seat") {
        await page.getByRole("button", { name: "More actions", exact: true }).click();
        await page.getByRole("menuitem", { name: mode, exact: true }).click();
      } else {
        await page.locator('button[data-seat-id][aria-label*="Assigned seat."]').first().click();
        await page.locator(`#seat-inspector-panel button[aria-label^="${mode} "]`).click();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole("group", { name: "Draft actions", exact: true })).toHaveCount(0);
      await expect(page.locator(".cursor-crosshair, .sp-pill--origin, .sp-pill--target, .sp-pill--invalid")).toHaveCount(0);
      await expect(page.locator("[data-mode-card]")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`mode-${mode}-${theme}-390.png`) });
      await page.setViewportSize({ width: 1920, height: 1080 });
      if (mode === "Add seat") await expect(page.locator(".cursor-crosshair")).toHaveCount(1);
      else await expect(page.locator(".sp-pill--origin")).toHaveCount(1);
      await expect(page.locator("[data-mode-card] button")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`mode-${mode}-${theme}-1920.png`) });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/management?tab=publishHistory");
    const history = page.getByRole("region", { name: "Publish history table", exact: true });
    await expect(history.or(page.getByRole("heading", { name: "Nothing published yet" }))).toBeVisible();
    // The seeded log may be empty. Loading/empty remains a truthful state.
    if (await page.getByRole("heading", { name: "Nothing published yet" }).isVisible()) return;
    await expect(history).toBeVisible();
    await expect(history.getByText("Scroll horizontally to see changes.")).toBeVisible();
    await expect(history).toHaveAttribute("tabindex", "0");
    await page.screenshot({ path: testInfo.outputPath(`history-${theme}-390.png`) });
  });
}
