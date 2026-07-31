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

test("renders Admin sections nav with the three items, aria-current only on the active one", async () => {
  await renderRail({ active: "management" });
  assert.ok(nav());
  const map = screen.getByRole("button", { name: "Seat map" });
  const management = screen.getByRole("button", { name: "Management" });
  const settings = screen.getByRole("button", { name: "Settings" });
  assert.equal(map.getAttribute("aria-current"), null);
  assert.equal(management.getAttribute("aria-current"), "page");
  assert.equal(settings.getAttribute("aria-current"), null);
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
  const management = screen.getByRole("button", { name: "Management" });
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
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Management" })));
  assert.deepEqual(calls, [["/admin/management", "Management"]]);
  assert.deepEqual(pushed, ["/admin/management"]);
});

test("returning false from onNavigate vetoes the navigation", async () => {
  await renderRail({ onNavigate: () => false });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Settings" })));
  assert.deepEqual(pushed, []);
});

test("without onNavigate, items navigate plainly via router.push", async () => {
  await renderRail();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Seat map" })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Management" })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Settings" })));
  assert.deepEqual(pushed, ["/admin", "/admin/management", "/admin/settings"]);
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
  const viewerButton = screen.getByRole("button", { name: "Open viewer surface" });

  await act(async () => fireEvent.click(viewerButton));

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
