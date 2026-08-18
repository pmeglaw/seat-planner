import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup } from "./helpers/renderComponent.mjs";

// Interaction tests for the real SeatInspector: rendered in jsdom with the
// updateSeatAction server action replaced by a double. Focus is the viewer↔admin
// isolation guardrail (a viewer must never see edit affordances), the close
// callback, the Seat actions verbs' hide-not-disable gating, the disclosure
// sections, and the custom-vs-protected delete guard.
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

// A factory (not a constant) so the seat-action-verb tests below can call it
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
const sectionHeader = bodyId => document.querySelector(`button[aria-controls="${bodyId}"]`);
const openSeatActions = () => act(async () => fireEvent.click(sectionHeader("seat-inspector-actions")));

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
  assert.ok(byLabelPrefix("Assign an employee"), "assign control present");
  assert.equal(byLabelPrefix("Delete custom seat"), null, "delete hidden while Seat actions collapsed");
  await openSeatActions();
  assert.ok(byLabelPrefix("Delete custom seat"), "delete control present");
  // Move/Swap/Vacate are hide-not-disable inside the Seat actions section:
  // with no onMove/onSwap/onVacate handlers wired (as here), no verbs render.
  assert.equal(byLabelPrefix("Swap seat"), null, "no swap handler wired");
  assert.equal(byLabelPrefix("Vacate"), null, "no vacate handler wired");
  assert.equal(byLabelPrefix("Move seat"), null, "no move handler wired");
  assert.equal(byLabelPrefix("Reset"), null, "reset-position never existed here");
});

test("admin mode shows the seat verbs inside Seat actions, gated on handlers", async () => {
  let moved = 0;
  await renderInspector(assignedSeat(), { canEdit: true, onMove: () => { moved += 1; }, onSwap() {}, onVacate() {} });
  await openSeatActions();
  assert.ok(document.querySelector('[aria-label="Move Alice Example to another seat"]'));
  assert.ok(document.querySelector(`[aria-label="Swap ${assignedSeat().label}"]`));
  assert.ok(document.querySelector(`[aria-label="Vacate ${assignedSeat().label}"]`));
  await clickLabel("Move Alice Example to another seat");
  assert.equal(moved, 1);
});

test("an open seat's Seat actions offer Swap only (Move and Vacate hide, not disable)", async () => {
  const seat = makeSeat();
  await renderInspector(seat, { canEdit: true, onMove() {}, onSwap() {}, onVacate() {} });
  await openSeatActions();
  assert.ok(document.querySelector(`[aria-label="Swap ${seat.label}"]`));
  assert.equal(byLabelPrefix("Move "), null);
  assert.equal(byLabelPrefix("Vacate "), null);
});

// Finding 2 (v12 slice 4 final review): the retired canvas action bar
// disabled its verbs on `mutationInFlight || barSeatActions.pending` — a
// mutation started elsewhere (not this inspector instance's own `pending`,
// which is false here) must still block Move/Swap/Vacate.
test("busy disables the Seat actions verbs even while this inspector's own pending is false", async () => {
  const seat = assignedSeat();
  await renderInspector(seat, { canEdit: true, onMove() {}, onSwap() {}, onVacate() {}, busy: true });
  await openSeatActions();
  assert.equal(document.querySelector('[aria-label="Move Alice Example to another seat"]').disabled, true);
  assert.equal(document.querySelector(`[aria-label="Swap ${seat.label}"]`).disabled, true);
  assert.equal(document.querySelector(`[aria-label="Vacate ${seat.label}"]`).disabled, true);
});

test("admin sections toggle independently and reset when the seat changes", async () => {
  const first = assignedSeat();
  const { rerender } = await renderInspector(first, { canEdit: true });
  const headers = () => Array.from(document.querySelectorAll("h3 > button[aria-expanded]")).map(el => el.textContent);
  assert.deepEqual(headers(), ["Contact", "Seat actions", "Notes", "Activity"]);
  // Defaults: Contact open when assigned; the rest collapsed (bodies unmounted).
  assert.equal(sectionHeader("seat-inspector-contact").getAttribute("aria-expanded"), "true");
  assert.equal(sectionHeader("seat-inspector-notes").getAttribute("aria-expanded"), "false");
  assert.equal(document.querySelector('textarea[name="seatNote"]'), null);
  await act(async () => fireEvent.click(sectionHeader("seat-inspector-notes")));
  assert.equal(sectionHeader("seat-inspector-notes").getAttribute("aria-expanded"), "true");
  assert.ok(document.querySelector('textarea[name="seatNote"]'));
  // Independent multi-open, not an accordion: Contact stayed open.
  assert.equal(sectionHeader("seat-inspector-contact").getAttribute("aria-expanded"), "true");
  // New seat → section state resets to defaults (open seat: no Contact, Notes closed).
  const second = makeSeat({ id: "seat-2", label: "S02" });
  await act(async () => rerender(React.createElement(SeatInspector, {
    seat: second, seats: [second], employees: [], departmentOptions: [],
    canEdit: true, collapsed: false, onClose() {}
  })));
  assert.equal(sectionHeader("seat-inspector-contact"), null, "open seat renders no Contact section");
  assert.equal(sectionHeader("seat-inspector-notes").getAttribute("aria-expanded"), "false");
});

test("clicking an open section's header collapses it and unmounts the body", async () => {
  await renderInspector(assignedSeat(), { canEdit: true });
  assert.equal(sectionHeader("seat-inspector-contact").getAttribute("aria-expanded"), "true");
  assert.ok(document.getElementById("seat-inspector-contact"), "open body is mounted");
  await act(async () => fireEvent.click(sectionHeader("seat-inspector-contact")));
  assert.equal(sectionHeader("seat-inspector-contact").getAttribute("aria-expanded"), "false");
  assert.equal(document.getElementById("seat-inspector-contact"), null, "collapsed body unmounts");
});

// Drives the real failure path end to end: a server notes-bounds rejection
// (lib/schemas.ts wording) becomes a notes field error, and activating its
// error-summary entry must open the collapsed Notes section before focusing
// the textarea — focusInspectorField's rAF waits for the body to mount.
test("a notes server error's summary entry auto-opens Notes and focuses the field", async () => {
  const message = "Notes must be 1000 characters or fewer.";
  configureContext({ actions: { updateSeatAction: async () => ({ ok: false, message }) } });
  await renderInspector(makeSeat(), { canEdit: true });
  await openSeatActions();
  const statusSelect = document.querySelector("#seat-inspector-actions select");
  await act(async () => fireEvent.change(statusSelect, { target: { value: "reserved" } }));
  await act(async () => fireEvent.submit(document.getElementById("seat-inspector-form")));
  const summaryEntry = [...document.querySelectorAll('[role="alert"] button')].find(button => button.textContent === message);
  assert.ok(summaryEntry, "notes error appears as a focus entry in the summary");
  assert.equal(sectionHeader("seat-inspector-notes").getAttribute("aria-expanded"), "false", "Notes stayed collapsed through the failed save");
  await act(async () => fireEvent.click(summaryEntry));
  assert.equal(sectionHeader("seat-inspector-notes").getAttribute("aria-expanded"), "true");
  const textarea = document.querySelector('textarea[name="seatNote"]');
  assert.ok(textarea, "Notes body mounted with the textarea");
  // Flush the focus rAF scheduled by focusInspectorField (jsdom pretendToBeVisual).
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(document.activeElement, textarea, "focus lands on the notes field after the section mounts");
});

test("viewer mode renders no sections, no action row, no footer CTA", async () => {
  await renderInspector(assignedSeat());
  assert.equal(document.querySelector("h3 > button[aria-expanded]"), null, "no disclosure headers in viewer");
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
  await openSeatActions();
  assert.ok(byLabelPrefix("Delete custom seat"), "custom seat exposes delete");
  cleanup();

  await renderInspector(makeSeat({ id: "seat-2", label: "W11", is_custom: false }), { canEdit: true, onDeleteSeat() {} });
  await openSeatActions();
  assert.equal(byLabelPrefix("Delete custom seat"), null, "protected original seat hides delete");
});
