import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { formatAxeViolations, WCAG_A_AA_TAGS } from "./axe-helpers";

// Regression coverage for the app/globals.css change that repoints
// --admin-publish-ready-text from --admin-primary-cta (#D23F0A, which the
// header comment measures at only 4.18:1 / 4.27:1 as TEXT on the ready
// surfaces) to --admin-primary-on-soft (#9E2F06, 6.52:1 / 6.66:1).
//
// This loads the REAL app/globals.css into a real page (no app server or
// build needed — just the token definitions and a fragment matching how
// AdminManagementPanel.tsx and SeatMap.tsx actually use the tokens: bg +
// border + text all on one element, no App build required to catch a
// regression here) and asserts on the resolved values and on contrast.
test.describe("--admin-publish-ready-text token", () => {
  test("resolves to --admin-primary-on-soft, not the cta fill", async ({ page }) => {
    const globalsCss = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");

    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>token fixture</title>
          <style>${globalsCss}</style>
        </head>
        <body class="admin-theme">
          <div id="ready-banner" class="border p-3 text-sm font-semibold"
               style="background-color: var(--admin-publish-ready-bg); border-color: var(--admin-publish-ready-border); color: var(--admin-publish-ready-text);">
            Publish draft changes when ready.
          </div>
        </body>
      </html>
    `);

    const [resolvedText, primaryOnSoft, primaryCta] = await page.evaluate(() => {
      // The admin tokens (including --admin-primary-on-soft / --admin-primary-cta)
      // are scoped to `.admin-theme, .shell-theme`, not `:root`, so they must be
      // read from an element within that scope — not from document.documentElement.
      const style = getComputedStyle(document.getElementById("ready-banner")!);
      return [
        style.color,
        style.getPropertyValue("--admin-primary-on-soft").trim(),
        style.getPropertyValue("--admin-primary-cta").trim()
      ];
    });

    // #9E2F06 == rgb(158, 47, 6); #D23F0A == rgb(210, 63, 10).
    expect(resolvedText).toBe("rgb(158, 47, 6)");
    expect(primaryOnSoft).toBe("#9E2F06");
    expect(primaryCta).toBe("#D23F0A");
    expect(resolvedText).not.toBe("rgb(210, 63, 10)");
  });

  test("the rendered publish-ready banner has no WCAG A/AA color-contrast violation", async ({ page }) => {
    const globalsCss = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");

    // Same markup shape as AdminManagementPanel.tsx's confirm-dialog notice:
    // border + bg + text all sourced from the publish-ready tokens, text-sm
    // font-semibold (not large text, so AA requires 4.5:1).
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>contrast fixture</title>
          <style>${globalsCss}</style>
        </head>
        <body class="admin-theme" style="background-color: #ffffff; margin: 0;">
          <div id="ready-banner" style="
              background-color: var(--admin-publish-ready-bg);
              border: 1px solid var(--admin-publish-ready-border);
              color: var(--admin-publish-ready-text);
              padding: 12px;
              font-size: 14px;
              font-weight: 600;
              line-height: 20px;
            ">
            The published map everyone sees won't change until you publish again.
          </div>
        </body>
      </html>
    `);

    const { violations } = await new AxeBuilder({ page })
      .include("#ready-banner")
      .withTags(WCAG_A_AA_TAGS)
      .analyze();

    expect(formatAxeViolations(violations)).toEqual([]);
  });
});