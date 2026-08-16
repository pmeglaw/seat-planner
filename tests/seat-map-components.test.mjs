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
let DraftTrailOverlay;
before(async () => {
  ({ SeatMarker } = await loadComponent("@/components/seat-map/SeatMarker"));
  ({ MapZoomControl } = await loadComponent("@/components/seat-map/MapZoomControl"));
  ({ FloorSelector } = await loadComponent("@/components/seat-map/FloorSelector"));
  ({ DeptChipRow } = await loadComponent("@/components/seat-map/DeptChipRow"));
  ({ DraftTrailOverlay } = await loadComponent("@/components/seat-map/DraftTrailOverlay"));
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

// --- DraftTrailOverlay -------------------------------------------------------
// The animated route between a pending swap/move pair
// (design_handoff_swap_trail, 2026-08-15). SeatMap renders it conditionally
// from its existing swap/move confirm state; the overlay itself is a pure,
// stateless render of (sourceSeat, targetSeat, kind). SeatMap can't be
// unit-rendered in jsdom (see header), so the mount/unmount contract is
// exercised through a harness that flips the same conditional SeatMap uses.

const trailSource = { id: "s1", x: 0.3, y: 0.4 };
const trailTarget = { id: "s2", x: 0.5, y: 0.6 };

test("the draft trail mounts while a swap is pending and unmounts on cancel", async () => {
  function PendingSwapHarness() {
    const [pending, setPending] = React.useState(true);
    return React.createElement(
      React.Fragment,
      null,
      pending
        ? React.createElement(DraftTrailOverlay, { kind: "swap", sourceSeat: trailSource, targetSeat: trailTarget })
        : null,
      React.createElement("button", { onClick: () => setPending(false) }, "Cancel swap")
    );
  }
  await renderElement(React.createElement(PendingSwapHarness));
  assert.ok(document.querySelector('svg[data-draft-trail="swap"]'), "trail overlay mounts while the swap is pending");
  await act(async () => fireEvent.click(document.querySelector("button")));
  assert.equal(document.querySelector("svg[data-draft-trail]"), null, "trail overlay unmounts when the swap cancels");
});

test("a swap trail is two mirrored arcs with two arrowheads, decorative and pointer-inert", async () => {
  await renderElement(React.createElement(DraftTrailOverlay, { kind: "swap", sourceSeat: trailSource, targetSeat: trailTarget }));
  const svg = document.querySelector('svg[data-draft-trail="swap"]');
  assert.equal(svg.getAttribute("aria-hidden"), "true", "trail is decorative reinforcement only");
  assert.match(svg.getAttribute("class") ?? "", /pointer-events-none/, "trail never intercepts marker clicks");
  const underlays = svg.querySelectorAll('[data-trail-part="underlay"]');
  const flows = svg.querySelectorAll('[data-trail-part="flow"]');
  const arrows = svg.querySelectorAll('[data-trail-part="arrow"]');
  assert.equal(underlays.length, 2, "one route underlay per direction");
  assert.equal(flows.length, 2, "one flow line per direction");
  assert.equal(arrows.length, 2, "each direction carries its own arrowhead");
  assert.equal(svg.querySelector('[data-trail-part="origin"]'), null, "origin ring is move-only");
  const [outbound, inbound] = flows;
  assert.notEqual(outbound.getAttribute("d"), inbound.getAttribute("d"), "the two arcs are distinct paths");
  // Mirroring, pinned geometrically: each `d` is `M sx sy Q cx cy ex ey`, and
  // the cross product of the chord with the control offset gives which side
  // of its own DIRECTED chord the arc bows to. A circular exchange means both
  // arcs curve toward the same directed side (each bows left along its own
  // travel — that is what closes a loop, since the chords run opposite ways);
  // opposite directed signs are the shared-lens bug where both arcs bow to
  // the same world side. (Directed side flips with the chord, so "mirrored in
  // world space" reads as EQUAL signs here, not opposite ones.)
  const bowSide = pathData => {
    const [sx, sy, cx, cy, ex, ey] = pathData.match(/-?[\d.]+/g).map(Number);
    return Math.sign((ex - sx) * (cy - sy) - (ey - sy) * (cx - sx));
  };
  const outboundSide = bowSide(outbound.getAttribute("d"));
  assert.notEqual(outboundSide, 0, "the outbound arc is bowed, not a straight chord");
  assert.equal(outboundSide, bowSide(inbound.getAttribute("d")), "both arcs curve toward the same directed side — a loop, not a lens");
  // The dash flow rides motion-safe only — under prefers-reduced-motion the
  // trail stays visible as a static dashed route (the handoff pins that).
  assert.match(outbound.getAttribute("class") ?? "", /motion-safe:animate-\[map-trail-dash/, "dash flow is motion-safe gated");
});

test("a move trail is one arc, one arrowhead, and a dashed origin ring at the start", async () => {
  await renderElement(React.createElement(DraftTrailOverlay, { kind: "move", sourceSeat: trailSource, targetSeat: trailTarget }));
  const svg = document.querySelector('svg[data-draft-trail="move"]');
  assert.equal(svg.querySelectorAll('[data-trail-part="flow"]').length, 1);
  assert.equal(svg.querySelectorAll('[data-trail-part="arrow"]').length, 1);
  const origin = svg.querySelector('[data-trail-part="origin"]');
  assert.ok(origin, "move trails mark the origin seat with a ring");
  const flowPath = svg.querySelector('[data-trail-part="flow"]').getAttribute("d") ?? "";
  const [, startX, startY] = flowPath.match(/^M ([\d.]+) ([\d.]+) /) ?? [];
  assert.equal(origin.getAttribute("cx"), startX, "ring sits at the path start");
  assert.equal(origin.getAttribute("cy"), startY, "ring sits at the path start");
});

test("trail colors come from the admin accent tokens, never hardcoded hex", async () => {
  await renderElement(React.createElement(DraftTrailOverlay, { kind: "move", sourceSeat: trailSource, targetSeat: trailTarget }));
  const svg = document.querySelector("svg[data-draft-trail]");
  assert.equal(svg.querySelector('[data-trail-part="flow"]').getAttribute("stroke"), "var(--admin-draft-trail)");
  assert.equal(svg.querySelector('[data-trail-part="arrow"]').getAttribute("fill"), "var(--admin-draft-trail)");
  assert.equal(svg.querySelector('[data-trail-part="origin"]').getAttribute("stroke"), "var(--admin-draft-trail-origin)");
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(svg.outerHTML), "no hardcoded hex anywhere in the trail markup");
});
