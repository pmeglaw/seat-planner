import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createPortal } from "react-dom";
import {
  loadComponent,
  renderElement,
  React,
  configureContext,
  setPathname,
  fireEvent,
  act,
  cleanup,
  screen,
  within,
  flushFrames
} from "./helpers/renderComponent.mjs";

// Persistent-shell tests (nav-lag fix + top-bar-first chrome): AppShell is the
// ONE mount point for the chrome — AppTopBar on EVERY shell route, the rail
// hanging below it — created by app/(shell)/layout.tsx and kept alive across
// client-side navigations. These pin the properties the fixes exist for: the
// rail AND bar must NOT remount when the route changes, normal navigation
// stays on the client router, a skewed tab downgrades to a full document
// load, surface handlers (SeatMap's unsaved-edits veto / Ask Planner opener)
// reach the rail through the registration context, and surface bar content
// reaches the bar through the slots context (portals).

let AppShell;
let useAppShellNavigation;
let useAppShellSlots;
before(async () => {
  ({ AppShell, useAppShellNavigation, useAppShellSlots } = await loadComponent("@/components/ui/AppShell"));
});

let pushed;
let assigned;
const quietDetector = { check: async () => false, isSkewed: () => false };
beforeEach(() => {
  pushed = [];
  assigned = [];
  configureContext({
    router: { push: href => pushed.push(href) },
    navigation: { assign: href => assigned.push(href) },
    pathname: "/admin"
  });
});
afterEach(() => cleanup());

function shellElement({ pathname, children = null, skewDetector = quietDetector, isAdmin = true } = {}) {
  if (pathname) setPathname(pathname);
  return React.createElement(
    AppShell,
    { email: "jane@example.com", isAdmin, skewDetector },
    children
  );
}

const nav = () => screen.getByRole("navigation", { name: "Admin sections" });
const bar = () => screen.getByRole("banner");
const slot = name => document.querySelector(`[data-topbar-slot="${name}"]`);

test("every shell surface mounts ONE top bar with the account menu — map included", async () => {
  await renderElement(shellElement({ pathname: "/admin" }));
  assert.ok(nav());
  assert.ok(bar(), "AppTopBar renders on the map too (top-bar-first chrome)");
  assert.equal(screen.getByRole("link", { name: "Seat map" }).getAttribute("aria-current"), "page");
  assert.ok(
    screen.getByRole("button", { name: "Account — jane@example.com" }),
    "the account menu lives in the bar's right cluster"
  );
  assert.ok(slot("left") && slot("center") && slot("right"), "the map surface gets all three bar slots");
  assert.equal(screen.getByRole("link", { name: "Skip to seat map" }).getAttribute("href"), "#planning-canvas");
});

test("sub-pages keep the bar, swap the center slot for a title, and wire the skip link", async () => {
  await renderElement(shellElement({ pathname: "/admin/settings" }));
  assert.ok(bar());
  assert.equal(screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current"), "page");
  assert.equal(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href"), "#admin-subpage-main");
  assert.equal(slot("center"), null, "sub-pages show a section title, not the map's center slot");
  assert.ok(screen.getByRole("button", { name: "Account — jane@example.com" }));
});

test("the skip link is the bar's first focusable — the document's first tab stop — then the rail toggle", async () => {
  await renderElement(shellElement({ pathname: "/admin/settings" }));
  const skipLink = screen.getByRole("link", { name: "Skip to content" });
  const focusable = bar().querySelectorAll("a, button, input, [tabindex]");
  assert.equal(focusable[0], skipLink, "the skip link must be the first focusable element inside the bar");
  assert.equal(
    focusable[1],
    screen.getByRole("button", { name: "Expand navigation" }),
    "the rail toggle sits in the bar's corner cell, right after the skip link"
  );
  assert.ok(bar().compareDocumentPosition(nav()) & Node.DOCUMENT_POSITION_FOLLOWING, "the bar precedes the rail in DOM order");
});

// The corner toggle (owner call 2026-08-14): the hamburger lives in the
// bar's w-12 corner cell, directly above the rail column it controls —
// AppShell owns the state, so the two chrome pieces stay in step.
test("the bar's corner toggle expands and collapses the rail", async () => {
  await renderElement(shellElement({ pathname: "/admin" }));
  const toggle = screen.getByRole("button", { name: "Expand navigation" });
  assert.equal(toggle.getAttribute("aria-controls"), "app-rail");
  assert.ok(nav().className.includes("w-12"));

  await act(async () => fireEvent.click(toggle));

  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.ok(nav().className.includes("w-[208px]"), "expanding must widen the rail overlay");

  await act(async () => fireEvent.keyDown(window, { key: "Escape" }));

  assert.ok(nav().className.includes("w-12"), "Escape must collapse the rail");
  assert.equal(document.activeElement, toggle, "Escape must return focus to the corner toggle");
});

test("reception maps to its own active item and skip target", async () => {
  await renderElement(shellElement({ pathname: "/reception" }));
  assert.equal(screen.getByRole("link", { name: "Reception" }).getAttribute("aria-current"), "page");
  assert.equal(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href"), "#reception-main");
});

test("a viewer-role session gets the role-safe rail flavor and keeps the bar", async () => {
  await renderElement(shellElement({ pathname: "/reception", isAdmin: false }));
  assert.ok(screen.getByRole("navigation", { name: "Sections" }));
  assert.equal(screen.queryByRole("link", { name: "Management" }), null);
  assert.ok(bar());
  assert.ok(screen.getByRole("button", { name: "Account — jane@example.com" }));
});

// The heart of the nav-lag fix: a route change re-renders the shell with a
// new pathname, it must NOT remount it. Node identity across the transition
// is the strongest observable — a remounted rail (or bar) is a NEW element,
// which is exactly the blank-flash bug (each page mounting its own chrome)
// this guards against.
test("the rail and bar persist across a route change — same DOM nodes, updated active item", async () => {
  const utils = await renderElement(shellElement({ pathname: "/admin" }));
  const railBefore = nav();
  const barBefore = bar();
  assert.ok(slot("center"), "map surface exposes the center slot");

  setPathname("/admin/management");
  await act(async () => utils.rerender(shellElement({})));

  assert.equal(nav(), railBefore, "the rail must be the same mounted node after navigation");
  assert.equal(bar(), barBefore, "the bar must be the same mounted node after navigation");
  assert.equal(screen.getByRole("link", { name: "Management" }).getAttribute("aria-current"), "page");
  assert.equal(screen.getByRole("link", { name: "Seat map" }).getAttribute("aria-current"), null);
  assert.equal(slot("center"), null, "the center slot swaps to the section title without remounting the bar");
});

test("normal navigation through the shell is client-side (router.push, no document load)", async () => {
  await renderElement(shellElement({ pathname: "/admin" }));
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(pushed, ["/admin/management"]);
  assert.deepEqual(assigned, [], "an un-skewed click must never become a full document load");
});

test("a skewed tab navigates via assignLocation instead of the client router", async () => {
  await renderElement(
    shellElement({ pathname: "/admin", skewDetector: { check: async () => true, isSkewed: () => true } })
  );
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(assigned, ["/admin/management"]);
  assert.deepEqual(pushed, [], "a skewed tab must not soft-navigate");
});

// Registration contract: a surface plugs its guard/opener in on mount and the
// rail routes through them; unmounting restores plain navigation. This is how
// SeatMap's unsaved-edits dialog keeps intercepting rail clicks now that the
// rail outlives the page.
function Registrar({ guard, opener }) {
  useAppShellNavigation({ guard, openAskPlanner: opener });
  return null;
}

test("a registered guard vetoes rail navigation; unregistering restores it", async () => {
  const calls = [];
  const utils = await renderElement(
    shellElement({
      pathname: "/admin",
      children: React.createElement(Registrar, {
        guard: (href, label) => {
          calls.push([href, label]);
          return false;
        }
      })
    })
  );

  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(calls, [["/admin/management", "Management"]]);
  assert.deepEqual(pushed, [], "a vetoing guard must block the client navigation");

  // Unmount the registering surface (page swap): navigation is plain again.
  await act(async () => utils.rerender(shellElement({})));
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(pushed, ["/admin/management"]);
});

test("a registered Ask Planner opener turns the AI item into an in-place button", async () => {
  let opened = 0;
  await renderElement(
    shellElement({
      pathname: "/admin",
      children: React.createElement(Registrar, { guard: () => true, opener: () => (opened += 1) })
    })
  );
  const aiButton = screen.getByRole("button", { name: /Ask Planner/ });
  await act(async () => fireEvent.click(aiButton));
  assert.equal(opened, 1);
  assert.deepEqual(pushed, []);
});

test("without a registered opener, the AI item is a plain link to /admin?ask-planner=open", async () => {
  await renderElement(shellElement({ pathname: "/admin/management" }));
  assert.equal(
    screen.getByRole("link", { name: /Ask Planner/ }).getAttribute("href"),
    "/admin?ask-planner=open"
  );
});

// Slots contract (top-bar-first chrome): a surface portals live bar content
// into the slot elements the bar registers — this is how SeatMap's undo/redo,
// floor identity, and publish cluster reach the persistent bar.
function SlotSurface({ label }) {
  const slots = useAppShellSlots();
  if (!slots?.right) return null;
  return createPortal(React.createElement("button", { type: "button" }, label), slots.right);
}

test("a surface portals bar content through the slots context, and it unmounts with the surface", async () => {
  const utils = await renderElement(
    shellElement({ pathname: "/admin", children: React.createElement(SlotSurface, { label: "Portaled action" }) })
  );
  const portaled = screen.getByRole("button", { name: "Portaled action" });
  assert.ok(bar().contains(portaled), "portaled content must land inside the bar");

  await act(async () => utils.rerender(shellElement({})));
  assert.equal(screen.queryByRole("button", { name: "Portaled action" }), null, "slot content leaves with its surface");
});

// Account menu in the bar (moved from the rail with the top-bar-first
// chrome): identity + sign-out semantics, and the persistent-chrome focus
// guarantees the rail's account cell used to give.
test("the bar's account menu surfaces email, role, and a POST sign-out form", async () => {
  await renderElement(shellElement({ pathname: "/admin/management" }));
  const trigger = screen.getByRole("button", { name: "Account — jane@example.com" });

  await act(async () => fireEvent.click(trigger));
  await flushFrames();

  const menu = screen.getByRole("menu", { name: "Account" });
  assert.ok(within(menu).getByText("jane@example.com"));
  assert.ok(within(menu).getByText("Admin"));
  const signOut = within(menu).getByRole("menuitem", { name: "Sign out" });
  assert.equal(signOut.getAttribute("type"), "submit");
  const form = signOut.closest("form");
  assert.equal(form?.getAttribute("action"), "/auth/signout");
  assert.equal(form?.getAttribute("method"), "post");
});

test("opening the account menu focuses its first item; Escape closes and refocuses the trigger", async () => {
  await renderElement(shellElement({ pathname: "/admin/management" }));
  const trigger = screen.getByRole("button", { name: "Account — jane@example.com" });
  await act(async () => fireEvent.click(trigger));
  await flushFrames();
  const menu = screen.getByRole("menu", { name: "Account" });
  assert.equal(document.activeElement, within(menu).getAllByRole("menuitem")[0]);

  await act(async () => fireEvent.keyDown(menu, { key: "Escape" }));
  await flushFrames();

  assert.equal(screen.queryByRole("menu", { name: "Account" }), null);
  assert.equal(document.activeElement, trigger);
});

// A route commit (back/forward with the menu open) unmounts the menu's
// focused menuitem. Every other dismissal restores focus to the trigger;
// this path must too, or keyboard focus falls to <body> (the guarantee the
// old rail account cell gave, carried by AccountMenu's autoCloseKey).
test("a route commit that closes the account menu returns focus to the trigger", async () => {
  const utils = await renderElement(shellElement({ pathname: "/admin" }));
  const trigger = screen.getByRole("button", { name: "Account — jane@example.com" });
  await act(async () => fireEvent.click(trigger));
  await flushFrames();
  const menu = screen.getByRole("menu", { name: "Account" });
  assert.equal(document.activeElement, within(menu).getAllByRole("menuitem")[0]);

  setPathname("/admin/management");
  await act(async () => utils.rerender(shellElement({})));

  assert.equal(screen.queryByRole("menu", { name: "Account" }), null, "the route commit must close the menu");
  assert.equal(document.activeElement, trigger, "focus must land back on the account trigger, not <body>");
});

test("useAppShellNavigation and useAppShellSlots are safe no-ops without a shell ancestor (standalone mounts)", async () => {
  function Standalone() {
    const slots = useAppShellSlots();
    assert.equal(slots, null, "no shell ancestor → null slots (surfaces render their fallback)");
    return null;
  }
  await renderElement(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Registrar, { guard: () => false }),
      React.createElement(Standalone)
    )
  );
  // Nothing further to assert beyond "did not throw": standalone component
  // tests mount SeatMap without the shell, and both hooks must tolerate that.
});
