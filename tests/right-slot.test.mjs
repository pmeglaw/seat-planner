import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, cleanup } from "./helpers/renderComponent.mjs";

// The 400px right slot (PHASE3DS §1.17, Phase 4 PR 3b C9): one host per
// surface, presence-keyed (data-open is present or absent — never "false"),
// the children ARE the `.sp-slot` aside so each owner keeps its own landmark.
let RightSlot;
let ModeCard;
before(async () => {
  ({ RightSlot } = await loadComponent("@/components/seat-map/RightSlot"));
  ({ ModeCard } = await loadComponent("@/components/seat-map/ModeCard"));
});
beforeEach(() => configureContext({}));
afterEach(() => cleanup());

const host = () => document.querySelector("[data-slot-host]");

test("the host is always mounted; data-open is a presence key and the children render only while open", async () => {
  await renderElement(React.createElement(RightSlot, { open: false }, React.createElement("aside", { className: "sp-slot", id: "owner" }, "content")));
  assert.ok(host(), "the host is mounted closed (the slide-in needs it)");
  assert.equal(host().getAttribute("data-open"), null, "closed = no attribute, never data-open=\"false\"");
  assert.equal(document.getElementById("owner"), null, "closed = no owner mounted");
  assert.ok(host().classList.contains("sp-slot-host"));
  cleanup();

  await renderElement(React.createElement(RightSlot, { open: true }, React.createElement("aside", { className: "sp-slot", id: "owner" }, "content")));
  assert.equal(host().getAttribute("data-open"), "", "open = the presence key");
  assert.ok(document.getElementById("owner"), "the owner aside is the host's child");
  assert.equal(host().firstElementChild, document.getElementById("owner"));
});

test("the mode card is a polite live region with eyebrow · title · sentence · note · exit ghost · Esc note", async () => {
  let exits = 0;
  await renderElement(React.createElement(ModeCard, {
    label: "Move employee",
    title: "Moving Sarah Reyes from NE04",
    body: "Select the destination seat — on this floor, or switch floors with the selector.",
    note: "Reserved and unavailable seats can't be destinations.",
    exitLabel: "Exit move employee",
    onExit: () => { exits += 1; }
  }));
  const card = document.querySelector("aside.sp-slot");
  assert.ok(card);
  assert.equal(card.getAttribute("role"), "status");
  assert.equal(card.getAttribute("aria-live"), "polite");
  assert.equal(card.getAttribute("aria-label"), "Move employee mode");
  assert.equal(card.querySelector(".sp-slot-eyebrow").textContent, "Move employee mode");
  assert.equal(card.querySelector(".sp-mode-card-title").textContent, "Moving Sarah Reyes from NE04");
  assert.match(card.textContent, /Reserved and unavailable seats can't be destinations\./);
  assert.match(card.textContent, /Esc also exits\./);
  const exit = card.querySelector("button.cds-btn--ghost");
  assert.equal(exit.textContent, "Exit move employee");
  exit.click();
  assert.equal(exits, 1);
  assert.equal(card.querySelector("[aria-busy]"), null, "no busy line unless given");
  cleanup();

  await renderElement(React.createElement(ModeCard, { label: "Add seat", title: "t", body: "b", exitLabel: "Exit add seat", onExit() {}, busyLabel: "Adding seat…" }));
  assert.match(document.querySelector("[aria-busy='true']").textContent, /Adding seat…/);
});
