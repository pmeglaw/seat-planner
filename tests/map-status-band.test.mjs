import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, cleanup } from "./helpers/renderComponent.mjs";

// MapStatusBand — the 40px `.sp-band` under the canvas (D1-g, PHASE3DS
// §1.21; Phase 4 PR 3a). Both surfaces own tier gating and counts; these
// tests pin the band's rendered DOM contract: the labelled <ul> legend with
// the Phase 3 marks (following the Names toggle — P3-13), the total, the
// count, the verbs, the note, and the zoom cluster on the right.
let MapStatusBand;
before(async () => {
  ({ MapStatusBand } = await loadComponent("@/components/seat-map/MapStatusBand"));
});
beforeEach(() => configureContext({}));
afterEach(() => cleanup());

const entries = [
  { key: "assigned", label: "Assigned", mark: "assigned", count: 60 },
  { key: "available", label: "Open", mark: "open", count: 27 },
  { key: "draft-changed", label: "Changed in draft", mark: "draft-badge", count: 3 }
];

test("band renders the labelled legend with inlined marks, the total, and per-entry counts", async () => {
  const { container } = await renderElement(
    React.createElement(MapStatusBand, { ariaLabel: "Seat status legend", totalLabel: "Floor 3 · 90 seats", entries })
  );
  const band = container.querySelector("[data-map-status-band]");
  assert.ok(band.classList.contains("sp-band"));
  const list = band.querySelector('ul[aria-label="Seat status legend"]');
  assert.ok(list, "entries are a labelled ul, not decorative text");
  const items = list.querySelectorAll("li.sp-seat-legend");
  assert.equal(items.length, 3);
  assert.ok(items[0].querySelector(".sp-seat-mark--pill"), "assigned = the mini pill while names are on");
  assert.ok(items[1].querySelector("svg.sp-seat-mark circle[data-stroke]"), "open = the hollow ring");
  assert.ok(items[2].querySelector("svg.sp-pill-badge"), "changed in draft = the ◇");
  assert.equal(list.querySelector("use"), null, "marks are inlined, never <use>d");
  assert.match(band.querySelector(".sp-band-title").textContent, /Floor 3 · 90 seats/);
  assert.match(items[2].textContent, /Changed in draft\s*3/);
});

test("the legend follows the Names toggle: names off swaps the mini pill for ●", async () => {
  const { container } = await renderElement(
    React.createElement(MapStatusBand, { ariaLabel: "Seat status legend", totalLabel: "68 seats", entries, namesVisible: false })
  );
  const assigned = container.querySelector("li.sp-seat-legend");
  assert.equal(assigned.querySelector(".sp-seat-mark--pill"), null);
  assert.ok(assigned.querySelector("svg.sp-seat-mark circle[data-fill]"));
});

test("count, actions, note and controls render in their slots and stay wired", async () => {
  let clears = 0;
  const { container } = await renderElement(
    React.createElement(MapStatusBand, {
      ariaLabel: "Seat status legend",
      totalLabel: "Floor 3 · 90 seats",
      entries,
      count: "0 of 90 seats match",
      actions: React.createElement("button", { type: "button", className: "cds-btn cds-btn--ghost cds-btn--sm", onClick: () => { clears += 1; } }, "Clear filters"),
      note: "20 people in Litigation are on Floor 2",
      noteAction: React.createElement("button", { type: "button", className: "cds-btn cds-btn--ghost cds-btn--sm" }, "Show Floor 2"),
      controls: React.createElement("button", { type: "button" }, "Zoom in")
    })
  );
  const band = container.querySelector("[data-map-status-band]");
  assert.equal(band.querySelector(".sp-band-count").textContent, "0 of 90 seats match");
  const clear = [...band.querySelectorAll("button")].find(b => b.textContent === "Clear filters");
  fireEvent.click(clear);
  assert.equal(clears, 1);
  assert.equal(band.querySelector(".sp-band-note").textContent, "20 people in Litigation are on Floor 2");
  assert.ok([...band.querySelectorAll("button")].some(b => b.textContent === "Show Floor 2"));
  assert.ok(band.querySelector(".sp-band-zoom button"), "controls render in the right cluster");
});

// Multi-floor PR-2: on a roster floor there is no map to summarise, so the
// band is title-only — no entry list, no controls seam (Hidden tier).
test("with no entries the band renders the title alone: no list, no controls cluster, the region keeps its name", async () => {
  const { container } = await renderElement(
    React.createElement(MapStatusBand, { ariaLabel: "Floor summary", totalLabel: "Floor 2 · Litigation · 40 people", entries: [] })
  );
  const band = container.querySelector("[data-map-status-band]");
  assert.match(band.textContent, /Floor 2 · Litigation · 40 people/);
  assert.doesNotMatch(band.textContent, /Legend/);
  assert.equal(band.querySelector("ul"), null, "no empty <ul> in the tree");
  assert.equal(band.querySelectorAll("button").length, 0);
  assert.ok(band.querySelector('[data-band-scroll-region][aria-label="Floor summary"][tabindex="0"]'), "the region keeps its name and focusability");
});

test("the read-only note (D2 below lg) renders in the band", async () => {
  const { container } = await renderElement(
    React.createElement(MapStatusBand, { ariaLabel: "Seat status legend", totalLabel: "Floor 3 · 68 seats", entries, note: "Editing needs a wider window." })
  );
  assert.equal(container.querySelector(".sp-band-note").textContent, "Editing needs a wider window.");
});
