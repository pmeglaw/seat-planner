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
    swapMode: false,
    swapSource: false,
    swapTarget: false,
    moveEmployeeMode: false,
    moveEmployeeSource: false,
    highlighted: false,
    addSeatMode: false,
    viewportEdge: "none",
    viewportEdgeOffsetPx: 0,
    tabIndex: 0,
    onSelect() {},
    ...overrides
  };
}

// --- SeatMarker ------------------------------------------------------------
// Phase 4 PR 3b: the Phase 3 pill (PHASE3DS §1.16). An assigned seat is
// `button.sp-pill.cds-touch-target` with the short name; the seat code is the
// tier-C tooltip sibling, never a second line; empty seats are
// `button.sp-seat-footprint` with the inlined status mark. States are CSS
// modifiers — one silhouette each — and the ◇ badge marks changed-in-draft.

const pill = () => document.querySelector("button.sp-pill");
const footprint = () => document.querySelector("button.sp-seat-footprint");
const tooltip = () => document.querySelector('[role="tooltip"]');

test("SeatMarker renders the short name on a pill and the seat code in the tooltip only", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat())));
  const button = pill();
  assert.ok(button, "an assigned seat is a .sp-pill");
  assert.ok(button.classList.contains("cds-touch-target"), "every marker carries the 44px touch target");
  assert.equal(button.textContent, "Alice S.", "the pill's only text is First L.");
  assert.equal(button.getAttribute("title"), null, "no native title (F3)");
  assert.equal(tooltip().textContent, "N01", "the seat code is the tier-C tooltip");
  assert.ok(!footprint());
  // Anatomy: wrapper .sp-has-tooltip.sp-marker placed by the calibration
  // transform, the pill, then the tooltip.
  const wrapper = button.parentElement;
  assert.ok(wrapper.classList.contains("sp-has-tooltip") && wrapper.classList.contains("sp-marker"));
  assert.match(wrapper.getAttribute("style"), /left: 30%; top: 32%;/);
  assert.match(wrapper.getAttribute("style"), /transform: translate\(-50%, calc\(-50% \+ 0px\)\)/);
  assert.equal(wrapper.lastElementChild, tooltip());
});

test("an empty seat is a footprint with its status mark, no pill", async () => {
  for (const [status, expectMark] of [["available", "circle[data-stroke]"], ["reserved", "path[data-stroke]"], ["unavailable", "path[data-hatch]"]]) {
    cleanup();
    const empty = makeSeat({ id: "s2", label: "N02", status, employee_id: null, employee: null });
    await renderElement(React.createElement(SeatMarker, markerProps(empty)));
    const button = footprint();
    assert.ok(button, `${status} renders a .sp-seat-footprint`);
    assert.ok(button.classList.contains("cds-touch-target"));
    assert.ok(button.querySelector(`svg.sp-seat-mark ${expectMark}`), `${status} carries its inlined mark`);
    assert.ok(!button.querySelector("use"), "marks are inlined, never <use>d");
    assert.ok(!pill());
    assert.equal(tooltip().textContent, "N02");
  }
});

test("the collision nudge is an inline transform on the wrapper; active markers stay on the anchor", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { nameNudge: -1 })));
  assert.match(pill().parentElement.getAttribute("style"), /translate\(-50%, calc\(-50% \+ -14px\)\)/);
  cleanup();
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { nameNudge: 1, selected: true })));
  assert.match(pill().parentElement.getAttribute("style"), /translate\(-50%, calc\(-50% \+ 0px\)\)/, "a selected pill never nudges");
  cleanup();
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { nameNudge: 1, viewportEdge: "left", viewportEdgeOffsetPx: 12 })));
  assert.match(pill().parentElement.getAttribute("style"), /translate\(12px, calc\(-50% \+ 14px\)\)/, "the viewport-edge hug rides the same transform");
  cleanup();
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { viewportEdge: "left", viewportEdgeOffsetPx: 12, swapMode: true, canEdit: true })));
  assert.match(pill().parentElement.getAttribute("style"), /translate\(-50%, calc\(-50% \+ 0px\)\)/, "a running mode snaps to the true coordinate");
});

test("SeatMarker's accessible label describes the seat, occupant, and status", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat())));
  const label = document.querySelector("button").getAttribute("aria-label");
  assert.match(label, /N01/);
  assert.match(label, /Alice Smith/);
  assert.match(label, /Assigned/i);
  assert.equal(label, "N01 Alice S. Alice Smith. Assigned seat. Open details.");
});

test("an empty seat's accessible label reflects available status, not an occupant", async () => {
  const empty = makeSeat({ id: "s2", label: "N02", status: "available", employee_id: null, employee: null });
  await renderElement(React.createElement(SeatMarker, markerProps(empty)));
  const label = document.querySelector("button").getAttribute("aria-label");
  assert.match(label, /N02/);
  assert.match(label, /Unassigned|Open seat/i);
  assert.ok(!/Alice/.test(label));
});

// F4 (read-path assessment 2026-08-25): with names off the pill renders no
// text (the filled 28 footprint), so the full name alone is announced —
// concatenating short + full name would be pure stutter ("Alice Alice Smith")
// on every occupied seat, at rest, on every arrow-key step.
test("with names hidden, the pill is the filled footprint and the label carries the full name once", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { showNames: false })));
  const button = pill();
  assert.ok(button.classList.contains("sp-pill--names-off"));
  assert.equal(button.textContent, "", "no visible text with names off");
  const label = button.getAttribute("aria-label");
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

test("SeatMarker reflects selection through aria-pressed and the 2px inverse edge state", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { selected: true })));
  const button = pill();
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.getAttribute("data-state"), "selected");
  assert.equal(button.getAttribute("data-marker-intent"), "selected");
  cleanup();
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat())));
  assert.equal(pill().getAttribute("aria-pressed"), "false");
  assert.equal(pill().getAttribute("data-state"), null);
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

test("one modifier per state — search hit, quiet, origin, target, invalid — and the ◇ badge", async () => {
  const cases = [
    [{ searchResult: true }, "sp-pill--search", "search-result", / Search result\./],
    [{ highlighted: true }, "sp-pill--search", "search-result", / Highlighted by Ask Planner\./],
    [{ dimmed: true }, "sp-pill--quiet", "assigned", null],
    [{ dimmed: true, searchResult: true }, "sp-pill--quiet", "assigned", null],
    [{ canEdit: true, swapMode: true, swapSource: true }, "sp-pill--origin", "swap-source", / Swap source\./],
    [{ canEdit: true, moveEmployeeMode: true, moveEmployeeSource: true }, "sp-pill--origin", "swap-source", / Move source\./],
    [{ canEdit: true, swapMode: true }, "sp-pill--target", "target-valid", / Valid swap target\./],
    [{ canEdit: true, moveEmployeeMode: true }, "sp-pill--target", "target-valid", / Valid destination seat\./],
    [{ canEdit: true, swapMode: true, swapTarget: true }, "sp-pill--target", "swap-target", / Swap target\./],
    [{ canEdit: true, moveEmployeeMode: true, invalidTarget: true }, "sp-pill--invalid", "target-invalid", / Not a valid target\./]
  ];
  for (const [props, modifier, intent, phrase] of cases) {
    cleanup();
    await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), props)));
    const button = pill();
    const mods = [...button.classList].filter(c => c.startsWith("sp-pill--"));
    assert.deepEqual(mods, [modifier], `${JSON.stringify(props)} → exactly ${modifier}`);
    assert.equal(button.getAttribute("data-marker-intent"), intent);
    if (phrase) assert.match(button.getAttribute("aria-label"), phrase);
    assert.ok(!button.className.includes("opacity"), "no opacity dim — quiet is a fill/edge/text step");
  }
  // Invalid targets report themselves as not operable; every other state is operable.
  cleanup();
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { canEdit: true, moveEmployeeMode: true, invalidTarget: true })));
  assert.equal(pill().getAttribute("aria-disabled"), "true");
  cleanup();
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { canEdit: true, moveEmployeeMode: true })));
  assert.equal(pill().getAttribute("aria-disabled"), null);
  // ◇ changed in draft: the inlined SeatMark badge on the pill, with the label saying so.
  cleanup();
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { draftChanged: true })));
  assert.ok(pill().querySelector("svg.sp-pill-badge path"), "the ◇ badge is inlined on the pill");
  assert.equal(pill().getAttribute("data-marker-intent"), "draft-changed");
  assert.match(pill().getAttribute("aria-label"), / Draft changed\./);
  cleanup();
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { draftChanged: true, showNames: false })));
  assert.ok(pill().querySelector("svg.sp-pill-badge"), "names off keeps the ◇ on the filled footprint");
});

test("in a move or swap every seat is a pill: empty seats show their code so targets read as one set", async () => {
  const empty = makeSeat({ id: "s2", label: "N02", status: "available", employee_id: null, employee: null });
  await renderElement(React.createElement(SeatMarker, markerProps(empty, { canEdit: true, moveEmployeeMode: true })));
  const button = pill();
  assert.ok(button, "an empty seat renders as a pill while a mode runs");
  assert.ok(!footprint());
  assert.equal(button.textContent, "N02");
  assert.ok(button.querySelector('span[translate="no"]'), "the code is a translate=no token");
  assert.ok(button.classList.contains("sp-pill--target"));
  assert.match(button.getAttribute("aria-label"), /^N02 Unassigned\. Open seat\. Valid destination seat\. Open details\.$/);
  cleanup();
  const reserved = makeSeat({ id: "s3", label: "N03", status: "reserved", employee_id: null, employee: null });
  await renderElement(React.createElement(SeatMarker, markerProps(reserved, { canEdit: true, moveEmployeeMode: true, invalidTarget: true })));
  assert.ok(pill().classList.contains("sp-pill--invalid"));
  assert.equal(pill().getAttribute("aria-disabled"), "true");
  cleanup();
  // Names off does not apply while a mode runs — the origin must be readable.
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { showNames: false, canEdit: true, swapMode: true, swapSource: true })));
  assert.equal(pill().textContent, "Alice S.");
  assert.ok(!pill().classList.contains("sp-pill--names-off"));
});

test("a filtered-out empty seat is a quiet footprint (no opacity)", async () => {
  const empty = makeSeat({ id: "s2", label: "N02", status: "available", employee_id: null, employee: null });
  await renderElement(React.createElement(SeatMarker, markerProps(empty, { dimmed: true })));
  assert.ok(footprint().classList.contains("sp-seat-footprint--quiet"));
  assert.ok(!footprint().className.includes("opacity"));
});

// Office nameplate retired (owner ruling O1, 2026-09-04): an office seat is
// the same marker as a pod seat — the job title is the inspector's.
test("a South Offices seat renders the same pill as a pod seat — no plate, no title line", async () => {
  const officeSeat = makeSeat({ id: "s3", seat_key: "s01", label: "S01", zone: "South Offices" });
  await renderElement(React.createElement(SeatMarker, markerProps(officeSeat)));
  const button = pill();
  assert.equal(button.textContent, "Alice S.");
  assert.ok(!/Analyst/.test(document.body.textContent), "no title line on the marker — the job title is the inspector's");
  assert.ok(!/Open office/.test(document.body.textContent));
  assert.equal(button.getAttribute("style"), null, "no room offset or plate width");
  assert.equal(tooltip().textContent, "S01");
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

test("trail colors come from the pill's origin-edge token (the Phase 3 vocabulary), never hardcoded hex", async () => {
  await renderElement(React.createElement(DraftTrailOverlay, { kind: "move", sourceSeat: trailSource, targetSeat: trailTarget }));
  const svg = document.querySelector("svg[data-draft-trail]");
  // PR 3b group-3 sweep: --sp-trail / --sp-trail-origin retired for the pill's
  // dashed-origin edge — the trail and the origin pill read as one construction.
  assert.equal(svg.querySelector('[data-trail-part="flow"]').getAttribute("stroke"), "var(--sp-pill-origin-edge)");
  assert.equal(svg.querySelector('[data-trail-part="arrow"]').getAttribute("fill"), "var(--sp-pill-origin-edge)");
  assert.equal(svg.querySelector('[data-trail-part="origin"]').getAttribute("stroke"), "var(--sp-pill-origin-edge)");
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(svg.outerHTML), "no hardcoded hex anywhere in the trail markup");
});
