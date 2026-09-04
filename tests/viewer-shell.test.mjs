import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup, screen, within, flushFrames, setUrl, setViewportWidth, waitFor } from "./helpers/renderComponent.mjs";

// The viewer INSIDE the persistent shell (redesign-v2 PR 2, route-group move
// of / — owner confirmation 2026-09-03): the search field lands in the
// tenant row, the four filter groups (Department · Zone · Status · Position,
// owner ruling 2026-09-04) register with the left panel, toggling an item
// filters the map, and the applied filters are URL state (?dept= ?zone=
// ?status= ?position=, PHASE1IA B3). tests/viewer-seat-finder.test.mjs covers
// the surface standalone; this file covers the seam.

let AppShell;
let ViewerSeatFinder;
before(async () => {
  ({ AppShell, ViewerSeatFinder } = await loadComponent("./tests/helpers/viewerShellEntry.ts"));
});

beforeEach(() => {
  configureContext({ pathname: "/", actions: { getPublishHistoryAction: async () => [] } });
  setViewportWidth(1280);
  setUrl("/");
  try {
    window.localStorage.clear();
  } catch {
    // no storage
  }
});
afterEach(() => cleanup());

function employee(id, full_name, department, position) {
  return { id, full_name, department, position, phone_extension: null, email: null, avatar_url: null, active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
}
function seat(overrides) {
  return { seat_key: overrides.label.toLowerCase(), x: 0.3, y: 0.3, layer: "published", employee_id: overrides.employee?.id ?? null, notes: null, is_custom: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", employee: null, ...overrides };
}
const ADA = employee("e1", "Ada Lovelace", "Litigation", "Attorney");
const GRACE = employee("e2", "Grace Hopper", "Corporate", "Paralegal");
const FIXTURE = {
  employees: [ADA, GRACE],
  seats: [
    seat({ id: "s1", label: "A-01", status: "assigned", employee: ADA, zone: "North Offices", department: "Litigation" }),
    seat({ id: "s2", label: "B-02", status: "assigned", employee: GRACE, zone: "South Offices", department: "Corporate", x: 0.6, y: 0.4 }),
    seat({ id: "s3", label: "C-03", status: "reserved", zone: "South Offices", department: "Litigation", x: 0.8, y: 0.7 }),
    seat({ id: "s4", label: "D-04", status: "available", zone: "South Offices", department: "Corporate", x: 0.4, y: 0.8 })
  ],
  departmentOptions: [
    { id: "d1", name: "Litigation", active: true, created_at: "", updated_at: "" },
    { id: "d2", name: "Corporate", active: true, created_at: "", updated_at: "" }
  ],
  zoneOptions: [
    { id: "z1", name: "North Offices", active: true, created_at: "", updated_at: "" },
    { id: "z2", name: "South Offices", active: true, created_at: "", updated_at: "" }
  ]
};

const quietDetector = { check: async () => false, isSkewed: () => false };
async function renderInShell(props = {}) {
  const result = await renderElement(
    React.createElement(
      AppShell,
      { email: "viewer@example.com", userId: "v1", isAdmin: false, skewDetector: quietDetector, initialShell: { publishedAt: "2026-09-02T21:12:00Z", mySeat: null } },
      React.createElement(ViewerSeatFinder, { ...FIXTURE, ...props })
    )
  );
  await flushFrames();
  return result;
}

function legendCounts() {
  const band = screen.getByRole("list", { name: "Seat status summary" });
  const read = label => Number(within(band).getByText(label, { exact: false }).closest("li")?.textContent.match(/\d+/)?.[0] ?? NaN);
  return { assigned: read("Assigned"), open: read("Open"), reserved: read("Reserved") };
}

async function openLeftPanel() {
  const hamburger = await waitFor(() => screen.getByRole("button", { name: "Filters" }));
  await act(async () => fireEvent.click(hamburger));
  await flushFrames();
  return screen.getByRole("complementary", { name: "Filters" });
}

test("the search field portals into the tenant row and the viewer renders no chrome of its own", async () => {
  await renderInShell();
  const row = document.querySelector("[data-shell-tenants]");
  const search = screen.getByRole("search", { name: "Viewer search" });
  assert.ok(row.contains(search), "the search field lands in the tenant row's left slot");
  assert.equal(screen.getAllByRole("banner").length, 1, "one header — the shell's");
  assert.equal(screen.queryByRole("button", { name: /^Filter seating/ }), null, "the old Filter popover trigger is not rendered in-shell");
  assert.equal(screen.getByRole("link", { name: "Skip to seat map" }).getAttribute("href"), "#viewer-seat-map");
});

test("the four filter groups register with the left panel, in order, with per-floor counts including zero", async () => {
  await renderInShell();
  const panel = await openLeftPanel();
  const groups = Array.from(panel.querySelectorAll("fieldset")).map(fieldset => fieldset.querySelector(".sp-filter-group-row").firstChild.textContent);
  assert.deepEqual(groups, ["Department", "Zone", "Status", "Position"]);
  const count = name => within(panel).getByRole("checkbox", { name: new RegExp(`^${name}`) }).closest("label").querySelector(".sp-filter-count").textContent;
  assert.equal(count("Litigation"), "2");
  assert.equal(count("Corporate"), "2");
  assert.equal(count("North Offices"), "1");
  assert.equal(count("Assigned"), "2");
  assert.equal(count("Unavailable"), "0", "zero counts render");
  assert.equal(count("Attorney"), "1");
});

test("toggling an item filters the map (legend follows), writes ?dept= to the URL, and re-checking clears it", async () => {
  await renderInShell();
  assert.deepEqual(legendCounts(), { assigned: 2, open: 1, reserved: 1 });
  const panel = await openLeftPanel();
  await act(async () => fireEvent.click(within(panel).getByRole("checkbox", { name: /^Corporate/ })));
  await flushFrames();
  assert.deepEqual(legendCounts(), { assigned: 1, open: 1, reserved: 0 });
  assert.equal(window.location.search, "?dept=Corporate");
  assert.ok(within(panel).getByRole("button", { name: "Clear all" }));
  await act(async () => fireEvent.click(within(panel).getByRole("checkbox", { name: /^Corporate/ })));
  await flushFrames();
  assert.deepEqual(legendCounts(), { assigned: 2, open: 1, reserved: 1 });
  assert.equal(window.location.search, "");
});

test("a ?position= deep link applies on load and Clear all clears every param", async () => {
  setUrl("/?position=Paralegal&dept=Corporate");
  await renderInShell();
  assert.deepEqual(legendCounts(), { assigned: 1, open: 0, reserved: 0 }, "Grace's Corporate Paralegal seat is the only match");
  const panel = await openLeftPanel();
  assert.equal(within(panel).getByRole("checkbox", { name: /^Paralegal/ }).checked, true);
  await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Clear all" })));
  await flushFrames();
  assert.equal(window.location.search, "");
  assert.deepEqual(legendCounts(), { assigned: 2, open: 1, reserved: 1 });
});
