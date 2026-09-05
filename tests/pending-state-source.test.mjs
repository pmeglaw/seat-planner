import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// PR-5 guard (AUDIT-2 §8.1, §0 item 6 remainder): every mutating flow tells
// the user, visibly and audibly, that the app is working between confirm and
// outcome.
//
// FLOW_REGISTRY below is the authoritative worklist — 20 mutating flows, not
// the audit's 17 (re-measure 2026-08-27: move-employee's two branches are
// distinct paths, dept "Add to list" adopt is its own control, and the
// inspector-guard Save arm is its own entry; Ask Planner is read-only and
// excluded). Each entry pins, in source:
//   1. the confirming control's present-participle label, wired to the
//      pending/busy flag (Carbon inline loading: label swap + disabled +
//      leading spinner via the Button `loading` prop);
//   2. the surface's live region — either the flow's own in-flight region or
//      the surface's shared always-mounted sr-only "Working…" region.
// The reopened dialogs' behavior half (alert inside the open dialog, retry,
// focus) lives in tests/dialog-error-placement.test.mjs ct tests; this file
// pins the SeatMap wiring those presentational renders cannot see.
//
// Ledgered deviation (owner ruling 2026-08-27): the inspector-guard Save arm
// (flow 8) KEEPS closing before resolve — "closes-into-announcing-surface".
// The guard dialog's Save submits the inspector form, whose commit bar and
// sr region carry the whole pending story; holding a second dialog open over
// the surface doing the work would duplicate, not disclose. Covered by flow 9.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = file => readFileSync(path.join(repoRoot, file), "utf8");

const SEAT_MAP = "components/seat-map/SeatMap.tsx";
const DIALOGS = "components/seat-map/SeatMapDialogs.tsx";
const INSPECTOR = "components/seat-map/SeatInspector.tsx";
const MANAGEMENT = "components/admin-management/AdminManagementPanel.tsx";
const SETTINGS = "components/admin-settings/DataUtilitiesPanel.tsx";
const BUTTON = "components/ui/Button.tsx";

// Each entry: which file must carry which pending-state tokens. `patterns`
// are matched against the file's full source.
const FLOW_REGISTRY = [
  {
    id: "01-publish",
    file: DIALOGS,
    patterns: [
      /pending \? "Publishing…"/,
      /loading=\{pending\}[\s\S]{0,600}?"Publishing…"|"Publishing…"[\s\S]{0,600}?loading=\{pending\}/,
      // The house-reference in-flight region stays.
      /role="status" aria-live="polite"[\s\S]{0,300}?Publishing reviewed draft changes/
    ]
  },
  {
    id: "02-discard-draft",
    file: DIALOGS,
    patterns: [/pending \? "Discarding…"/]
  },
  {
    id: "03-swap",
    file: DIALOGS,
    patterns: [/pending \? "Swapping…" : actionError \? "Retry swap" : "Confirm swap"/]
  },
  {
    id: "04-vacate",
    file: DIALOGS,
    patterns: [
      /pending \? "Vacating…" : actionError \? "Retry vacate" : "Vacate seat"/,
      /Vacate did not complete\./
    ]
  },
  {
    id: "05-delete-seat",
    file: DIALOGS,
    patterns: [
      /pending \? "Deleting…" : actionError \? "Retry delete" : "Delete seat"/,
      /Delete did not complete\./
    ]
  },
  {
    id: "06-move-employee-open-seat",
    file: DIALOGS,
    patterns: [/pending \? "Moving…" : actionError \? "Retry move" : "Move them"/]
  },
  {
    id: "07-move-employee-as-swap",
    file: DIALOGS,
    patterns: [/pending \? "Swapping…" : actionError \? "Retry swap" : "Swap them"/]
  },
  {
    id: "08-inspector-guard-save (ledgered: closes-into-announcing-surface)",
    file: SEAT_MAP,
    patterns: [
      // The Save arm still closes the guard and submits the inspector form —
      // the inspector (flow 9) carries the pending story. Owner-ruled; do not
      // "fix" this by holding the guard dialog open.
      /function requestInspectorGuardSave\(\)[\s\S]{0,400}?setInspectorGuardAction\(null\);[\s\S]{0,400}?requestSubmit\(\)/
    ]
  },
  {
    id: "09-inspector-save",
    file: INSPECTOR,
    patterns: [
      /pending \? "Saving…" : primaryActionLabel/,
      /aria-busy=\{pending \|\| undefined\}/,
      // The inspector's own sr region keeps announcing the flight.
      /"Saving draft…"/
    ]
  },
  {
    id: "10-inspector-move-conflict",
    file: INSPECTOR,
    patterns: [
      /pending \? "Moving…" : moveConflictError \? "Retry move" : "Move them"/,
      /Move did not complete\./
    ]
  },
  {
    id: "11-create-seat",
    file: SEAT_MAP,
    patterns: [
      // No confirm button to relabel — the add-seat mode card carries the
      // visible busy line; the shared region announces "Working…".
      /addSeatMode && mutationInFlight[\s\S]{0,400}?Adding seat…/
    ]
  },
  {
    id: "12-undo",
    file: SEAT_MAP,
    patterns: [
      // PR 3a: the row's Undo carries the in-flight flag; the spinner and
      // aria-busy render in MapControlRow (pinned separately below). The
      // accessible name keeps its words (ruled) and gains the shortcut (P2-1).
      /busy: historyOpInFlight === "Undo"/,
      /Undo last map change/
    ]
  },
  {
    id: "13-redo",
    file: SEAT_MAP,
    patterns: [
      /busy: historyOpInFlight === "Redo"/,
      /Redo · \$\{redoShortcutHint\(platform\)\}/
    ]
  },
  {
    id: "14-employee-save",
    file: MANAGEMENT,
    patterns: [
      /busyOp === "employee-save"[\s\S]{0,200}?\? selectedEmployee \? "Saving…" : "Adding…"/
    ]
  },
  {
    id: "15-deactivate-employee",
    file: MANAGEMENT,
    patterns: [
      // Pending treatment while the confirm is up; the finally-close on both
      // outcomes is by design (dialog-error-placement ledger) — unchanged.
      /busyOp === "management-confirm"[\s\S]{0,200}?"Deactivating…"/
    ]
  },
  {
    id: "16-department-create-and-adopt",
    file: MANAGEMENT,
    patterns: [
      /busyOp === "dept-create" \? "Adding…" : "Add"/,
      /busyOp === `adopt-department:\$\{row\.name\}` \? "Adding…" : "Add to list"/
    ]
  },
  {
    id: "17-department-rename-delete",
    file: MANAGEMENT,
    patterns: [
      /busyOp === "dept-rename" \? "Renaming…" : "Save"/,
      /"Deleting…"/
    ]
  },
  {
    id: "18-zone-create-rename-delete",
    file: MANAGEMENT,
    patterns: [
      /busyOp === "zone-create" \? "Adding…" : "Add"/,
      /busyOp === "zone-rename" \? "Renaming…" : "Save"/
    ]
  },
  {
    id: "19-csv-apply",
    file: SETTINGS,
    patterns: [/busy \? "Applying…"/, /loading=\{busy\}/]
  },
  {
    id: "20-json-restore-and-reset",
    file: SETTINGS,
    patterns: [/busy \? "Restoring…" : "Restore draft snapshot"/, /busy \? "Resetting…" : "Reset to published"/]
  }
];

test("all 20 mutating flows carry a wired present-participle pending state", () => {
  for (const flow of FLOW_REGISTRY) {
    const source = read(flow.file);
    for (const pattern of flow.patterns) {
      assert.match(
        source,
        pattern,
        `flow ${flow.id}: ${flow.file} must match ${pattern} — the confirming control's pending treatment is a §8.1 guardrail`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Live regions: one always-mounted sr-only "Working…" region per surface.
// Always-mounted matters — a region that mounts WITH its content is not
// reliably announced. The visible outcome banners keep owning outcomes.
// ---------------------------------------------------------------------------

const SR_REGION = /role="status" aria-live="polite" className="sr-only"/;

test("SeatMap, Management, and Settings each mount the shared sr-only in-flight region", () => {
  for (const [file, busyExpr] of [
    [SEAT_MAP, /\(mutationInFlight \|\| barSeatActions\.pending \|\| pending\) && !publishReviewOpen \? "Working…"/],
    [MANAGEMENT, /\{pending \? "Working…" : ""\}/],
    [SETTINGS, /\{busy \? "Working…" : ""\}/]
  ]) {
    const source = read(file);
    assert.match(source, SR_REGION, `${file}: shared in-flight region must be an sr-only polite status region`);
    assert.match(source, busyExpr, `${file}: the region must announce "Working…" while the surface's mutations are in flight`);
  }
});

// ---------------------------------------------------------------------------
// The Button primitive's inline-loading contract the labels above rely on.
// ---------------------------------------------------------------------------

test("Button loading prop disables, marks aria-busy, and renders the leading spinner", () => {
  const source = read(BUTTON);
  assert.match(source, /disabled=\{disabled \|\| loading\}/);
  assert.match(source, /aria-busy=\{loading \? "true" : undefined\}/);
  assert.match(source, /loading \? \([\s\S]{0,300}?motion-safe:animate-spin/);
});

// ---------------------------------------------------------------------------
// Reopen wiring (flows 4–7): the dialogs hold open until the action resolves.
// The close now lives in the resolved/success path — these pins fail if the
// old "close first, then run" shape comes back. (The ct halves render the
// dialogs directly; SeatMap owns this state.)
// ---------------------------------------------------------------------------

test("vacate closes only in the resolved saved path; stale path closes via handleStaleDraft", () => {
  const source = read(SEAT_MAP);
  assert.match(
    source,
    /void barSeatActions\.vacateSeat\(seatToVacate\)\.then\(outcome => \{[\s\S]{0,700}?outcome\.kind === "saved"[\s\S]{0,200}?setVacateConfirm\(null\)/,
    "the vacate dialog must close on success, inside the resolved callback"
  );
  assert.match(
    source,
    /function handleStaleDraft\(message: string\) \{[\s\S]{0,900}?setVacateConfirm\(null\);\s*\n\s*setDeleteSeatConfirm\(null\)/,
    "the stale path must close the held-open vacate/delete dialogs"
  );
});

test("delete-seat and move-employee close after their actions resolve", () => {
  const source = read(SEAT_MAP);
  assert.match(
    source,
    /const result = await deleteSeatAction\(seatToDelete\.id\);[\s\S]{0,700}?setDeleteSeatConfirm\(null\)/,
    "the delete dialog must close after the action resolves"
  );
  assert.match(
    source,
    /recordDraftHistory\(moveLabel[\s\S]{0,200}?setMoveEmployeeConfirm\(null\)/,
    "the move dialog must close in the success path"
  );
});

test("SeatMap hands actionError to the held-open dialogs and stands the canvas banner down while any of them shows it", () => {
  const source = read(SEAT_MAP);
  for (const dialog of ["VacateConfirmDialog", "DeleteSeatConfirmDialog", "MoveEmployeeConfirmDialog"]) {
    assert.match(
      source,
      new RegExp(`<${dialog}[\\s\\S]{0,500}?actionError=\\{actionError\\}`),
      `${dialog} must receive actionError (the in-dialog channel)`
    );
  }
  assert.match(
    source,
    /actionError && !sessionExpired && !swapConfirm && !vacateConfirm && !deleteSeatConfirm && !moveEmployeeConfirm/,
    "the canvas error banner must stand down for every dialog that renders actionError inline"
  );
});

// ---------------------------------------------------------------------------
// §8.1 route nit: /my-seat and /login own their loading sentences instead of
// inheriting "Loading the seat map…" from the root segment.
// ---------------------------------------------------------------------------

test("/my-seat and /login have their own loading.tsx sentences", () => {
  assert.match(read("app/my-seat/loading.tsx"), /Loading your seat…/);
  assert.match(read("app/login/loading.tsx"), /Loading the sign-in page…/);
  // The viewer map lives under the (shell) route group since redesign-v2 PR 2
  // and streams its own pane skeleton; the root segment serves the rest.
  assert.match(read("app/(shell)/loading.tsx"), /Loading the seat map…/);
  assert.match(read("app/loading.tsx"), /Loading…/);
});

// PR 3a: the Undo / Redo buttons live in the shared control row — the
// spinner replaces the glyph and the button says aria-busy while the draft
// history round-trips (flows 12 / 13 above pin the wiring in SeatMap).
test("the control row's Undo / Redo show their in-flight state on the confirming control", () => {
  const source = read("components/seat-map/MapControlRow.tsx");
  assert.match(source, /aria-busy=\{busy \? "true" : undefined\}/);
  assert.match(source, /busy \? \([\s\S]{0,200}?motion-safe:animate-spin/);
});
