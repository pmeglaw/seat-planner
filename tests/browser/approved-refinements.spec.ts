import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { HARNESS_DIR } from "./build-harness";

async function mount(page: Page, kind: "palette" | "management", props = {}) {
  await page.exposeFunction("__ctCall", () => []);
  await page.goto(pathToFileURL(path.join(HARNESS_DIR, "refinements.html")).href);
  await page.evaluate(({ kind, props }) => {
    (window as unknown as { __mountRefinement: (kind: string, props: object) => void }).__mountRefinement(kind, props);
  }, { kind, props });
}

for (const theme of ["white", "g100"] as const) {
  test(`palette wraps and scrolls all zones and people in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await mount(page, "palette");
    await page.evaluate(theme => document.documentElement.setAttribute("data-carbon-theme", theme), theme);
    for (const width of [1920, 900, 899, 880, 640, 390, 320, 900]) {
      await page.setViewportSize({ width, height: 700 });
      const palette = page.locator("#viewer-find-palette");
      await expect.poll(async () => Math.round((await palette.boundingBox())!.width)).toBe(width >= 900 ? 560 : width - 24);
      const box = (await palette.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(12);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 12);
      const zones = page.locator(".sp-palette-zone");
      const geometry = await zones.evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect();
        const count = element.querySelector(".sp-palette-zone-count")!;
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height,
          overflow: element.scrollWidth > element.clientWidth, nameSize: getComputedStyle(element).fontSize, countSize: getComputedStyle(count).fontSize };
      }));
      expect(geometry.filter(zone => zone.top === geometry[0].top).length).toBeLessThanOrEqual(3);
      for (const zone of geometry) {
        expect(zone.height).toBeGreaterThanOrEqual(48);
        expect(zone.overflow).toBe(false);
        expect(zone.nameSize).toBe("14px"); expect(zone.countSize).toBe("12px");
      }
      for (let index = 1; index < geometry.length; index++) {
        const a = geometry[index - 1], b = geometry[index];
        expect(a.right <= b.left || a.bottom <= b.top).toBe(true);
      }
      await zones.last().focus();
      if (await zones.last().getAttribute("aria-pressed") !== "true") await zones.last().press("Space");
      await expect(zones.last()).toHaveAttribute("aria-pressed", "true");
      await expect(zones.last().locator("svg")).toHaveCount(1);
      await page.locator(".sp-palette-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
      const last = palette.locator('[data-vindex="219"] button');
      await expect(last).toBeVisible();
      await last.click();
      await expect(page.getByLabel("Opened person")).toHaveText("Example person 219");
      expect((await last.boundingBox())!.height).toBe(48);
      await page.locator(".sp-palette-scroll").evaluate(element => { element.scrollTop = 0; });
    }
    await page.screenshot({ path: path.join(HARNESS_DIR, `palette-${theme}.png`), fullPage: true });
  });
}

test("short visual viewport keeps search, all zones and final result above the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { width: 390, height: 260, offsetTop: 80, offsetLeft: 0 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  });
  await mount(page, "palette", { anchorTop: 300 });
  const palette = page.locator("#viewer-find-palette");
  await expect(page.getByRole("searchbox", { name: "Search office seating in palette" })).toBeVisible();
  const box = (await palette.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(80); expect(box.y + box.height).toBeLessThanOrEqual(340);
  await page.locator(".sp-palette-zone").last().focus();
  await page.locator(".sp-palette-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
  const last = page.locator('[data-vindex="219"] button');
  await expect(last).toBeVisible(); await last.click();
  const rowBox = (await last.boundingBox())!;
  expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(340);
  await page.screenshot({ path: path.join(HARNESS_DIR, "palette-keyboard.png"), fullPage: true });
  const localSearch = page.getByRole("searchbox", { name: "Search office seating in palette" });
  await localSearch.fill("Example person 219");
  await localSearch.press("ArrowDown");
  await expect(page.locator('[aria-label="Viewer search results"] button').first()).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(localSearch).toBeFocused();
  await localSearch.press("Enter");
  await expect(page.getByLabel("Opened person")).toHaveText("Example person 219");
  await page.getByRole("button", { name: "Close search" }).click();
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search office seating", exact: true })).toBeFocused();
});

test("Management density preserves the visible person in a virtualized long table", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mount(page, "management");
  const normal = page.getByRole("radio", { name: "Normal", exact: true });
  const compact = page.getByRole("radio", { name: "Compact", exact: true });
  await expect(normal).toBeChecked();
  await expect.poll(async () => (await page.locator("[data-directory-row]").nth(1).boundingBox())!.height).toBe(49);
  await page.evaluate(() => window.scrollTo(0, 1825));
  const firstVisible = () => page.locator("[data-directory-row]").evaluateAll(rows => rows.find(row => row.getBoundingClientRect().bottom > Math.max(0, document.querySelector(".sp-tabs-host")?.getBoundingClientRect().bottom ?? 0))?.getAttribute("data-employee-id"));
  await expect.poll(firstVisible).toBeTruthy();
  const person = await firstVisible();
  // Change the preference without Playwright first scrolling the toolbar into view.
  await compact.evaluate(element => (element as HTMLInputElement).click());
  await expect(compact).toBeChecked();
  await expect.poll(firstVisible).toBe(person);
  await expect.poll(async () => (await page.locator("[data-directory-row]").nth(1).boundingBox())!.height).toBe(32);
  await normal.evaluate(element => (element as HTMLInputElement).click());
  await expect.poll(firstVisible).toBe(person);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('[data-employee-id="example-219"]')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(compact).toBeDisabled(); await expect(normal).toBeChecked();
  await expect.poll(() => page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }))).toEqual({ width: 390, viewport: 390 });
  await page.screenshot({ path: path.join(HARNESS_DIR, "density-phone.png"), fullPage: true });
});


for (const focusedControl of ["input", "close"] as const) {
  test(`expanded palette restores the latest selection with ${focusedControl} focused`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const viewport = new EventTarget();
      Object.assign(viewport, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    });
    await mount(page, "palette", { anchorTop: 300 });
    const original = page.getByRole("searchbox", { name: "Search office seating", exact: true });
    const local = page.getByRole("searchbox", { name: "Search office seating in palette" });
    const palette = await page.locator("#viewer-find-palette").elementHandle();
    await original.fill("Example person");
    await original.evaluate((input: HTMLInputElement) => input.setSelectionRange(2, 6, "backward"));
    await page.evaluate(() => {
      Object.assign(window.visualViewport!, { height: 260 });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect(local).toBeFocused();
    const selection = (input: HTMLInputElement) => [input.selectionStart, input.selectionEnd, input.selectionDirection];
    await expect.poll(() => local.evaluate(selection)).toEqual([2, 6, "backward"]);
    await local.fill("Changed example person");
    const direction = focusedControl === "input" ? "forward" : "backward";
    await local.evaluate((input: HTMLInputElement, isForward) => input.setSelectionRange(8, 15, isForward ? "forward" : "backward"), direction === "forward");
    if (focusedControl === "close") {
      await page.getByRole("button", { name: "Close search" }).focus();
      await expect(page.getByRole("button", { name: "Close search" })).toBeFocused();
    }
    await page.evaluate(() => {
      Object.assign(window.visualViewport!, { height: 844 });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect(local).toHaveCount(0);
    await expect(original).toBeFocused();
    await expect(original).toHaveValue("Changed example person");
    await expect.poll(() => original.evaluate(selection)).toEqual([8, 15, direction]);
    expect(await palette!.evaluate(element => element.isConnected)).toBe(true);
    await page.screenshot({ path: path.join(HARNESS_DIR, `focus-return-${focusedControl}.png`) });
    // Inserting text must replace the restored range, not append at the end.
    await original.press("x");
    await expect(original).toHaveValue("Changed x person");
  });
}
