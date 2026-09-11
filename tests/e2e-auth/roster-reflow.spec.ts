import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { signIn, SEEDED_VIEWER_EMAIL } from "./auth-helpers";
import { db } from "./db-helpers";
import { waitForOneShotAnimations } from "../e2e/axe-helpers";

test("narrow roster retains long contact details and its copy action in both themes", async ({ page, context }, testInfo) => {
  // Independent, unseated snapshot fixture; never change an existing person.
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.E2E_SUPABASE_URL!).hostname);
  const id = randomUUID();
  const name = "Reflow Test Person";
  const position = "Senior Litigation Case Management Coordinator";
  const email = "reflow.long-contact-address@example.test";
  await db("published_employees", { method: "POST", body: JSON.stringify({ id, full_name: name, position, email, phone_extension: "12345", active: true, department: "Litigation" }) });
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signIn(page, SEEDED_VIEWER_EMAIL);
    for (const theme of ["light", "dark"]) {
      await page.goto(`/?floor=2&q=${encodeURIComponent(name)}`);
      await page.evaluate(value => {
        document.documentElement.dataset.theme = value;
        document.documentElement.dataset.carbonTheme = value === "dark" ? "g100" : "white";
      }, theme);
      const row = page.locator(`[data-roster-row="${id}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(position);
      await expect(row).toContainText(email);
      for (const width of [320, 390, 480, 640, 767, 768, 1920]) {
        await page.setViewportSize({ width, height: 1080 });
        await waitForOneShotAnimations(page);
        const details = await row.locator(".sp-roster-name, .sp-roster-job, .sp-roster-extension, .sp-roster-email, button").evaluateAll(elements => elements.map(element => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return { text: element.textContent, inside: rect.left >= 0 && rect.right <= innerWidth, clipped: element.scrollWidth > element.clientWidth + 1, hit: element === hit || element.contains(hit) };
        }));
        for (const detail of details) {
          expect(detail.inside, `${width}: ${detail.text}`).toBe(true);
          expect(detail.hit, `${width}: ${detail.text}`).toBe(true);
          if (width < 768) expect(detail.clipped, `${width}: ${detail.text}`).toBe(false);
        }
        if (width === 390 || width === 1920) await page.screenshot({ path: testInfo.outputPath(`roster-${width}-${theme}.png`) });
      }
      await page.setViewportSize({ width: 390, height: 1080 });
      const copy = row.getByRole("button", { name: `Copy link for ${name}` });
      await copy.click();
      await expect(copy).toHaveAttribute("data-done", "Copied");
      await expect.poll(() => page.evaluate(async () => new URL(await navigator.clipboard.readText()).searchParams.get("q"))).toBe(name);
    }
  } finally {
    await db(`published_employees?id=eq.${id}`, { method: "DELETE" });
  }
});
