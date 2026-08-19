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
// A legitimately deletable custom seat: S-zone label — NOT a protected-
// original label, which the delete gate now also guards against.
const custom = seat({ id: "s3", seat_key: "s01", label: "S01", x: 0.6, y: 0.5, is_custom: true });
// South Offices seat whose SAVED coords transform into the left room's
// measured VISUAL rect (0.1066, 0.902 → visual ≈ 0.170, 0.955, computed by
// inverting the real calibration with the FULL seat as source — a bare
// zone/label source resolves a different area) — drives the office room wash.
const officeAssigned = seat({
  id: "s4",
  seat_key: "s02",
  label: "S02",
  x: 0.1066,
  y: 0.902,
  zone: "South Offices",
  status: "assigned",
  employee_id: "emp-1",
  is_custom: true,
  employee: alice
});

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

test("an assigned office seat washes its room; an open one does not", async ({ page }) => {
  await mountSeatMap(page, { seats: [officeAssigned, n02], employees: [alice], canEdit: false });
  await expect(page.locator('[data-office-wash="south-office-1"]')).toBeAttached();
  await expect(page.locator('[data-office-wash="south-office-2"]')).toHaveCount(0);
});

test("an open office seat leaves the room unwashed", async ({ page }) => {
  const officeOpen = { ...officeAssigned, status: "available", employee_id: null, employee: null };
  await mountSeatMap(page, { seats: [officeOpen], employees: [], canEdit: false });
  await expect(marker(page, "S02")).toBeAttached();
  await expect(page.locator("[data-office-wash]")).toHaveCount(0);
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
  await clickMarker(page, "S01");
  await expect(page.locator('[aria-label="Close inspector"]')).toBeAttached();
  await expect(page.locator('[aria-label^="Delete"]')).toHaveCount(0);
  // The canvas action bar (and its `data-seat-action-bar` attribute) is gone
  // from the codebase entirely (v12 slice 4) — the reseat verbs live in the
  // inspector's icon action row now, canEdit-gated internally. Nothing can
  // ever match this selector again; the assertion just guards against the
  // attribute being reintroduced.
  await expect(page.locator('[data-seat-action-bar]')).toHaveCount(0);
});

// `custom` (S01) is an OPEN seat (status "available", no employee_id), so the
// icon action row's occupied-only verbs (Move, Vacate) don't apply here — only
// the footer's assignment CTA and the row's Swap button render.
test("an admin sees the edit affordances for a custom draft seat", async ({ page }) => {
  await mountSeatMap(page, { seats: [custom], employees: [], canEdit: true });
  await clickMarker(page, "S01");
  // Delete and Swap live in the collapsed Seat actions section — expand it first.
  const actionsHeader = page.locator('button[aria-controls="seat-inspector-actions"]');
  await expect(actionsHeader).toBeAttached();
  await actionsHeader.dispatchEvent("click");
  await expect(page.locator('[aria-label^="Delete custom seat"]')).toBeAttached();
  // The assign affordance now has a single source (the inspector's footer
  // CTA) — the canvas bar that duplicated it is retired, so the name is
  // unique and the locator no longer needs `.first()`.
  await expect(page.locator('[aria-label^="Assign an employee to"]')).toBeAttached();
  await expect(page.locator('[aria-label^="Swap "]')).toBeAttached();
});

// SI-01: a successful save unmounts the commit bar (and the Save button the
// keyboard user just activated); focus must land on the re-mounted primary
// CTA, not fall to <body>. The CTA cannot mount until the transition commit
// flips `pending` false, so a focus scheduled on a single frame loses
// whenever that commit takes longer than a frame — 20x CPU throttle makes
// the loss deterministic (unthrottled, this tiny harness wins the race and
// masks the bug). Real browser only: jsdom has no frame timing to lose to.
test("a successful save hands focus to the re-mounted primary CTA", async ({ page }) => {
  const saved = { ...n02, status: "assigned", employee_id: "emp-1", department: "Intake", employee: alice, updated_at: "2026-01-02T00:00:00Z" };
  await mountSeatMap(page, { seats: [n02], employees: [alice], canEdit: true }, {
    responses: { "action:updateSeatAction": () => ({ ok: true, seat: saved }) }
  });
  await clickMarker(page, "N02");
  await page.locator('[aria-label^="Assign an employee to"]').dispatchEvent("click");
  await expect(page.locator("#seat-inspector-form input").first()).toBeAttached();
  // Fill the employee name through React's controlled-input path (native
  // setter + bubbling input, per the harness's no-CSS rules).
  await page.evaluate(() => {
    const field = [...document.querySelectorAll("input")].find(input => input.closest("label")?.textContent?.includes("Employee name"));
    if (!field) throw new Error("employee input not found");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(field, "Alice Smith");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = page.locator('#seat-inspector-commit-bar button[type="submit"]');
  await expect(save).toBeAttached();
  await save.evaluate(el => (el as HTMLElement).focus());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  try {
    await save.dispatchEvent("click");
    // The save lands and the commit bar unmounts...
    await expect(page.locator("#seat-inspector-commit-bar")).toHaveCount(0, { timeout: 15000 });
    // ...and the keyboard user's focus follows to the primary CTA.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? "none"), { timeout: 15000 })
      .toBe("Edit assignment for N02");
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
});

// Edit the notes field through React's controlled-input path so the inspector
// reports dirty (native setter + bubbling input, per the harness's no-CSS rules).
async function dirtyInspectorNotes(page: Page) {
  await clickMarker(page, "S01");
  // Progressive sections: the notes textarea lives in the Notes section,
  // collapsed by default — expand it before reaching for the field.
  const notesHeader = page.locator('button[aria-controls="seat-inspector-notes"]');
  await expect(notesHeader).toBeAttached();
  await notesHeader.dispatchEvent("click");
  await expect(page.locator("textarea").first()).toBeAttached();
  await page.evaluate(() => {
    const field = document.querySelector("textarea");
    if (!field) throw new Error("notes textarea not found");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(field, "unsaved note");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

test("a dirty inspector intercepts the viewer link with the unsaved-edits dialog", async ({ page }) => {
  await mountSeatMap(page, { seats: [custom], employees: [], canEdit: true });
  await dirtyInspectorNotes(page);

  // AppRail's Viewer item is a <Link> (prefetch + pre-hydration nav); the
  // onNavigate guard intercepts it via preventDefault in the item's onClick.
  await page.locator('a[aria-label="Open viewer surface"]').dispatchEvent("click");
  await expect(page.locator("#inspector-unsaved-title")).toBeAttached();
  // The click must not have navigated the harness away.
  expect(page.url()).toContain("harness.html");
});

test("selecting a seat writes ?seat= to the URL and deselecting clears it", async ({ page }) => {
  await mountSeatMap(page, { seats: [n01, n02], employees: [alice], canEdit: false });

  await clickMarker(page, "N01");
  await expect(marker(page, "N01")).toHaveAttribute("aria-pressed", "true");
  expect(page.url()).toContain("seat=N01");

  await page.locator('[aria-label="Close inspector"]').dispatchEvent("click");
  await expect(marker(page, "N01")).toHaveAttribute("aria-pressed", "false");
  expect(page.url()).not.toContain("seat=");
});

test("a ?seat= URL selects that seat on load, case-insensitively", async ({ page }) => {
  await mountSeatMap(page, { seats: [n01, n02], employees: [alice], canEdit: false }, { query: "?seat=n02" });
  await expect(marker(page, "N02")).toHaveAttribute("aria-pressed", "true");
  // The param survives the mount round-trip instead of being stripped.
  expect(page.url()).toContain("seat=");
});

test("a dirty inspector arms a beforeunload warning; a clean one does not", async ({ page }) => {
  await mountSeatMap(page, { seats: [custom], employees: [], canEdit: true });

  const fire = () =>
    page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });

  expect(await fire()).toBe(false);
  await dirtyInspectorNotes(page);
  expect(await fire()).toBe(true);
});

// Regression for plan 002: a failed discard must surface its error INSIDE
// the discard-confirm dialog, not swallow it or leave only the generic
// top-of-canvas banner. This is also the first browser-tier spec combining
// canEdit:true with a rejected action — exercising the auth.getUser()
// session-expiry probe (SeatMap.tsx) that the harness's supabase client mock
// previously had no stub for.
test("a failed discard surfaces its error inside the discard dialog (002)", async ({ page }) => {
  await mountSeatMap(page, { seats: [custom], employees: [], canEdit: true, publishedSeats: [] }, {
    responses: { "action:resetDraftToPublishedAction": () => { throw new Error("Server error"); } }
  });

  // v12: the discard trigger lives in the header kebab, not the publish
  // review dialog. custom has no published counterpart, so it reads as an
  // "added" draft change (hasChanges true) and the kebab's "Discard draft
  // changes" item is enabled.
  await page.getByRole("button", { name: "More tools" }).dispatchEvent("click");
  await page.getByRole("button", { name: "Discard draft changes" }).dispatchEvent("click");
  await page.getByRole("button", { name: "Discard everything" }).dispatchEvent("click");

  const dialog = page.getByRole("dialog", { name: /Discard all draft changes/ });
  await expect(dialog).toBeAttached();                             // dialog stayed open on failure (not swallowed)
  await expect(dialog.getByRole("alert")).toBeAttached();          // the error renders INSIDE the dialog — plan 002's core fix
  await expect(dialog.getByText(/Server error/)).toBeAttached();   // ...carrying the action's error text

  // The confirm button relabels to "Retry discard" once useTransition's
  // `pending` clears — which it now does: SeatMap no longer re-renders forever
  // when the option props are omitted (T-05).
  await expect(dialog.getByRole("button", { name: "Retry discard" })).toBeAttached();
});

// v12 slice 5: the publish review is a unified per-seat diff table. `custom`
// with an empty published layer reads as one Added change, which renders the
// contract-#4 publish cluster whose entry button opens the review.
test("the publish review lists per-seat diff rows with change tags", async ({ page }) => {
  await mountSeatMap(page, { seats: [custom], employees: [], canEdit: true, publishedSeats: [] });

  await page.getByRole("button", { name: /unpublished change/ }).dispatchEvent("click");

  const dialog = page.getByRole("dialog", { name: "Review draft before publishing" });
  await expect(dialog).toBeAttached();
  await expect(dialog.getByText("Published now")).toBeAttached();
  await expect(dialog.getByText("After publish")).toBeAttached();
  await expect(dialog.getByText("S01", { exact: true })).toBeAttached();
  await expect(dialog.getByText("Added", { exact: true })).toBeAttached();
  await expect(dialog.getByText("1 seat change", { exact: true })).toBeAttached();
});

// --- Status band (Option A parity with the viewer, 2026-08-17) ---------------
// The admin map folds its floating legend + zoom stack into the same in-flow
// bottom band the viewer shipped in v1.45.0. Real-browser tier because SeatMap
// never mounts in jsdom and the tiers are matchMedia-driven; presence-based
// assertions because the harness ships no CSS.
test("the status band is the admin map's one zoom home and yields to the sheet", async ({ page }) => {
  await mountSeatMap(page, { seats: [n01, n02], employees: [alice], canEdit: true });
  const band = page.locator("[data-map-status-band]");
  await expect(band).toBeAttached();
  await expect(band.locator('ul[aria-label="Seat status legend"]')).toBeAttached();
  // The scrollable informational region must be keyboard-operable on its own —
  // at rest it holds only text, so without tabindex a keyboard user can never
  // scroll clipped counts into view (axe scrollable-region-focusable, caught
  // by the e2e-auth viewer scan on #408).
  await expect(band.locator('[data-band-scroll-region]')).toHaveAttribute("tabindex", "0");
  // toHaveCount(1) doubles as the one-zoom-home assertion: the floating stack
  // must not render alongside the band.
  await expect(page.locator('button[aria-label="Zoom in"]')).toHaveCount(1);
  await expect(band.locator('button[aria-label="Zoom in"]')).toBeAttached();

  // Below the panel tier the inspector is a bottom sheet and the band yields.
  await page.setViewportSize({ width: 820, height: 900 });
  await clickMarker(page, "N01");
  await expect(page.locator("#seat-inspector-panel")).toBeAttached();
  await expect(band).not.toBeAttached();
  await page.locator('button[aria-label="Close inspector"]').dispatchEvent("click");
  await expect(band).toBeAttached();

  // Phones: no band, the floating zoom stack returns (owner call 2026-08-17).
  await page.setViewportSize({ width: 500, height: 850 });
  await expect(band).not.toBeAttached();
  await expect(page.locator('button[aria-label="Zoom in"]')).toHaveCount(1);
});

test("the inspector's panel-tier band clearance follows the band, not the floor it left", async ({ page }) => {
  await mountSeatMap(page, { seats: [n01, n02], employees: [alice], canEdit: true });
  await clickMarker(page, "N01");
  const inspector = page.locator("#seat-inspector-panel");
  // Floor 3: the band renders, so the docked panel clears it (52px).
  await expect(inspector).toHaveClass(/panel:bottom-\[52px\]/);

  // Switch to Floor 2: the selection survives, the band does not — the
  // clearance must fall back to the stock 12px gutter, not hold a 52px gap
  // above nothing.
  // Two FloorSelector variants mount (chrome bar + canvas) — either menu works.
  await page.locator('button[aria-label^="Change floor"]').first().dispatchEvent("click");
  await page.getByRole("menuitemradio", { name: /Floor 2/ }).first().dispatchEvent("click");
  await expect(page.locator("[data-map-status-band]")).not.toBeAttached();
  await expect(inspector).toHaveClass(/panel:bottom-3/);
});
