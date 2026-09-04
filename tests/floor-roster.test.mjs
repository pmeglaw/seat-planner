import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, flushFrames, screen, within, cleanup } from "./helpers/renderComponent.mjs";

// FloorRoster (multi-floor PR-2): the surface an UNMAPPED floor renders in
// place of a plan — every active person who works there, grouped by
// department. Rows are static list items (DECISIONS.md deviation 9): every
// fact the inspector would show is already on the row, so there is nothing
// to open and nothing to disable. The only control is the zero-result
// "Clear search" button. The region itself is focusable so the list stays
// keyboard-scrollable (axe scrollable-region-focusable).
let FloorRoster;
let focusFloorRoster;
before(async () => {
  ({ FloorRoster, focusFloorRoster } = await loadComponent("@/components/seat-map/FloorRoster"));
});
beforeEach(() => {
  configureContext({});
  // jsdom has no scrollIntoView; the roster calls it on highlight.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});
afterEach(() => cleanup());

function person(id, full_name, department, position, phone_extension, email) {
  return { id, full_name, department, position, phone_extension, email, avatar_url: null, active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
}

const PEOPLE = [
  person("dan", "Dan Ortiz", null, "Clerk", "104", "dan@example.com"),
  person("cara", "cara VANCE", "litigation ", "Paralegal", "103", "cara@example.com"),
  person("bob", "Bob Ito", "Litigation", "Attorney", "102", "bob@example.com"),
  person("alice", "Alice Ng", "Case Management", "Case Manager", "101", "alice@example.com")
];

const HELPER = "The 2nd-floor plan is not mapped yet.";

async function renderRoster(overrides = {}) {
  const props = { floor: "2", people: PEOPLE, query: "", helper: HELPER, ...overrides };
  const result = await renderElement(React.createElement(FloorRoster, props));
  await flushFrames();
  return result;
}

const region = () => screen.getByRole("region", { name: "Floor 2 · Litigation roster" });
const rows = () => [...document.querySelectorAll("[data-roster-row]")];

test("renders a focusable region headed by the floor label and the people count", async () => {
  await renderRoster();
  const root = region();
  assert.equal(root.getAttribute("tabindex"), "0", "the scroll region is a tab stop");
  assert.match(within(root).getByRole("heading", { level: 2 }).textContent, /Floor 2 · Litigation — 4 people/);
  assert.match(root.textContent, /The 2nd-floor plan is not mapped yet\./);
});

test("groups people by department A→Z with No department last, and people A→Z within", async () => {
  await renderRoster();
  const groups = [...region().querySelectorAll("[data-roster-group]")].map(group => group.getAttribute("data-roster-group"));
  assert.deepEqual(groups, ["Case Management", "Litigation", "No department"]);
  assert.deepEqual(rows().map(row => row.getAttribute("data-roster-row")), ["alice", "bob", "cara", "dan"]);
  // Each row carries every fact the seat inspector would show.
  const bob = rows()[1];
  assert.match(bob.textContent, /Bob Ito/);
  assert.match(bob.textContent, /Attorney/);
  assert.match(bob.textContent, /102/);
  assert.match(bob.textContent, /bob@example\.com/);
});

test("rows are static list items — nothing to open, nothing disabled (deviation 9)", async () => {
  await renderRoster();
  // PR 3a (D1-e): the only controls at rest are the rows' Copy link icon
  // buttons — one per person, named for the person, never a row action.
  const copyButtons = [...region().querySelectorAll("button")];
  assert.equal(copyButtons.length, 4, "one Copy link per row, nothing else");
  assert.ok(copyButtons.every(button => /^Copy link for /.test(button.getAttribute("aria-label") ?? "")));
  assert.equal(region().querySelectorAll("[disabled]").length, 0);
  assert.equal(region().querySelectorAll('[role="listitem"]').length, 4);
});

test("a query filters rows in place and publishes the count, zero included", async () => {
  await renderRoster({ query: "para" });
  assert.deepEqual(rows().map(row => row.getAttribute("data-roster-row")), ["cara"]);
  const live = region().querySelector('[aria-live="polite"]');
  assert.match(live.textContent, /1 of 4 people match “para”/);
});

test("a query with no matches names it, names the floor, and offers the way out", async () => {
  let cleared = 0;
  await renderRoster({ query: "nobody", onClearSearch: () => { cleared += 1; } });
  assert.equal(rows().length, 0);
  const status = within(region()).getByRole("status");
  assert.match(status.textContent, /No results for “nobody” on Floor 2 · Litigation/);
  fireEvent.click(within(region()).getByRole("button", { name: "Clear search" }));
  assert.equal(cleared, 1);
});

test("first-run: an empty roster names the state and who acts next", async () => {
  await renderRoster({ people: [] });
  const status = within(region()).getByRole("status");
  assert.match(status.textContent, /No one is listed on Floor 2 · Litigation yet/);
  assert.match(status.textContent, /People appear here after an admin publishes the seat map\./);
  assert.equal(region().querySelectorAll("button").length, 0, "no Clear control without a query");
});

test("the highlighted person is the marked row and the region can take focus", async () => {
  await renderRoster({ highlightedPersonId: "cara", regionId: "viewer-floor-roster" });
  const marked = rows().filter(row => row.getAttribute("aria-current") === "true");
  assert.deepEqual(marked.map(row => row.getAttribute("data-roster-row")), ["cara"]);

  focusFloorRoster("viewer-floor-roster");
  await flushFrames();
  assert.equal(document.activeElement, region());
});

// The viewer floats its floor/crumb chip cluster over the top-left of the
// stage; on the roster that is exactly where the sticky header sits, so the
// caller passes the cluster's measured height and the header clears it.
test("a header inset pushes the sticky heading below the caller's floating chrome", async () => {
  await renderRoster({ headerInsetPx: 64 });
  const header = region().querySelector("h2").parentElement;
  assert.equal(header.style.paddingTop, "64px");
});

// A structured filter that hides everyone is NOT first-run: the map has been
// published, the emptiness is the filter — name it, keep the floor's real
// count in the heading, and offer the way out (review finding, 2026-09-01).
test("filters hiding everyone name the filter, keep the floor total, and offer Clear filters", async () => {
  let cleared = 0;
  await renderRoster({ people: [], totalCount: 4, filtersActive: true, onClearFilters: () => { cleared += 1; } });
  assert.match(within(region()).getByRole("heading", { level: 2 }).textContent, /— 4 people/);
  const status = within(region()).getByRole("status");
  assert.match(status.textContent, /No one on Floor 2 · Litigation matches the active filters/);
  assert.doesNotMatch(status.textContent, /No one is listed/);
  fireEvent.click(within(region()).getByRole("button", { name: "Clear filters" }));
  assert.equal(cleared, 1);
});

test("with filters narrowing the list the header publishes the visible count against the floor total", async () => {
  await renderRoster({ people: PEOPLE.slice(0, 2), totalCount: 4, filtersActive: true });
  assert.match(within(region()).getByRole("heading", { level: 2 }).textContent, /— 4 people/);
  assert.match(region().querySelector('[aria-live="polite"]').textContent, /2 of 4 people match the active filters/);
});

test("Copy link writes a ?q= landing URL for the person and shows an in-place Copied done-state", async () => {
  const written = [];
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async text => { written.push(text); } } });
  await renderRoster();
  const button = within(region()).getByRole("button", { name: "Copy link for Bob Ito" });
  fireEvent.click(button);
  await new Promise(resolve => setTimeout(resolve, 0));
  await flushFrames();
  assert.equal(written.length, 1);
  assert.match(written[0], /\?q=Bob\+Ito$/);
  assert.equal(button.getAttribute("data-done"), "Copied");
  assert.match(region().textContent, /Link copied for Bob Ito\./);
});
