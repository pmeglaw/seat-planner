import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, cleanup } from "./helpers/renderComponent.mjs";

// MapStatusBand is the shared in-flow bottom status band (Option A,
// 2026-08-17): the viewer shipped it first (v1.45.0) and the admin map joins
// it. Both surfaces own tier gating and counts; these tests pin the band's
// rendered DOM contract: labelled <ul> entries, total label, and the three
// slots — summary (prose, lg-only by class), actions (admin's Fit matches /
// Clear cluster), controls (names switch + zoom, right-aligned).
let MapStatusBand;
before(async () => {
  ({ MapStatusBand } = await loadComponent("@/components/seat-map/MapStatusBand"));
});
beforeEach(() => configureContext({}));
afterEach(() => cleanup());

const entries = [
  { key: "assigned", label: "Assigned", dotClassName: "bg-x", count: 60 },
  { key: "available", label: "Open", dotClassName: "bg-y", count: 27 },
  { key: "draft-changed", label: "Draft changed", dotClassName: "bg-z", count: 3 }
];

test("band renders the labelled entry list, total, and per-entry counts", async () => {
  const { container } = await renderElement(
    React.createElement(MapStatusBand, {
      ariaLabel: "Seat status legend",
      totalLabel: "90 seats",
      entries
    })
  );
  const band = container.querySelector("[data-map-status-band]");
  assert.ok(band, "band root carries the data-map-status-band hook");
  const list = band.querySelector('ul[aria-label="Seat status legend"]');
  assert.ok(list, "entries are a labelled ul, not decorative text");
  assert.equal(list.querySelectorAll("li").length, 3);
  assert.match(band.textContent, /90 seats/);
  assert.match(band.textContent, /Draft changed3/);
});

test("actions and controls slots render inside the band and stay wired", async () => {
  let fits = 0;
  const { container } = await renderElement(
    React.createElement(MapStatusBand, {
      ariaLabel: "Seat status legend",
      totalLabel: "90 seats",
      entries,
      summary: "12 of 90 seats match",
      actions: React.createElement("button", { type: "button", onClick: () => { fits += 1; } }, "Fit matches"),
      controls: React.createElement("button", { type: "button" }, "Zoom in")
    })
  );
  const band = container.querySelector("[data-map-status-band]");
  assert.match(band.textContent, /12 of 90 seats match/);
  const fit = [...band.querySelectorAll("button")].find(b => b.textContent === "Fit matches");
  assert.ok(fit, "actions slot renders in the band");
  fireEvent.click(fit);
  assert.equal(fits, 1, "action handlers stay wired through the slot");
  assert.ok([...band.querySelectorAll("button")].some(b => b.textContent === "Zoom in"), "controls slot renders in the band");
});

// Multi-floor PR-2: on a roster floor there is no map to summarise, so the
// band is title-only — no Legend word, no entry list, no controls seam
// (Hidden tier: the controls are absent, never disabled).
test("with no entries the band renders the title alone: no Legend, no list, no controls cluster", async () => {
  const { container } = await renderElement(
    React.createElement(MapStatusBand, {
      ariaLabel: "Floor summary",
      totalLabel: "Floor 2 · Litigation · 40 people",
      entries: []
    })
  );
  const band = container.querySelector("[data-map-status-band]");
  assert.match(band.textContent, /Floor 2 · Litigation · 40 people/);
  assert.doesNotMatch(band.textContent, /Legend/);
  assert.equal(band.querySelector("ul"), null, "no empty <ul> in the tree");
  assert.equal(band.querySelectorAll("button").length, 0);
  assert.ok(band.querySelector('[data-band-scroll-region][aria-label="Floor summary"]'), "the region keeps its name and focusability");
});
