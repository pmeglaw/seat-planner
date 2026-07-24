import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup } from "./helpers/renderComponent.mjs";

// Interaction tests for the real SeatInspector: rendered in jsdom with the
// updateSeatAction server action replaced by a double. Focus is the viewer↔admin
// isolation guardrail (a viewer must never see edit affordances), the close /
// collapse callbacks, and the custom-vs-protected delete guard.
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

const assignedSeat = makeSeat({
  status: "assigned",
  employee_id: "emp-1",
  department: "Intake",
  employee: {
    id: "emp-1",
    full_name: "Alice Smith",
    position: "Analyst",
    department: "Intake",
    phone_extension: "123",
    email: null,
    avatar_url: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  }
});

function renderInspector(seat, extra = {}) {
  return renderElement(
    React.createElement(SeatInspector, {
      seat,
      seats: [seat],
      employees: seat.employee ? [seat.employee] : [],
      departmentOptions: [{ id: "d1", name: "Intake", active: true }],
      canEdit: false,
      collapsed: false,
      swapMode: false,
      onClose() {},
      onToggleCollapse() {},
      ...extra
    })
  );
}

const byLabelPrefix = prefix => document.querySelector(`[aria-label^="${prefix}"]`);
const clickLabel = name => act(async () => fireEvent.click(document.querySelector(`[aria-label="${name}"]`)));

test("viewer mode shows the seat's read-only facts", async () => {
  await renderInspector(assignedSeat, { canEdit: false });
  const text = document.body.textContent;
  assert.match(text, /Alice Smith/);
  assert.match(text, /Analyst/);
  assert.match(text, /South Offices/);
  assert.match(text, /Assigned/);
});

test("viewer mode exposes no edit affordances (viewer/admin isolation)", async () => {
  await renderInspector(assignedSeat, { canEdit: false });
  assert.equal(byLabelPrefix("Delete"), null);
  assert.equal(byLabelPrefix("Move seat"), null);
  assert.equal(byLabelPrefix("Swap seat"), null);
  assert.equal(byLabelPrefix("Assign an employee"), null);
  assert.equal(document.querySelectorAll("input, select, textarea").length, 0);
});

test("admin mode exposes the edit affordances", async () => {
  await renderInspector(makeSeat(), { canEdit: true, onDeleteSeat() {}, onStartMoveSeat() {}, onStartSwapSeat() {} });
  assert.ok(byLabelPrefix("Delete custom seat"), "delete control present");
  assert.ok(byLabelPrefix("Move seat"), "move control present");
  assert.ok(byLabelPrefix("Swap seat"), "swap control present");
  assert.ok(byLabelPrefix("Assign an employee"), "assign control present");
});

test("an occupied seat's CTA reads Edit assignment (it opens a form, never acts)", async () => {
  await renderInspector(assignedSeat, { canEdit: true, onDeleteSeat() {}, onStartMoveSeat() {}, onStartSwapSeat() {} });
  assert.ok(byLabelPrefix("Edit assignment"), "occupied-seat CTA is an edit verb");
  assert.equal(byLabelPrefix("Change assignment"), null, "old ambiguous label retired");
});

test("Contact section never repeats Department — the header role line carries it", async () => {
  await renderInspector(assignedSeat, { canEdit: true, onDeleteSeat() {}, onStartMoveSeat() {}, onStartSwapSeat() {} });
  const factLabels = [...document.querySelectorAll("dt")].map(dt => dt.textContent);
  assert.ok(!factLabels.includes("Department"), "no duplicate Department fact row");
});

test("the close button invokes onClose", async () => {
  let closed = 0;
  await renderInspector(assignedSeat, { onClose: () => (closed += 1) });
  await clickLabel("Close inspector");
  assert.equal(closed, 1);
});

test("the collapse button invokes onToggleCollapse", async () => {
  let toggled = 0;
  await renderInspector(assignedSeat, { onToggleCollapse: () => (toggled += 1) });
  await clickLabel("Collapse inspector");
  assert.equal(toggled, 1);
});

test("a custom draft seat can be deleted; a protected original seat cannot", async () => {
  await renderInspector(makeSeat({ is_custom: true }), { canEdit: true, onDeleteSeat() {} });
  assert.ok(byLabelPrefix("Delete custom seat"), "custom seat exposes delete");
  cleanup();

  await renderInspector(makeSeat({ id: "seat-2", label: "W11", is_custom: false }), { canEdit: true, onDeleteSeat() {} });
  assert.equal(byLabelPrefix("Delete custom seat"), null, "protected original seat hides delete");
});
