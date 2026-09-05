import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup } from "./helpers/renderComponent.mjs";

// The full SeatMap component runs live layout/de-collision measurement that only
// terminates against a real browser's geometry, so it can't be unit-rendered in
// jsdom. These tests instead cover the renderable seat-map building blocks it
// composes — the seat marker (the core seat unit) and the map controls.
let SeatMarker;
let MapZoomControl;
let FloorMenuButton;
let DraftTrailOverlay;
before(async () => {
  ({ SeatMarker } = await loadComponent("@/components/seat-map/SeatMarker"));
  ({ MapZoomControl } = await loadComponent("@/components/seat-map/MapZoomControl"));
  ({ FloorMenuButton } = await loadComponent("@/components/seat-map/FloorMenuButton"));
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

// 44px touch floor (lib/seatCrowding markerHitFloorMet): the surface decides
// for the whole layer and the marker grows an out-of-flow hit region only when
// told to — its drawn 32px box is untouched either way, and the flag is
// readable off the DOM for the live-geometry probes.
test("SeatMarker grows a 44px hit region only when the surface says the floor is met", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { hitFloor: true })));
  let button = document.querySelector("button");
  assert.ok(button.className.includes("h-8 w-8"), "the drawn box does not grow");
  assert.ok(button.className.includes("after:absolute after:-inset-1.5"), "32 + 2×6 = 44");
  assert.equal(button.getAttribute("data-hit-floor"), "true");
  cleanup();

  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { hitFloor: true, selected: true })));
  button = document.querySelector("button");
  assert.ok(button.className.includes("h-10 w-10"));
  assert.ok(button.className.includes("after:absolute after:-inset-0.5"), "40 + 2×2 = 44");
  cleanup();

  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat())));
  button = document.querySelector("button");
  assert.ok(!button.className.includes("after:"), "below the floor the button keeps its drawn box");
  assert.equal(button.getAttribute("data-hit-floor"), null);
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

// F4 (read-path assessment 2026-08-25): with names off, the short name is
// display:none until hover — no visible text to contain, so concatenating
// short + full name is pure stutter ("Alice Alice Smith") on every occupied
// seat, at rest, on every arrow-key step. Axe evaluates at rest, so gating
// the concatenation on hover disclosure does not weaken
// label-content-name-mismatch.
test("with names hidden, the accessible label carries the full name once — no stutter", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { showNames: false })));
  const label = document.querySelector("button").getAttribute("aria-label");
  assert.match(label, /Alice Smith/, "full name still announced");
  assert.ok(!/Alice Alice Smith/.test(label), "no doubled first name");
  assert.equal(label.match(/Alice/g).length, 1, "occupant named exactly once");
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
// Private offices follow the pill rule (owner ruling O1, 2026-09-04, PR 3a):
// the door-plate card retired with lib/officeRoomWash — an office seat is
// the same marker as a pod seat.
test("a South Offices seat renders the same pill as a pod seat — no plate, no title line", async () => {
  const officeSeat = makeSeat({ id: "s3", seat_key: "s01", label: "S01", zone: "South Offices" });
  await renderElement(React.createElement(SeatMarker, markerProps(officeSeat)));
  const text = document.body.textContent;
  assert.match(text, /S01/);
  assert.ok(!/Analyst/.test(text), "no title line on the marker — the job title is the inspector's");
  assert.ok(!/Open office/.test(text));
  assert.equal(document.querySelector("button > span").getAttribute("style"), null, "no room offset or plate width");
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

// --- FloorMenuButton ---------------------------------------------------------
// PR 3a: the control row's floor selector (.sp-menu-button / .sp-menu) — the
// APG menu-button contract accessibility-source pins, one look for both
// surfaces now that the tenant row is gone.

test("FloorMenuButton renders the floor control on the field surface", async () => {
  await renderElement(React.createElement(FloorMenuButton, { floor: "3", onChange() {} }));
  const trigger = document.querySelector('[aria-label^="Change floor"]');
  assert.ok(trigger, "floor control renders");
  assert.ok(trigger.classList.contains("sp-menu-button"));
  assert.equal(trigger.textContent.trim(), "Floor 3 · Pre-Litigation");
});

// Multi-floor PR-2: the options come from the registry (lib/floors), the
// SOON badge is gone — an unmapped floor is a real destination now (it
// renders a roster), and the roster header explains itself.
test("FloorMenuButton lists the registry's floors without a SOON badge; the current one is checked and current", async () => {
  const picks = [];
  await renderElement(React.createElement(FloorMenuButton, { floor: "3", onChange: floor => picks.push(floor), meta: { "3": "68 seats", "2": "40 people" } }));
  await act(async () => fireEvent.click(document.querySelector('[aria-label^="Change floor"]')));
  const menu = document.querySelector('[role="menu"]');
  assert.ok(menu.classList.contains("sp-menu"));
  const options = [...document.querySelectorAll('[role="menuitemradio"]')];
  assert.deepEqual(options.map(option => option.textContent), ["Floor 3 · Pre-Litigation68 seats", "Floor 2 · Litigation40 people"]);
  assert.deepEqual(options.map(option => option.getAttribute("aria-checked")), ["true", "false"]);
  assert.equal(options[0].getAttribute("aria-current"), "true");
  assert.doesNotMatch(document.body.textContent, /SOON/);
  await act(async () => fireEvent.click(options[1]));
  assert.deepEqual(picks, ["2"]);
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
  assert.equal(svg.querySelector('[data-trail-part="flow"]').getAttribute("stroke"), "var(--sp-trail)");
  assert.equal(svg.querySelector('[data-trail-part="arrow"]').getAttribute("fill"), "var(--sp-trail)");
  assert.equal(svg.querySelector('[data-trail-part="origin"]').getAttribute("stroke"), "var(--sp-trail-origin)");
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(svg.outerHTML), "no hardcoded hex anywhere in the trail markup");
});
