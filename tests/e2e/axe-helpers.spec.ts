import { test, expect } from "@playwright/test";
import { expectNoAxeViolations, waitForColorSettle } from "./axe-helpers";

// Backend-free unit coverage for the two new axe-helpers.ts exports. Neither
// needs a session or the app server: both just need a real page with real CSS,
// which page.setContent() provides without touching Supabase.

test.describe("waitForColorSettle", () => {
  test("resolves once a CSS-transitioning element's colors stop changing, not while mid-animation", async ({
    page
  }) => {
    // Mirrors the Button primitive's disabled->enabled flip this helper exists
    // for: colors start at one value, then transition to their final value over
    // 300ms once triggered.
    await page.setContent(`
      <button
        id="target"
        style="background-color: rgb(200, 200, 200); color: rgb(0, 0, 0); transition: background-color 300ms linear, color 300ms linear;"
      >Target</button>
    `);

    const locator = page.locator("#target");
    // Start the settle poll loop without awaiting it yet, so its first check()
    // sample captures the pre-transition colors as the baseline.
    const settlePromise = waitForColorSettle(locator);

    // Now trigger the style mutation and capture start time from this point.
    await locator.evaluate(el => {
      (el as HTMLElement).style.backgroundColor = "rgb(20, 20, 20)";
      (el as HTMLElement).style.color = "rgb(255, 255, 255)";
    });
    const start = Date.now();

    await settlePromise;
    const elapsed = Date.now() - start;

    // The transition runs for 300ms, and resolving requires two 120ms-apart
    // samples reading the SAME color — so this cannot resolve before the
    // transition's own end, which is the whole point of the helper.
    expect(elapsed).toBeGreaterThanOrEqual(300);
    await expect(locator).toHaveCSS("background-color", "rgb(20, 20, 20)");
    await expect(locator).toHaveCSS("color", "rgb(255, 255, 255)");
  });

  test("resolves for a static element with no transition at all", async ({ page }) => {
    await page.setContent(
      `<div id="target" style="background-color: rgb(255, 255, 255); color: rgb(22, 22, 22);">Static</div>`
    );

    const locator = page.locator("#target");
    // Should not hang: a non-animating element still settles on its first
    // observed color, it just needs the one polling round-trip to confirm it.
    await waitForColorSettle(locator);
    await expect(locator).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(locator).toHaveCSS("color", "rgb(22, 22, 22)");
  });
});

test.describe("expectNoAxeViolations", () => {
  test("does not throw for a page with no WCAG A/AA violations", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Accessible fixture</title></head>
        <body>
          <main>
            <h1>Accessible heading</h1>
            <p style="color: #161616; background-color: #ffffff;">High-contrast paragraph text.</p>
          </main>
        </body>
      </html>
    `);

    await expectNoAxeViolations(page);
  });

  test("throws when the page has a real color-contrast violation", async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Inaccessible fixture</title></head>
        <body>
          <main>
            <h1>Accessible heading</h1>
            <p style="color: #eeeeee; background-color: #ffffff;">Barely visible low-contrast text.</p>
          </main>
        </body>
      </html>
    `);

    await expect(expectNoAxeViolations(page)).rejects.toThrow();
  });
});