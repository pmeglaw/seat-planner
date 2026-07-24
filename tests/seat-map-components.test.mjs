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
before(async () => {
  ({ SeatMarker } = await loadComponent("@/components/seat-map/SeatMarker"));
  ({ MapZoomControl } = await loadComponent("@/components/seat-map/MapZoomControl"));
  ({ FloorSelector } = await loadComponent("@/components/seat-map/FloorSelector"));
});
beforeEach(() => configureContext({}));
afterEach(() => cleanup());

function makeSeat(overrides = {}) {
  return {
    id: "s1",
    seat_key: "n01",
    label: "N01",
    x: 0.3,
    y: 0.2,
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
    moveSeatMode: false,
    swapMode: false,
    swapSource: false,
    swapTarget: false,
    highlighted: false,
    dragging: false,
    addSeatMode: false,
    viewportEdge: "none",
    viewportEdgeOffsetPx: 0,
    variant: "viewer",
    tabIndex: 0,
    onSelect() {},
    onMovePointerDown() {},
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

test("a names-on pill in a standard zone shows the short name too", async () => {
  const southSeat = makeSeat({ id: "s3", seat_key: "s01", label: "S01", zone: "South Offices" });
  await renderElement(React.createElement(SeatMarker, markerProps(southSeat)));
  const text = document.body.textContent;
  assert.match(text, /Alice S\./);
  assert.ok(!/Alice Smith/.test(text));
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

// --- FloorSelector ---------------------------------------------------------

test("FloorSelector renders a floor control", async () => {
  await renderElement(React.createElement(FloorSelector, { floor: "3", onChange() {} }));
  const trigger = document.querySelector('[aria-label^="Change floor"]');
  assert.ok(trigger, "floor control renders");
});
