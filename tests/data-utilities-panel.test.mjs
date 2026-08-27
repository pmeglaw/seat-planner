import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
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

// PR-5 added an always-mounted sr-only in-flight status region, so role
// "status" is no longer unique — these asserts target the visible outcome
// banner (the region with rendered text, not the sr-only sibling).
const visibleStatus = () => screen.getAllByRole("status").find(el => !el.className.includes("sr-only"));

// Interaction tests for the real DataUtilitiesPanel (Settings → data
// utilities), the surface fronting the three bulk-destructive operations:
// CSV import, draft-snapshot restore, and reset-to-published. The
// bulk-destructive-action-safety-source test pins that the review dialogs
// EXIST in the source; these pin that they actually gate the mutation —
// nothing writes until the review is confirmed, blocking CSV issues disable
// the apply, the concurrency fences are captured from the reviewed props,
// and a stale-draft rejection (MLS02 path) surfaces the refresh guidance.

let DataUtilitiesPanel;
before(async () => {
  ({ DataUtilitiesPanel } = await loadComponent("@/components/admin-settings/DataUtilitiesPanel"));
});
afterEach(() => cleanup());

function employee(id, fullName, overrides = {}) {
  return {
    id,
    full_name: fullName,
    position: null,
    department: null,
    phone_extension: null,
    email: null,
    avatar_url: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: `2026-08-01T0${id.length % 10}:00:00.123456+00:00`,
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
    updated_at: "2026-08-02T10:00:00.654321+00:00",
    ...overrides
  };
}

const CSV_HEADER = "seat_label,employee_name,employee_email,position,department,zone,status,notes";
const VALID_CSV = `${CSV_HEADER}\nN01,Jane Doe,jane@example.test,Case Manager,Intake,North Pod,assigned,\n`;
const BROKEN_CSV = `${CSV_HEADER}\n,Jane Doe,jane@example.test,,,,assigned,\n`;

// The handlers only ever call file.text(); a plain object stands in for a File
// (jsdom's input.files is read-only, so it is installed via defineProperty).
function chooseFile(input, text) {
  Object.defineProperty(input, "files", {
    value: [{ text: async () => text }],
    configurable: true
  });
  fireEvent.change(input);
}

function fileInputs(container) {
  return [...container.querySelectorAll('input[type="file"]')];
}

function defaultProps(overrides = {}) {
  const seats = [seat("N01"), seat("N02")];
  return {
    seats,
    publishedSeats: seats,
    employees: [employee("emp-1", "Jane Doe")],
    ...overrides
  };
}

let refreshCalls;
beforeEach(() => {
  refreshCalls = 0;
  configureContext({
    router: {
      refresh() {
        refreshCalls += 1;
      }
    },
    actions: {}
  });
});

test("CSV import: choosing a file only opens the review — no action call before confirm", async () => {
  const importCalls = [];
  globalThis.__ct.actions.importAssignmentsCsvAction = async (...args) => {
    importCalls.push(args);
    return { ok: true, count: 1 };
  };
  const props = defaultProps();
  const { container } = await renderElement(React.createElement(DataUtilitiesPanel, props));

  const [csvInput] = fileInputs(container);
  await act(async () => chooseFile(csvInput, VALID_CSV));
  await waitFor(() => screen.getByRole("dialog"));

  // Parsed counts are on screen for review; nothing has written yet.
  assert.ok(screen.getByText("Review CSV import"));
  assert.equal(importCalls.length, 0);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Apply import" }));
  });
  await waitFor(() => assert.equal(importCalls.length, 1));

  // The action receives the reviewed CSV text plus BOTH concurrency fences,
  // captured from the props the admin was looking at (exact timestamps,
  // never re-serialized).
  const [text, expectedSeats, expectedEmployees] = importCalls[0];
  assert.equal(text, VALID_CSV);
  assert.deepEqual(expectedSeats, [
    { id: "seat-n01", updated_at: "2026-08-02T10:00:00.654321+00:00" },
    { id: "seat-n02", updated_at: "2026-08-02T10:00:00.654321+00:00" }
  ]);
  assert.deepEqual(expectedEmployees, [{ id: "emp-1", updated_at: props.employees[0].updated_at }]);

  await waitFor(() => assert.ok(visibleStatus()));
  assert.match(visibleStatus().textContent, /CSV import applied\. 1 rows updated/);
  assert.equal(refreshCalls, 1);
});

test("CSV import: inactive employees are excluded from the directory fence", async () => {
  const importCalls = [];
  globalThis.__ct.actions.importAssignmentsCsvAction = async (...args) => {
    importCalls.push(args);
    return { ok: true, count: 1 };
  };
  const props = defaultProps({
    employees: [employee("emp-1", "Jane Doe"), employee("emp-2", "Gone Person", { active: false })]
  });
  const { container } = await renderElement(React.createElement(DataUtilitiesPanel, props));

  await act(async () => chooseFile(fileInputs(container)[0], VALID_CSV));
  await waitFor(() => screen.getByRole("dialog"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Apply import" }));
  });
  await waitFor(() => assert.equal(importCalls.length, 1));

  assert.deepEqual(
    importCalls[0][2].map(({ id }) => id),
    ["emp-1"]
  );
});

test("CSV import: blocking validation errors disable the apply and name the rows", async () => {
  let called = false;
  globalThis.__ct.actions.importAssignmentsCsvAction = async () => {
    called = true;
    return { ok: true, count: 0 };
  };
  const { container } = await renderElement(React.createElement(DataUtilitiesPanel, defaultProps()));

  await act(async () => chooseFile(fileInputs(container)[0], BROKEN_CSV));
  await waitFor(() => screen.getByRole("dialog"));

  assert.ok(screen.getByText("CSV import has blocking errors"));
  assert.match(screen.getByRole("dialog").textContent, /Row 2: Seat label is required\./);

  const apply = screen.getByRole("button", { name: "Fix CSV first" });
  assert.equal(apply.disabled, true);
  // A click on the disabled apply must be inert even if forced through.
  await act(async () => {
    fireEvent.click(apply);
  });
  assert.equal(called, false);
});

test("CSV import: a stale-draft rejection closes the review and surfaces the refresh guidance", async () => {
  globalThis.__ct.actions.importAssignmentsCsvAction = async () => ({
    ok: false,
    message: "The draft changed while you were reviewing."
  });
  const { container } = await renderElement(React.createElement(DataUtilitiesPanel, defaultProps()));

  await act(async () => chooseFile(fileInputs(container)[0], VALID_CSV));
  await waitFor(() => screen.getByRole("dialog"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Apply import" }));
  });

  await waitFor(() => screen.getByRole("alert"));
  assert.match(
    screen.getByRole("alert").textContent,
    /The draft changed while you were reviewing\. This page has been refreshed with the latest draft/
  );
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(refreshCalls, 1);
});

test("snapshot restore: a valid snapshot opens the review, and confirming sends the snapshot plus the seat fence", async () => {
  const restoreCalls = [];
  globalThis.__ct.actions.restoreDraftSnapshotAction = async (...args) => {
    restoreCalls.push(args);
    return { ok: true };
  };
  const props = defaultProps();
  const snapshot = { seats: [seat("N01"), seat("N02"), seat("N03")], employees: [employee("emp-1", "Jane Doe")] };
  const { container } = await renderElement(React.createElement(DataUtilitiesPanel, props));

  await act(async () => chooseFile(fileInputs(container)[1], JSON.stringify(snapshot)));
  await waitFor(() => screen.getByRole("dialog"));

  assert.ok(screen.getByText("Review draft snapshot restore"));
  assert.equal(restoreCalls.length, 0);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Restore draft snapshot" }));
  });
  await waitFor(() => assert.equal(restoreCalls.length, 1));

  const [sentSnapshot, fence] = restoreCalls[0];
  assert.equal(sentSnapshot.seats.length, 3);
  assert.deepEqual(
    fence.map(({ id }) => id),
    ["seat-n01", "seat-n02"]
  );
  await waitFor(() => assert.ok(visibleStatus()));
  assert.match(visibleStatus().textContent, /Draft backup restored/);
});

test("snapshot restore: a payload without seats/employees arrays is rejected before any review", async () => {
  let called = false;
  globalThis.__ct.actions.restoreDraftSnapshotAction = async () => {
    called = true;
    return { ok: true };
  };
  const { container } = await renderElement(React.createElement(DataUtilitiesPanel, defaultProps()));

  await act(async () => chooseFile(fileInputs(container)[1], JSON.stringify({ rows: [] })));

  await waitFor(() => screen.getByRole("alert"));
  assert.match(screen.getByRole("alert").textContent, /Draft snapshot must include seats and employees arrays\./);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(called, false);
});

test("reset to published: a clean draft short-circuits to a notice — no dialog, no action", async () => {
  let called = false;
  globalThis.__ct.actions.resetDraftToPublishedAction = async () => {
    called = true;
    return { ok: true };
  };
  // seats === publishedSeats in defaultProps, so the diff is empty.
  await renderElement(React.createElement(DataUtilitiesPanel, defaultProps()));

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Reset draft to published\./ }));
  });

  assert.match(visibleStatus().textContent, /already matches the published map/);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(called, false);
});

test("reset to published: a dirty draft opens the review, cancel keeps the draft, confirm sends the fence", async () => {
  const resetCalls = [];
  globalThis.__ct.actions.resetDraftToPublishedAction = async (...args) => {
    resetCalls.push(args);
    return { ok: true };
  };
  const props = defaultProps({
    seats: [seat("N01", { status: "assigned", employee_id: "emp-1" }), seat("N02"), seat("N03")],
    publishedSeats: [seat("N01"), seat("N02")]
  });
  await renderElement(React.createElement(DataUtilitiesPanel, props));

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Reset draft to published\./ }));
  });
  await waitFor(() => screen.getByRole("dialog"));
  assert.ok(screen.getByText("Reset draft to published?"));

  // Cancel path first: the dialog closes and nothing was called.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Keep draft changes" }));
  });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(resetCalls.length, 0);

  // Reopen and confirm.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Reset draft to published\./ }));
  });
  await waitFor(() => screen.getByRole("dialog"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Reset to published" }));
  });
  await waitFor(() => assert.equal(resetCalls.length, 1));

  assert.deepEqual(
    resetCalls[0][0].map(({ id }) => id),
    ["seat-n01", "seat-n02", "seat-n03"]
  );
  await waitFor(() => assert.ok(visibleStatus()));
  assert.match(visibleStatus().textContent, /people edits in Management were kept/i);
  assert.equal(refreshCalls, 1);
});

test("review dialogs close on Escape without mutating anything", async () => {
  let called = false;
  globalThis.__ct.actions.importAssignmentsCsvAction = async () => {
    called = true;
    return { ok: true, count: 0 };
  };
  const { container } = await renderElement(React.createElement(DataUtilitiesPanel, defaultProps()));

  await act(async () => chooseFile(fileInputs(container)[0], VALID_CSV));
  await waitFor(() => screen.getByRole("dialog"));

  await act(async () => {
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(called, false);
});
