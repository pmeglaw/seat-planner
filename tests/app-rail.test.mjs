import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup, screen, within } from "./helpers/renderComponent.mjs";

// Interaction tests for the v12 left rail (docs/superpowers/plans/2026-07-31-v12-slice2-rail-shell.md
// Task 1). Nothing mounts AppRail yet — this component is standalone this
// slice. Covers: nav items + aria-current, hamburger expand/collapse geometry,
// the onNavigate veto contract, Escape/scrim collapse + focus return, the
// account menu (email/role/sign-out form), and the AI item's dual mode
// (in-place open vs plain link).
let AppRail;
before(async () => {
  ({ AppRail } = await loadComponent("@/components/ui/AppRail"));
});

let pushed;
beforeEach(() => {
  pushed = [];
  configureContext({ router: { push: href => pushed.push(href) } });
});
afterEach(() => cleanup());

function renderRail(overrides = {}) {
  return renderElement(
    React.createElement(AppRail, {
      active: "map",
      email: "jane@example.com",
      roleLabel: "Admin",
      ...overrides
    })
  );
}

const nav = () => screen.getByRole("navigation", { name: "Admin sections" });
const hamburger = () => screen.getByRole("button", { name: /(Expand|Collapse) navigation/ });

// Nav items are <Link>s (role link), not buttons — they must prefetch and
// navigate natively before hydration; the veto contract rides preventDefault.
test("renders Admin sections nav with the four items, aria-current only on the active one", async () => {
  await renderRail({ active: "management" });
  assert.ok(nav());
  const map = screen.getByRole("link", { name: "Seat map" });
  const management = screen.getByRole("link", { name: "Management" });
  const settings = screen.getByRole("link", { name: "Settings" });
  const reception = screen.getByRole("link", { name: "Reception" });
  assert.equal(map.getAttribute("href"), "/admin");
  assert.equal(management.getAttribute("href"), "/admin/management");
  assert.equal(settings.getAttribute("href"), "/admin/settings");
  assert.equal(reception.getAttribute("href"), "/reception");
  assert.equal(map.getAttribute("aria-current"), null);
  assert.equal(management.getAttribute("aria-current"), "page");
  assert.equal(settings.getAttribute("aria-current"), null);
  assert.equal(reception.getAttribute("aria-current"), null);
});

test("Reception sits after Settings in the nav order (reception handoff placement)", async () => {
  await renderRail();
  const labels = Array.from(nav().querySelectorAll("a, button"))
    .map(item => item.textContent ?? "")
    .filter(text => /Seat map|Management|Settings|Reception/.test(text));
  assert.ok(
    labels.findIndex(text => text.includes("Settings")) < labels.findIndex(text => text.includes("Reception")),
    "Reception must render after Settings"
  );
});

// Viewer-mode rail (/reception for non-admins): admin routes would bounce a
// viewer at the guard, so only role-safe items render.
test("railMode viewer hides the admin nav items and Ask Planner, keeps Reception + Viewer + account", async () => {
  await renderRail({ railMode: "viewer", active: "reception", roleLabel: "Viewer" });
  const viewerNav = screen.getByRole("navigation", { name: "Sections" });
  assert.ok(viewerNav);
  assert.equal(screen.queryByRole("link", { name: "Seat map" }), null);
  assert.equal(screen.queryByRole("link", { name: "Management" }), null);
  assert.equal(screen.queryByRole("link", { name: "Settings" }), null);
  assert.equal(screen.queryByRole("button", { name: /Ask Planner/ }), null);
  assert.equal(screen.queryByRole("link", { name: /Ask Planner/ }), null);
  const reception = screen.getByRole("link", { name: "Reception" });
  assert.equal(reception.getAttribute("aria-current"), "page");
  assert.ok(screen.getByRole("link", { name: "Open viewer surface" }));
  assert.ok(screen.getByRole("button", { name: "Account — jane@example.com" }));
});

test("with skipLink provided, it renders as the rail's first focusable element, before the hamburger", async () => {
  await renderRail({ skipLink: { href: "#planning-canvas", label: "Skip to seat map" } });
  const skipLink = screen.getByRole("link", { name: "Skip to seat map" });
  assert.equal(skipLink.getAttribute("href"), "#planning-canvas");

  // Visual-pass fix: the skip link used to render outside the rail, after
  // all 7 rail controls (8th tab stop). It must now be the rail's first
  // focusable descendant, ahead of the hamburger and everything else.
  const focusable = nav().querySelectorAll('a[href], button:not([tabindex="-1"])');
  assert.equal(focusable[0], skipLink, "the skip link must be the first focusable element inside the rail");
  assert.equal(focusable[1], hamburger(), "the hamburger must be the next focusable element after the skip link");
});

test("without skipLink, no skip anchor renders", async () => {
  await renderRail();
  assert.equal(screen.queryByRole("link", { name: /Skip to/ }), null);
});

test("hamburger toggles aria-expanded and flips the rail width class w-12 <-> w-[208px]", async () => {
  await renderRail();
  const button = hamburger();
  const navEl = nav();
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.ok(navEl.className.includes("w-12"));
  assert.ok(!navEl.className.includes("w-[208px]"));

  await act(async () => fireEvent.click(button));

  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.ok(navEl.className.includes("w-[208px]"));
  assert.ok(!navEl.className.includes("w-12"));
});

test("item labels stay mounted (opacity swap, not conditional render) across collapse state", async () => {
  await renderRail();
  const management = screen.getByRole("link", { name: "Management" });
  // Findable by accessible name while collapsed proves the label text node is
  // still in the DOM/AX tree, not removed — the opacity class is what changes.
  assert.match(management.textContent ?? "", /Management/);
  const label = management.querySelector("span:last-child");
  assert.ok(label?.className.includes("opacity-0"));

  await act(async () => fireEvent.click(hamburger()));

  assert.ok(label?.className.includes("opacity-100"));
});

test("clicking a nav item calls onNavigate with the href + label, then navigates when it returns true", async () => {
  const calls = [];
  await renderRail({
    onNavigate: (href, label) => {
      calls.push([href, label]);
      return true;
    }
  });
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  assert.deepEqual(calls, [["/admin/management", "Management"]]);
  assert.deepEqual(pushed, ["/admin/management"]);
});

test("returning false from onNavigate vetoes the navigation", async () => {
  await renderRail({ onNavigate: () => false });
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Settings" })));
  assert.deepEqual(pushed, []);
});

test("without onNavigate, items navigate plainly", async () => {
  await renderRail();
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Seat map" })));
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" })));
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Settings" })));
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Reception" })));
  assert.deepEqual(pushed, ["/admin", "/admin/management", "/admin/settings", "/reception"]);
});

// Modified clicks (new tab) must bypass the guard entirely — the current page
// keeps its unsaved edits, so onNavigate must not fire and nothing pushes.
test("a ctrl-click on a nav item skips onNavigate and client navigation", async () => {
  const calls = [];
  await renderRail({ onNavigate: (...args) => (calls.push(args), true) });
  await act(async () => fireEvent.click(screen.getByRole("link", { name: "Management" }), { ctrlKey: true }));
  assert.deepEqual(calls, []);
  assert.deepEqual(pushed, []);
});

// The map header's own accessibility-source test (#197, "narrow widths keep
// the viewer switch reachable") defers this control's presence and guard
// wiring to AppRail's own suite rather than re-asserting it via source-text
// grep — this is that coverage. Accessible name is the explicit aria-label
// ("Open viewer surface"), not the visible "Viewer" text content.
test("the Viewer item is reachable and routes through onNavigate", async () => {
  const calls = [];
  await renderRail({
    onNavigate: (href, label) => {
      calls.push([href, label]);
      return true;
    }
  });
  const viewerLink = screen.getByRole("link", { name: "Open viewer surface" });

  await act(async () => fireEvent.click(viewerLink));

  assert.deepEqual(calls, [["/", "the viewer"]]);
  assert.deepEqual(pushed, ["/"]);
});

test("Escape collapses an expanded rail and returns focus to the hamburger", async () => {
  await renderRail();
  const button = hamburger();
  await act(async () => fireEvent.click(button));
  assert.equal(button.getAttribute("aria-expanded"), "true");

  await act(async () => fireEvent.keyDown(window, { key: "Escape" }));

  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, button);
});

test("clicking the outside scrim collapses an expanded rail and returns focus to the hamburger", async () => {
  await renderRail();
  const button = hamburger();
  await act(async () => fireEvent.click(button));
  const scrim = document.querySelector("[data-rail-scrim]");
  assert.ok(scrim, "a scrim renders while the rail is expanded");

  await act(async () => fireEvent.click(scrim));

  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, button);
});

test("the account cell opens a menu with email, role label, and a Sign out form", async () => {
  await renderRail({ email: "jane@example.com", roleLabel: "Admin" });
  const trigger = screen.getByRole("button", { name: "Account — jane@example.com" });

  await act(async () => fireEvent.click(trigger));

  const menu = screen.getByRole("menu", { name: "Account" });
  assert.ok(within(menu).getByText("jane@example.com"));
  assert.ok(within(menu).getByText("Admin"));
  const signOut = within(menu).getByRole("menuitem", { name: "Sign out" });
  assert.equal(signOut.getAttribute("type"), "submit");
  const form = signOut.closest("form");
  assert.equal(form?.getAttribute("action"), "/auth/signout");
  assert.equal(form?.getAttribute("method"), "post");
});

test("opening the account menu focuses its first menu item, and Escape closes it and refocuses the trigger", async () => {
  await renderRail();
  const trigger = screen.getByRole("button", { name: "Account — jane@example.com" });
  await act(async () => fireEvent.click(trigger));
  const menu = screen.getByRole("menu", { name: "Account" });
  const firstItem = within(menu).getAllByRole("menuitem")[0];
  assert.equal(document.activeElement, firstItem);

  await act(async () => fireEvent.keyDown(menu, { key: "Escape" }));

  assert.equal(screen.queryByRole("menu", { name: "Account" }), null);
  assert.equal(document.activeElement, trigger);
});

test("with onOpenAskPlanner present, the AI item calls it instead of navigating", async () => {
  let opened = 0;
  await renderRail({ onOpenAskPlanner: () => (opened += 1) });
  const aiButton = screen.getByRole("button", { name: /Ask Planner/ });

  await act(async () => fireEvent.click(aiButton));

  assert.equal(opened, 1);
  assert.deepEqual(pushed, []);
});

test("without onOpenAskPlanner, the AI item is a plain link to /admin?ask-planner=open", async () => {
  await renderRail();
  const aiLink = screen.getByRole("link", { name: /Ask Planner/ });
  assert.equal(aiLink.getAttribute("href"), "/admin?ask-planner=open");
});
