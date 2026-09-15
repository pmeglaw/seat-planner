import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { HARNESS_DIR } from "./build-harness";

for (const theme of ["white", "g100"] as const) {
  test(`mobile admin notice shares constrained search geometry in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const viewport = new EventTarget();
      Object.assign(viewport, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    });
    const calls: string[] = [];
    await page.exposeFunction("__ctCall", (name: string) => { calls.push(name); return null; });
    await page.goto(pathToFileURL(path.join(HARNESS_DIR, "refinements.html")).href);
    await page.evaluate(theme => {
      document.documentElement.setAttribute("data-carbon-theme", theme);
      const employees = Array.from({ length: 60 }, (_, index) => ({
        id: `person-${index}`, full_name: `Example person ${index}`, position: "Analyst", department: "Intake",
        phone_extension: null, email: null, avatar_url: null, active: true, created_at: "", updated_at: ""
      }));
      (window as unknown as { __mountSeatMap: (props: object) => void }).__mountSeatMap({
        canEdit: true, employees, seats: [{
          id: "seat-1", seat_key: "n01", label: "N01", x: 0.3, y: 0.2, status: "available",
          layer: "draft", floor: "3", employee_id: null, employee: null, department: null,
          zone: "North Pod", notes: null, is_custom: false, created_at: "", updated_at: ""
        }]
      });
    }, theme);
    const notice = page.getByRole("status").filter({ hasText: "Editing needs a wider window." });
    await expect(notice).toBeVisible();
    const zoom = page.getByRole("group", { name: "Map zoom", exact: true });
    await expect(zoom).toBeVisible();
    for (const button of await zoom.getByRole("button").all()) {
      await expect(button).toHaveCSS("width", "48px");
      await expect(button).toHaveCSS("height", "48px");
    }
    await page.getByRole("searchbox", { name: "Admin search", exact: true }).focus();
    const palette = page.locator("#viewer-find-palette");
    await expect(palette).toBeVisible();
    await expect(zoom).toBeHidden();
    for (const state of [
      { name: "normal", layoutHeight: 844, height: 844, offsetTop: 0 },
      { name: "short", layoutHeight: 350, height: 350, offsetTop: 0 },
      { name: "keyboard", layoutHeight: 844, height: 260, offsetTop: 80 }
    ]) {
      await page.setViewportSize({ width: 390, height: state.layoutHeight });
      await page.evaluate(({ height, offsetTop }) => {
        Object.assign(window.visualViewport!, { height, offsetTop });
        window.visualViewport!.dispatchEvent(new Event("resize"));
      }, state);
      await expect(palette.getByRole("status").filter({ hasText: "Editing needs a wider window." })).toBeVisible();
      await expect(notice).toHaveCount(1);
      if (state.name !== "normal") {
        for (const control of [
          palette.getByRole("searchbox", { name: "Search office seating in palette", exact: true }),
          palette.getByRole("button", { name: "Close search", exact: true })
        ]) {
          await expect(control).toBeInViewport();
          await expect.poll(() => control.evaluate(element => {
            const box = element.getBoundingClientRect();
            return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
          })).toBe(true);
          await control.click({ trial: true });
        }
      }
      const scroll = palette.getByRole("region", { name: "Scrollable search content" });
      await expect.poll(async () => {
        const n = await notice.boundingBox(), p = await palette.boundingBox(), s = await scroll.boundingBox();
        return Boolean(n && p && s && n.y >= s.y + s.height - 1 && n.y >= state.offsetTop
          && n.y + n.height <= state.offsetTop + state.height && n.y + n.height <= p.y + p.height + 1
          && n.x >= 0 && n.x + n.width <= 390 && s.height >= 48);
      }).toBe(true);
      await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const last = palette.getByRole("button", { name: /Example person 59/ });
      await expect(last).toBeInViewport();
      const lastBox = (await last.boundingBox())!, noteBox = (await notice.boundingBox())!;
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(noteBox.y + 1);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
      await page.screenshot({ path: testInfo.outputPath(`${state.name}-${theme}.png`) });
    }
    await page.getByRole("button", { name: "Close search", exact: true }).click();
    await expect(palette).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Admin search", exact: true })).toBeFocused();
    await expect(notice).toBeVisible();
    await expect(zoom).toBeVisible();
    expect(calls.filter(name => /^action:(update|create|delete|swap|publish|reset|restore)/.test(name))).toEqual([]);
  });
}
