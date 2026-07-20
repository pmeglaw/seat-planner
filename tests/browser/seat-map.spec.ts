import { test, expect, type Page } from "@playwright/test";
import { mountSeatMap } from "./harness";

// SeatMap composition tests in a real browser: mount the real component, then
// drive its markers/inspector and assert the wiring jsdom can't reach (SeatMap's
// layout loop never converges there). Clicks use dispatchEvent because the
// harness ships no CSS, so markers aren't positioned for hit-testing.

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

const n01 = seat({ id: "s1", seat_key: "n01", label: "N01", status: "assigned", employee_id: "emp-1", department: "Intake", employee: alice });
const n02 = seat({ id: "s2", seat_key: "n02", label: "N02", x: 0.5, y: 0.4 });
const custom = seat({ id: "s3", seat_key: "cw01", label: "CW01", x: 0.6, y: 0.5, is_custom: true });

const marker = (page: Page, label: string) => page.locator(`button[aria-label^="${label}"]`).first();
const clickMarker = (page: Page, label: string) => marker(page, label).dispatchEvent("click");

test("renders a marker for every seat", async ({ page }) => {
  await mountSeatMap(page, { seats: [n01, n02], employees: [alice], canEdit: false });
  await expect(page.locator('button[aria-label*="Open details"]')).toHaveCount(2);
  await expect(marker(page, "N01")).toBeAttached();
  await expect(marker(page, "N02")).toBeAttached();
});

test("clicking a seat selects it and opens the inspector with the occupant's details", async ({ page }) => {
  await mountSeatMap(page, { seats: [n01, n02], employees: [alice], canEdit: false });
  await clickMarker(page, "N01");
  await expect(marker(page, "N01")).toHaveAttribute("aria-pressed", "true");
  // The harness ships no CSS, so assert on presence (DOM), not paint-visibility.
  await expect(page.getByText("Alice Smith").first()).toBeAttached();
  await expect(page.getByText("123").first()).toBeAttached();
  await expect(page.locator('[aria-label="Close inspector"]')).toBeAttached();
});

test("selecting another seat swaps the inspector content", async ({ page }) => {
  await mountSeatMap(page, { seats: [n01, n02], employees: [alice], canEdit: false });
  await clickMarker(page, "N01");
  await expect(page.getByText("Alice Smith").first()).toBeAttached();

  await clickMarker(page, "N02");
  await expect(marker(page, "N02")).toHaveAttribute("aria-pressed", "true");
  await expect(marker(page, "N01")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Alice Smith")).toHaveCount(0);
});

test("closing the inspector clears the selection", async ({ page }) => {
  await mountSeatMap(page, { seats: [n01, n02], employees: [alice], canEdit: false });
  await clickMarker(page, "N01");
  await expect(page.locator('[aria-label="Close inspector"]')).toBeAttached();

  await page.locator('[aria-label="Close inspector"]').dispatchEvent("click");
  await expect(marker(page, "N01")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Alice Smith")).toHaveCount(0);
});

test("a viewer sees no edit affordances in the inspector", async ({ page }) => {
  await mountSeatMap(page, { seats: [custom], employees: [], canEdit: false });
  await clickMarker(page, "CW01");
  await expect(page.locator('[aria-label="Close inspector"]')).toBeAttached();
  await expect(page.locator('[aria-label^="Delete"]')).toHaveCount(0);
  await expect(page.locator('[aria-label^="Move seat"]')).toHaveCount(0);
  await expect(page.locator('[aria-label^="Swap seat"]')).toHaveCount(0);
});

test("an admin sees the edit affordances for a custom draft seat", async ({ page }) => {
  await mountSeatMap(page, { seats: [custom], employees: [], canEdit: true });
  await clickMarker(page, "CW01");
  await expect(page.locator('[aria-label^="Delete custom seat"]')).toBeAttached();
  await expect(page.locator('[aria-label^="Move seat"]')).toBeAttached();
  await expect(page.locator('[aria-label^="Swap seat"]')).toBeAttached();
});
