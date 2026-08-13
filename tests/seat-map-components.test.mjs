import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup } from "./helpers/renderComponent.mjs";

// The full SeatMap component runs live layout/de-collision measurement that only
// terminates against a real browser's geometry, so it can't be unit-rendered in
// jsdom. These tests instead cover the renderable seat-map building blocks it
// composes — the seat marker (the core seat unit) and the map controls.
let SeatMarker;
let MapZoomControl;
let FloorSelector;
let DeptChipRow;
before(async () => {
  ({ SeatMarker } = await loadComponent("@/components/seat-map/SeatMarker"));
  ({ MapZoomControl } = await loadComponent("@/components/seat-map/MapZoomControl"));
  ({ FloorSelector } = await loadComponent("@/components/seat-map/FloorSelector"));
  ({ DeptChipRow } = await loadComponent("@/components/seat-map/DeptChipRow"));
});
beforeEach(() => configureContext({}));
afterEach(() => cleanup());

function makeSeat(overrides = {}) {
  return {
    id: "s1",
    seat_key: "n01",
    label: "N01",
    // y 0.32 sits in the pod aisle, clearly OUTSIDE every measured office
    // room rect (N rooms end at y 0.248) — the plate gate is geometry-based,
    // so pod fixtures must not graze a room edge.
    x: 0.3,
    y: 0.32,
    status: "assigned",
    layer: "draft",
    employee_id: "emp-1",
    department: "Intake",
    zone: "North Pod",
    notes: null,
    is_custom: false,
    created_at: "",
    updated_at: "",
    employee: {
      id: "emp-1",
      full_name: "Alice Smith",
      position: "Analyst",
      department: "Intake",
      phone_extension: null,
      email: null,
      avatar_url: null,
      active: true,
      created_at: "",
      updated_at: ""
    },
    ...overrides
  };
}

function markerProps(seat, overrides = {}) {
  return {
    seat,
    selected: false,
    dimmed: false,
    canEdit: false,
    showNames: true,
    searchResult: false,
    compactNameLabel: false,
    swapMode: false,
    swapSource: false,
    swapTarget: false,
    moveEmployeeMode: false,
    moveEmployeeSource: false,
    highlighted: false,
    addSeatMode: false,
    viewportEdge: "none",
    viewportEdgeOffsetPx: 0,
    variant: "viewer",
    tabIndex: 0,
    onSelect() {},
    ...overrides
  };
}

// --- SeatMarker ------------------------------------------------------------

test("SeatMarker renders the seat code and occupant name", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat())));
  const text = document.body.textContent;
  assert.match(text, /N01/);
  assert.match(text, /Alice/);
});

test("SeatMarker's accessible label describes the seat, occupant, and status", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat())));
  const label = document.querySelector("button").getAttribute("aria-label");
  assert.match(label, /N01/);
  assert.match(label, /Alice Smith/);
  assert.match(label, /Assigned/i);
});

test("an empty seat's accessible label reflects available status, not an occupant", async () => {
  const empty = makeSeat({ id: "s2", label: "N02", status: "available", employee_id: null, employee: null });
  await renderElement(React.createElement(SeatMarker, markerProps(empty)));
  const label = document.querySelector("button").getAttribute("aria-label");
  assert.match(label, /N02/);
  assert.match(label, /Unassigned|Open seat/i);
  assert.ok(!/Alice/.test(label));
});

test("clicking a SeatMarker selects it by id", async () => {
  const selected = [];
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { onSelect: id => selected.push(id) })));
  await act(async () => fireEvent.click(document.querySelector("button")));
  assert.deepEqual(selected, ["s1"]);
});

test("SeatMarker reflects selection through aria-pressed", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { selected: true })));
  assert.equal(document.querySelector("button").getAttribute("aria-pressed"), "true");
});

// Owner call 2026-07-24: pill inline names are first name + last initial —
// the inspector header carries the full name. The aria-label must still
// contain BOTH (axe label-content-name-mismatch: visible text verbatim,
// then the full name it abbreviates).
test("a selected pill shows the short name; the accessible label keeps the full name", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { selected: true })));
  const text = document.body.textContent;
  assert.match(text, /Alice S\./, "visible pill name is First L.");
  assert.ok(!/Alice Smith/.test(text), "full name never renders on the pill");
  const label = document.querySelector("button").getAttribute("aria-label");
  assert.match(label, /Alice S\. Alice Smith/, "aria contains short form then full name");
});

// Office nameplate (owner pick 2026-07-24, specimen option 2): South Offices
// seats render a door-plate card — code eyebrow, always-visible short name,
// title line — instead of the stadium pill. Pods keep pills.
test("a South Offices seat renders a door-plate: code, short name, title — names toggle irrelevant", async () => {
  const officeSeat = makeSeat({ id: "s3", seat_key: "s01", label: "S01", zone: "South Offices" });
  await renderElement(React.createElement(SeatMarker, markerProps(officeSeat, { showNames: false })));
  const text = document.body.textContent;
  assert.match(text, /S01/);
  assert.match(text, /Alice S\./, "plate shows the short name even with Show names off");
  assert.match(text, /Analyst/, "plate shows the title line");
  assert.ok(!/Alice Smith/.test(text), "full name never renders on the plate");
  const label = document.querySelector("button").getAttribute("aria-label");
  assert.match(label, /Alice S\. Analyst Alice Smith/, "aria contains visible text then the full name");
});

test("an open South Offices seat plate reads Open office", async () => {
  const openOffice = makeSeat({ id: "s4", seat_key: "s02", label: "S02", zone: "South Offices", status: "available", employee_id: null, employee: null });
  await renderElement(React.createElement(SeatMarker, markerProps(openOffice)));
  assert.match(document.body.textContent, /Open office/);
  const label = document.querySelector("button").getAttribute("aria-label");
  assert.match(label, /S02 Open office/, "aria contains the visible plate text");
});

test("pod seats keep the stadium pill — no title line, no plate copy", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat())));
  const text = document.body.textContent;
  assert.ok(!/Analyst/.test(text), "pods never show the title line");
  assert.ok(!/Open office/.test(text));
});

// Plate positioning/sizing (2026-07-24 optimization): SeatMap derives a
// room-center token offset + a room-fitted width and passes them down; the
// plate renders centered in its ROOM (not on the click point) and never
// wider than the room. The offset is display-only (same contract as the
// nudge/viewport-edge offsets — the anchor button never moves) and snaps
// back to the true coordinate during move/add/swap so dragging stays honest.
test("plate token honors the room offset and width props", async () => {
  const officeSeat = makeSeat({ id: "s6", seat_key: "s01", label: "S01", zone: "South Offices" });
  await renderElement(React.createElement(SeatMarker, markerProps(officeSeat, {
    officePlateOffsetXPx: 20,
    officePlateOffsetYPx: -10,
    officePlateWidthPx: 120
  })));
  const token = document.querySelector("button > span");
  assert.match(token.getAttribute("style") ?? "", /calc\(50% \+ 20px\)/, "horizontal room-center offset applied");
  assert.match(token.getAttribute("style") ?? "", /top: calc\(50% - 10px\)/, "vertical room-center offset applied");
  assert.match(token.getAttribute("style") ?? "", /width: 120px/, "room-fitted width applied");
});

// 2026-07-24 extension: a seat placed INSIDE a measured office room renders
// the plate regardless of zone — N13 carries the pod zone "North Pod" (zone
// inference has no room concept), so the gate must be geometry-based.
test("a pod-zoned seat inside an office room still renders the plate", async () => {
  const n13 = makeSeat({ id: "s5", seat_key: "n13", label: "N13", zone: "North Pod", x: 0.1413, y: 0.181 });
  await renderElement(React.createElement(SeatMarker, markerProps(n13, { showNames: false })));
  const text = document.body.textContent;
  assert.match(text, /N13/);
  assert.match(text, /Alice S\./, "plate name renders from geometry gate alone");
  assert.match(text, /Analyst/);
});

test("move-employee mode snaps the plate back to the true anchor", async () => {
  const officeSeat = makeSeat({ id: "s7", seat_key: "s01", label: "S01", zone: "South Offices" });
  await renderElement(React.createElement(SeatMarker, markerProps(officeSeat, {
    moveEmployeeMode: true,
    officePlateOffsetXPx: 20,
    officePlateOffsetYPx: -10,
    officePlateWidthPx: 120
  })));
  const token = document.querySelector("button > span");
  assert.ok(!/calc\(50% \+ 20px\)/.test(token.getAttribute("style") ?? ""), "offset dropped in move mode");
  assert.match(token.getAttribute("style") ?? "", /width: 120px/, "width still room-fitted");
});

test("move-employee source and candidates announce themselves", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { canEdit: true, moveEmployeeMode: true, moveEmployeeSource: true })));
  assert.match(document.querySelector("button").getAttribute("aria-label") ?? "", / Move source\./);
  cleanup();
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { canEdit: true, moveEmployeeMode: true })));
  assert.match(document.querySelector("button").getAttribute("aria-label") ?? "", / Valid destination seat\./);
});

// --- MapZoomControl --------------------------------------------------------

test("MapZoomControl wires zoom in / out / fit to their callbacks", async () => {
  const calls = [];
  await renderElement(
    React.createElement(MapZoomControl, {
      label: "100%",
      onZoomIn: () => calls.push("in"),
      onZoomOut: () => calls.push("out"),
      onFit: () => calls.push("fit")
    })
  );
  const click = name => act(async () => fireEvent.click(document.querySelector(`[aria-label="${name}"]`)));
  await click("Zoom in");
  await click("Zoom out");
  await click("Fit map to view");
  assert.deepEqual(calls, ["in", "out", "fit"]);
});

test("MapZoomControl disables the zoom buttons at their limits", async () => {
  await renderElement(
    React.createElement(MapZoomControl, {
      label: "200%",
      onZoomIn() {},
      onZoomOut() {},
      onFit() {},
      zoomInDisabled: true,
      zoomOutDisabled: false
    })
  );
  assert.equal(document.querySelector('[aria-label="Zoom in"]').disabled, true);
  assert.equal(document.querySelector('[aria-label="Zoom out"]').disabled, false);
});

// --- DeptChipRow -----------------------------------------------------------
// Canvas-chrome redesign (2026-08-13): quick department filter chips with
// counts, floating on the map canvas. Counts come from the parent
// (departmentChipCounts in lib/seatFilters — faceted, filter-aware); the row
// is presentational plus the single-toggle rule: clicking the active chip
// clears back to "all".

test("DeptChipRow renders a labeled group with one counted chip per department", async () => {
  await renderElement(React.createElement(DeptChipRow, {
    departments: ["Attorneys", "Intake"],
    counts: { Attorneys: 14, Intake: 8 },
    activeDepartment: "all",
    onSelectDepartment() {}
  }));
  const group = document.querySelector('[role="group"][aria-label="Department filters"]');
  assert.ok(group, "chip row is a labeled group");
  const chips = group.querySelectorAll("button");
  assert.equal(chips.length, 2);
  assert.match(chips[0].textContent, /Attorneys/);
  assert.match(chips[0].textContent, /14/);
  assert.match(chips[1].textContent, /Intake/);
  assert.match(chips[1].textContent, /8/);
});

test("DeptChipRow chips toggle: inactive selects, active clears to all", async () => {
  const picks = [];
  await renderElement(React.createElement(DeptChipRow, {
    departments: ["Attorneys", "Intake"],
    counts: { Attorneys: 14, Intake: 8 },
    activeDepartment: "Intake",
    onSelectDepartment: value => picks.push(value)
  }));
  const chips = document.querySelectorAll('[role="group"][aria-label="Department filters"] button');
  assert.equal(chips[0].getAttribute("aria-pressed"), "false");
  assert.equal(chips[1].getAttribute("aria-pressed"), "true", "active chip exposes pressed state");
  await act(async () => fireEvent.click(chips[0]));
  await act(async () => fireEvent.click(chips[1]));
  assert.deepEqual(picks, ["Attorneys", "all"], "active chip click clears the facet");
});

// --- FloorSelector ---------------------------------------------------------

test("FloorSelector renders a floor control", async () => {
  await renderElement(React.createElement(FloorSelector, { floor: "3", onChange() {} }));
  const trigger = document.querySelector('[aria-label^="Change floor"]');
  assert.ok(trigger, "floor control renders");
});
