import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadComponent,
  renderElement,
  React,
  configureContext,
  setPathname,
  setViewportWidth,
  fireEvent,
  act,
  cleanup,
  screen,
  within,
  flushFrames,
  waitFor
} from "./helpers/renderComponent.mjs";

// Persistent-shell tests (nav-lag fix, redesign-v2 PR 2 shell): AppShell is
// the ONE mount point for the chrome — the Phase 3 header, the left filter
// panel, the Help / History / Account panels and the provisional tenant row —
// created by app/(shell)/layout.tsx and kept alive across client-side
// navigations. These pin: nothing remounts on a route change (same DOM
// nodes), navigation stays on the client router, a skewed tab downgrades to
// a document load, surface handlers reach the shell through registration
// (guard veto, live draft status, filter groups), tenants reach the tenant
// row through portals, and the panels' open / close / focus contracts.

let AppShell;
let useAppShellNavigation;
let useAppShellLeftPanel;
let useAppShellState;
let useAppShellFilters;
before(async () => {
  ({ AppShell, useAppShellNavigation, useAppShellLeftPanel, useAppShellState, useAppShellFilters } = await loadComponent("@/components/ui/AppShell"));
});

let pushed;
let assigned;
let draftStatusCalls;
const quietDetector = { check: async () => false, isSkewed: () => false };
beforeEach(() => {
  pushed = [];
  assigned = [];
  draftStatusCalls = 0;
  setViewportWidth(1280);
  configureContext({
    router: { push: href => pushed.push(href) },
    navigation: { assign: href => assigned.push(href) },
    pathname: "/admin",
    actions: {
      getDraftStatusAction: async () => ((draftStatusCalls += 1), { changeCount: 7, lastEditAt: null, publishedAt: "2026-09-02T21:12:00Z" }),
      getPublishHistoryAction: async () => []
    }
  });
  try {
    window.localStorage.clear();
  } catch {
    // no storage in this environment
  }
});
afterEach(() => cleanup());

const SHELL = { publishedAt: "2026-09-02T21:12:00Z", mySeat: { label: "L02", floor: "3" } };

function shellElement({ pathname, children = null, skewDetector = quietDetector, isAdmin = true, initialShell = SHELL } = {}) {
  if (pathname) setPathname(pathname);
  return React.createElement(AppShell, { email: "jane@example.com", userId: "u1", isAdmin, skewDetector, initialShell }, children);
}

const header = () => screen.getByRole("banner");
const leftHost = () => document.getElementById("shell-left-panel");
const panelsHost = () => document.getElementById("shell-panels");

test("every shell route mounts ONE header with the section links, indicator and utilities — / included", async () => {
  await renderElement(shellElement({ pathname: "/admin" }));
  assert.equal(screen.getAllByRole("banner").length, 1);
  assert.equal(header().id, "shell-header");
  assert.equal(screen.getByRole("link", { name: "Seat map" }).getAttribute("aria-current"), "page");
  assert.ok(screen.getByRole("button", { name: "Help" }) && screen.getByRole("button", { name: "History" }) && screen.getByRole("button", { name: "Account" }));
  assert.equal(document.querySelector("[data-shell-tenants]"), null, "no tenant row under the header (PR 3a closed the PR 2 seam)");
  assert.equal(screen.getByRole("link", { name: "Skip to seat map" }).getAttribute("href"), "#planning-canvas");
  cleanup();
  await renderElement(shellElement({ pathname: "/", isAdmin: false }));
  assert.equal(screen.getAllByRole("banner").length, 1);
  assert.equal(screen.getByRole("link", { name: "Skip to seat map" }).getAttribute("href"), "#viewer-seat-map");
  assert.equal(screen.getByRole("link", { name: "Seat map" }).getAttribute("href"), "/");
  assert.ok(screen.getByRole("button", { name: /Published · Sep 2, 2026/ }), "a viewer reads the published date");
});

test("sub-pages: skip target, aria-current, reserved hamburger slot, draft count fetched once", async () => {
  await renderElement(shellElement({ pathname: "/admin/settings" }));
  assert.equal(screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current"), "page");
  assert.equal(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href"), "#admin-subpage-main");
  assert.equal(screen.queryByRole("button", { name: "Filters" }), null, "no filters registered → reserved slot (D0-h at lg+)");
  assert.ok(header().querySelector(".sp-header-slot--reserved"));
  await waitFor(() => screen.getByRole("button", { name: /Draft — 7 changes/ }));
  assert.equal(draftStatusCalls, 1, "the shell asks once per mount on an admin sub-page");
});

test("reception maps to its own active item and skip target; viewers never fetch the draft status", async () => {
  await renderElement(shellElement({ pathname: "/reception", isAdmin: false }));
  assert.equal(screen.getByRole("link", { name: "Reception" }).getAttribute("aria-current"), "page");
  assert.equal(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href"), "#reception-main");
  assert.equal(screen.queryByRole("link", { name: "Management" }), null);
  await flushFrames();
  assert.equal(draftStatusCalls, 0, "the viewer shell never calls the admin-only action (two-layer rule)");
});

// The heart of the nav-lag fix: a route change re-renders the shell with a
// new pathname, it must NOT remount it. Node identity is the strongest
// observable — a remounted header is a NEW element, which is exactly the
// blank-flash bug this guards against.
test("header, left host and panels host persist across /admin → /admin/management → /reception → / — same DOM nodes", async () => {
  const utils = await renderElement(shellElement({ pathname: "/admin" }));
  const before = { header: header(), left: leftHost(), panels: panelsHost() };
  for (const pathname of ["/admin/management", "/reception", "/"]) {
    setPathname(pathname);
    await act(async () => utils.rerender(shellElement({})));
    assert.equal(header(), before.header, `${pathname}: the header must be the same mounted node`);
    assert.equal(leftHost(), before.left, `${pathname}: the left panel host must persist`);
    assert.equal(panelsHost(), before.panels, `${pathname}: the panels host must persist`);
  }
  assert.equal(screen.getByRole("link", { name: "Seat map" }).getAttribute("aria-current"), "page");
});

test("normal navigation is client-side; a skewed tab uses assignLocation", async () => {
  await renderElement(shellElement({ pathname: "/admin" }));
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(pushed, ["/admin/management"]);
  assert.deepEqual(assigned, []);
  cleanup();
  pushed = [];
  await renderElement(shellElement({ pathname: "/admin", skewDetector: { check: async () => true, isSkewed: () => true } }));
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(assigned, ["/admin/management"]);
  assert.deepEqual(pushed, []);
});

// Registration contract: a surface plugs its guard in on mount and the shell
// routes every link through it; unmounting restores plain navigation.
function Registrar({ guard, opener, askPlannerOpen, draftStatus }) {
  useAppShellNavigation({ guard, openAskPlanner: opener, askPlannerOpen, draftStatus });
  return null;
}

test("a registered guard vetoes header navigation; unregistering restores it", async () => {
  const calls = [];
  const utils = await renderElement(
    shellElement({ pathname: "/admin", children: React.createElement(Registrar, { guard: (href, label) => (calls.push([href, label]), false) }) })
  );
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(calls, [["/admin/management", "Management"]]);
  assert.deepEqual(pushed, []);
  await act(async () => utils.rerender(shellElement({})));
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(pushed, ["/admin/management"]);
});

test("Ask Planner opener / open-state registration is a safe no-op in the PR 2 shell", async () => {
  await renderElement(shellElement({ pathname: "/admin", children: React.createElement(Registrar, { guard: () => true, opener: () => {}, askPlannerOpen: true }) }));
  assert.equal(screen.queryByRole("button", { name: /Ask Planner/ }), null, "the shell renders no AI entry (PR 3's control row does)");
});

test("a registered live draftStatus drives the indicator and suppresses the fetch", async () => {
  await renderElement(shellElement({ pathname: "/admin", children: React.createElement(Registrar, { guard: () => true, draftStatus: { changeCount: 4, lastEditAt: null } }) }));
  assert.ok(screen.getByRole("button", { name: /Draft — 4 changes/ }));
  await flushFrames();
  assert.equal(draftStatusCalls, 0, "a live value means no round-trip");
});

// Left-panel contract (PR 3a): the control row's "Filters · N" button opens
// the same panel the hamburger does, through useAppShellLeftPanel; "Find me"
// reads the person's published seat through useAppShellState.
function LeftPanelSurface() {
  const leftPanel = useAppShellLeftPanel();
  const state = useAppShellState();
  return React.createElement(
    "div",
    null,
    React.createElement("button", { type: "button", onClick: () => leftPanel?.open() }, `Open filters (${leftPanel?.isOpen ? "open" : "closed"})`),
    React.createElement("span", null, state?.mySeat ? `Seat ${state.mySeat.label} · ${state.email}` : "no seat")
  );
}

test("a surface opens the left panel through useAppShellLeftPanel and reads the shell state", async () => {
  await renderElement(shellElement({ pathname: "/", isAdmin: false, children: React.createElement(React.Fragment, null, React.createElement(FilterSurface, { spec: FILTERS }), React.createElement(LeftPanelSurface)) }));
  assert.ok(screen.getByText("Seat L02 · jane@example.com"));
  const opener = await waitFor(() => screen.getByRole("button", { name: "Open filters (closed)" }));
  await act(async () => fireEvent.click(opener));
  await flushFrames();
  assert.ok(leftHost().hasAttribute("data-open"), "the left panel host opens");
  assert.ok(screen.getByRole("button", { name: "Open filters (open)" }), "isOpen mirrors the host");
  assert.equal(document.querySelector("[data-shell-tenants]"), null);
});

// --- Right panels ------------------------------------------------------------

test("History opens from its utility as a complementary landmark; opening Account swaps; Esc closes and returns focus", async () => {
  await renderElement(shellElement({ pathname: "/admin/management" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "History" })));
  assert.ok(screen.getByRole("complementary", { name: "History" }));
  assert.equal(screen.getByRole("button", { name: "History" }).getAttribute("aria-expanded"), "true");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Account" })));
  assert.equal(screen.queryByRole("complementary", { name: "History" }), null, "one panel at a time");
  const account = screen.getByRole("complementary", { name: "Account" });
  assert.ok(within(account).getByRole("button", { name: "Sign out" }).closest('form[action="/auth/signout"][method="post"]'));
  await act(async () => fireEvent.keyDown(account, { key: "Escape" }));
  assert.equal(screen.queryByRole("complementary", { name: "Account" }), null);
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Account" }), "Esc returns focus to the utility");
});

test("the mode indicator opens History; a route commit closes the open panel", async () => {
  const utils = await renderElement(shellElement({ pathname: "/admin", children: React.createElement(Registrar, { guard: () => true, draftStatus: { changeCount: 2, lastEditAt: null } }) }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Draft — 2 changes/ })));
  assert.ok(screen.getByRole("complementary", { name: "History" }));
  setPathname("/admin/management");
  await act(async () => utils.rerender(shellElement({})));
  assert.equal(screen.queryByRole("complementary", { name: "History" }), null);
});

test("the History switch navigates to the other mode through the guard, keeping ?floor= and ?seat=", async () => {
  const calls = [];
  window.history.replaceState(null, "", "/admin?floor=2&seat=N01&ask-planner=open");
  try {
    await renderElement(shellElement({ pathname: "/admin", children: React.createElement(Registrar, { guard: (href, label) => (calls.push([href, label]), true), draftStatus: { changeCount: 0, lastEditAt: null } }) }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "History" })));
    const modeSwitch = screen.getByRole("group", { name: "Mode" });
    await act(async () => fireEvent.click(within(modeSwitch).getByRole("button", { name: "Published" })));
    assert.deepEqual(calls, [["/?floor=2&seat=N01", "the published map"]]);
    assert.deepEqual(pushed, ["/?floor=2&seat=N01"]);
    assert.equal(screen.queryByRole("complementary", { name: "History" }), null, "the panel closes on switch");
  } finally {
    window.history.replaceState(null, "", "/");
  }
});

test("a vetoed switch stays put", async () => {
  await renderElement(shellElement({ pathname: "/admin", children: React.createElement(Registrar, { guard: () => false, draftStatus: { changeCount: 1, lastEditAt: null } }) }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "History" })));
  await act(async () => fireEvent.click(within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: "Published" })));
  assert.deepEqual(pushed, []);
  assert.deepEqual(assigned, []);
});

// --- Left panel ----------------------------------------------------------------

function FilterSurface({ spec }) {
  useAppShellFilters(spec);
  return null;
}
const FILTERS = {
  groups: [{ id: "department", label: "Department", state: "ready", items: [{ id: "Litigation", label: "Litigation", count: 3, checked: false }] }],
  appliedCount: 0,
  onToggle: () => {},
  onClearGroup: () => {},
  onClearAll: () => {}
};

test("registered filters give the header a hamburger; it opens the left panel, Esc closes it and refocuses the hamburger; the choice is remembered per user", async () => {
  await renderElement(shellElement({ pathname: "/", isAdmin: false, children: React.createElement(FilterSurface, { spec: FILTERS }) }));
  const hamburger = await waitFor(() => screen.getByRole("button", { name: "Filters" }));
  assert.equal(leftHost().getAttribute("data-open"), null);
  await act(async () => fireEvent.click(hamburger));
  await flushFrames();
  assert.equal(leftHost().getAttribute("data-open"), "true");
  assert.ok(within(screen.getByRole("complementary", { name: "Filters" })).getByRole("checkbox", { name: /Litigation/ }));
  assert.equal(hamburger.getAttribute("aria-expanded"), "true");
  assert.ok(document.querySelector("[data-shell-content]").className.includes("pl-[var(--sp-panel-left-w)]"), "the open panel pushes the content pane");
  assert.equal(window.localStorage.getItem("seat-planner:left-panel-open:u1"), "true");
  await act(async () => fireEvent.keyDown(screen.getByRole("complementary", { name: "Filters" }), { key: "Escape" }));
  assert.equal(leftHost().getAttribute("data-open"), null);
  assert.equal(document.activeElement, hamburger);
  assert.equal(window.localStorage.getItem("seat-planner:left-panel-open:u1"), "false");
});

test("a route commit closes the left panel; unregistering the filters retires the hamburger", async () => {
  const utils = await renderElement(shellElement({ pathname: "/", isAdmin: false, children: React.createElement(FilterSurface, { spec: FILTERS }) }));
  const hamburger = await waitFor(() => screen.getByRole("button", { name: "Filters" }));
  await act(async () => fireEvent.click(hamburger));
  await flushFrames();
  assert.equal(leftHost().getAttribute("data-open"), "true");
  setPathname("/reception");
  await act(async () => utils.rerender(shellElement({ isAdmin: false })));
  assert.equal(leftHost().getAttribute("data-open"), null);
  await waitFor(() => assert.equal(screen.queryByRole("button", { name: "Filters" }), null));
});

test("below the header-nav breakpoint the hamburger exists everywhere and the panel carries the section links", async () => {
  setViewportWidth(1024);
  await renderElement(shellElement({ pathname: "/admin/settings" }));
  const hamburger = await waitFor(() => screen.getByRole("button", { name: "Filters" }));
  await act(async () => fireEvent.click(hamburger));
  const nav = within(screen.getByRole("complementary", { name: "Sections" })).getByRole("navigation", { name: "Sections" });
  assert.equal(within(nav).getByRole("link", { name: "Settings" }).getAttribute("aria-current"), "page");
  await waitFor(() => screen.getByRole("button", { name: "Draft · 7" }), "the indicator compacts below the breakpoint");
});

test("useAppShellNavigation, useAppShellLeftPanel, useAppShellState and useAppShellFilters are safe no-ops without a shell ancestor", async () => {
  function Standalone() {
    assert.equal(useAppShellLeftPanel(), null);
    assert.equal(useAppShellState(), null);
    return null;
  }
  await renderElement(
    React.createElement(React.Fragment, null, React.createElement(Registrar, { guard: () => false }), React.createElement(FilterSurface, { spec: FILTERS }), React.createElement(Standalone))
  );
});
