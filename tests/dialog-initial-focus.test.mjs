import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, flushFrames, React, cleanup } from "./helpers/renderComponent.mjs";

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
  // (PR 5b: the confirm is `role="alertdialog"` on the asset modal.)
  assert.equal(document.activeElement?.getAttribute("role"), "alertdialog");
});

// Phase 4 PR 6 (owner ruling on the 5b R-5 finding): CarbonModal owns the
// busy ⇄ idle focus seam for every consumer family.

function vacateProps(pending) {
  return { label: "A-12", occupantName: "Anahit Petrosyan", pending, onCancel: () => {}, onConfirm: () => {} };
}

test("a dialog that mounted busy lands focus on its first control once it settles", async () => {
  const { rerender } = await renderElement(React.createElement(VacateConfirmDialog, vacateProps(true)));
  assert.equal(document.activeElement?.getAttribute("role"), "alertdialog");
  rerender(React.createElement(VacateConfirmDialog, vacateProps(false)));
  await flushFrames();
  const active = document.activeElement;
  assert.ok(active instanceof HTMLButtonElement, `expected a button to hold focus, got ${active?.tagName}`);
  assert.equal(active.textContent, "Cancel");
});

test("focus dropped to <body> as the dialog goes busy re-anchors on the container", async () => {
  const { rerender } = await renderElement(React.createElement(VacateConfirmDialog, vacateProps(false)));
  assert.equal(document.activeElement?.textContent, "Cancel");
  // Chrome drops focus from a control that disables under the pointer.
  document.activeElement.blur();
  assert.equal(document.activeElement, document.body);
  rerender(React.createElement(VacateConfirmDialog, vacateProps(true)));
  assert.equal(document.activeElement?.getAttribute("role"), "alertdialog");
});

test("a consumer's error alert keeps focus through the settle — the host never overrides it", async () => {
  const { rerender } = await renderElement(React.createElement(VacateConfirmDialog, vacateProps(true)));
  rerender(React.createElement(VacateConfirmDialog, { ...vacateProps(false), actionError: "Could not vacate seat." }));
  await flushFrames();
  const alert = document.querySelector('[role="alert"]');
  assert.ok(alert, "the in-dialog error notification renders");
  assert.equal(document.activeElement, alert, "focus stays in the error alert the consumer focused on the settle");
});

test("a dialog that leaves as it settles never refocuses its detached section", async () => {
  const opener = document.createElement("button");
  opener.textContent = "Vacate";
  document.body.append(opener);
  opener.focus();
  const { rerender, unmount } = await renderElement(React.createElement(VacateConfirmDialog, vacateProps(true)));
  assert.equal(document.activeElement?.getAttribute("role"), "alertdialog");
  rerender(React.createElement(VacateConfirmDialog, vacateProps(false)));
  unmount();
  await flushFrames();
  assert.equal(document.activeElement, opener, "useDialogFocus restored the opener and the host left it there");
  opener.remove();
});
