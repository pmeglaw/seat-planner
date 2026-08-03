import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup } from "./helpers/renderComponent.mjs";

// Interaction tests for the real SeatInspector: rendered in jsdom with the
// updateSeatAction server action replaced by a double. Focus is the viewer↔admin
// isolation guardrail (a viewer must never see edit affordances), the close
// callback, the icon action row's hide-not-disable gating, the tabs, and the
// custom-vs-protected delete guard.
let SeatInspector;
before(async () => {
  ({ SeatInspector } = await loadComponent("@/components/seat-map/SeatInspector"));
});
beforeEach(() => {
  configureContext({ actions: { updateSeatAction: async () => ({ ok: true, seat: {} }) } });
});
afterEach(() => cleanup());

function makeSeat(overrides = {}) {
  return {
    id: "seat-1",
    // A legitimately deletable custom label (S-zone): the delete gate now
    // also excludes protected-original labels regardless of is_custom.
    seat_key: "s01",
    label: "S01",
    x: 0.3,
    y: 0.3,
    status: "available",
    layer: "draft",
    employee_id: null,
    department: null,
    zone: "South Offices",
    notes: null,
    is_custom: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    employee: null,
    ...overrides
  };
}

// A factory (not a constant) so the icon-action-row tests below can call it
// per-assertion — the employee is named "Alice Example" to match the
// existing "Move ... to another seat" aria-label convention already
// established for this exact button shape in seat-map-components.test.mjs.
function assignedSeat(overrides = {}) {
  return makeSeat({
    status: "assigned",
    employee_id: "emp-1",
    department: "Intake",
    employee: {
      id: "emp-1",
      full_name: "Alice Example",
      position: "Analyst",
      department: "Intake",
      phone_extension: "123",
      email: null,
      avatar_url: null,
      active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    },
    ...overrides
  });
}

function renderInspector(seat, extra = {}) {
  return renderElement(
    React.createElement(SeatInspector, {
      seat,
      seats: [seat],
      employees: seat.employee ? [seat.employee] : [],
      departmentOptions: [{ id: "d1", name: "Intake", active: true }],
      canEdit: false,
      collapsed: false,
      onClose() {},
      ...extra
    })
  );
}

const byLabelPrefix = prefix => document.querySelector(`[aria-label^="${prefix}"]`);
const clickLabel = name => act(async () => fireEvent.click(document.querySelector(`[aria-label="${name}"]`)));

test("viewer mode shows the seat's read-only facts", async () => {
  await renderInspector(assignedSeat(), { canEdit: false });
  const text = document.body.textContent;
  assert.match(text, /Alice Example/);
  assert.match(text, /Analyst/);
  assert.match(text, /South Offices/);
  assert.match(text, /Assigned/);
});

test("viewer mode exposes no edit affordances (viewer/admin isolation)", async () => {
  await renderInspector(assignedSeat(), { canEdit: false });
  assert.equal(byLabelPrefix("Delete"), null);
  assert.equal(byLabelPrefix("Move seat"), null);
  assert.equal(byLabelPrefix("Swap seat"), null);
  assert.equal(byLabelPrefix("Assign an employee"), null);
  assert.equal(document.querySelectorAll("input, select, textarea").length, 0);
});

test("admin mode exposes the edit affordances", async () => {
  await renderInspector(makeSeat(), { canEdit: true, onDeleteSeat() {} });
  assert.ok(byLabelPrefix("Delete custom seat"), "delete control present");
  assert.ok(byLabelPrefix("Assign an employee"), "assign control present");
  // Move/Swap/Vacate are hide-not-disable on the icon action row: with no
  // onMove/onSwap/onVacate handlers wired (as here), the row renders nothing.
  // See the gated-handler tests below for the row itself.
  assert.equal(byLabelPrefix("Swap seat"), null, "no swap handler wired");
  assert.equal(byLabelPrefix("Vacate"), null, "no vacate handler wired");
  assert.equal(byLabelPrefix("Move seat"), null, "no move handler wired");
  assert.equal(byLabelPrefix("Reset"), null, "reset-position never existed here");
});

test("admin mode shows the icon action row for an occupied seat, gated on handlers", async () => {
  let moved = 0;
  await renderInspector(assignedSeat(), { canEdit: true, onMove: () => { moved += 1; }, onSwap() {}, onVacate() {} });
  assert.ok(document.querySelector('[aria-label="Move Alice Example to another seat"]'));
  assert.ok(document.querySelector(`[aria-label="Swap ${assignedSeat().label}"]`));
  assert.ok(document.querySelector(`[aria-label="Vacate ${assignedSeat().label}"]`));
  await clickLabel("Move Alice Example to another seat");
  assert.equal(moved, 1);
});

test("an open seat's action row offers Swap only (Move and Vacate hide, not disable)", async () => {
  const seat = makeSeat();
  await renderInspector(seat, { canEdit: true, onMove() {}, onSwap() {}, onVacate() {} });
  assert.ok(document.querySelector(`[aria-label="Swap ${seat.label}"]`));
  assert.equal(byLabelPrefix("Move "), null);
  assert.equal(byLabelPrefix("Vacate "), null);
});

// Finding 2 (v12 slice 4 final review): the retired canvas action bar
// disabled its verbs on `mutationInFlight || barSeatActions.pending` — a
// mutation started elsewhere (not this inspector instance's own `pending`,
// which is false here) must still block Move/Swap/Vacate.
test("busy disables the icon action row even while this inspector's own pending is false", async () => {
  const seat = assignedSeat();
  await renderInspector(seat, { canEdit: true, onMove() {}, onSwap() {}, onVacate() {}, busy: true });
  assert.equal(document.querySelector('[aria-label="Move Alice Example to another seat"]').disabled, true);
  assert.equal(document.querySelector(`[aria-label="Swap ${seat.label}"]`).disabled, true);
  assert.equal(document.querySelector(`[aria-label="Vacate ${seat.label}"]`).disabled, true);
});

test("admin tabs switch panels and reset to Overview when the seat changes", async () => {
  const first = assignedSeat();
  const { rerender } = await renderInspector(first, { canEdit: true });
  const tabs = () => Array.from(document.querySelectorAll('[role="tab"]')).map(el => el.textContent);
  assert.deepEqual(tabs(), ["Overview", "Notes", "Activity"]);
  const notesTab = Array.from(document.querySelectorAll('[role="tab"]')).find(el => el.textContent === "Notes");
  await act(async () => fireEvent.click(notesTab));
  assert.equal(notesTab.getAttribute("aria-selected"), "true");
  assert.ok(document.querySelector('textarea[name="seatNote"]'));
  // New seat → tab state resets to Overview.
  const second = makeSeat({ id: "seat-2", label: "S02" });
  await act(async () => rerender(React.createElement(SeatInspector, {
    seat: second, seats: [second], employees: [], departmentOptions: [],
    canEdit: true, collapsed: false, onClose() {}
  })));
  const overviewTab = Array.from(document.querySelectorAll('[role="tab"]')).find(el => el.textContent === "Overview");
  assert.equal(overviewTab.getAttribute("aria-selected"), "true");
});

test("viewer mode renders no tabs, no action row, no footer CTA", async () => {
  await renderInspector(assignedSeat());
  assert.equal(document.querySelector('[role="tablist"]'), null);
  assert.equal(byLabelPrefix("Move "), null);
  assert.equal(byLabelPrefix("Vacate "), null);
  assert.equal(byLabelPrefix("Edit assignment for"), null);
  assert.equal(byLabelPrefix("Assign an employee to"), null);
});

test("collapsed renders nothing at all (the rail and pill are retired)", async () => {
  await renderInspector(assignedSeat(), { canEdit: true, collapsed: true });
  assert.equal(document.getElementById("seat-inspector-panel"), null);
  assert.equal(document.body.textContent.includes("VIEW DETAILS"), false);
});

test("an occupied seat's CTA reads Edit assignment (it opens a form, never acts)", async () => {
  await renderInspector(assignedSeat(), { canEdit: true, onDeleteSeat() {} });
  assert.ok(byLabelPrefix("Edit assignment"), "occupied-seat CTA is an edit verb");
  assert.equal(byLabelPrefix("Change assignment"), null, "old ambiguous label retired");
});

test("Contact section never repeats Department — the header role line carries it", async () => {
  await renderInspector(assignedSeat(), { canEdit: true, onDeleteSeat() {} });
  const factLabels = [...document.querySelectorAll("dt")].map(dt => dt.textContent);
  assert.ok(!factLabels.includes("Department"), "no duplicate Department fact row");
});

test("the close button invokes onClose", async () => {
  let closed = 0;
  await renderInspector(assignedSeat(), { onClose: () => (closed += 1) });
  await clickLabel("Close inspector");
  assert.equal(closed, 1);
});

test("a custom draft seat can be deleted; a protected original seat cannot", async () => {
  await renderInspector(makeSeat({ is_custom: true }), { canEdit: true, onDeleteSeat() {} });
  assert.ok(byLabelPrefix("Delete custom seat"), "custom seat exposes delete");
  cleanup();

  await renderInspector(makeSeat({ id: "seat-2", label: "W11", is_custom: false }), { canEdit: true, onDeleteSeat() {} });
  assert.equal(byLabelPrefix("Delete custom seat"), null, "protected original seat hides delete");
});
