import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup, screen, within, flushFrames } from "./helpers/renderComponent.mjs";

// LeftPanel — the 256px filter panel (+ section links below the header-nav
// breakpoint), exercised standalone with a registered filter spec. AppShell's
// suite covers the hamburger, persistence and the live registration channel.

let LeftPanel;
before(async () => {
  ({ LeftPanel } = await loadComponent("@/components/ui/LeftPanel"));
});

beforeEach(() => configureContext({ pathname: "/" }));
afterEach(() => cleanup());

const LINKS = [
  { id: "map", label: "Seat map", href: "/", current: true },
  { id: "reception", label: "Reception", href: "/reception", current: false }
];

function spec(overrides = {}) {
  return {
    groups: [
      { id: "department", label: "Department", state: "ready", items: [{ id: "Litigation", label: "Litigation", count: 20, checked: true }, { id: "Intake", label: "Intake", count: 0, checked: false }] },
      { id: "zone", label: "Zone", state: "ready", items: [{ id: "North", label: "North pod", count: 12, checked: false }] },
      { id: "status", label: "Status", state: "ready", items: [{ id: "assigned", label: "Assigned", count: 56, checked: false }] },
      { id: "position", label: "Position", state: "ready", items: [{ id: "Attorney", label: "Attorney", count: 9, checked: false }] }
    ],
    appliedCount: 1,
    onToggle: () => {},
    onClearGroup: () => {},
    onClearAll: () => {},
    ...overrides
  };
}

function panel(overrides = {}) {
  return React.createElement(LeftPanel, {
    open: true,
    onClose: () => {},
    belowNav: false,
    links: LINKS,
    onLinkClick: () => {},
    filters: spec(),
    isAdmin: false,
    ...overrides
  });
}

const host = () => document.getElementById("shell-left-panel");

test("closed: host mounted, no data-open, no aside", async () => {
  await renderElement(panel({ open: false }));
  assert.ok(host());
  assert.equal(host().getAttribute("data-open"), null);
  assert.equal(host().querySelector("aside"), null);
});

test("open with filters: complementary named Filters, the four groups in order, counts incl. zero, checked state, data-open a frame later", async () => {
  await renderElement(panel());
  const aside = screen.getByRole("complementary", { name: "Filters" });
  const groups = Array.from(aside.querySelectorAll("fieldset")).map(fieldset => fieldset.querySelector(".sp-filter-group-row").firstChild.textContent);
  assert.deepEqual(groups, ["Department", "Zone", "Status", "Position"], "Position is the fourth group (owner ruling 2026-09-04)");
  const litigation = within(aside).getByRole("checkbox", { name: /Litigation/ });
  assert.equal(litigation.checked, true);
  const intake = within(aside).getByRole("checkbox", { name: /Intake/ });
  assert.equal(intake.checked, false);
  assert.equal(intake.closest("label").querySelector(".sp-filter-count").textContent, "0", "zero counts render");
  await flushFrames();
  assert.equal(host().getAttribute("data-open"), "true");
});

test("toggling an item, clearing a group, clearing all", async () => {
  const toggled = [];
  const cleared = [];
  let clearedAll = 0;
  await renderElement(panel({ filters: spec({ onToggle: (g, i) => toggled.push([g, i]), onClearGroup: g => cleared.push(g), onClearAll: () => (clearedAll += 1) }) }));
  const aside = screen.getByRole("complementary", { name: "Filters" });
  await act(async () => fireEvent.click(within(aside).getByRole("checkbox", { name: /Intake/ })));
  assert.deepEqual(toggled, [["department", "Intake"]]);
  const clearButtons = within(aside).getAllByRole("button", { name: "Clear" });
  assert.equal(clearButtons.length, 1, "only the group with a checked item shows Clear");
  await act(async () => fireEvent.click(clearButtons[0]));
  assert.deepEqual(cleared, ["department"]);
  await act(async () => fireEvent.click(within(aside).getByRole("button", { name: "Clear all" })));
  assert.equal(clearedAll, 1);
});

test("nothing applied: no Clear all", async () => {
  await renderElement(panel({ filters: spec({ appliedCount: 0, groups: [{ id: "department", label: "Department", state: "ready", items: [{ id: "a", label: "A", count: 1, checked: false }] }] }) }));
  assert.equal(screen.queryByRole("button", { name: "Clear all" }), null);
});

test("loading group → skeleton rows; error group → notification with Retry; hidden group absent; note renders", async () => {
  const retried = [];
  await renderElement(
    panel({
      filters: spec({
        groups: [
          { id: "department", label: "Department", state: "loading", items: [] },
          { id: "zone", label: "Zone", state: "error", items: [] },
          { id: "status", label: "Status", state: "ready", hidden: true, items: [] }
        ],
        appliedCount: 0,
        note: "Zone and status are seat facts — Floor 2 has no seats yet.",
        onRetryGroup: id => retried.push(id)
      })
    })
  );
  const aside = screen.getByRole("complementary", { name: "Filters" });
  assert.equal(aside.querySelectorAll(".sp-skeleton-row").length, 3);
  const alert = within(aside).getByRole("alert");
  assert.match(alert.textContent, /Zone couldn't load/);
  await act(async () => fireEvent.click(within(alert).getByRole("button", { name: "Retry" })));
  assert.deepEqual(retried, ["zone"]);
  assert.equal(within(aside).queryByText("Status"), null, "hidden groups do not render");
  assert.ok(within(aside).getByText(/Floor 2 has no seats yet/));
});

test("all groups empty: admin gets the Management link; viewer reads Ask an admin", async () => {
  const emptyGroups = [
    { id: "department", label: "Department", state: "ready", items: [] },
    { id: "zone", label: "Zone", state: "ready", items: [] }
  ];
  await renderElement(panel({ isAdmin: true, filters: spec({ groups: emptyGroups, appliedCount: 0 }) }));
  assert.ok(screen.getByText("Filters appear once departments and zones exist"));
  assert.equal(screen.getByRole("link", { name: "Go to Management" }).getAttribute("href"), "/admin/management?tab=departments");
  cleanup();
  await renderElement(panel({ isAdmin: false, filters: spec({ groups: emptyGroups, appliedCount: 0 }) }));
  assert.ok(screen.getByText("Ask an admin."));
  assert.equal(screen.queryByRole("link", { name: "Go to Management" }), null);
});

test("below the nav breakpoint: section links render above the filters with aria-current, routed through onLinkClick", async () => {
  const clicks = [];
  await renderElement(panel({ belowNav: true, onLinkClick: (event, href, label) => clicks.push([href, label]) }));
  const nav = screen.getByRole("navigation", { name: "Sections" });
  const map = within(nav).getByRole("link", { name: "Seat map" });
  assert.equal(map.getAttribute("aria-current"), "page");
  assert.equal(within(nav).getByRole("link", { name: "Reception" }).getAttribute("aria-current"), null);
  const aside = screen.getByRole("complementary", { name: "Filters" });
  assert.ok(nav.compareDocumentPosition(aside.querySelector("fieldset")) & Node.DOCUMENT_POSITION_FOLLOWING, "links precede the filters");
  await act(async () => fireEvent.click(within(nav).getByRole("link", { name: "Reception" })));
  assert.deepEqual(clicks, [["/reception", "Reception"]]);
});

test("no filters registered: nothing renders at lg+; below the breakpoint the links render under a Sections title", async () => {
  await renderElement(panel({ filters: null }));
  assert.equal(host().querySelector("aside"), null, "no content → the host stays empty (D0-h)");
  cleanup();
  await renderElement(panel({ filters: null, belowNav: true }));
  assert.ok(screen.getByRole("complementary", { name: "Sections" }));
  assert.ok(screen.getByRole("navigation", { name: "Sections" }));
});

test("Escape inside the panel calls onClose", async () => {
  let closed = 0;
  await renderElement(panel({ onClose: () => (closed += 1) }));
  await act(async () => fireEvent.keyDown(screen.getByRole("complementary", { name: "Filters" }), { key: "Escape" }));
  assert.equal(closed, 1);
});
