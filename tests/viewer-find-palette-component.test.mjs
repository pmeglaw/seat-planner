import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadComponent,
  renderElement,
  React,
  configureContext,
  fireEvent,
  flushFrames,
  screen,
  within,
  cleanup
} from "./helpers/renderComponent.mjs";

// The Find palette, mounted standalone. tests/viewer-find-palette.test.mjs
// covers the FEED (lib/viewerFindPalette); this covers what the surface does
// with it — which mode owns the slot, that a zone chip previews before it
// pins, that an unseated person can be read but never opened (contract #9),
// and that the hover preview is always released when the palette closes.
//
// Standalone rather than only through ViewerSeatFinder: the palette is
// presentational, so driving its callbacks directly is the only way to assert
// that hover fires with the right argument and that a disabled row fires
// nothing at all.
let ViewerFindPalette;
before(async () => {
  ({ ViewerFindPalette } = await loadComponent("@/components/seat-map/ViewerFindPalette"));
});

beforeEach(() => {
  configureContext({});
});
afterEach(() => cleanup());

function personRow(overrides = {}) {
  return {
    id: `person:${overrides.title}`,
    kind: "person",
    title: "Ada Lovelace",
    subtitle: "A-01 · North Offices",
    meta: "Attorney · Litigation",
    seatId: "seat-1",
    seatIds: ["seat-1"],
    status: "assigned",
    floor: "3",
    employeeId: `emp:${overrides.title}`,
    ...overrides
  };
}

const ADA = personRow({ title: "Ada Lovelace", id: "person:ada" });
const BEN = personRow({ title: "Ben Carter", id: "person:ben", subtitle: "B-02 · South Offices", seatId: "seat-2", seatIds: ["seat-2"] });
// Unseated: the contract #9 row — listed, honest, and (since the 2026-09-01
// multi-floor amendment) openable: the person works on the unmapped floor.
const CASS = personRow({
  title: "Cass Nolan",
  id: "person:cass",
  subtitle: "Floor 2 · Litigation",
  seatId: null,
  seatIds: [],
  status: undefined,
  floor: "2"
});

const BROWSE = {
  zones: [
    { name: "North Offices", seatCount: 12 },
    { name: "South Offices", seatCount: 7 }
  ],
  people: [ADA, BEN, CASS],
  totalCount: 3,
  seatedCount: 2,
  summary: "3 people · 2 seated"
};

const SEAT_RESULT = {
  id: "seat:seat-2",
  kind: "seat",
  title: "B-02",
  subtitle: "Ben Carter",
  meta: "Assigned · Litigation · South Offices",
  seatId: "seat-2",
  seatIds: ["seat-2"]
};

// Records every callback the palette can fire, so a test can assert both what
// happened and what did NOT.
function makeSpies() {
  const calls = [];
  const record = name => (...args) => calls.push([name, ...args]);
  return {
    calls,
    onZoneHoverChange: record("zoneHover"),
    onZonePin: record("zonePin"),
    onRowHoverChange: record("rowHover"),
    onOpenRow: record("openRow"),
    onClearSearch: record("clearSearch")
  };
}

// Mounts the palette beside a real search field, because two of its behaviors
// (left-edge anchoring, ArrowUp exiting the list) are defined against that
// field rather than against the palette alone.
function Harness({ paletteProps }) {
  const anchorRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const searchInputRef = React.useRef(null);
  return React.createElement(
    "div",
    null,
    React.createElement(
      "div",
      { ref: anchorRef },
      React.createElement("input", { ref: searchInputRef, type: "search", "aria-label": "Search office seating" })
    ),
    React.createElement(ViewerFindPalette, { anchorRef, containerRef, searchInputRef, ...paletteProps })
  );
}

async function renderPalette(overrides = {}) {
  const spies = makeSpies();
  const paletteProps = {
    query: "",
    browse: BROWSE,
    results: [],
    resultCountLabel: "0 results",
    mappedSeatCount: 0,
    activeResultId: null,
    selectedSeatId: null,
    pinnedZone: "all",
    ...spies,
    ...overrides
  };
  const result = await renderElement(React.createElement(Harness, { paletteProps }));
  // The list window measures itself in an animation frame.
  await flushFrames();
  return { ...result, spies };
}

function browseList() {
  return screen.getByRole("list", { name: "People directory" });
}

function browseRow(name) {
  return within(browseList()).getByRole("button", { name: new RegExp(`^${name}`) });
}

// Scoped to the chip row: a zone NAME also appears in every row subtitle for
// that zone, so an unscoped query by name matches people as well as chips.
function zoneChip(name) {
  return within(screen.getByRole("group", { name: "Zones" })).getByRole("button", { name: new RegExp(`^${name}`) });
}

// --- Browse mode ------------------------------------------------------------

test("browse mode renders the zone chips and the A→Z people feed", async () => {
  await renderPalette();

  const zones = screen.getByRole("group", { name: "Zones" });
  const chips = within(zones).getAllByRole("button");
  assert.deepEqual(chips.map(chip => chip.textContent), ["North Offices12", "South Offices7"]);

  const rows = within(browseList()).getAllByRole("listitem");
  assert.equal(rows.length, 3);
  assert.match(browseList().textContent, /Ada Lovelace/);
  assert.match(browseList().textContent, /Cass Nolan/);
  // The search-results list is the OTHER mode — never both in the same slot.
  assert.equal(screen.queryByRole("list", { name: "Viewer search results" }), null);
});

test("browse mode carries the feed's own summary in the footer legend", async () => {
  const { container } = await renderPalette();
  // Browse scopes the legend to the keys that work from the field: the field's
  // Enter handler is gated on an active query, so browse must not advertise
  // "Enter opens" (P5).
  assert.match(container.textContent, /↑↓ to move · Esc closes/);
  assert.doesNotMatch(container.textContent, /Enter opens/);
  assert.match(container.textContent, /3 people · 2 seated/);
});

test("a zone chip previews before it pins, and releases the preview on leave", async () => {
  const { spies } = await renderPalette();
  const chip = zoneChip("North Offices");

  fireEvent.mouseEnter(chip);
  assert.deepEqual(spies.calls.at(-1), ["zoneHover", "North Offices"]);
  fireEvent.mouseLeave(chip);
  assert.deepEqual(spies.calls.at(-1), ["zoneHover", null]);

  // Keyboard reaches the same preview — it is not a pointer-only affordance.
  fireEvent.focus(chip);
  assert.deepEqual(spies.calls.at(-1), ["zoneHover", "North Offices"]);

  fireEvent.click(chip);
  assert.deepEqual(spies.calls.at(-1), ["zonePin", "North Offices"]);
});

test("clicking the pinned zone chip again clears the filter rather than re-pinning it", async () => {
  const { spies } = await renderPalette({ pinnedZone: "North Offices" });
  const chip = zoneChip("North Offices");

  assert.equal(chip.getAttribute("aria-pressed"), "true");
  fireEvent.click(chip);
  assert.deepEqual(spies.calls.at(-1), ["zonePin", "all"]);
});

test("closing the palette releases a live hover preview instead of stranding it on the map", async () => {
  const { spies, unmount } = await renderPalette();
  fireEvent.mouseEnter(zoneChip("South Offices"));
  spies.calls.length = 0;

  // Unmounting never fires mouseleave/blur, so without the cleanup the wash
  // would stay painted over the plan after the palette is gone.
  unmount();
  assert.deepEqual(spies.calls, [["zoneHover", null], ["rowHover", null]]);
});

test("an unseated person is listed, honest about their floor, and openable (contract #9, amended 2026-09-01)", async () => {
  const { spies } = await renderPalette();
  const row = browseRow("Cass Nolan");

  assert.equal(row.disabled, false, "never disabled — the content must be read, and the row now opens the floor");
  assert.match(row.textContent, /Floor 2/);
  assert.doesNotMatch(row.textContent, /No seat/);
  fireEvent.click(row);
  assert.deepEqual(spies.calls.at(-1), ["openRow", CASS]);
});

test("a seated person on another floor carries a floor tag beside the seat code; same-floor rows do not", async () => {
  const benDownstairs = { ...BEN, floor: "2" };
  await renderPalette({ browse: { ...BROWSE, people: [ADA, benDownstairs, CASS] }, currentFloor: "3" });
  assert.match(browseRow("Ben Carter").textContent, /Floor 2/);
  assert.doesNotMatch(browseRow("Ada Lovelace").textContent, /Floor 3/);
  // The row's explicit aria-label replaces its content, so the visual tag
  // must be spoken too.
  assert.match(browseRow("Ben Carter").getAttribute("aria-label"), /Floor 2/);
  assert.doesNotMatch(browseRow("Ada Lovelace").getAttribute("aria-label"), /Floor 3/);
});

test("query results tag a seat on another floor too", async () => {
  await renderPalette({ query: "b", results: [{ ...SEAT_RESULT, floor: "2" }], resultCountLabel: "1 result", mappedSeatCount: 1, currentFloor: "3" });
  const list = screen.getByRole("list", { name: "Viewer search results" });
  assert.match(list.textContent, /Floor 2/);
  assert.match(within(list).getByRole("button").getAttribute("aria-label"), /Floor 2/);
});

test("a seated row opens through the one selection path and lights its seat on hover", async () => {
  const { spies } = await renderPalette();
  const row = browseRow("Ben Carter");

  fireEvent.pointerEnter(row);
  assert.deepEqual(spies.calls.at(-1), ["rowHover", "seat-2"]);
  fireEvent.pointerLeave(row);
  assert.deepEqual(spies.calls.at(-1), ["rowHover", null]);

  fireEvent.click(row);
  assert.deepEqual(spies.calls.at(-1), ["openRow", BEN]);
});

// --- Query mode -------------------------------------------------------------

test("a query swaps the same slot to results — the directory does not linger behind it", async () => {
  await renderPalette({ query: "ben", results: [SEAT_RESULT], resultCountLabel: "1 result", mappedSeatCount: 1 });

  const results = screen.getByRole("list", { name: "Viewer search results" });
  assert.match(results.textContent, /B-02/);
  assert.equal(screen.queryByRole("list", { name: "People directory" }), null);
  assert.equal(screen.queryByRole("group", { name: "Zones" }), null);
});

test("query mode is the one place the legend claims Enter", async () => {
  const { container } = await renderPalette({ query: "ben", results: [SEAT_RESULT], resultCountLabel: "1 result", mappedSeatCount: 1 });
  assert.match(container.textContent, /↑↓ to move · Enter opens · Esc closes/);
});

test("a query with no matches reports it and offers the way out", async () => {
  const { spies } = await renderPalette({ query: "nobody", results: [], resultCountLabel: "0 results" });

  assert.match(screen.getByRole("status").textContent, /No results for/);
  assert.equal(screen.queryByRole("list", { name: "Viewer search results" }), null);
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  assert.deepEqual(spies.calls.at(-1), ["clearSearch"]);
});

// --- Roving -----------------------------------------------------------------
// Both lists are one tab stop with arrow traversal inside, and ArrowUp off the
// first row returns focus to the field the rows came from. Browse mode steps by
// ABSOLUTE index because only a slice of it is mounted; query mode may walk the
// DOM because it renders every row.

test("arrow keys rove the browse feed and ArrowUp exits to the search field", async () => {
  await renderPalette();
  const field = screen.getByRole("searchbox");

  fireEvent.keyDown(browseList(), { key: "ArrowDown" });
  assert.equal(document.activeElement, browseRow("Ada Lovelace"));

  fireEvent.keyDown(browseList(), { key: "ArrowDown" });
  assert.equal(document.activeElement, browseRow("Ben Carter"));

  // The unseated row is openable now (contract #9, amended 2026-09-01), so
  // roving reaches it instead of skipping it.
  fireEvent.keyDown(browseList(), { key: "ArrowDown" });
  assert.equal(document.activeElement, browseRow("Cass Nolan"));

  fireEvent.keyDown(browseList(), { key: "ArrowUp" });
  assert.equal(document.activeElement, browseRow("Ben Carter"));
  fireEvent.keyDown(browseList(), { key: "ArrowUp" });
  assert.equal(document.activeElement, browseRow("Ada Lovelace"));
  fireEvent.keyDown(browseList(), { key: "ArrowUp" });
  assert.equal(document.activeElement, field);
});

test("arrow keys rove the results list and ArrowUp exits to the search field", async () => {
  await renderPalette({ query: "o", results: [SEAT_RESULT, { ...SEAT_RESULT, id: "seat:seat-1", title: "A-01", seatId: "seat-1", seatIds: ["seat-1"] }], resultCountLabel: "2 results", mappedSeatCount: 2 });
  const list = screen.getByRole("list", { name: "Viewer search results" });
  const rows = within(list).getAllByRole("button");

  fireEvent.keyDown(list, { key: "ArrowDown" });
  assert.equal(document.activeElement, rows[0]);
  fireEvent.keyDown(list, { key: "ArrowDown" });
  assert.equal(document.activeElement, rows[1]);
  fireEvent.keyDown(list, { key: "ArrowUp" });
  assert.equal(document.activeElement, rows[0]);
  fireEvent.keyDown(list, { key: "ArrowUp" });
  assert.equal(document.activeElement, screen.getByRole("searchbox"));
});

// --- Keyboard-scrollable regions --------------------------------------------

test("both list regions keep a tab stop of their own", async () => {
  // axe scrollable-region-focusable: every row is a <button>, but rows for
  // unseated people render disabled, so a directory where nobody is seated
  // would otherwise have no tab stop and could not be scrolled by keyboard.
  await renderPalette();
  assert.equal(browseList().getAttribute("tabindex"), "0");
  cleanup();

  await renderPalette({ query: "ben", results: [SEAT_RESULT], resultCountLabel: "1 result", mappedSeatCount: 1 });
  assert.equal(screen.getByRole("list", { name: "Viewer search results" }).getAttribute("tabindex"), "0");
});

// AUDIT-2 §8.2: before the first publish the browse feed has zero people, and
// the palette rendered its "People — seated first" eyebrow over an empty list.
// First-run states its emptiness and the next step instead.
test("browse mode with zero people shows a first-run message, not an eyebrow over nothing", async () => {
  await renderPalette({
    browse: { zones: [], people: [], totalCount: 0, seatedCount: 0, summary: "0 people · 0 seated" }
  });
  assert.ok(!screen.queryByRole("list", { name: "People directory" }));
  assert.doesNotMatch(document.body.textContent, /People — seated first/);
  assert.match(document.body.textContent, /No one is in the directory yet/i);
  assert.match(document.body.textContent, /publish/i);
});
