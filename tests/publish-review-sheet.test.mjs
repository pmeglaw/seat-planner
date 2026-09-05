import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, cleanup, fireEvent } from "./helpers/renderComponent.mjs";

// The publish review as the wide tearsheet (PHASE3DS §1.19, Phase 4 PR 3b
// C10): no ×, Cancel is the exit; rail readiness; floor group rows in
// registry order; facts footer; the four states.
let PublishReviewSheet;
before(async () => {
  ({ PublishReviewSheet } = await loadComponent("@/components/seat-map/PublishReviewSheet"));
});
beforeEach(() => configureContext({}));
afterEach(() => cleanup());

const counts = (overrides = {}) => ({ assigned: 0, added: 0, vacated: 0, removed: 0, reassigned: 0, updated: 0, ...overrides });
const summary = (overrides = {}) => ({
  draftSeatCount: 68, publishedSeatCount: 68, addedSeats: [], removedSeats: [], assignmentChanges: [], vacatedSeats: [],
  statusChanges: [], otherChanges: [], employeeDetailChanges: [], updatedSeatCount: 0, totalChangeCount: 0, hasChanges: false, ...overrides
});
const row = (label, floor, kind, from, to, detail = null) => ({ key: `${floor}-${label}`, label, floor, kind, from, to, detail });

function render(props = {}) {
  return renderElement(React.createElement(PublishReviewSheet, {
    publishSummary: summary(),
    publishDiffRows: [],
    publishDiffCounts: counts(),
    actionError: null,
    pending: false,
    onClose() {},
    onConfirm() {},
    ...props
  }));
}
const dialog = () => document.querySelector('[role="dialog"]');
const primary = () => document.querySelector(".sp-tearsheet-footer .cds-btn--primary");

test("the sheet is a bottom-anchored dialog with no × — Cancel is the only exit; facts in the footer", async () => {
  await render();
  assert.ok(document.querySelector(".sp-tearsheet-host[data-open]"), "the host keys presence");
  assert.ok(document.querySelector(".sp-tearsheet-overlay"));
  const sheet = dialog();
  assert.ok(sheet.classList.contains("sp-tearsheet"));
  assert.equal(sheet.getAttribute("aria-modal"), "true");
  assert.equal(sheet.getAttribute("aria-labelledby"), "publish-review-title");
  assert.equal(document.getElementById("publish-review-title").textContent, "Review draft before publishing");
  assert.equal(document.querySelector('[aria-label^="Close"]'), null, "no × — leaving is Cancel");
  assert.equal(document.querySelector(".sp-tearsheet-footer .cds-btn--ghost").textContent, "Cancel");
  assert.equal(document.querySelector(".sp-tearsheet-facts").textContent, "Draft 68 seats · Published 68 seats · Total changes 0");
});

test("no changes: empty state names the next step, the primary is disabled with its reason", async () => {
  await render();
  assert.match(document.querySelector(".cds-empty").textContent, /No draft changes to publish/);
  assert.match(document.querySelector(".cds-empty").textContent, /Make a change on the map, then review again\./);
  assert.match(document.querySelector(".sp-readiness-title").textContent, /No changes/);
  assert.equal(primary().textContent, "No changes to publish");
  assert.equal(primary().disabled, true);
  assert.equal(primary().getAttribute("aria-describedby"), "publish-review-no-changes");
});

test("ready: floor group rows in registry order, the diff under them, people details, and the tag set", async () => {
  const rows = [
    row("L02", "2", "reassigned", "Rita Costa", "Marta Reyes-Cole"),
    row("NE04", "3", "assigned", "Open seat", "Sarah Reyes"),
    row("SW11", "3", "vacated", "Tom Reyes", "Open seat", "notes cleared")
  ];
  let confirmed = 0;
  await render({
    publishSummary: summary({ hasChanges: true, totalChangeCount: 4, employeeDetailChanges: [{ label: "Daniel Ortiz", detail: "extension 233 -> 235" }] }),
    publishDiffRows: rows,
    publishDiffCounts: counts({ assigned: 1, vacated: 1, reassigned: 1 }),
    onConfirm: () => { confirmed += 1; }
  });
  const groups = [...document.querySelectorAll("tbody")];
  assert.deepEqual(groups.map(group => group.querySelector("tr.sp-table-group td").textContent), ["Floor 3 · Pre-Litigation · 2 changes", "Floor 2 · Litigation · 1 change"], "registry order, Floor 3 first");
  assert.deepEqual(groups.map(group => group.querySelectorAll("tr").length), [3, 2]);
  assert.match(document.querySelector(".sp-tearsheet-section").textContent, /3 seat changes/);
  assert.match(document.body.textContent, /People details · 1/);
  assert.match(document.querySelector(".sp-detail-list").textContent, /Daniel Ortiz/);
  assert.deepEqual([...document.querySelectorAll(".sp-readiness .cds-tag")].map(tag => tag.textContent), ["1 assigned", "1 vacated", "1 reassigned", "1 person updated"]);
  assert.match(document.querySelector(".sp-readiness-title").textContent, /Ready · 4 changes/);
  assert.equal(primary().textContent, "Publish 4 changes");
  assert.equal(primary().disabled, false);
  primary().click();
  assert.equal(confirmed, 1);
  assert.match(document.body.textContent, /notes cleared/, "row detail rides in the Change cell");
});

test("submitting: info notification, Cancel disabled, the primary busy and labelled Publishing…", async () => {
  await render({ publishSummary: summary({ hasChanges: true, totalChangeCount: 1 }), publishDiffCounts: counts({ assigned: 1 }), pending: true });
  const status = document.querySelector('[role="status"]');
  assert.match(status.textContent, /Publishing reviewed draft changes/);
  assert.match(status.textContent, /Viewers keep the current map until this finishes\./);
  assert.equal(document.querySelector(".sp-tearsheet-footer .cds-btn--ghost").disabled, true);
  assert.equal(primary().textContent, "Publishing…");
  assert.equal(primary().getAttribute("aria-busy"), "true");
  assert.equal(primary().disabled, true);
});

test("failure: the error notification with Retry publish, the review intact", async () => {
  let confirmed = 0;
  await render({
    publishSummary: summary({ hasChanges: true, totalChangeCount: 1 }),
    publishDiffRows: [row("NE04", "3", "assigned", "Open seat", "Sarah Reyes")],
    publishDiffCounts: counts({ assigned: 1 }),
    actionError: "The publish RPC refused.",
    onConfirm: () => { confirmed += 1; }
  });
  const alert = document.querySelector('[role="alert"]');
  assert.ok(dialog().contains(alert), "the error renders inside the sheet");
  assert.match(alert.textContent, /Publish did not complete\./);
  assert.match(alert.textContent, /The publish RPC refused\./);
  assert.ok(document.querySelector("table.cds-table"), "the review stays on screen");
  alert.querySelector("button").click();
  assert.equal(confirmed, 1, "Retry publish re-runs the confirm");
  assert.equal(primary().textContent, "Publish 1 change", "the footer primary keeps its name — one Retry publish on screen");
  assert.equal(document.querySelectorAll("button").length, 3, "Cancel · Publish · Retry publish, nothing else");
});

// PR 4 smoke carry (PHASE4BUILD §1.39): a pointer on the inert overlay must
// not pull focus out of the trap — otherwise Tab walks the document behind
// the sheet and Esc is dead. The overlay cancels mousedown.
test("a mousedown on the overlay leaves focus inside the sheet", async () => {
  await render({ publishSummary: summary({ hasChanges: true, totalChangeCount: 1 }), publishDiffRows: [row("N01", "3", "assigned", "Open seat", "Alex")], publishDiffCounts: counts({ assigned: 1 }) });
  const sheet = dialog();
  assert.ok(sheet.contains(document.activeElement), "the trap lands focus in the sheet on open");
  const overlay = document.querySelector(".sp-tearsheet-overlay");
  const cancelled = !fireEvent.mouseDown(overlay);
  assert.equal(cancelled, true, "the overlay cancels mousedown");
  assert.ok(sheet.contains(document.activeElement), "focus is still inside the sheet");
});
