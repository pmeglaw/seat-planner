import { test, expect, type Page } from "@playwright/test";
import { SEEDED_ADMIN_EMAIL, SEEDED_VIEWER_EMAIL, signIn } from "./auth-helpers";

// Header geometry across the width ladder (owner ruling 2026-09-04, Phase 4
// PR 2): the mode indicator is centred in the header's FREE RUN — between
// the last section link and the first utility — so its box must never
// intersect a section link or a utility at any width, for both link sets
// (admin: four links; viewer: two). The backend-free viewport-matrix tier
// cannot sign in, so the geometry is pinned here against the real shell.
//
// The widths: the 1920 ruling frame, the 1580 collision edge of the old
// page-midpoint rule, two laptops, and 1056 — the last width before the
// asset folds the header nav into the left panel (below it the run is
// name → utilities and the compact indicator has no links to meet).
const WIDTHS = [1920, 1580, 1366, 1280, 1056];

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function assertIndicatorClear(page: Page, role: "admin" | "viewer") {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1080 });
    await page.waitForTimeout(250);
    const indicator = await page.locator("#shell-header .sp-mode").boundingBox();
    expect(indicator, `${role} ${width}: indicator present`).not.toBeNull();
    const links = await page.locator("#shell-header nav.cds-header-nav a").evaluateAll(els =>
      els.map(el => {
        const r = el.getBoundingClientRect();
        return { label: el.textContent ?? "", box: { x: r.x, y: r.y, width: r.width, height: r.height }, visible: r.width > 0 };
      })
    );
    const utilities = await page.locator("#shell-header .cds-header-utils button").evaluateAll(els =>
      els.map(el => {
        const r = el.getBoundingClientRect();
        return { label: el.getAttribute("aria-label") ?? "", box: { x: r.x, y: r.y, width: r.width, height: r.height }, visible: r.width > 0 };
      })
    );
    for (const item of [...links, ...utilities].filter(entry => entry.visible)) {
      expect(intersects(indicator!, item.box), `${role} ${width}px: the indicator (x ${Math.round(indicator!.x)}–${Math.round(indicator!.x + indicator!.width)}) must not meet "${item.label.trim()}" (x ${Math.round(item.box.x)}–${Math.round(item.box.x + item.box.width)})`).toBe(false);
    }
    const centre = Math.round(indicator!.x + indicator!.width / 2);
    // Recorded in the run log for PHASE4BUILD §1.15 (the 1920 positions).
    console.log(`header-geometry ${role} ${width}px: indicator centre x=${centre}, links end x=${Math.round(Math.max(0, ...links.filter(l => l.visible).map(l => l.box.x + l.box.width)))}`);
  }
}

test("admin header: the indicator never meets a section link or a utility across the width ladder", async ({ page }) => {
  await signIn(page, SEEDED_ADMIN_EMAIL);
  await page.goto("/admin");
  await expect(page.locator("#shell-header .sp-mode")).toBeVisible();
  // Wait for the live count to replace the loading skeleton so the box is the real button.
  await expect(page.locator("#shell-header button.sp-mode")).toBeVisible();
  await assertIndicatorClear(page, "admin");
});

test("viewer header: the indicator never meets a section link or a utility across the width ladder", async ({ page }) => {
  await signIn(page, SEEDED_VIEWER_EMAIL);
  await page.goto("/");
  await expect(page.locator("#shell-header button.sp-mode")).toBeVisible();
  await assertIndicatorClear(page, "viewer");
});
