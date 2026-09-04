import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, setPathname, fireEvent, act, cleanup, screen, within } from "./helpers/renderComponent.mjs";

// Standalone AppTopBar suite — the Phase 3 shell header (redesign-v2 PR 2).
// AppShell-level wiring (panels opening, slot registration, chrome
// persistence) lives in tests/app-shell.test.mjs; these pin the header's OWN
// structural guardrails: the skip link first in tab order, the hamburger /
// reserved-slot contract, role-fitted section links with aria-current, the
// status-only mode indicator, the three utilities with their tooltips — and
// the three navigation contracts the retired AppRail used to carry (veto with
// modifier bypass, deploy-skew full load, 4s stalled-nav watchdog), exercised
// through the header links via a harness that mounts useShellNavigation the
// way AppShell does. Visual styling is deliberately unpinned.

let AppTopBar;
let useShellNavigation;
before(async () => {
  ({ AppTopBar } = await loadComponent("@/components/ui/AppTopBar"));
  ({ useShellNavigation } = await loadComponent("@/components/ui/useShellNavigation"));
});

let pushed;
let assigned;
const quietDetector = { check: async () => false, isSkewed: () => false };
const skewedDetector = { check: async () => true, isSkewed: () => true };
beforeEach(() => {
  pushed = [];
  assigned = [];
  configureContext({ router: { push: href => pushed.push(href) }, navigation: { assign: href => assigned.push(href) }, pathname: "/admin" });
});
afterEach(() => cleanup());

const ADMIN_LINKS = [
  { id: "map", label: "Seat map", href: "/admin" },
  { id: "reception", label: "Reception", href: "/reception" },
  { id: "management", label: "Management", href: "/admin/management" },
  { id: "settings", label: "Settings", href: "/admin/settings" }
];
const VIEWER_LINKS = [
  { id: "map", label: "Seat map", href: "/" },
  { id: "reception", label: "Reception", href: "/reception" }
];
const DRAFT = { kind: "draft", publishedAt: "2026-09-02T21:12:00Z", changeCount: 4, lastEditAt: null };

// Stands in for AppShell: owns the open states and mounts the navigation
// contracts so link clicks run the real veto / skew / watchdog code.
function Harness({ overrides, guard, skewDetector = quietDetector }) {
  const [leftOpen, setLeftOpen] = React.useState(false);
  const [openPanel, setOpenPanel] = React.useState(null);
  const { onLinkClick } = useShellNavigation({ guard, skewDetector });
  return React.createElement(AppTopBar, {
    isAdmin: true,
    pathname: "/admin",
    active: "map",
    links: ADMIN_LINKS,
    skipLink: { href: "#planning-canvas", label: "Skip to seat map" },
    onLinkClick,
    hasLeftContent: true,
    leftOpen,
    onToggleLeft: () => setLeftOpen(current => !current),
    modeStatus: DRAFT,
    compact: false,
    openPanel,
    onTogglePanel: panel => setOpenPanel(current => (current === panel ? null : panel)),
    ...overrides
  });
}

const renderBar = (overrides = {}, harness = {}) => renderElement(React.createElement(Harness, { overrides, ...harness }));
const bar = () => screen.getByRole("banner");

test("the skip link is the header's first focusable, then the hamburger, then the name", async () => {
  await renderBar();
  assert.equal(bar().id, "shell-header");
  const focusable = bar().querySelectorAll("a, button, input, [tabindex]");
  assert.equal(focusable[0].getAttribute("href"), "#planning-canvas");
  assert.equal(focusable[0].textContent, "Skip to seat map");
  assert.equal(focusable[1], screen.getByRole("button", { name: "Filters" }), "hamburger follows the skip link");
  assert.equal(focusable[2].className, "cds-header-name");
});

test("hamburger: aria-expanded flips, controls the left panel, both glyphs stay mounted; no content → reserved slot", async () => {
  await renderBar();
  const hamburger = screen.getByRole("button", { name: "Filters" });
  assert.equal(hamburger.getAttribute("aria-controls"), "shell-left-panel");
  assert.equal(hamburger.getAttribute("aria-expanded"), "false");
  assert.ok(hamburger.querySelector(".sp-glyph-menu") && hamburger.querySelector(".sp-glyph-close"), "the CSS swaps the glyphs on aria-expanded");
  await act(async () => fireEvent.click(hamburger));
  assert.equal(hamburger.getAttribute("aria-expanded"), "true");
  cleanup();
  await renderBar({ hasLeftContent: false });
  assert.equal(screen.queryByRole("button", { name: "Filters" }), null);
  assert.ok(bar().querySelector(".sp-header-slot--reserved[aria-hidden='true']"), "the 48px slot is reserved, not collapsed (D0-h)");
});

test("section links are role-fitted with aria-current on the active one; the name is text only", async () => {
  await renderBar({ active: "management" });
  const nav = screen.getByRole("navigation", { name: "Sections" });
  const labels = within(nav).getAllByRole("link").map(link => link.textContent);
  assert.deepEqual(labels, ["Seat map", "Reception", "Management", "Settings"]);
  assert.equal(within(nav).getByRole("link", { name: "Seat map" }).getAttribute("href"), "/admin");
  assert.equal(within(nav).getByRole("link", { name: "Management" }).getAttribute("aria-current"), "page");
  assert.equal(within(nav).getByRole("link", { name: "Seat map" }).getAttribute("aria-current"), null);
  assert.equal(within(nav).getByRole("link", { name: "Management" }).getAttribute("title"), "Management", "title is the e2e selector");
  const name = bar().querySelector(".cds-header-name");
  assert.match(name.textContent, /Megeredchian Law Seat Planner/);
  assert.equal(name.querySelector("img, svg"), null, "text only — no graphic mark (D0-d, owner ruling 2026-09-04)");
  assert.equal(name.querySelector('[translate="no"]').textContent, "Megeredchian Law");
  cleanup();
  await renderBar({ isAdmin: false, links: VIEWER_LINKS, active: "map" });
  const viewerNav = screen.getByRole("navigation", { name: "Sections" });
  assert.deepEqual(within(viewerNav).getAllByRole("link").map(link => link.textContent), ["Seat map", "Reception"]);
  assert.equal(within(viewerNav).getByRole("link", { name: "Seat map" }).getAttribute("href"), "/");
});

test("the mode indicator is status only: text per state, opens History, skeleton while loading", async () => {
  await renderBar();
  const indicator = screen.getByRole("button", { name: /Draft — 4 changes/ });
  assert.ok(indicator.className.includes("sp-mode--draft"));
  assert.equal(indicator.getAttribute("aria-controls"), "shell-panel-history");
  assert.equal(indicator.getAttribute("aria-expanded"), "false");
  assert.ok(indicator.querySelector("svg.sp-mode-mark [data-stroke]"), "the draft mark is an inlined hollow diamond");
  await act(async () => fireEvent.click(indicator));
  assert.equal(indicator.getAttribute("aria-expanded"), "true");
  assert.equal(screen.getByRole("button", { name: "History" }).getAttribute("aria-expanded"), "true", "opening from the indicator outlines the History utility too");
  cleanup();
  await renderBar({ modeStatus: { kind: "published", publishedAt: "2026-09-02T21:12:00Z" }, compact: true });
  assert.ok(screen.getByRole("button", { name: "Published" }), "compact form below the nav breakpoint");
  cleanup();
  await renderBar({ modeStatus: { kind: "loading" } });
  assert.equal(screen.queryByRole("button", { name: /Draft|Published/ }), null);
  const loading = bar().querySelector(".sp-mode--loading");
  assert.equal(loading.getAttribute("aria-busy"), "true");
  assert.ok(loading.querySelector(".sp-mode-skeleton"));
  cleanup();
  await renderBar({ modeStatus: { kind: "error" } });
  assert.ok(screen.getByRole("button", { name: "Publish state unavailable" }), "error still opens the panel");
  cleanup();
  await renderBar({ modeStatus: { kind: "unpublished" } });
  assert.ok(screen.getByRole("button", { name: "Not yet published" }));
});

test("the three utilities carry a tooltip that repeats the label and flip aria-expanded with the open panel", async () => {
  await renderBar();
  for (const label of ["Help", "History", "Account"]) {
    const button = screen.getByRole("button", { name: label });
    assert.equal(button.getAttribute("aria-controls"), `shell-panel-${label.toLowerCase()}`);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    const tooltip = button.parentElement.querySelector('[role="tooltip"]');
    assert.equal(tooltip?.textContent, label, "the tooltip text IS the aria-label (tier C)");
    assert.ok(button.parentElement.className.includes("sp-has-tooltip"));
  }
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Account" })));
  assert.equal(screen.getByRole("button", { name: "Account" }).getAttribute("aria-expanded"), "true");
  assert.equal(screen.getByRole("button", { name: "Help" }).getAttribute("aria-expanded"), "false");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Account" })));
  assert.equal(screen.getByRole("button", { name: "Account" }).getAttribute("aria-expanded"), "false", "pressing the open utility closes it");
});

// --- Navigation contracts (moved verbatim from tests/app-rail.test.mjs) -----

test("clicking a section link runs the guard with href + label, then navigates on the client when allowed", async () => {
  const calls = [];
  await renderBar({}, { guard: (href, label) => (calls.push([href, label]), true) });
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(calls, [["/admin/management", "Management"]]);
  assert.deepEqual(pushed, ["/admin/management"]);
  assert.deepEqual(assigned, []);
});

test("a vetoing guard blocks the navigation", async () => {
  await renderBar({}, { guard: () => false });
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Settings" })));
  assert.deepEqual(pushed, []);
});

test("without a guard, links navigate plainly; the name link goes to the viewer", async () => {
  await renderBar();
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Reception" })));
  await act(async () => fireEvent.click(screen.getByRole("link", { name: /Megeredchian Law/ })));
  assert.deepEqual(pushed, ["/reception", "/"]);
});

test("a ctrl-click skips the guard and client navigation, and arms no watchdog", async () => {
  const calls = [];
  await renderBar({}, { guard: (...args) => (calls.push(args), true) });
  const scheduled = [];
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = (fn, ms, ...rest) => (scheduled.push(ms), originalSetTimeout(fn, ms, ...rest));
  try {
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" }), { ctrlKey: true }));
  } finally {
    window.setTimeout = originalSetTimeout;
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(pushed, []);
  assert.ok(!scheduled.includes(4000), "a modified click must not arm the 4s nav watchdog");
});

test("a skewed tab navigates via full document load, not the client router; the veto still wins", async () => {
  await renderBar({}, { skewDetector: skewedDetector });
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(assigned, ["/admin/management"]);
  assert.deepEqual(pushed, []);
  cleanup();
  assigned = [];
  await renderBar({}, { skewDetector: skewedDetector, guard: () => false });
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Settings" })));
  assert.deepEqual(assigned, []);
  assert.deepEqual(pushed, []);
});

test("mounting the header probes the skew detector", async () => {
  let checks = 0;
  await renderBar({}, { skewDetector: { check: async () => ((checks += 1), false), isSkewed: () => false } });
  assert.ok(checks >= 1);
});

test("an allowed click arms the 4s watchdog; a committed route change disarms it", async () => {
  const props = { overrides: {}, guard: undefined };
  const utils = await renderElement(React.createElement(Harness, props));
  const armed = [];
  const cleared = [];
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  window.setTimeout = (fn, ms, ...rest) => {
    const id = originalSetTimeout(() => {}, ms, ...rest);
    if (ms === 4000) armed.push(id);
    return id;
  };
  window.clearTimeout = id => (cleared.push(id), originalClearTimeout(id));
  try {
    try {
      await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
    } finally {
      window.setTimeout = originalSetTimeout;
    }
    assert.equal(armed.length, 1, "the click must arm exactly one 4s watchdog");
    setPathname("/admin/management");
    await act(async () => utils.rerender(React.createElement(Harness, props)));
  } finally {
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
  }
  assert.ok(cleared.includes(armed[0]), "the committed navigation must clear the armed watchdog timer");
});

test("a stalled navigation fires the watchdog as a full document load", async () => {
  await renderBar();
  const timers = [];
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = (fn, ms, ...rest) => {
    timers.push({ fn, ms });
    return originalSetTimeout(() => {}, ms, ...rest);
  };
  try {
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  } finally {
    window.setTimeout = originalSetTimeout;
  }
  const watchdog = timers.find(timer => timer.ms === 4000);
  assert.ok(watchdog, "the click must arm the watchdog");
  // The pathname never moved (jsdom stays on /): firing must downgrade.
  await act(async () => watchdog.fn());
  assert.deepEqual(assigned, ["/admin/management"]);
});
