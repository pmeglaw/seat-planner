import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, fireEvent, cleanup, screen, within } from "./helpers/renderComponent.mjs";

// MapControlRow — the 48px control row both map surfaces mount (PHASE2UX
// §1M.3, D2-b, PHASE3DS §1.14). Published: floor · search · Filters · count ·
// Find me · Names. Draft continues after a divider: Undo · Redo · Add seat ·
// Ask Planner · Publish (the ONE primary) · ⋯ · Names.

let MapControlRow;
before(async () => {
  ({ MapControlRow } = await loadComponent("@/components/seat-map/MapControlRow"));
});
afterEach(() => cleanup());

const noop = () => {};
const search = {
  value: "", onChange: noop, onClear: noop, scope: "floor", onScopeChange: noop, hint: "Ctrl K", placeholder: "Search people or seats…",
  inputId: "viewer-seat-search", paletteOpen: false, onOpenPalette: noop, onClosePalette: noop, onArrowDown: noop, onEnter: noop
};

function row(overrides = {}) {
  return React.createElement(MapControlRow, {
    floor: "3", onFloorChange: noop, search, filters: null, count: { text: "68 seats", live: true }, onFindMe: noop,
    names: { pressed: true, hidden: false, onToggle: noop },
    ...overrides
  });
}

function draft(overrides = {}) {
  return {
    undo: { label: "Undo last map change · Ctrl Z", disabled: false, onClick: noop },
    redo: { label: "Redo · Ctrl Shift Z", disabled: true, onClick: noop },
    addSeat: { active: false, hidden: false, onToggle: noop },
    askPlanner: { count: 3, open: false, onOpen: noop },
    publish: { count: 4, onOpen: noop },
    discard: { disabled: false, onOpen: noop },
    ...overrides
  };
}

test("published row: floor menu · search · count · Find me · Names — no divider, no primary, no filters at null", async () => {
  await renderElement(row());
  const toolbar = screen.getByRole("toolbar", { name: "Map controls" });
  assert.ok(toolbar.classList.contains("sp-control-row"));
  assert.ok(within(toolbar).getByRole("button", { name: /^Change floor\. Current floor: /i }).classList.contains("sp-menu-button"));
  assert.ok(within(toolbar).getByRole("search", { name: "Find a person or seat" }));
  assert.equal(within(toolbar).getByText("68 seats").getAttribute("aria-live"), "polite");
  assert.ok(within(toolbar).getByRole("button", { name: "Find me" }).classList.contains("cds-btn--ghost"));
  assert.equal(within(toolbar).getByRole("button", { name: "Show occupant names" }).getAttribute("aria-pressed"), "true");
  assert.equal(toolbar.querySelector(".sp-control-divider"), null);
  assert.equal(toolbar.querySelector(".cds-btn--primary"), null);
  assert.equal(toolbar.querySelector(".sp-filters"), null);
  assert.equal(within(toolbar).getByText("Ctrl K").classList.contains("sp-kbd"), true);
});

test("Filters · N split control: Hidden at 0; at 3 the tertiary opens the left panel and a separate Clear icon button clears", async () => {
  await renderElement(row({ filters: { appliedCount: 0, onOpen: noop, onClear: noop, panelOpen: false } }));
  assert.equal(document.querySelector(".sp-filters"), null);
  cleanup();
  let opened = 0, cleared = 0;
  await renderElement(row({ filters: { appliedCount: 3, onOpen: () => { opened += 1; }, onClear: () => { cleared += 1; }, panelOpen: false } }));
  const split = document.querySelector(".sp-filters");
  const trigger = within(split).getByRole("button", { name: "Filters · 3" });
  assert.equal(trigger.getAttribute("aria-controls"), "shell-left-panel");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  fireEvent.click(trigger);
  fireEvent.click(within(split).getByRole("button", { name: "Clear filters" }));
  assert.equal(opened, 1);
  assert.equal(cleared, 1);
  assert.equal(split.querySelectorAll("button").length, 2, "two interactive elements, never a × nested inside the button");
});

test("draft row: divider, Undo/Redo with tooltips, Add seat, Ask Planner badge, the ONE primary, ⋯ Discard only", async () => {
  await renderElement(row({ draft: draft() }));
  const toolbar = screen.getByRole("toolbar", { name: "Map controls" });
  assert.ok(toolbar.querySelector(".sp-control-divider[role='separator']"));
  const undo = within(toolbar).getByRole("button", { name: "Undo last map change · Ctrl Z" });
  assert.equal(undo.disabled, false);
  assert.equal(undo.parentElement.querySelector("[role='tooltip']").textContent, "Undo last map change · Ctrl Z");
  assert.equal(within(toolbar).getByRole("button", { name: "Redo · Ctrl Shift Z" }).disabled, true);
  assert.equal(within(toolbar).getByRole("button", { name: "Add seat" }).getAttribute("aria-pressed"), "false");
  const ask = within(toolbar).getByRole("button", { name: "Open Ask Planner AI, 3 seats highlighted" });
  assert.equal(ask.dataset.count, "3");
  assert.ok(ask.classList.contains("cds-btn--tertiary"));
  const primaries = toolbar.querySelectorAll(".cds-btn--primary");
  assert.equal(primaries.length, 1, "one primary per section");
  assert.equal(primaries[0].textContent, "Publish 4 changes");
  assert.equal(primaries[0].disabled, false);
  fireEvent.click(within(toolbar).getByRole("button", { name: "More actions" }));
  const menu = within(toolbar).getByRole("menu", { name: "More actions" });
  const items = within(menu).getAllByRole("menuitem");
  assert.equal(items.length, 1);
  assert.equal(items[0].textContent, "Discard draft changes");
  assert.ok(items[0].classList.contains("cds-danger"));
});

test("draft, no changes: Publish present and DISABLED with the reason beside it (aria-describedby); Discard disabled; Ask Planner has no badge", async () => {
  await renderElement(row({ draft: draft({ publish: { count: 0, onOpen: noop }, askPlanner: { count: 0, open: false, onOpen: noop }, discard: { disabled: true, onOpen: noop } }) }));
  const publish = screen.getByRole("button", { name: "Publish" });
  assert.equal(publish.disabled, true);
  const reason = document.getElementById(publish.getAttribute("aria-describedby"));
  assert.equal(reason.textContent, "No changes to publish");
  assert.ok(reason.classList.contains("sp-control-reason"));
  assert.equal(screen.getByRole("button", { name: "Open Ask Planner AI" }).hasAttribute("data-count"), false);
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  assert.equal(screen.getByRole("menuitem", { name: "Discard draft changes" }).disabled, true);
});

test("Add seat active reads 'Exit add seat' (aria-pressed); roster floor hides Add seat and Names, counts people", async () => {
  await renderElement(row({ draft: draft({ addSeat: { active: true, hidden: false, onToggle: noop } }) }));
  assert.equal(screen.getByRole("button", { name: "Exit add seat" }).getAttribute("aria-pressed"), "true");
  cleanup();
  await renderElement(row({ count: { text: "40 people", live: true }, names: { pressed: true, hidden: true, onToggle: noop }, draft: draft({ addSeat: { active: false, hidden: true, onToggle: noop } }) }));
  assert.equal(screen.queryByRole("button", { name: /add seat/i }), null);
  assert.equal(screen.queryByRole("button", { name: "Show occupant names" }), null);
  assert.ok(screen.getByText("40 people"));
});

test("search field: clear × replaces the hint once a query exists; Escape peels palette then query; ArrowDown enters the palette", async () => {
  const calls = [];
  await renderElement(row({ search: { ...search, value: "sar", paletteOpen: true, paletteId: "pal", onClear: () => calls.push("clear"), onClosePalette: () => calls.push("close"), onArrowDown: () => calls.push("down"), onEnter: () => calls.push("enter") } }));
  const input = screen.getByRole("searchbox", { name: "Find a person or seat" });
  assert.equal(input.getAttribute("aria-controls"), "pal");
  assert.ok(screen.getByRole("button", { name: "Clear search" }).classList.contains("sp-search-clear"));
  assert.equal(document.querySelector(".sp-kbd"), null);
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.deepEqual(calls, ["close", "down", "enter"]);
  const scope = screen.getByRole("button", { name: "Search scope: This floor" });
  fireEvent.click(scope);
  assert.equal(scope.getAttribute("aria-expanded"), "true");
  assert.equal(screen.getByRole("menuitemradio", { name: "This floor" }).getAttribute("aria-checked"), "true");
  assert.equal(screen.getByRole("menuitemradio", { name: "Whole building" }).getAttribute("aria-checked"), "false");
});

test("floor menu: opens on click, current floor checked + aria-current, choosing calls onFloorChange", async () => {
  let chosen = null;
  await renderElement(row({ onFloorChange: next => { chosen = next; } }));
  const trigger = screen.getByRole("button", { name: /^Change floor/ });
  fireEvent.click(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  const menu = screen.getByRole("menu", { name: "Floors" });
  assert.ok(menu.classList.contains("sp-menu"));
  const current = within(menu).getAllByRole("menuitemradio").find(item => item.getAttribute("aria-checked") === "true");
  assert.equal(current.getAttribute("aria-current"), "true");
  const other = within(menu).getAllByRole("menuitemradio").find(item => item.getAttribute("aria-checked") === "false");
  fireEvent.click(other);
  assert.notEqual(chosen, null);
});
