import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, cleanup } from "./helpers/renderComponent.mjs";

// useDialogFocus moves initial focus to the dialog's first enabled control
// (owner decision, 2026-08-15): the container's own focus is invisible
// (focus-visible:outline-none), so focusing e.g. the Cancel button gives
// keyboard users a visible cue the moment the dialog opens. The container
// stays the Tab-trap boundary and the restore-to-opener anchor.
let VacateConfirmDialog;
before(async () => {
  ({ VacateConfirmDialog } = await loadComponent("@/components/seat-map/SeatMapDialogs"));
  // jsdom quirk: getClientRects() is always empty, which the hook's
  // visibility filter reads as "nothing focusable". Give every element one
  // rect so the filter sees the controls the way a browser would.
  HTMLElement.prototype.getClientRects = function () {
    return [{ width: 1, height: 1 }];
  };
});
afterEach(() => cleanup());

test("a dialog focuses its first enabled control on open, not the container", async () => {
  await renderElement(
    React.createElement(VacateConfirmDialog, {
      label: "A-12",
      occupantName: "Anahit Petrosyan",
      pending: false,
      onCancel: () => {},
      onConfirm: () => {}
    })
  );
  const active = document.activeElement;
  assert.ok(active instanceof HTMLButtonElement, `expected a button to hold focus, got ${active?.tagName}`);
  assert.equal(active.textContent, "Cancel");
});

test("focus falls back to the container when the dialog has no enabled control", async () => {
  await renderElement(
    React.createElement(VacateConfirmDialog, {
      label: "A-12",
      occupantName: "Anahit Petrosyan",
      pending: true,
      onCancel: () => {},
      onConfirm: () => {}
    })
  );
  // pending disables both buttons — the container keeps focus so the Tab
  // trap and Escape handling still have an anchor inside the dialog.
  assert.equal(document.activeElement?.getAttribute("role"), "dialog");
});
