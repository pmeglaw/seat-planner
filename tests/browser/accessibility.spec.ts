import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mountSeatMap } from "./harness";
// Shared with the e2e tier so both report violations in the same readable form.
import { formatAxeViolations, WCAG_A_AA_TAGS } from "../e2e/axe-helpers";

// Structural accessibility scan of the real SeatMap.
//
// This is the only tier that can mount SeatMap at all — jsdom's zero-size
// geometry makes its layout loop never converge — so it is the only place the
// map's own ARIA can be checked against a live accessibility tree rather than
// against source text.
//
// IMPORTANT: the harness ships no Tailwind CSS (see tests/browser/harness.ts),
// so every colour rule is meaningless here — nothing is painted and nothing is
// hidden. `color-contrast` is therefore disabled, and contrast is covered
// instead by the e2e tier, which runs against the real built app with real
// styles. What survives is the CSS-independent half of axe, and it is the half
// the source guardrails cannot reach: accessible names, role validity, ARIA
// references that must resolve to a real element, nested interactives,
// duplicate ids.
//
// Scanning an unstyled tree also scans controls that real CSS would hide, which
// is stricter than production, not laxer — a hidden control with no accessible
// name still fails here.
const CSS_DEPENDENT_RULES = ["color-contrast"];

const alice = {
  id: "emp-1",
  full_name: "Alice Smith",
  position: "Analyst",
  department: "Intake",
  phone_extension: "123",
  email: null,
  avatar_url: null,
  active: true,
  created_at: "",
  updated_at: ""
};

function seat(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    seat_key: "n01",
    label: "N01",
    x: 0.3,
    y: 0.2,
    status: "available",
    layer: "draft",
    employee_id: null,
    department: null,
    zone: "North Pod",
    notes: null,
    is_custom: false,
    created_at: "",
    updated_at: "",
    employee: null,
    ...overrides
  };
}

const n01 = seat({
  id: "s1",
  seat_key: "n01",
  label: "N01",
  status: "assigned",
  employee_id: "emp-1",
  department: "Intake",
  employee: alice
});
const n02 = seat({ id: "s2", seat_key: "n02", label: "N02", x: 0.5, y: 0.4 });
const custom = seat({ id: "s3", seat_key: "s01", label: "S01", x: 0.6, y: 0.5, is_custom: true });

// Not enabled here: label-content-name-mismatch (WCAG 2.5.3, Label in Name).
// It ships EXPERIMENTAL in axe-core — `enabled: false`, so a tag filter alone
// never runs it, which is why every axe tier stayed green while the Ask Planner
// trigger shipped a real 2.5.3 violation that only Lighthouse caught. Turning
// it on in THIS tier was tried and reverted: the harness ships no Tailwind, so
// controls that production hides (rail labels at opacity-0) and glyph-only
// controls (the account avatar's single initial) all read as visible label
// text, and the rule fires on four elements that are fine in the real app.
// It belongs in a tier with real CSS — see the note in the PR.
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).disableRules(CSS_DEPENDENT_RULES).analyze();

test("the viewer map has no structural WCAG A/AA violations", async ({ page }) => {
  await mountSeatMap(page, { seats: [n01, n02], employees: [alice], canEdit: false });
  await expect(page.locator('button[aria-label*="Open details"]')).toHaveCount(2);

  const { violations } = await scan(page);
  expect(formatAxeViolations(violations)).toEqual([]);
});

test("the admin map with an open inspector has no structural WCAG A/AA violations", async ({ page }) => {
  await mountSeatMap(page, { seats: [custom, n01], employees: [alice], canEdit: true });
  // dispatchEvent, not click: the harness ships no CSS, so markers are not
  // positioned for hit-testing (same reason as tests/browser/seat-map.spec.ts).
  await page.locator('button[aria-label^="S01"]').first().dispatchEvent("click");
  await expect(page.locator('[aria-label="Close inspector"]')).toBeAttached();

  const { violations } = await scan(page);
  expect(formatAxeViolations(violations)).toEqual([]);
});

// Dialogs are the highest-risk a11y surface in the app and the one the source
// guardrails watch most closely — this checks the live tree agrees: the dialog
// carries a resolvable accessible name and holds no invalid ARIA.
test("the discard-confirm dialog has no structural WCAG A/AA violations", async ({ page }) => {
  await mountSeatMap(page, { seats: [custom], employees: [], canEdit: true, publishedSeats: [] });

  // v12: the trigger lives in the header kebab now, not the publish review
  // dialog — open the kebab, then its "Discard draft changes" item (enabled
  // here since `custom` has no published counterpart, so hasChanges is true).
  await page.getByRole("button", { name: "More tools" }).dispatchEvent("click");
  await page.getByRole("button", { name: "Discard draft changes" }).dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: /Discard all draft changes/ })).toBeAttached();

  const { violations } = await scan(page);
  expect(formatAxeViolations(violations)).toEqual([]);
});
