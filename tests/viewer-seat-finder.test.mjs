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
});
afterEach(() => cleanup());

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

test("the admin shortcut is gated on the role the server page passes down", async () => {
  await renderViewer({ showAdminShortcut: false });
  assert.equal(screen.queryByRole("link", { name: "Open admin surface" }), null);
  cleanup();

  await renderViewer({ showAdminShortcut: true });
  assert.ok(screen.getByRole("link", { name: "Open admin surface" }));
});

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
  await renderViewer();
  fireEvent.click(screen.getByRole("button", { name: "Filter seating" }));
  const group = screen.getByRole("group", { name: "Filter options" });
  const departmentSelect = within(group).getAllByRole("combobox")[0];
  fireEvent.change(departmentSelect, { target: { value: "Corporate" } });
  await flushFrames();

  // Corporate owns B-02 (Grace, assigned) and D-04 (open); the Litigation
  // seats must drop out rather than the legend keep reporting the whole map.
  assert.deepEqual(legendCounts(), { assigned: 1, open: 1, reserved: 0 });
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

// --- People directory -------------------------------------------------------

test("the people directory lists the published employee snapshot", async () => {
  await renderViewer();
  const directory = screen.getByRole("list", { name: "People directory" });
  assert.match(directory.textContent, /Ada Lovelace/);
  assert.match(directory.textContent, /Grace Hopper/);
});

test("inactive employees stay out of the directory", async () => {
  await renderViewer({ employees: [ADA, { ...GRACE, active: false }] });
  const directory = screen.getByRole("list", { name: "People directory" });
  assert.match(directory.textContent, /Ada Lovelace/);
  assert.doesNotMatch(directory.textContent, /Grace Hopper/);
});
