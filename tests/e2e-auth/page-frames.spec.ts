import { test, expect, type Page } from "@playwright/test";
import { SEEDED_ADMIN_EMAIL, signIn } from "./auth-helpers";

// Page frames across the width ladder (Phase 4 PR 4; PHASE2UX §1G / §1S,
// PHASE3DS §1.22 / §1.27): the two document pages — /admin/management and
// /admin/settings — at the 1920 ruling frame, a laptop and the 1024 narrow
// frame. Per cell: no horizontal document scroll; the skip link lands on the
// page's marker; ONE primary per section (D5-a / D6-a); the Management tab
// strip stays pinned to the top of the pane after a scroll (P3-15 — the
// sheet's header offset is zeroed on the strip at lg, PHASE4BUILD §1.37);
// the CSV trigger states its type and limit in its own label (D6-b). The
// backend-free viewport-matrix tier walks these routes only as signed-out
// redirects, so the signed-in frames are pinned here.

const WIDTHS: Array<[number, number]> = [
  [1920, 1080],
  [1280, 800],
  [1024, 768]
];

async function expectNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth, `${label}: the document must not scroll sideways`).toBeLessThanOrEqual(overflow.clientWidth);
}

test.describe("Management frame", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_ADMIN_EMAIL);
  });

  for (const [width, height] of WIDTHS) {
    test(`${width}×${height}: one primary, the sections landmark, the strip pinned, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/admin/management");
      await expect(page.getByRole("heading", { name: "Management", level: 1 })).toBeVisible();
      await expect(page.locator("[data-directory-row]").first()).toBeVisible();

      await expectNoHorizontalScroll(page, `management ${width}`);

      // The page header owns the one primary and it names the current tab's create.
      const primaries = page.locator(".sp-page .cds-page-header .cds-btn--primary");
      await expect(primaries).toHaveCount(1);
      await expect(primaries).toHaveText("Add employee");
      await expect(page.getByRole("navigation", { name: "Management sections" }).getByRole("tablist")).toBeVisible();

      // The selected tab's bar is the brand terracotta through Carbon's
      // interactive-border role (no hex in components) — read as painted.
      const bar = await page.getByRole("tab", { name: "Employees" }).evaluate(el => getComputedStyle(el).boxShadow);
      expect(bar, "the selected tab bar is #B85C2E").toContain("rgb(184, 92, 46)");

      // Scroll the pane (lg) or the document (below lg); the strip must still
      // sit at the top of the visible content, never 48px below it.
      const strip = page.locator(".sp-tabs-host");
      await page.evaluate(() => {
        const region = document.querySelector<HTMLElement>('[role="region"][aria-label="Management"]');
        if (region && getComputedStyle(region).overflowY === "auto") region.scrollTop = 600;
        else window.scrollTo(0, 600);
      });
      await page.waitForTimeout(250);
      const stripBox = await strip.boundingBox();
      const headerBox = await page.locator("#shell-header").boundingBox();
      expect(stripBox, "tab strip present").not.toBeNull();
      expect(headerBox, "shell header present").not.toBeNull();
      expect(Math.round(stripBox!.y), `${width}: the strip is pinned directly under the header`).toBe(Math.round(headerBox!.y + headerBox!.height));

      // The skip link lands on the page's own marker.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? "")).toBe("admin-subpage-main");
    });
  }
});

test.describe("Settings frame", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_ADMIN_EMAIL);
  });

  for (const [width, height] of WIDTHS) {
    test(`${width}×${height}: no page primary, one primary per section, labelled triggers, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/admin/settings");
      await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

      await expectNoHorizontalScroll(page, `settings ${width}`);

      // D6-a: the page header has no primary; each section carries exactly one.
      await expect(page.locator(".sp-page .cds-page-header .cds-btn")).toHaveCount(0);
      for (const name of ["CSV assignments", "Draft working-copy snapshots"]) {
        const section = page.getByRole("region", { name });
        await expect(section.locator(".cds-btn--primary")).toHaveCount(1);
      }
      await expect(page.getByRole("region", { name: "CSV assignments" }).locator(".cds-btn--primary")).toHaveText("Import CSV · .csv up to 5 MB");
      await expect(page.getByRole("region", { name: "Draft working-copy snapshots" }).locator(".cds-btn--primary")).toHaveText("Export draft snapshot");
      await expect(page.getByRole("button", { name: "Restore draft snapshot…" })).toBeVisible();
      await expect(page.getByText(".json up to 5 MB — a file exported from this page.")).toBeVisible();

      // The callout is guidance, not a notification: no close, no status glyph.
      const callout = page.locator(".sp-callout");
      await expect(callout).toBeVisible();
      await expect(callout.locator("button, svg")).toHaveCount(0);

      // Exports are never disabled.
      await expect(page.getByRole("button", { name: "Export CSV" })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Export draft snapshot" })).toBeEnabled();
      await expect(page.getByRole("button", { name: /Reset draft/ })).toHaveCount(0);

      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? "")).toBe("admin-subpage-main");
    });
  }
});
