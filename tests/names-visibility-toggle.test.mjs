import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, fireEvent, screen, cleanup } from "./helpers/renderComponent.mjs";

// NamesVisibilityToggle is the ONE names control both legend footers share
// (admin SeatMap and the viewer). The contract it must keep, learned from the
// retired flipping-label control: a stable accessible name ("Show occupant
// names", never an inverse verb), aria-pressed for assistive tech, and a
// visible switch cue for sighted users — the label alone told them nothing
// once it stopped flipping.
let NamesVisibilityToggle;
before(async () => {
  ({ NamesVisibilityToggle } = await loadComponent("@/components/seat-map/NamesVisibilityToggle"));
});
afterEach(() => cleanup());

test("renders a button with the stable accessible name and an off pressed state", async () => {
  await renderElement(React.createElement(NamesVisibilityToggle, { pressed: false, onToggle: () => {} }));
  const button = screen.getByRole("button", { name: "Show occupant names" });
  assert.equal(button.getAttribute("aria-pressed"), "false");
  // The visible cue is a real switch track, not a checkmark that appears from
  // nowhere: it exists in BOTH states and carries the state as data-state.
  const track = button.querySelector("[data-state]");
  assert.ok(track, "the switch track must render in the off state too");
  assert.equal(track.getAttribute("data-state"), "off");
});

test("pressed=true flips aria-pressed and the track cue, never the label", async () => {
  await renderElement(React.createElement(NamesVisibilityToggle, { pressed: true, onToggle: () => {} }));
  const button = screen.getByRole("button", { name: "Show occupant names" });
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.querySelector("[data-state]").getAttribute("data-state"), "on");
  assert.doesNotMatch(button.textContent, /Hide/);
});

test("clicking invokes onToggle exactly once", async () => {
  let calls = 0;
  await renderElement(React.createElement(NamesVisibilityToggle, { pressed: false, onToggle: () => { calls += 1; } }));
  fireEvent.click(screen.getByRole("button", { name: "Show occupant names" }));
  assert.equal(calls, 1);
});
