import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadComponent,
  renderElement,
  React,
  configureContext,
  fireEvent,
  flushFrames,
  setUrl,
  setViewportWidth,
  screen,
  within,
  cleanup
} from "./helpers/renderComponent.mjs";

// The first tier that MOUNTS ViewerSeatFinder — the map surface non-admins
// actually use. Until now it was covered only by regex-over-source tests, which
// can see that `canEdit={false}` appears in the file but never that a viewer
// clicking a seat gets a read-only inspector, that the legend agrees with the
// filters, or that a deep link selects anything.
//
// Unlike SeatMap, this component IS unit-renderable in jsdom: its crowding
// nudges are pure lib/seatCrowding calls over a measured scale rather than an
// iterative de-collision pass, and every measurement site is guarded
// (`offsetWidth || null`, `Math.max(1, ...)`), so jsdom's zero-size geometry
// yields a stable single pass instead of never converging.
let ViewerSeatFinder;
before(async () => {
  ({ ViewerSeatFinder } = await loadComponent("@/components/seat-map/ViewerSeatFinder"));
});

beforeEach(() => {
  // Any action reaching the double is a read-only violation, so each one
  // records the call and the assertions below require the log to stay empty.
  actionCalls.length = 0;
  const recordCall = name => async (...args) => {
    actionCalls.push({ name, args });
    return {};
  };
  configureContext({
    actions: {
      updateSeatAction: recordCall("updateSeatAction"),
      createSeatAction: recordCall("createSeatAction"),
      deleteSeatAction: recordCall("deleteSeatAction"),
      swapSeatAssignmentsAction: recordCall("swapSeatAssignmentsAction"),
      publishSeatMapAction: recordCall("publishSeatMapAction")
    }
  });
  setViewportWidth(1280);
  setUrl("/");
  // The remembered floor is a per-browser preference; each test starts clean.
  window.localStorage.removeItem(VIEWER_FLOOR_KEY);
});
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(VIEWER_FLOOR_KEY);
});

const VIEWER_FLOOR_KEY = "seat-planner:viewer-floor";

const actionCalls = [];

function makeEmployee(overrides = {}) {
  return {
    id: "emp-1",
    full_name: "Ada Lovelace",
    position: "Attorney",
    department: "Litigation",
    phone_extension: "101",
    email: "ada@example.com",
    avatar_url: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides
  };
}

function makeSeat(overrides = {}) {
  return {
    id: "seat-1",
    seat_key: "a01",
    label: "A-01",
    x: 0.25,
    y: 0.25,
    status: "available",
    layer: "published",
    employee_id: null,
    zone: "North Offices",
    department: "Litigation",
    notes: null,
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    employee: null,
    ...overrides
  };
}

// The fixture spans all three statuses the legend counts, across two
// departments and two zones, so filter and count assertions have something to
// discriminate rather than trivially passing.
const ADA = makeEmployee();
const GRACE = makeEmployee({
  id: "emp-2",
  full_name: "Grace Hopper",
  position: "Paralegal",
  department: "Corporate",
  phone_extension: "202",
  email: "grace@example.com"
});

function makeFixture() {
  return {
    employees: [ADA, GRACE],
    seats: [
      makeSeat({ id: "seat-1", seat_key: "a01", label: "A-01", status: "assigned", employee_id: ADA.id, employee: ADA }),
      // Grace occupies a Corporate seat, so a person search result actually
      // maps to a seat — a person with no assigned seat correctly selects
      // nothing, which would make a click assertion here prove nothing.
      makeSeat({
        id: "seat-2",
        seat_key: "b02",
        label: "B-02",
        x: 0.6,
        y: 0.4,
        status: "assigned",
        employee_id: GRACE.id,
        employee: GRACE,
        department: "Corporate",
        zone: "South Offices"
      }),
      makeSeat({ id: "seat-3", seat_key: "c03", label: "C-03", x: 0.8, y: 0.7, status: "reserved" }),
      makeSeat({
        id: "seat-4",
        seat_key: "d04",
        label: "D-04",
        x: 0.4,
        y: 0.8,
        status: "available",
        department: "Corporate",
        zone: "South Offices"
      })
    ],
    departmentOptions: [
      { id: "dep-1", name: "Litigation", active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      { id: "dep-2", name: "Corporate", active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }
    ],
    zoneOptions: [
      { id: "zone-1", name: "North Offices", active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      { id: "zone-2", name: "South Offices", active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }
    ]
  };
}

async function renderViewer(overrides = {}) {
  const props = { ...makeFixture(), ...overrides };
  const result = await renderElement(React.createElement(ViewerSeatFinder, props));
  // The component schedules the ⌘K hint and any deep-link selection in a frame.
  await flushFrames();
  return result;
}

// A seat marker is a button whose accessible name starts with the seat label.
// Phase 4 PR 3b: the Phase 3 pill has no token modes — names on = the pill
// shows "First L.", names off = `.sp-pill--names-off` (the filled footprint,
// no text), an empty seat = `.sp-seat-footprint` regardless of the toggle.
function markerMode(label) {
  const button = seatMarker(label);
  if (button.classList.contains("sp-seat-footprint")) return "footprint";
  if (button.classList.contains("sp-pill--names-off")) return button.textContent === "" ? "names-off" : "names-off-with-text";
  return button.textContent ? "name" : "pill-without-text";
}

function seatMarker(label) {
  return screen.getByRole("button", { name: new RegExp(`^${label}\\b`) });
}

// The inspector is queried by id, and its mode read off aria-label, because
// SeatInspector also carries aria-labelledby (the seat title) — and
// aria-labelledby wins the accessible name, so the mode string is NOT
// reachable via getByRole(name). The attribute is still the thing that flips
// on canEdit, which is what these tests are pinning.
function openInspector() {
  return document.getElementById("seat-inspector-panel");
}

function inspectorMode() {
  return openInspector()?.getAttribute("aria-label") ?? null;
}

const READ_ONLY_INSPECTOR = "Selected published seat details";
const EDITABLE_INSPECTOR = "Selected draft seat inspector";

test("renders every published seat as a marker", async () => {
  await renderViewer();
  for (const label of ["A-01", "B-02", "C-03", "D-04"]) {
    assert.ok(seatMarker(label), `expected a marker for ${label}`);
  }
});

// --- The read-only guardrail ------------------------------------------------
// The contract that matters most on this surface: a viewer can open a seat and
// read it, and has no path to mutating anything.

test("selecting a seat opens the READ-ONLY inspector, never the editable one", async () => {
  await renderViewer();
  fireEvent.click(seatMarker("A-01"));

  // SeatInspector labels itself by mode, so this asserts canEdit=false actually
  // reached it rather than merely appearing in the source.
  assert.equal(inspectorMode(), READ_ONLY_INSPECTOR);
  assert.notEqual(inspectorMode(), EDITABLE_INSPECTOR);
  assert.match(openInspector().textContent, /Ada Lovelace/);
});

test("the viewer inspector exposes no edit affordances", async () => {
  await renderViewer();
  fireEvent.click(seatMarker("A-01"));
  const inspector = openInspector();
  assert.equal(inspector.getAttribute("aria-label"), READ_ONLY_INSPECTOR);

  for (const forbidden of [/^Edit/i, /^Delete/i, /^Vacate/i, /^Swap/i, /^Move/i, /^Save/i, /^Assign/i]) {
    assert.equal(
      within(inspector).queryByRole("button", { name: forbidden }),
      null,
      `viewer inspector must not offer a ${forbidden} control`
    );
  }
});

test("no server action fires from any viewer interaction", async () => {
  await renderViewer();
  fireEvent.click(seatMarker("A-01"));
  fireEvent.click(seatMarker("B-02"));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Ada" } });
  await flushFrames();

  assert.deepEqual(actionCalls, [], "the viewer surface must never invoke a server action");
});

// The viewer's own chrome (surface tabs, account menu, theme toggle) retired
// with its header in redesign-v2 PR 2 — the shell provides all of it; see
// tests/viewer-shell.test.mjs for the in-shell registration.

// --- Search -----------------------------------------------------------------

test("search narrows the results list and selecting a result opens that seat", async () => {
  await renderViewer();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Grace" } });
  await flushFrames();

  const results = screen.getByRole("list", { name: "Viewer search results" });
  const items = within(results).getAllByRole("listitem");
  assert.ok(items.length > 0, "expected at least one result for a matching person");
  assert.match(results.textContent, /Grace Hopper/);
  assert.doesNotMatch(results.textContent, /Ada Lovelace/);

  fireEvent.click(within(items[0]).getByRole("button"));
  assert.equal(inspectorMode(), READ_ONLY_INSPECTOR);
  assert.match(openInspector().textContent, /B-02/);
});

test("a search with no matches reports it instead of rendering an empty list", async () => {
  await renderViewer();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Nobody Here" } });
  await flushFrames();

  const status = screen.getByRole("status");
  assert.match(status.textContent, /No results for/);
  assert.equal(screen.queryByRole("list", { name: "Viewer search results" }), null);
});

// --- Legend counts vs filters ----------------------------------------------
// The 2026-07-16 regrade contract: the one number row everyone reads must not
// contradict a filtered map. Only a mounting test can check the rendered
// numbers actually track the active filter.

// Read the legend structurally, one <li> per status. Scraping body text looks
// easier and is a trap: the legend's trailing "1 of 3 seats matches filters"
// summary abuts the last count, so a /Reserved(\d+)/ over textContent captures
// "01" and silently reports 1 for a rendered 0.
function legendCounts() {
  const entries = within(screen.getByRole("list", { name: "Seat status summary" })).getAllByRole("listitem");
  const read = label => {
    const entry = entries.find(item => item.textContent.startsWith(label));
    return entry ? Number(entry.textContent.slice(label.length)) : null;
  };
  return { assigned: read("Assigned"), open: read("Open"), reserved: read("Reserved") };
}

test("legend counts describe the whole map when no filter is active", async () => {
  await renderViewer();
  assert.deepEqual(legendCounts(), { assigned: 2, open: 1, reserved: 1 });
});

test("legend counts follow an active department filter", async () => {
  // PR 3a: the filters live in the shell's left panel; standalone, the URL
  // (?dept=, PHASE1IA B3) is the door — the same state the panel writes.
  setUrl("/?dept=Corporate");
  await renderViewer();
  await flushFrames();

  // Corporate owns B-02 (Grace, assigned) and D-04 (open); the Litigation
  // seats must drop out rather than the legend keep reporting the whole map.
  assert.deepEqual(legendCounts(), { assigned: 1, open: 1, reserved: 0 });
  assert.match(screen.getByRole("toolbar", { name: "Map controls" }).textContent, /2 of 4 seats match/);
});

test("Escape clears a position-only filter, not just department, zone and status", async () => {
  setUrl("/?position=Paralegal");
  await renderViewer();
  await flushFrames();
  // Grace's B-02 is the only Paralegal seat, and an unoccupied seat never
  // matches a real position — so the open and reserved seats drop out.
  assert.deepEqual(legendCounts(), { assigned: 1, open: 0, reserved: 0 });

  // Dispatched at <body>: the handler ignores presses whose target is an
  // input or select, which is what keeps Escape inside the field a
  // query-clear rather than a filter reset.
  fireEvent.keyDown(document.body, { key: "Escape" });
  await flushFrames();

  assert.deepEqual(legendCounts(), { assigned: 2, open: 1, reserved: 1 });
  assert.equal(window.location.search, "", "the cleared filter leaves the URL");
});

// --- Deep links -------------------------------------------------------------

test("a ?seat= deep link selects that seat at mount", async () => {
  setUrl("/?seat=B-02");
  await renderViewer();

  assert.equal(inspectorMode(), READ_ONLY_INSPECTOR);
  assert.match(openInspector().textContent, /B-02/);
});

test("an unknown ?seat= value selects nothing rather than throwing", async () => {
  setUrl("/?seat=ZZ-99");
  await renderViewer();
  assert.equal(openInspector(), null);
});

test("selecting and clearing a seat writes the seat param back to the URL", async () => {
  await renderViewer();
  fireEvent.click(seatMarker("C-03"));
  await flushFrames();
  assert.match(window.location.search, /seat=C-03/);

  fireEvent.click(screen.getByRole("button", { name: /close/i }));
  await flushFrames();
  assert.doesNotMatch(window.location.search, /seat=/);
});

// --- The Find palette -------------------------------------------------------
// The people directory is browse mode inside the palette now, so every
// assertion about it has to open the palette first. Nothing docks at rest
// (contract #1), which is itself the first thing worth pinning.

// Focusing the field is one of the four documented ways in (click, focus, ⌘K,
// typing) and the one a test can drive without a keyboard shortcut.
function openPalette() {
  fireEvent.focus(screen.getByRole("searchbox"));
}

// D1-d scope (PR 3a): "This floor" lists this floor's rows; a find on the
// other floor needs the building scope first (the zero state offers Widen).
function widenScope() {
  fireEvent.click(screen.getByRole("button", { name: "Search scope: This floor" }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Whole building" }));
}

test("nothing docks at rest — the palette opens from the search field", async () => {
  await renderViewer();
  assert.equal(screen.queryByRole("list", { name: "People directory" }), null);
  assert.equal(screen.queryByRole("list", { name: "Viewer search results" }), null);

  openPalette();
  assert.ok(screen.getByRole("list", { name: "People directory" }));
});

test("the palette's people list is the published employee snapshot", async () => {
  await renderViewer();
  openPalette();
  const directory = screen.getByRole("list", { name: "People directory" });
  assert.match(directory.textContent, /Ada Lovelace/);
  assert.match(directory.textContent, /Grace Hopper/);
});

test("inactive employees stay out of the palette's people list", async () => {
  await renderViewer({ employees: [ADA, { ...GRACE, active: false }] });
  openPalette();
  const directory = screen.getByRole("list", { name: "People directory" });
  assert.match(directory.textContent, /Ada Lovelace/);
  assert.doesNotMatch(directory.textContent, /Grace Hopper/);
});

test("the palette browses zones with their published seat counts", async () => {
  await renderViewer();
  openPalette();
  const zones = within(screen.getByRole("group", { name: "Zones" })).getAllByRole("button");
  // North Offices holds A-01 and C-03; South Offices holds B-02 and D-04.
  assert.deepEqual(zones.map(chip => chip.textContent), ["North Offices2", "South Offices2"]);
});

test("picking a zone chip pins the filter and closes the palette", async () => {
  await renderViewer();
  openPalette();
  fireEvent.click(within(screen.getByRole("group", { name: "Zones" })).getAllByRole("button")[1]);
  await flushFrames();

  assert.equal(screen.queryByRole("list", { name: "People directory" }), null, "picking a zone ends the browse");
  // The pin lands on the same facet the Filter popover drives, so the legend
  // recounts against it: South Offices is B-02 (assigned) + D-04 (open).
  assert.deepEqual(legendCounts(), { assigned: 1, open: 1, reserved: 0 });
});

test("Escape from a palette row closes it and does not let the focus hand-back reopen it", async () => {
  await renderViewer();
  openPalette();
  // Focus a row, so Escape has to hand focus back to the field on the way out —
  // the row it was on is about to unmount. That hand-back reaches the field's
  // onFocus, which is also the handler that OPENS the palette, so without a
  // one-shot suppression Escape closed and re-opened it in the same frame and
  // read as doing nothing at all.
  const row = within(screen.getByRole("list", { name: "People directory" })).getByRole("button", { name: /^Ada Lovelace/ });
  row.focus();
  // Identity via assert.ok, never assert.equal, on DOM nodes: a failing
  // assert.equal on two elements makes node's differ serialize both trees and
  // it dies with "Array buffer allocation failed" after ~90s, hiding which
  // assertion actually failed.
  assert.ok(document.activeElement === row, "the row must take focus before Escape");

  // Dispatched on the ROW, not on window: the handler listens on window but
  // branches on event.target, and a keydown fired straight at window carries
  // target=window — not a Node inside the palette — so it would silently skip
  // the very hand-back this test exists to cover.
  fireEvent.keyDown(row, { key: "Escape" });
  await flushFrames();

  assert.equal(screen.queryByRole("list", { name: "People directory" }), null, "Escape must leave the palette closed");
  assert.ok(
    document.activeElement === screen.getByRole("searchbox"),
    "focus must land on the field, not <body>"
  );

  // …and a deliberate click still opens it, so the suppression is one-shot.
  fireEvent.click(screen.getByRole("searchbox"));
  assert.ok(screen.getByRole("list", { name: "People directory" }));
});

test("opening a person from the palette selects their seat and closes the palette", async () => {
  await renderViewer();
  openPalette();
  const directory = screen.getByRole("list", { name: "People directory" });
  fireEvent.click(within(directory).getByRole("button", { name: /^Grace Hopper/ }));
  await flushFrames();

  assert.equal(inspectorMode(), READ_ONLY_INSPECTOR);
  assert.match(openInspector().textContent, /B-02/);
  assert.equal(screen.queryByRole("list", { name: "People directory" }), null);
});

// --- Show occupant names -----------------------------------------------------
// The viewer legend's footer carries the shared NamesVisibilityToggle. The
// behavior pinned here: markers actually change render mode (not merely a
// pressed attribute), the choice persists per browser, and the toggle stays a
// render-local control — no server action, read-only surface intact.

const VIEWER_NAMES_KEY = "seat-planner:viewer-names-visible";

test("the legend names toggle switches markers to name mode and persists the choice", async () => {
  window.localStorage.removeItem(VIEWER_NAMES_KEY);
  await renderViewer();

  const toggle = screen.getByRole("button", { name: "Show occupant names" });
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.equal(markerMode("A-01"), "names-off");

  fireEvent.click(toggle);
  await flushFrames();

  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.equal(markerMode("A-01"), "name", "an assigned seat must render its occupant name");
  assert.equal(markerMode("D-04"), "footprint", "an open seat has no name to show");
  assert.equal(window.localStorage.getItem(VIEWER_NAMES_KEY), "true");
  assert.deepEqual(actionCalls, [], "the names toggle is render-local — never a server action");
});

test("a persisted names preference hydrates on mount", async () => {
  window.localStorage.setItem(VIEWER_NAMES_KEY, "true");
  try {
    await renderViewer();
    assert.equal(
      screen.getByRole("button", { name: "Show occupant names" }).getAttribute("aria-pressed"),
      "true"
    );
    assert.equal(markerMode("B-02"), "name");
  } finally {
    window.localStorage.removeItem(VIEWER_NAMES_KEY);
  }
});

// --- Status band (Option A, owner-picked 2026-08-17) -------------------------
// The floating legend card + floating zoom stack become one in-flow bottom
// band from the sm tier up. Only a mounting test can check the three moves
// that matter: the band is the ONE home for legend counts and zoom at >=640,
// phones keep the shipped floating zoom (and no band), and below the panel
// tier the band yields to the inspector bottom sheet instead of fighting it.

function statusBand() {
  return document.querySelector("[data-map-status-band]");
}

test("the status band carries the legend list and the only zoom cluster at desktop widths", async () => {
  await renderViewer();

  const band = statusBand();
  assert.ok(band, "expected the status band to render at the default 1280px viewport");
  assert.ok(
    band.contains(screen.getByRole("list", { name: "Seat status summary" })),
    "the seat-status list must live inside the band"
  );
  assert.match(band.textContent, /4 seats/);

  // getByRole throws on duplicates, so this doubles as the one-zoom-home
  // assertion: the floating stack must not render alongside the band.
  const zoomIn = screen.getByRole("button", { name: "Zoom in" });
  assert.ok(band.contains(zoomIn), "zoom controls must live inside the band at this tier");
  assert.ok(
    screen.getByRole("toolbar", { name: "Map controls" }).contains(screen.getByRole("button", { name: "Show occupant names" })),
    "the names switch lives in the control row (PHASE1IA B4, PR 3a)"
  );
});

test("zooming from the band updates its own live label", async () => {
  await renderViewer();
  const band = statusBand();
  assert.match(band.textContent, /Fit/);

  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await flushFrames();

  assert.match(statusBand().textContent, /100%/);
  assert.deepEqual(actionCalls, [], "zoom is render-local — never a server action");
});

test("below the sm tier the band stays away and the floating zoom stack remains", async () => {
  setViewportWidth(500);
  await renderViewer();

  // assert.ok(x === null), never assert.equal(element, null): a failing
  // element diff hangs ~100s then dies on buffer allocation (memory recipe).
  assert.ok(statusBand() === null, "no band on phones (owner call 2026-08-17: band >=640 only)");
  const zoomIn = screen.getByRole("button", { name: "Zoom in" });
  assert.ok(zoomIn, "phones keep the shipped floating zoom stack");
  assert.ok(screen.queryByRole("list", { name: "Seat status summary" }) === null, "no legend counts below sm — matches the shipped hidden-below-md legend");
});

// Below 640 the band (and its switch) is gone by owner call, so the names
// flipper moves into the phone's floating cluster — same accessible name, same
// pressed contract, same storage key, and exactly ONE such control in the
// tree (getByRole throws on a duplicate).
test("below the sm tier the names toggle lives in the control row and still drives the markers", async () => {
  window.localStorage.removeItem(VIEWER_NAMES_KEY);
  setViewportWidth(500);
  await renderViewer();

  // Exactly ONE names control at any width (getByRole throws on a duplicate):
  // the row's toggle, since PR 3a — the phone stack's flipper retired.
  const toggle = screen.getByRole("button", { name: "Show occupant names" });
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.ok(toggle.closest('[role="toolbar"][aria-label="Map controls"]'), "it is the control row's switch");
  assert.equal(markerMode("A-01"), "names-off");

  fireEvent.click(toggle);
  await flushFrames();

  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.equal(markerMode("A-01"), "name");
  assert.equal(window.localStorage.getItem(VIEWER_NAMES_KEY), "true");
  assert.deepEqual(actionCalls, [], "render-local — never a server action");
});

// Phase 4 PR 3b: the inspector is the right slot over the canvas column
// (PHASE3DS §1.17) — it never covers the band, so the band stays at every
// width while the inspector is open, and the slot host keys presence.
test("the band stays while the inspector is open at tablet widths — the slot never covers it", async () => {
  setViewportWidth(820);
  await renderViewer();
  assert.ok(statusBand(), "band renders at tablet widths while nothing is selected");
  assert.equal(document.querySelector("[data-slot-host]").getAttribute("data-open"), null, "closed slot: no presence key");

  fireEvent.click(seatMarker("A-01"));
  await flushFrames();
  assert.ok(openInspector(), "selecting a seat opens the inspector");
  assert.equal(document.querySelector("[data-slot-host]").getAttribute("data-open"), "", "the slot host is open");
  assert.ok(document.querySelector("[data-slot-host] #seat-inspector-panel"), "the inspector is the slot's child");
  assert.ok(statusBand() !== null, "the band stays — the slot sits over the canvas column, not the band");
  assert.ok(!document.querySelector("[data-slot-host]").contains(statusBand()), "the band is never under the slot");

  fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
  await flushFrames();
  assert.ok(statusBand() !== null, "the band is still there once the inspector closes");
  assert.equal(document.querySelector("[data-slot-host]").getAttribute("data-open"), null);
});

// AUDIT-2 §8.2: a never-published map rendered the bare floor plan with zero
// markers and a zeroed status band — nothing said why. First-run names it.
test("zero published seats shows the never-published state instead of a bare floor plan", async () => {
  await renderViewer({ seats: [], employees: [] });
  // With nothing published no floor is live, so the roster renders its
  // first-run state (multi-floor PR-2) — it still names the state and who acts.
  assert.match(document.body.textContent, /No one is listed on Floor 3 · Pre-Litigation yet/);
  assert.match(document.body.textContent, /admin/i);
  assert.ok(screen.queryByRole("img", { name: "Office floor plan" }) === null, "no bare floor plan");
});

// --- Multi-floor (PR-2) --------------------------------------------------------
// One canvas per floor; search, deep links and the department filter span the
// building and switch the floor for the user; an unmapped floor renders a
// roster instead of a plan (DECISIONS.md D1′). Floor 2 is unmapped in this
// build, so the fixture's unseated person works there by the interim rule.

const LINUS = makeEmployee({
  id: "emp-3",
  full_name: "Linus Torvalds",
  position: "Records Clerk",
  department: "Medical Records",
  phone_extension: "303",
  email: "linus@example.com"
});

async function renderTwoFloors(overrides = {}) {
  return renderViewer({ employees: [ADA, GRACE, LINUS], ...overrides });
}

const floorTrigger = () => screen.getByRole("button", { name: /^Change floor/ });
const roster = () => screen.queryByRole("region", { name: "Floor 2 · Litigation roster" });
const floorPlan = () => screen.queryByRole("img", { name: "Office floor plan" });
const viewport = () => document.getElementById("viewer-seat-map");

function liveText() {
  return [...document.querySelectorAll('[aria-live="polite"]')].map(node => node.textContent).join(" | ");
}

async function switchFloorTo(label) {
  fireEvent.click(floorTrigger());
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
  await flushFrames();
}

test("lands on Floor 3 by default: the plan renders, the selector names the floor, no floor param", async () => {
  await renderTwoFloors();
  assert.ok(floorPlan(), "the mapped floor renders its plan");
  assert.ok(roster() === null);
  assert.match(floorTrigger().getAttribute("aria-label"), /Floor 3 · Pre-Litigation/);
  assert.doesNotMatch(window.location.search, /floor=/);
  assert.equal(viewport().getAttribute("tabindex"), "0");
});

test("the floor selector lists both floors from the registry with no SOON badge", async () => {
  await renderTwoFloors();
  fireEvent.click(floorTrigger());
  const options = screen.getAllByRole("menuitemradio");
  assert.deepEqual(options.map(option => option.textContent), ["Floor 3 · Pre-Litigation", "Floor 2 · Litigation"]);
  assert.doesNotMatch(document.body.textContent, /SOON/);
});

test("an unmapped floor renders the roster of its people instead of a plan", async () => {
  await renderTwoFloors();
  await switchFloorTo("Floor 2 · Litigation");

  assert.ok(roster(), "the roster region renders");
  assert.ok(floorPlan() === null, "no plan on an unmapped floor");
  assert.match(roster().textContent, /Linus Torvalds/);
  assert.doesNotMatch(roster().textContent, /Ada Lovelace/, "seated people belong to their seat's floor");
  assert.equal(viewport().getAttribute("tabindex"), "-1", "no map to pan — the roster region is the tab stop");
  assert.match(liveText(), /Showing Floor 2 · Litigation/);
  assert.match(window.location.search, /floor=2/);
});

test("switching back to Floor 3 restores the plan and drops the floor param", async () => {
  await renderTwoFloors();
  await switchFloorTo("Floor 2 · Litigation");
  await switchFloorTo("Floor 3 · Pre-Litigation");
  assert.ok(floorPlan());
  assert.ok(roster() === null);
  assert.doesNotMatch(window.location.search, /floor=/);
});

test("on the roster floor the band carries the floor title and no map controls (Hidden, not disabled)", async () => {
  await renderTwoFloors();
  await switchFloorTo("Floor 2 · Litigation");

  const band = statusBand();
  assert.ok(band, "the band still renders at 1280");
  assert.match(band.textContent, /Floor 2 · Litigation · 1 person/);
  assert.ok(screen.queryByRole("list", { name: "Seat status summary" }) === null, "no legend counts without a map");
  assert.ok(screen.queryByRole("button", { name: "Zoom in" }) === null, "no zoom without a map");
  assert.ok(screen.queryByRole("button", { name: "Show occupant names" }) === null, "no names switch without markers");
  assert.equal(band.querySelectorAll("[disabled]").length, 0);
});

test("on a phone the roster floor mounts no floating zoom stack either", async () => {
  setViewportWidth(500);
  await renderTwoFloors();
  await switchFloorTo("Floor 2 · Litigation");
  assert.ok(roster());
  assert.ok(screen.queryByRole("button", { name: "Zoom in" }) === null);
  assert.ok(screen.queryByRole("button", { name: "Show occupant names" }) === null);
});

test("?floor=2 lands on the roster floor", async () => {
  setUrl("/?floor=2");
  await renderTwoFloors();
  assert.ok(roster());
  assert.match(floorTrigger().getAttribute("aria-label"), /Floor 2 · Litigation/);
});

test("the server-computed landing floor (own seat) is honoured", async () => {
  await renderTwoFloors({ landing: { urlFloor: null, ownFloor: "2" } });
  assert.ok(roster());
});

test("a remembered floor is restored on the next visit and mirrored to the URL", async () => {
  window.localStorage.setItem(VIEWER_FLOOR_KEY, "2");
  await renderTwoFloors();
  assert.ok(roster());
  assert.match(window.location.search, /floor=2/);
});

test("switching floors persists the choice; an invalid stored value is ignored", async () => {
  await renderTwoFloors();
  await switchFloorTo("Floor 2 · Litigation");
  assert.equal(window.localStorage.getItem(VIEWER_FLOOR_KEY), "2");
  cleanup();

  window.localStorage.setItem(VIEWER_FLOOR_KEY, "9");
  setUrl("/");
  await renderTwoFloors();
  assert.ok(floorPlan(), "garbage in storage falls back to Floor 3");
});

test("a ?floor= in the URL beats the remembered floor", async () => {
  window.localStorage.setItem(VIEWER_FLOOR_KEY, "2");
  setUrl("/?floor=3");
  await renderTwoFloors();
  assert.ok(floorPlan());
  assert.ok(roster() === null);
});

test("a ?seat= deep link beats the remembered floor and selects the seat on its own floor", async () => {
  window.localStorage.setItem(VIEWER_FLOOR_KEY, "2");
  setUrl("/?seat=B-02");
  await renderTwoFloors();
  assert.ok(floorPlan(), "the seat's floor wins");
  assert.equal(inspectorMode(), READ_ONLY_INSPECTOR);
  assert.match(openInspector().textContent, /B-02/);
  assert.match(window.location.search, /seat=B-02/);
  assert.doesNotMatch(window.location.search, /floor=/);
});

test("opening an unseated person from search switches to their floor, marks their row and focuses the roster", async () => {
  await renderTwoFloors();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Linus" } });
  await flushFrames();
  // Linus is on Floor 2: the "This floor" scope publishes the zero with the
  // building count and offers Widen (D1-d).
  assert.match(screen.getByRole("status").textContent, /0 on this floor · 1 in building/);
  widenScope();
  await flushFrames();
  const results = screen.getByRole("list", { name: "Viewer search results" });
  const row = within(results).getByRole("button", { name: /Linus Torvalds/ });
  assert.equal(row.disabled, false, "unseated people are openable (contract #9, amended 2026-09-01)");
  assert.match(row.getAttribute("aria-label"), /Floor 2 · Litigation/);

  fireEvent.click(row);
  await flushFrames();

  assert.ok(roster(), "the canvas switched to the person's floor");
  const marked = roster().querySelector('[data-roster-row][aria-current="true"]');
  assert.ok(marked, "the person's row is marked");
  assert.match(marked.textContent, /Linus Torvalds/);
  assert.equal(document.activeElement, roster(), "focus lands on the roster region, not <body>");
  assert.match(liveText(), /Linus Torvalds/);
  assert.deepEqual(actionCalls, [], "read-only surface — never a server action");
});

test("a department with no seats on this floor says where its people are and offers the switch (Q5)", async () => {
  setUrl("/?dept=Medical%20Records");
  await renderTwoFloors();
  await flushFrames();

  // The cross-floor line (lib/floors floorDepartmentSummary) rides the band's
  // note with its "Show Floor 2" action (PR 3a); the row states the zero.
  const band = statusBand();
  assert.match(screen.getByRole("toolbar", { name: "Map controls" }).textContent, /0 of 4 seats match/);
  assert.match(band.textContent, /1 person in Medical Records is on Floor 2/);
  fireEvent.click(within(band).getByRole("button", { name: "Show Floor 2" }));
  await flushFrames();

  assert.ok(roster(), "the switch action lands on the roster floor");
  assert.match(roster().textContent, /Linus Torvalds/);
});

test("on the roster floor the row counts people, and Names is Hidden without markers", async () => {
  await renderTwoFloors();
  await switchFloorTo("Floor 2 · Litigation");
  const row = screen.getByRole("toolbar", { name: "Map controls" });
  assert.match(row.textContent, /1 person/);
  assert.ok(within(row).queryByRole("button", { name: "Show occupant names" }) === null, "Hidden, not disabled, without markers");
});

test("on the roster floor a department filter (URL state) still filters the rows and names the way out", async () => {
  setUrl("/?floor=2&dept=Corporate");
  await renderTwoFloors();
  await flushFrames();
  assert.ok(roster());
  assert.equal(roster().querySelectorAll("[data-roster-row]").length, 0);
  // A filter that hides everyone is not first-run: name the filter, keep
  // the floor's real count in the heading, offer the way out.
  assert.match(roster().textContent, /No one on Floor 2 · Litigation matches the active filters/);
  assert.doesNotMatch(roster().textContent, /No one is listed on/);
  assert.match(within(roster()).getByRole("heading", { level: 2 }).textContent, /— 1 person/);
  fireEvent.click(within(roster()).getByRole("button", { name: "Clear filters" }));
  await flushFrames();
  assert.equal(roster().querySelectorAll("[data-roster-row]").length, 1);
});

test("opening an unseated person from the People directory (no query) marks and announces them", async () => {
  await renderTwoFloors();
  openPalette();
  const directory = screen.getByRole("list", { name: "People directory" });
  fireEvent.click(within(directory).getByRole("button", { name: /^Linus Torvalds/ }));
  await flushFrames();

  assert.ok(roster(), "the canvas switched to the person's floor");
  const marked = roster().querySelector('[data-roster-row][aria-current="true"]');
  assert.ok(marked, "the browse path marks the row like the query path does");
  assert.match(marked.textContent, /Linus Torvalds/);
  assert.equal(document.activeElement, roster());
  assert.match(liveText(), /Linus Torvalds highlighted on the Floor 2 · Litigation roster/);
});

test("a manual floor switch after a find announces the floor and drops the stale result", async () => {
  await renderTwoFloors();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Linus" } });
  await flushFrames();
  widenScope();
  await flushFrames();
  fireEvent.click(within(screen.getByRole("list", { name: "Viewer search results" })).getByRole("button", { name: /Linus Torvalds/ }));
  await flushFrames();
  assert.match(liveText(), /Linus Torvalds highlighted/);

  await switchFloorTo("Floor 3 · Pre-Litigation");
  assert.match(liveText(), /Showing Floor 3 · Pre-Litigation/);
  assert.doesNotMatch(liveText(), /highlighted|selected on the map/);

  // And the seat path: a selected seat's announcement must not outlive the
  // switch that just deselected it.
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "B-02" } });
  await flushFrames();
  fireEvent.click(within(screen.getByRole("list", { name: "Viewer search results" })).getAllByRole("button")[0]);
  await flushFrames();
  assert.match(liveText(), /selected on the map/);
  await switchFloorTo("Floor 2 · Litigation");
  assert.match(liveText(), /Showing Floor 2 · Litigation/);
  assert.doesNotMatch(liveText(), /selected on the map/);
  assert.ok(openInspector() === null, "the switch deselects");
});

test("a found person stays marked on the roster even when a structured filter would hide them", async () => {
  setUrl("/?dept=Corporate");
  await renderTwoFloors();
  await flushFrames();

  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Linus" } });
  await flushFrames();
  widenScope();
  await flushFrames();
  fireEvent.click(within(screen.getByRole("list", { name: "Viewer search results" })).getByRole("button", { name: /Linus Torvalds/ }));
  await flushFrames();

  assert.ok(roster());
  const marked = roster().querySelector('[data-roster-row][aria-current="true"]');
  assert.ok(marked, "the found person is exempt from the filter, like the selected seat is exempt from dimming");
  assert.match(marked.textContent, /Linus Torvalds/);
  assert.match(liveText(), /Linus Torvalds highlighted/);
});

