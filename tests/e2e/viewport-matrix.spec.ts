import { test, expect } from "@playwright/test";

// Viewport-matrix smoke (owner rule "works at any width", redesign-v2 PR 2):
// every route this backend-free tier can reach — /login itself and the
// signed-out redirects that land on it — at the dual-27" primary target, a
// laptop, the narrow shell frame and a phone. Three invariants per cell:
//   1. no horizontal document scroll (the body never scrolls sideways);
//   2. the page's masthead is present (the login page's own "Seat Planner"
//      heading — the shell header mounts only for signed-in visitors, which
//      this tier cannot be);
//   3. the first Tab lands on the page's first focusable — /login ships no
//      skip link (its form IS the content), so that is the email field.
// The signed-in shell (header + skip link first) is covered by the e2e-auth
// tier and tests/app-shell.test.mjs.

const VIEWPORTS: Array<[number, number]> = [
  [1920, 1080],
  [1366, 768],
  [1024, 768],
  [390, 844]
];

const PATHS = ["/login", "/", "/admin", "/admin/management", "/admin/settings", "/reception"];

for (const [width, height] of VIEWPORTS) {
  for (const path of PATHS) {
    test(`${width}×${height} ${path}: no horizontal scroll, masthead present, first Tab reaches the first field`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await page.waitForURL(url => url.pathname === "/login");
      await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      expect(overflow.scrollWidth, `document scrollWidth must not exceed clientWidth at ${width}px`).toBeLessThanOrEqual(overflow.clientWidth);

      await expect(page.getByRole("heading", { name: "Seat Planner", level: 1 })).toBeVisible();

      await page.keyboard.press("Tab");
      const active = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el ? { tag: el.tagName.toLowerCase(), type: el.getAttribute("type"), skip: el.classList.contains("cds-skip-link") } : null;
      });
      expect(active, "first Tab must land on a focusable element").not.toBeNull();
      expect(active?.skip || (active?.tag === "input" && active?.type === "email"), `first focusable at ${width}px is the skip link or the email field, got ${JSON.stringify(active)}`).toBe(true);
    });
  }
}
