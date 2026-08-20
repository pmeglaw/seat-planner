import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup } from "./helpers/renderComponent.mjs";

// Interaction tests for the real SeatInspector: rendered in jsdom with the
// updateSeatAction server action replaced by a double. Focus is the viewer↔admin
// isolation guardrail (a viewer must never see edit affordances), the close
// callback, the Seat actions verbs' hide-not-disable gating, the flat
// always-mounted sections (2026-08-19 Carbon handoff — supersedes the
// 2026-08-18 progressive disclosure), the contact copy/mailto affordances,
// and the custom-vs-protected delete guard.
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
  // Flat sections (2026-08-19): delete is visible without any toggle.
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
  assert.ok(document.querySelector('[aria-label="Move Alice Example to another seat"]'));
  assert.ok(document.querySelector(`[aria-label="Swap ${assignedSeat().label}"]`));
  assert.ok(document.querySelector(`[aria-label="Vacate ${assignedSeat().label}"]`));
  await clickLabel("Move Alice Example to another seat");
  assert.equal(moved, 1);
});

test("an open seat's Seat actions offer Swap only (Move and Vacate hide, not disable)", async () => {
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
test("busy disables the Seat actions verbs even while this inspector's own pending is false", async () => {
  const seat = assignedSeat();
  await renderInspector(seat, { canEdit: true, onMove() {}, onSwap() {}, onVacate() {}, busy: true });
  assert.equal(document.querySelector('[aria-label="Move Alice Example to another seat"]').disabled, true);
  assert.equal(document.querySelector(`[aria-label="Swap ${seat.label}"]`).disabled, true);
  assert.equal(document.querySelector(`[aria-label="Vacate ${seat.label}"]`).disabled, true);
});

// 2026-08-19 Carbon handoff (owner-approved, supersedes the 2026-08-18
// progressive disclosure): every section is flat and always mounted — no
// aria-expanded toggles, bodies never unmount, dividers carry the grouping.
test("admin sections render flat and always mounted, in handoff order", async () => {
  await renderInspector(assignedSeat(), { canEdit: true, onDeleteSeat() {} });
  // Boolean form, never assert.equal(element, null): a failing equal on a
  // jsdom node makes the assertion differ inspect/diff the whole DOM graph,
  // which spins the CPU until the runner is killed.
  assert.ok(!document.querySelector('button[aria-controls="seat-inspector-contact"]'), "no Contact toggle");
  assert.ok(!document.querySelector('button[aria-controls="seat-inspector-notes"]'), "no Notes toggle");
  assert.ok(document.getElementById("seat-inspector-contact"), "Contact body mounted");
  assert.ok(document.getElementById("seat-inspector-actions"), "Seat actions body mounted");
  assert.ok(document.getElementById("seat-inspector-notes"), "Notes body mounted");
  assert.ok(document.getElementById("seat-inspector-activity"), "Activity body mounted");
  assert.ok(document.querySelector('textarea[name="seatNote"]'), "notes textarea mounted without a toggle");
  const order = ["seat-inspector-contact", "seat-inspector-actions", "seat-inspector-notes", "seat-inspector-activity"]
    .map(id => document.getElementById(id));
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(
      order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      "sections keep the handoff order"
    );
  }
});

test("an open seat renders no Contact section (nobody to reach)", async () => {
  await renderInspector(makeSeat(), { canEdit: true });
  assert.equal(document.getElementById("seat-inspector-contact"), null);
  assert.ok(document.getElementById("seat-inspector-notes"), "other sections still mounted");
});

// Drives the real failure path end to end: a server notes-bounds rejection
// (lib/schemas.ts wording) becomes a notes field error whose error-summary
// entry focuses the always-mounted textarea directly.
test("a notes server error's summary entry focuses the notes field", async () => {
  const message = "Notes must be 1000 characters or fewer.";
  configureContext({ actions: { updateSeatAction: async () => ({ ok: false, message }) } });
  await renderInspector(makeSeat(), { canEdit: true });
  const statusSelect = document.querySelector("#seat-inspector-actions select");
  await act(async () => fireEvent.change(statusSelect, { target: { value: "reserved" } }));
  await act(async () => fireEvent.submit(document.getElementById("seat-inspector-form")));
  const summaryEntry = [...document.querySelectorAll('[role="alert"] button')].find(button => button.textContent === message);
  assert.ok(summaryEntry, "notes error appears as a focus entry in the summary");
  await act(async () => fireEvent.click(summaryEntry));
  const textarea = document.querySelector('textarea[name="seatNote"]');
  // Flush the focus rAF scheduled by focusInspectorField (jsdom pretendToBeVisual).
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(document.activeElement, textarea, "focus lands on the notes field");
});

test("contact email renders as a mailto link in both variants", async () => {
  const seat = assignedSeat();
  seat.employee.email = "alice@example.com";
  await renderInspector(seat, { canEdit: true, onDeleteSeat() {} });
  assert.ok(document.querySelector('a[href="mailto:alice@example.com"]'), "admin mailto link");
  cleanup();

  await renderInspector(seat, { canEdit: false });
  assert.ok(document.querySelector('a[href="mailto:alice@example.com"]'), "viewer mailto link");
});

test("the copy-extension button writes the clipboard and confirms inline", async () => {
  const written = [];
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async value => { written.push(value); } }
  });
  await renderInspector(assignedSeat(), { canEdit: true, onDeleteSeat() {} });
  const copyButton = document.querySelector('[aria-label="Copy extension 123"]');
  assert.ok(copyButton, "copy affordance present for the extension row");
  await clickLabel("Copy extension 123");
  assert.deepEqual(written, ["123"]);
  assert.match(copyButton.textContent, /Copied/);
  cleanup();

  // Viewer variant keeps the copy convenience — it reads, never edits.
  await renderInspector(assignedSeat(), { canEdit: false });
  assert.ok(document.querySelector('[aria-label="Copy extension 123"]'), "viewer copy affordance");
  delete window.navigator.clipboard;
});

test("the admin footer bar carries seat ID and recency; the viewer has none", async () => {
  await renderInspector(assignedSeat(), { canEdit: true, onDeleteSeat() {} });
  const footer = document.getElementById("seat-inspector-footer");
  assert.ok(footer, "admin footer bar present");
  assert.match(footer.textContent, /S01/);
  assert.match(footer.textContent, /Updated/);
  cleanup();

  await renderInspector(assignedSeat(), { canEdit: false });
  assert.equal(document.getElementById("seat-inspector-footer"), null, "viewer stays footer-free");
});

test("viewer mode renders no sections, no action row, no footer CTA", async () => {
  await renderInspector(assignedSeat());
  assert.equal(document.getElementById("seat-inspector-actions"), null, "no Seat actions in viewer");
  assert.equal(document.getElementById("seat-inspector-notes"), null, "no Notes in viewer");
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
