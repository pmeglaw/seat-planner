import test, { before, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  loadComponent,
  renderElement,
  React,
  configureContext,
  fireEvent,
  screen,
  waitFor,
  act,
  cleanup
} from "./helpers/renderComponent.mjs";

// PR-4 guard (AUDIT-2 F-INT-4 / F-FRM-1): a server error from a dialog-hosted
// submit must render INSIDE the [role="dialog"] subtree — the page/canvas
// banners sit under the dialog scrims, and an error painted there reads as
// "the dialog did nothing".
//
// Two halves:
//   1. ct interaction tests over every dialog that keeps itself open through
//      the action (employee form, swap, publish, discard, Ask Planner): on an
//      error union the alert is inside the dialog, the dialog stays open,
//      submit is re-enabled, and focus lands in the alert.
//   2. A source scan that finds every role="dialog" in components/** and
//      requires each to be classified in DIALOG_REGISTRY — ct-covered here,
//      or ledgered under exactly one of two reasons:
//        - closes-before-resolve: the dialog closes before the action runs;
//          the missing in-flight state is PR-5's territory, NOT an error-
//          placement bug (the error lands on a visible banner after close).
//        - closes-after-resolve-by-design: the dialog deliberately closes on
//          BOTH outcomes once the action resolves. For the Settings review
//          dialogs this is the MLS02 stale-fence recovery: the action failed
//          because the reviewed data went stale, the page refreshes, and
//          re-reviewing IS the recovery — do not "fix" them by holding the
//          dialog open over data it no longer shows.
//      A new dialog with a submit path must pick a lane or this scan fails.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

let AdminManagementPanel;
let SwapConfirmDialog;
let PublishReviewDialog;
let DiscardDraftDialog;
let AskPlannerDrawer;
before(async () => {
  ({ AdminManagementPanel } = await loadComponent("@/components/admin-management/AdminManagementPanel"));
  ({ SwapConfirmDialog, PublishReviewDialog, DiscardDraftDialog } = await loadComponent(
    "@/components/seat-map/SeatMapDialogs"
  ));
  ({ AskPlannerDrawer } = await loadComponent("@/components/seat-map/AskPlannerDrawer"));
});
beforeEach(() => configureContext({ actions: {} }));
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function employee(id, fullName, overrides = {}) {
  return {
    id,
    full_name: fullName,
    position: "Analyst",
    department: null,
    phone_extension: null,
    email: null,
    avatar_url: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides
  };
}

function seat(label, overrides = {}) {
  return {
    id: `seat-${label.toLowerCase()}`,
    seat_key: label.toLowerCase(),
    label,
    x: 0.2,
    y: 0.3,
    status: "available",
    layer: "draft",
    employee_id: null,
    employee: null,
    department: null,
    zone: "North Pod",
    notes: null,
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-08-02T00:00:00Z",
    ...overrides
  };
}

function option(id, name) {
  return { id, name, active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
}

function panelProps() {
  const jane = employee("emp-1", "Jane Doe", { department: "Intake" });
  return {
    employees: [jane],
    seats: [seat("N01", { status: "assigned", employee_id: "emp-1", employee: jane })],
    departmentOptions: [option("dept-intake", "Intake")],
    zoneOptions: [option("zone-north", "North Pod")]
  };
}

const noop = () => {};

function assertAlertInsideOpenDialog() {
  const dialog = screen.getByRole("dialog");
  const alert = screen.getByRole("alert");
  assert.ok(dialog.contains(alert), "the error alert must render INSIDE the [role=dialog] subtree");
  return { dialog, alert };
}

async function assertFocusLandsIn(alert) {
  // Focus arrives on the next frame (rAF) or effect flush.
  await waitFor(() => {
    assert.ok(
      alert === document.activeElement || alert.contains(document.activeElement),
      "focus must move to the in-dialog error alert"
    );
  });
}

// ---------------------------------------------------------------------------
// 1. Employee form (management-employee-title) — the named F-INT-4 finding.
// ---------------------------------------------------------------------------

async function openEditJaneAndFailSave(failure) {
  globalThis.__ct.actions.updateEmployeeAction = failure;
  await renderElement(React.createElement(AdminManagementPanel, panelProps()));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Edit Jane Doe" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save employee" }));
  });
  await waitFor(() => screen.getByRole("alert"));
}

test("employee save error union renders inside the still-open dialog, submit re-enabled, values kept, focus in the alert", async () => {
  await openEditJaneAndFailSave(async () => ({ ok: false, message: "Email looks wrong." }));

  const { dialog, alert } = assertAlertInsideOpenDialog();
  assert.match(alert.textContent, /Email looks wrong\./);
  assert.match(dialog.textContent, /Edit employee/);

  const save = screen.getByRole("button", { name: "Save employee" });
  assert.equal(save.disabled, false, "Save must re-enable after the error");
  // Field values survive the failed round-trip.
  assert.ok([...dialog.querySelectorAll("input")].some(input => input.value === "Jane Doe"));
  await assertFocusLandsIn(alert);
});

test("a thrown employee save error takes the same in-dialog path with the written fallback", async () => {
  await openEditJaneAndFailSave(async () => {
    throw new Error("An error occurred in the Server Components render (digest: abc123)");
  });
  const { alert } = assertAlertInsideOpenDialog();
  assert.match(alert.textContent, /Could not save employee\./);
});

test("dismissing the employee dialog error returns focus to the submit button", async () => {
  await openEditJaneAndFailSave(async () => ({ ok: false, message: "Email looks wrong." }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Dismiss save error" }));
  });
  assert.equal(screen.queryByRole("alert"), null);
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Save employee" }));
});

// ---------------------------------------------------------------------------
// 2. Swap confirm (swap-confirm-title) — the sibling the audit undercounted:
//    its thrown path keeps the dialog open, so the error must live inside it.
//    Presentational render: SeatMap owns the state; the wiring is pinned in
//    the source section below.
// ---------------------------------------------------------------------------

function swapSeats() {
  const jane = employee("emp-1", "Jane Doe");
  return {
    source: seat("N01", { status: "assigned", employee_id: "emp-1", employee: jane }),
    target: seat("N02")
  };
}

test("swap dialog renders actionError inline, keeps confirm enabled as Retry, and focuses the alert", async () => {
  const { source, target } = swapSeats();
  await renderElement(
    React.createElement(SwapConfirmDialog, {
      swapSourceSeat: source,
      swapTargetSeat: target,
      actionError: "Could not swap seats.",
      pending: false,
      onCancel: noop,
      onConfirm: noop
    })
  );

  const { alert } = assertAlertInsideOpenDialog();
  assert.match(alert.textContent, /Swap did not complete\..*Could not swap seats\./);
  const retry = screen.getByRole("button", { name: "Retry swap" });
  assert.equal(retry.disabled, false);
  await assertFocusLandsIn(alert);
});

// ---------------------------------------------------------------------------
// 3–5. Publish, discard, Ask Planner — already correct; pinned so the pattern
//      cannot regress out of the dialogs that have it.
// ---------------------------------------------------------------------------

test("publish review renders actionError inline with an enabled Retry publish", async () => {
  await renderElement(
    React.createElement(PublishReviewDialog, {
      publishSummary: {
        hasChanges: true,
        employeeDetailChanges: [],
        draftSeatCount: 2,
        publishedSeatCount: 2,
        totalChangeCount: 1
      },
      publishDiffRows: [],
      publishDiffCounts: { assigned: 0, added: 0, vacated: 0, removed: 0, reassigned: 0, updated: 0 },
      actionError: "The publish RPC refused.",
      pending: false,
      onClose: noop,
      onConfirm: noop
    })
  );
  const { alert } = assertAlertInsideOpenDialog();
  assert.match(alert.textContent, /Publish did not complete\..*The publish RPC refused\./);
  assert.equal(screen.getByRole("button", { name: /Retry publish/ }).disabled, false);
});

test("discard draft renders actionError inline with an enabled Retry discard", async () => {
  await renderElement(
    React.createElement(DiscardDraftDialog, {
      totalChangeCount: 3,
      actionError: "The reset RPC refused.",
      pending: false,
      onCancel: noop,
      onConfirm: noop
    })
  );
  const { alert } = assertAlertInsideOpenDialog();
  assert.match(alert.textContent, /The reset RPC refused\./);
  assert.equal(screen.getByRole("button", { name: /Retry discard/ }).disabled, false);
});

test("Ask Planner renders its action error inside the open drawer and re-enables Ask", async () => {
  globalThis.__ct.actions.askPlannerAction = async () => ({ error: "Ask Planner is unavailable." });
  await renderElement(
    React.createElement(AskPlannerDrawer, {
      open: true,
      draftDirty: false,
      zones: [],
      queuedRequest: null,
      highlightedSeatIds: [],
      onClose: noop,
      onHighlightSeats: noop,
      onClearHighlights: noop,
      onSelectSeat: noop
    })
  );
  await act(async () => {
    fireEvent.change(document.querySelector('textarea[name="askPlannerQuestion"]'), {
      target: { value: "Who sits in the north pod?" }
    });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  });
  await waitFor(() => screen.getByRole("alert"));
  const { alert } = assertAlertInsideOpenDialog();
  // friendlyDrawerError maps the raw action message to written copy — assert
  // the mapped text, not the raw string.
  assert.match(alert.textContent, /Ask Planner could not answer/);
  assert.equal(screen.getByRole("button", { name: "Ask" }).disabled, false);
});

// ---------------------------------------------------------------------------
// Source scan: every role="dialog" in components/** must be classified.
// ---------------------------------------------------------------------------

// Ids covered by the ct tests above. Adding a dialog here without a matching
// ct test defeats the guard — the reviewer checks this list against the tests.
const CT_COVERED = new Set([
  "management-employee-title",
  "swap-confirm-title",
  "publish-review-title",
  "discard-draft-title",
  "ask-planner-title"
]);

const DIALOG_REGISTRY = {
  "management-employee-title": { kind: "ct" },
  "swap-confirm-title": { kind: "ct" },
  "publish-review-title": { kind: "ct" },
  "discard-draft-title": { kind: "ct" },
  "ask-planner-title": { kind: "ct" },

  // PR-5 territory: these close BEFORE the action resolves; the error lands
  // on a visible banner after close. The defect is missing in-flight state,
  // not error placement — do not add in-dialog errors here piecemeal.
  "vacate-seat-confirm-title": { kind: "closes-before-resolve" },
  "delete-seat-confirm-title": { kind: "closes-before-resolve" },
  "move-employee-map-confirm-title": { kind: "closes-before-resolve" },
  "inspector-unsaved-title": { kind: "closes-before-resolve" },
  "move-employee-confirm-title": { kind: "closes-before-resolve" },

  // Deliberate close-on-both-outcomes AFTER resolve.
  "management-confirm-title": {
    kind: "closes-after-resolve-by-design",
    reason:
      "finally-close + page banner (visible, nothing occludes it); pinned by admin-management-panel.test.mjs failed-deactivation test"
  },
  "csv-import-review-title": {
    kind: "closes-after-resolve-by-design",
    reason:
      "MLS02 stale-fence recovery: failure means the reviewed rows went stale; close + router.refresh + re-review IS the recovery"
  },
  "json-restore-review-title": {
    kind: "closes-after-resolve-by-design",
    reason: "MLS02 stale-fence recovery, same as the CSV review"
  },
  "reset-review-title": {
    kind: "closes-after-resolve-by-design",
    reason: "MLS02 stale-fence recovery, same as the CSV review"
  }
};

function collectComponentFiles(root) {
  const abs = path.join(repoRoot, root);
  const out = [];
  for (const entry of readdirSync(abs)) {
    const p = path.join(abs, entry);
    if (statSync(p).isDirectory()) out.push(...collectComponentFiles(path.join(root, entry)));
    else if (/\.tsx$/.test(entry)) out.push(path.join(root, entry).replaceAll("\\", "/"));
  }
  return out;
}

test("every role=dialog is classified: ct-covered or ledgered under one of the two reasons", () => {
  const discovered = new Map();
  for (const file of collectComponentFiles("components")) {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    for (const match of source.matchAll(/role="dialog"/g)) {
      const window = source.slice(match.index, match.index + 400);
      const label = window.match(/aria-labelledby="([\w-]+)"/);
      assert.ok(label, `${file}: role="dialog" without aria-labelledby near it — dialogs must be labeled`);
      discovered.set(label[1], file);
    }
  }

  for (const [id, file] of discovered) {
    const entry = DIALOG_REGISTRY[id];
    assert.ok(
      entry,
      `${file}: dialog "${id}" is not in DIALOG_REGISTRY — classify it: add a ct test here (kind "ct"), or ledger it as ` +
        `"closes-before-resolve" (PR-5) / "closes-after-resolve-by-design" (with the reason)`
    );
    if (entry.kind === "ct") {
      assert.ok(CT_COVERED.has(id), `dialog "${id}" is marked ct but missing from CT_COVERED`);
    } else {
      assert.ok(
        entry.kind === "closes-before-resolve" || entry.kind === "closes-after-resolve-by-design",
        `dialog "${id}" has unknown classification "${entry.kind}"`
      );
    }
  }

  for (const id of Object.keys(DIALOG_REGISTRY)) {
    assert.ok(discovered.has(id), `Stale DIALOG_REGISTRY entry: no dialog labelled "${id}" exists any more — delete it`);
  }
});

// ---------------------------------------------------------------------------
// SeatMap wiring pins: the swap ct above renders the dialog directly, so the
// two SeatMap-side halves are pinned in source — the dialog receives the
// error, and the canvas banner stands down while it is open (one channel).
// ---------------------------------------------------------------------------

test("SeatMap passes actionError to SwapConfirmDialog and suppresses the canvas banner while it is open", () => {
  const source = readFileSync(path.join(repoRoot, "components/seat-map/SeatMap.tsx"), "utf8");
  assert.match(
    source,
    /<SwapConfirmDialog[\s\S]{0,400}?actionError=\{actionError\}/,
    "SwapConfirmDialog must receive actionError (the in-dialog channel)"
  );
  assert.match(
    source,
    /actionError && !sessionExpired && !swapConfirm/,
    "the canvas error banner must not double-render the error while the swap dialog shows it"
  );
});
