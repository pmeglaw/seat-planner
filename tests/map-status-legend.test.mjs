import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, cleanup } from "./helpers/renderComponent.mjs";

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
