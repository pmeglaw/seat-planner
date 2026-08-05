import { test, expect } from "@playwright/test";
import { retryUntilVisible } from "./auth-helpers";

// Unit coverage for retryUntilVisible in isolation, using page.setContent()
// fixtures rather than any real admin page. No sign-in and no draft state are
// needed here — only the polling/retry contract itself is under test. (It
// still runs under the e2e-auth tier's global setup/build, like every spec in
// this directory, but exercises none of that infrastructure.)

test.describe("retryUntilVisible", () => {
  test("does not call the action when the effect is already visible", async ({ page }) => {
    await page.setContent(`<div id="effect">Already here</div>`);
    let calls = 0;

    await retryUntilVisible(async () => {
      calls += 1;
    }, page.locator("#effect"));

    expect(calls).toBe(0);
  });

  test("calls the action once and resolves once the effect becomes visible", async ({ page }) => {
    await page.setContent(`<div id="effect" hidden>Hidden until revealed</div>`);
    let calls = 0;

    await retryUntilVisible(async () => {
      calls += 1;
      await page.locator("#effect").evaluate(el => el.removeAttribute("hidden"));
    }, page.locator("#effect"));

    expect(calls).toBe(1);
    await expect(page.locator("#effect")).toBeVisible();
  });

  test("retries the action if the first attempt's effect never shows up (e.g. a dropped pre-hydration click)", async ({
    page
  }) => {
    test.setTimeout(30_000);
    await page.setContent(`<div id="effect" hidden>Hidden until the second attempt</div>`);
    let calls = 0;

    await retryUntilVisible(async () => {
      calls += 1;
      // The first call is a dropped click: it has no effect. Only the second
      // (and any later) call actually reveals the element.
      if (calls > 1) {
        await page.locator("#effect").evaluate(el => el.removeAttribute("hidden"));
      }
    }, page.locator("#effect"));

    expect(calls).toBeGreaterThanOrEqual(2);
    await expect(page.locator("#effect")).toBeVisible();
  });

  test("rejects when the effect never becomes visible before the given timeout", async ({ page }) => {
    test.setTimeout(30_000);
    await page.setContent(`<div id="effect" hidden>Never revealed</div>`);
    let calls = 0;

    await expect(
      retryUntilVisible(
        async () => {
          calls += 1;
        },
        page.locator("#effect"),
        4_000
      )
    ).rejects.toThrow();

    expect(calls).toBeGreaterThan(0);
  });

  test("is idempotent for toggle-style targets: a second call never re-invokes the action once the effect is up", async ({
    page
  }) => {
    await page.setContent(`<div id="effect" hidden>Toggled once</div>`);
    let calls = 0;
    const action = async () => {
      calls += 1;
      await page.locator("#effect").evaluate(el => el.removeAttribute("hidden"));
    };

    await retryUntilVisible(action, page.locator("#effect"));
    await retryUntilVisible(action, page.locator("#effect"));

    expect(calls).toBe(1);
  });
});