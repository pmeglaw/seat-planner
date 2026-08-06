import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadComponent,
  renderElement,
  React,
  configureContext,
  setPathname,
  fireEvent,
  act,
  cleanup,
  screen
} from "./helpers/renderComponent.mjs";

// Persistent-shell tests (nav-lag fix): AppShell is the ONE mount point for
// the rail (+ the sub-page AdminShellBar), created by app/(shell)/layout.tsx
// and kept alive across client-side navigations. These pin the properties the
// fix exists for: the rail must NOT remount when the route changes, normal
// navigation stays on the client router, a skewed tab downgrades to a full
// document load, and surface handlers (SeatMap's unsaved-edits veto / Ask
// Planner opener) reach the rail through the registration context.

let AppShell;
let useAppShellNavigation;
before(async () => {
  ({ AppShell, useAppShellNavigation } = await loadComponent("@/components/ui/AppShell"));
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

test("the map surface renders the rail without the sub-page brand bar", async () => {
  await renderElement(shellElement({ pathname: "/admin" }));
  assert.ok(nav());
  assert.equal(screen.getByRole("link", { name: "Seat map" }).getAttribute("aria-current"), "page");
  assert.equal(screen.queryByRole("banner"), null, "no AdminShellBar on the map — SeatMap owns its header");
});

test("sub-pages get the AdminShellBar and the matching active item + skip link", async () => {
  await renderElement(shellElement({ pathname: "/admin/settings" }));
  assert.ok(screen.getByRole("banner"), "AdminShellBar renders on sub-pages");
  assert.equal(screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current"), "page");
  assert.equal(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href"), "#admin-subpage-main");
});

test("reception maps to its own active item and skip target", async () => {
  await renderElement(shellElement({ pathname: "/reception" }));
  assert.equal(screen.getByRole("link", { name: "Reception" }).getAttribute("aria-current"), "page");
  assert.equal(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href"), "#reception-main");
});

test("a viewer-role session gets the role-safe rail flavor", async () => {
  await renderElement(shellElement({ pathname: "/reception", isAdmin: false }));
  assert.ok(screen.getByRole("navigation", { name: "Sections" }));
  assert.equal(screen.queryByRole("link", { name: "Management" }), null);
});

// The heart of the nav-lag fix: a route change re-renders the shell with a
// new pathname, it must NOT remount it. Node identity across the transition
// is the strongest observable — a remounted rail is a NEW element, which is
// exactly the blank-flash bug (each page mounting its own rail) this guards
// against.
test("the rail persists across a route change — same DOM node, updated active item", async () => {
  const utils = await renderElement(shellElement({ pathname: "/admin" }));
  const railBefore = nav();
  assert.equal(screen.queryByRole("banner"), null);

  setPathname("/admin/management");
  await act(async () => utils.rerender(shellElement({})));

  assert.equal(nav(), railBefore, "the rail must be the same mounted node after navigation");
  assert.equal(screen.getByRole("link", { name: "Management" }).getAttribute("aria-current"), "page");
  assert.equal(screen.getByRole("link", { name: "Seat map" }).getAttribute("aria-current"), null);
  assert.ok(screen.getByRole("banner"), "the sub-page bar appears without remounting the rail");
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

test("useAppShellNavigation is a safe no-op without a shell ancestor (standalone mounts)", async () => {
  await renderElement(React.createElement(Registrar, { guard: () => false }));
  // Nothing to assert beyond "did not throw": standalone component tests
  // mount SeatMap without the shell, and registration must tolerate that.
});
