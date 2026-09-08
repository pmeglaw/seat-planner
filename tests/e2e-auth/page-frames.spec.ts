import { test, expect, type Locator, type Page } from "@playwright/test";
import { SEEDED_ADMIN_EMAIL, SEEDED_VIEWER_EMAIL, signIn } from "./auth-helpers";

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

      // Scroll the pane (lg) or the document (below lg); once anything has
      // scrolled, the strip must sit at the top of the visible content, never
      // 48px below it (the sheet's offset assumes a scrolling document). The
      // seed directory may be too short to scroll at the tallest frames — then
      // the strip simply sits in its natural place under the page header.
      const strip = page.locator(".sp-tabs-host");
      const naturalY = Math.round((await strip.boundingBox())!.y);
      const scrolled = await page.evaluate(() => {
        const region = document.querySelector<HTMLElement>('[role="region"][aria-label="Management"]');
        if (region && getComputedStyle(region).overflowY === "auto") {
          region.scrollTop = 600;
          return region.scrollTop;
        }
        window.scrollTo(0, 600);
        return window.scrollY;
      });
      await page.waitForTimeout(250);
      const stripBox = await strip.boundingBox();
      const headerBox = await page.locator("#shell-header").boundingBox();
      expect(stripBox, "tab strip present").not.toBeNull();
      expect(headerBox, "shell header present").not.toBeNull();
      const headerBottom = Math.round(headerBox!.y + headerBox!.height);
      if (scrolled > 0) {
        // Sticky: the strip travels with the content until it meets the header, then pins there.
        const expected = Math.max(headerBottom, naturalY - scrolled);
        expect(Math.round(stripBox!.y), `${width}: the strip is sticky under the header after scrolling ${scrolled}px (natural ${naturalY})`).toBe(expected);
        if (expected === headerBottom) console.log(`page-frames management ${width}px: pin reached after ${scrolled}px`);
        else console.log(`page-frames management ${width}px: scrolled ${scrolled}px, pin not yet reached (content barely overflows the seed)`);
      } else {
        expect(Math.round(stripBox!.y), `${width}: nothing to scroll — the strip sits under the page header`).toBeGreaterThan(headerBottom);
        console.log(`page-frames management ${width}px: content shorter than the pane — pin not exercised at this frame`);
      }

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

// Reception (Phase 4 PR 5; PHASE2UX §1R.2 as amended by owner ruling Q-6;
// PHASE3DS §1.22 / §1.29; sheet amendment E): the same 1584 frame, NO action
// in the page header (D3-a), the readout 480 with the 32 gutter at the two
// wide frames (the list takes the rest of the 1520 content box — 1008 at
// 1920), one column under the 1055 fold with the readout following the list
// and "Back to the list" shown; the skip link lands on the FIELD (§1R.7).
test.describe("Reception frame", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_VIEWER_EMAIL);
  });

  for (const [width, height] of WIDTHS) {
    test(`${width}×${height}: no header action, readout 480 + gap 32 (or one column), skip link on the field, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/reception");
      await expect(page.getByRole("heading", { name: "Reception", level: 1 })).toBeVisible();
      await expect(page.locator('li[role="option"]').first()).toBeVisible();
      // The live grid inside <main> — the loading skeleton has its own `.sp-recep`
      // that can still be on screen while the streamed page waits in React's
      // hidden pre-swap container.
      await expect(page.locator("main .sp-recep")).toBeVisible();

      await expectNoHorizontalScroll(page, `reception ${width}`);
      await expect(page.locator("main .sp-page .cds-page-header .cds-btn")).toHaveCount(0);

      const list = (await page.locator("main .sp-recep-list").boundingBox())!;
      const readout = (await page.getByRole("region", { name: "Caller detail" }).boundingBox())!;
      if (width >= 1280) {
        expect(Math.round(readout.width), `${width}: the readout column is 480`).toBe(480);
        expect(Math.round(readout.x - (list.x + list.width)), `${width}: the gutter is 32`).toBe(32);
        if (width === 1920) expect(Math.round(list.width), "the list takes the rest of the 1520 content box (Q-6)").toBe(1008);
        await expect(page.getByRole("button", { name: "Back to the list" })).toBeHidden();
      } else {
        const columns = await page.locator("main .sp-recep").evaluate(el => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
        expect(columns, `${width}: one column under the fold`).toBe(1);
        expect(readout.y).toBeGreaterThanOrEqual(list.y + list.height - 1);
        await expect(page.getByRole("button", { name: "Back to the list" })).toBeVisible();
      }

      // The skip link lands on the field itself. Autofocus already parked
      // focus there, and blur() would leave Chrome's sequential-focus starting
      // point on the field; focusing <body> resets it to the document start so
      // the next Tab reaches the header's skip link.
      await page.evaluate(() => {
        const body = document.body;
        body.tabIndex = -1;
        body.focus();
        body.removeAttribute("tabindex");
      });
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? "")).toBe("reception-main");
    });
  }
});

// The one row action's tier-C tooltip must actually paint (PHASE3DS §1.23 +
// amendment D, 2026-09-05): the asset clips every table cell, which swallowed
// the below-cell tooltip until the actions cell stopped clipping, and the last
// row — whose tooltip would leave `.sp-table-scroll`, a clipping box in both
// axes — flips its tooltip above the button. "Visible" here is a hit test at
// the tooltip's centre plus the box inside the viewport, never a `visibility`
// read (a clipped box still passes that — the smoke's original assertion).
async function tooltipState(edit: Locator) {
  return edit.evaluate(button => {
    const tip = button.parentElement!.querySelector<HTMLElement>(".sp-tooltip")!;
    const r = tip.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    // The tooltip is pointer-events: none (it never intercepts the pointer), so the hit test lifts that for one call.
    const prev = tip.style.pointerEvents;
    tip.style.pointerEvents = "auto";
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    tip.style.pointerEvents = prev;
    return {
      text: tip.textContent,
      painted: !!hit && (hit === tip || tip.contains(hit)),
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      above: r.bottom <= b.top,
      below: r.top >= b.bottom
    };
  });
}

test.describe("Edit tooltip", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_ADMIN_EMAIL);
  });

  for (const [width, height] of WIDTHS) {
    test(`${width}×${height}: the tooltip paints below on the first row and above on the last, on hover and on focus`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/admin/management");
      const rows = page.locator("[data-directory-row]");
      await expect(rows.first()).toBeVisible();

      const firstEdit = rows.first().locator('button[aria-label^="Edit "]');
      await firstEdit.hover();
      expect(await tooltipState(firstEdit)).toMatchObject({ text: "Edit", painted: true, inViewport: true, below: true });
      await page.mouse.move(0, 0);
      await firstEdit.focus();
      expect(await tooltipState(firstEdit)).toMatchObject({ text: "Edit", painted: true, inViewport: true, below: true });

      const lastRow = rows.last();
      await lastRow.scrollIntoViewIfNeeded();
      await expect(lastRow.locator(".sp-has-tooltip")).toHaveAttribute("data-tooltip-placement", "above");
      const lastEdit = lastRow.locator('button[aria-label^="Edit "]');
      await lastEdit.hover();
      expect(await tooltipState(lastEdit)).toMatchObject({ text: "Edit", painted: true, inViewport: true, above: true });
      await page.mouse.move(0, 0);
      await lastEdit.focus();
      expect(await tooltipState(lastEdit)).toMatchObject({ text: "Edit", painted: true, inViewport: true, above: true });
    });
  }
});

// The map's status band under an open right slot (Phase 4 PR 6, finding F-8;
// PHASE2UX §1M.2 "the band spans the canvas, not the slot"; sheet amendment G).
// `.sp-slot-host` is absolute against the map STAGE, which holds the band as well
// as the viewport, so without the band's own push the band's right end — the
// result count and the zoom − / Fit / + group, D2-b's only home for Reset zoom —
// is painted under the slot and unreachable while editing. Hit-tested, not
// structure-tested: the DOM relationship (host inside the column, band its
// sibling) stayed true the whole time the paint overlapped.
const MAP_WIDTHS: Array<[number, number]> = [
  [1920, 1080],
  [820, 900]
];

test.describe("Map band under an open slot", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_ADMIN_EMAIL);
  });

  for (const [width, height] of MAP_WIDTHS) {
    test(`${width}×${height}: the band's zoom control stays hit-testable with the inspector open`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/admin");
      const band = page.locator("[data-map-status-band]");
      await expect(band).toBeVisible();
      const zoomIn = band.locator('button[aria-label="Zoom in"]');
      await expect(zoomIn).toBeVisible();

      // At 820 the band can sit below the fold — scroll it in before hit-testing.
      const hitZoom = async () => zoomIn.evaluate(el => {
        document.scrollingElement!.scrollTop = document.scrollingElement!.scrollHeight;
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          inBand: Boolean(hit?.closest("[data-map-status-band]")),
          inSlot: Boolean(hit?.closest("[data-slot-host]"))
        };
      });

      expect(await hitZoom(), "closed: the zoom control is its own").toEqual({ inBand: true, inSlot: false });
      await expect(band).not.toHaveAttribute("data-slot-open", "");

      await page.locator("button[data-seat-id]").first().dispatchEvent("click");
      await expect(page.locator("#seat-inspector-panel")).toBeVisible();
      await expect(band).toHaveAttribute("data-slot-open", "");
      expect(await hitZoom(), "open: the zoom control must not be under the slot").toEqual({ inBand: true, inSlot: false });

      const clearance = await page.evaluate(() => {
        const zoom = document.querySelector('[data-map-status-band] button[aria-label="Zoom in"]')!.getBoundingClientRect();
        const host = document.querySelector("[data-slot-host][data-open]")!.getBoundingClientRect();
        return Math.round(zoom.right - host.x);
      });
      expect(clearance, "the band's zoom group ends at or before the slot's left edge").toBeLessThanOrEqual(0);

      await page.locator('button[aria-label="Close inspector"]').dispatchEvent("click");
      await expect(page.locator("[data-slot-host][data-open]")).toHaveCount(0);
      await expect(band).not.toHaveAttribute("data-slot-open", "");
      expect(await hitZoom(), "closed again: the band takes its width back").toEqual({ inBand: true, inSlot: false });
    });
  }
});

// The VIEWER carries the same pair — its own RightSlot (the published inspector) and its own band —
// and amendment G was wired there only after a PR 6 tier probe caught it uncovered. Guarded here so
// the surface cannot regress on its own.
test.describe("Viewer band under an open slot", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_ADMIN_EMAIL);
  });

  test("1920×1080 /: the band's zoom control stays hit-testable with the published inspector open", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    const band = page.locator("[data-map-status-band]");
    await expect(band).toBeVisible();
    const zoomIn = band.locator('button[aria-label="Zoom in"]');
    await expect(zoomIn).toBeVisible();
    const hitZoom = async () => zoomIn.evaluate(el => {
      const box = el.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { inBand: Boolean(hit?.closest("[data-map-status-band]")), inSlot: Boolean(hit?.closest("[data-slot-host]")) };
    });

    expect(await hitZoom(), "closed: the zoom control is its own").toEqual({ inBand: true, inSlot: false });
    await expect(band).not.toHaveAttribute("data-slot-open", "");

    await page.locator("button[data-seat-id]").first().dispatchEvent("click");
    await expect(page.locator("#seat-inspector-panel")).toBeVisible();
    await expect(band).toHaveAttribute("data-slot-open", "");
    expect(await hitZoom(), "open: the zoom control must not be under the slot").toEqual({ inBand: true, inSlot: false });
  });
});
