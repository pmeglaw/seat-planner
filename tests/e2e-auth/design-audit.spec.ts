import { test, expect, type Page } from "@playwright/test";
import { SEEDED_ADMIN_EMAIL, signIn, retryUntilVisible } from "./auth-helpers";

async function noDocumentOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
}

for (const theme of ["light", "dark"] as const) {
  test(`design audit: Management and navigation geometry in ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await signIn(page, SEEDED_ADMIN_EMAIL);
    for (const width of [320, 390, 480]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/admin/settings");
      const content = page.locator("[data-shell-content]");
      await expect(content).toBeVisible();
      const before = await content.boundingBox();
      const navigation = page.getByRole("button", { name: "Navigation", exact: true });
      await retryUntilVisible(() => navigation.click(), page.getByRole("complementary", { name: "Sections" }));
      await expect(page.locator("#shell-left-panel")).toHaveAttribute("data-open", "true");
      await expect(page.getByRole("complementary", { name: "Sections" })).toBeInViewport();
      await expect.poll(async () => (await content.boundingBox())!.width).toBe(before!.width);
      await expect(content).toHaveCSS("padding-left", "0px");
      await noDocumentOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`navigation-${width}.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(navigation).toBeFocused();
      await expect(navigation).toHaveAttribute("aria-expanded", "false");

      await page.goto("/admin/management");
      const search = page.getByRole("searchbox", { name: "Search employees" });
      await expect(search).toHaveCSS("height", "48px");
      await search.fill("no-matching-employee");
      await expect(page.getByRole("heading", { name: "No employees match this search" })).toBeVisible();
      await search.fill("");
      await retryUntilVisible(() => page.getByRole("button", { name: "Add employee", exact: true }).click(), page.getByRole("dialog"));
      const heading = page.getByRole("dialog").getByRole("heading", { name: "Add employee" });
      await expect.poll(async () => (await heading.boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator("#shell-header").boundingBox())!.height);
      await noDocumentOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`employee-panel-${width}.png`) });
      await page.getByRole("button", { name: "Cancel", exact: true }).click();

      for (const tab of ["departments", "zones"]) {
        await page.goto(`/admin/management?tab=${tab}`);
        await noDocumentOverflow(page);
        const rename = page.getByRole("button", { name: /^Rename / }).first();
        await expect(rename).toBeInViewport();
        if (tab === "departments") {
          const name = page.locator(".sp-list-name", { hasText: "Case Management" });
          await expect.poll(async () => (await name.boundingBox())!.height).toBeLessThan(25);
        }
        await page.screenshot({ path: testInfo.outputPath(`${tab}-${width}.png`), fullPage: true });
        await rename.click();
        await expect(page.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
        await noDocumentOverflow(page);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      }
      await page.goto("/admin/management?tab=publishHistory");
      const selected = page.getByRole("tab", { name: "Publish history", exact: true });
      await expect.poll(async () => {
        const tab = (await selected.boundingBox())!;
        const strip = (await page.locator(".sp-tabs-host").boundingBox())!;
        return tab.x >= strip.x - 1 && tab.x + tab.width <= strip.x + strip.width + 1;
      }).toBe(true);
    }
  });

  test(`design audit: Reception rows and map search in ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await signIn(page, SEEDED_ADMIN_EMAIL);
    await page.goto("/reception");
    for (const width of [320, 390, 480, 768, 1055, 1056, 1920]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1080 });
      await expect(page.locator(".sp-recep-row").first()).toBeVisible();
      await expect.poll(() => page.locator(".sp-recep-row").evaluateAll(rows => rows.every(row => {
        const person = row.querySelector(".sp-recep-person")!.getBoundingClientRect();
        const seat = row.children[1].getBoundingClientRect();
        const extension = row.querySelector(".sp-recep-ext")!.getBoundingClientRect();
        const separated = person.right <= seat.left + 1 || person.bottom <= seat.top + 1;
        return separated && person.right <= extension.left + 1 && seat.right <= extension.left + 1;
      }))).toBe(true);
      await noDocumentOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`reception-${width}.png`), fullPage: true });
    }
    await page.goto("/");
    const search = page.locator('input[name="seat-search"]');
    await expect(search).toBeVisible();
    await expect.poll(async () => (await search.boundingBox())!.width).toBeGreaterThan(300);
    await retryUntilVisible(() => search.click(), page.locator("#viewer-find-palette"));
    await page.setViewportSize({ width: 320, height: 844 });
    const zones = page.getByRole("button", { name: "Filter by zone" });
    await expect(zones).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("list", { name: "People directory" }).getByRole("button").first()).toBeInViewport();
    await zones.click();
    await expect(zones).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("group", { name: "Zones" }).getByRole("button", { pressed: false }).first().click();
    await noDocumentOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("palette-320.png") });
  });
}
