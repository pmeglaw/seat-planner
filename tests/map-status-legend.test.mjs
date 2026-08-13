import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup } from "./helpers/renderComponent.mjs";

// MapStatusLegend is a shared presentational card (floating layer-01 legend)
// used by both the admin map and the viewer. Nothing mounts it yet — Tasks 3
// and 5 wire it into the real surfaces. These tests just pin its rendered DOM
// contract: total label, entries (label + dot + count) as a labeled <ul>, and
// the optional summary/actions slots.
let MapStatusLegend;
before(async () => {
  ({ MapStatusLegend } = await loadComponent("@/components/seat-map/MapStatusLegend"));
});
beforeEach(() => configureContext({}));
afterEach(() => cleanup());

test("legend renders total, entries from given labels, and dot counts", async () => {
  const { container } = await renderElement(
    React.createElement(MapStatusLegend, {
      ariaLabel: "Seat status legend",
      totalLabel: "90 seats",
      entries: [
        { key: "assigned", label: "Assigned", dotClassName: "bg-x", count: 60 },
        { key: "available", label: "Open", dotClassName: "bg-y", count: 27 }
      ]
    })
  );
  const list = container.querySelector('ul[aria-label="Seat status legend"]');
  assert.ok(list);
  assert.match(container.textContent, /90 seats/);
  assert.match(container.textContent, /Assigned/);
  assert.match(container.textContent, /60/);
});

test("summary and actions slots render when provided", async () => {
  const { container } = await renderElement(
    React.createElement(MapStatusLegend, {
      ariaLabel: "Seat status summary",
      totalLabel: "5 seats",
      entries: [],
      summary: "3 of 5 seats match",
      actions: null
    })
  );
  assert.match(container.textContent, /3 of 5 seats match/);
});

// Canvas-chrome redesign (2026-08-13): the legend is a vertical card with a
// collapsible body. The header (title + total) stays visible when collapsed,
// exposes aria-expanded, and the entry list unmounts rather than hiding
// visually — a collapsed legend must not keep its entries in the a11y tree.
test("legend collapses to its header and re-expands", async () => {
  const { container } = await renderElement(
    React.createElement(MapStatusLegend, {
      ariaLabel: "Seat status legend",
      totalLabel: "90 seats",
      entries: [{ key: "assigned", label: "Assigned", dotClassName: "bg-x", count: 60 }]
    })
  );
  const toggle = container.querySelector("button[aria-expanded]");
  assert.ok(toggle, "collapse toggle renders");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.ok(container.querySelector('ul[aria-label="Seat status legend"]'), "entries visible expanded");

  await act(async () => fireEvent.click(toggle));
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(container.querySelector('ul[aria-label="Seat status legend"]'), null, "entries unmount collapsed");
  assert.match(container.textContent, /90 seats/, "total stays visible collapsed");

  await act(async () => fireEvent.click(toggle));
  assert.ok(container.querySelector('ul[aria-label="Seat status legend"]'), "entries return on expand");
});

// The footer slot hosts surface-owned controls (the admin map passes its Show
// occupant names toggle). It must collapse with the body — a hidden legend
// with a floating orphan toggle reads as a broken card.
test("footer slot renders in the body and collapses with it", async () => {
  const { container } = await renderElement(
    React.createElement(MapStatusLegend, {
      ariaLabel: "Seat status legend",
      totalLabel: "5 seats",
      entries: [],
      footer: React.createElement("button", { type: "button" }, "Show occupant names")
    })
  );
  assert.match(container.textContent, /Show occupant names/);
  const toggle = container.querySelector("button[aria-expanded]");
  await act(async () => fireEvent.click(toggle));
  assert.ok(!/Show occupant names/.test(container.textContent), "footer collapses with the body");
});
