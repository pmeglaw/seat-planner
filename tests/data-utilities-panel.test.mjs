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
  cleanup,
  within
} from "./helpers/renderComponent.mjs";

// PR-5 added an always-mounted sr-only in-flight status region, so role
// "status" is no longer unique — these asserts target the visible outcome
// notification (the region with rendered text, not the sr-only sibling).
const visibleStatus = () => screen.getAllByRole("status").find(el => !el.className.includes("sr-only"));

// Interaction tests for the real DataUtilitiesPanel (Settings, Phase 4 PR 4
// shape: callout, two sections with labelled file triggers, the CSV and
// snapshot reviews as narrow tearsheets). The bulk-destructive-action-safety-
// source test pins that the reviews EXIST in the source; these pin that they
// actually gate the mutation — nothing writes until a review is confirmed,
// blocking CSV issues disable the apply, the concurrency fences are captured
// from the reviewed props, a stale-draft rejection surfaces the refresh
// guidance — plus the PR 4 contracts: the 5 MB / type guard refuses inline
// before any sheet, the exports never disable, the restore review's
// export-first ghost shows its done-state in place, and Reset draft is gone.

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

// The handlers read file.name / file.size for the guard and file.text() for
// the content; a plain object stands in for a File (jsdom's input.files is
// read-only, so it is installed via defineProperty).
function chooseFile(input, text, { name = "roster.csv", size = text.length } = {}) {
  Object.defineProperty(input, "files", {
    value: [{ name, size, text: async () => text }],
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

async function render(props = defaultProps()) {
  return renderElement(React.createElement(DataUtilitiesPanel, props));
}

test("CSV import: choosing a file only opens the review — no action call before confirm", async () => {
  const importCalls = [];
  globalThis.__ct.actions.importAssignmentsCsvAction = async (...args) => {
    importCalls.push(args);
    return { ok: true, count: 1 };
  };
  const props = defaultProps();
  const { container } = await render(props);

  const [csvInput] = fileInputs(container);
  await act(async () => chooseFile(csvInput, VALID_CSV));
  await waitFor(() => screen.getByRole("dialog"));

  // Parsed counts are on screen for review; nothing has written yet.
  assert.ok(screen.getByRole("heading", { name: "Review CSV import" }));
  const sheet = screen.getByRole("dialog");
  assert.ok(sheet.className.includes("sp-tearsheet--narrow"), "the review is the narrow tearsheet");
  assert.equal(within(sheet).queryByRole("button", { name: /close/i }), null, "no × — Cancel is the exit");
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
  assert.match(visibleStatus().textContent, /CSV import applied — 1 row updated in the draft\./);
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
  const { container } = await render(props);

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

test("CSV import: blocking validation errors disable the apply, name the rows and the reason", async () => {
  let called = false;
  globalThis.__ct.actions.importAssignmentsCsvAction = async () => {
    called = true;
    return { ok: true, count: 0 };
  };
  const { container } = await render();

  await act(async () => chooseFile(fileInputs(container)[0], BROKEN_CSV));
  await waitFor(() => screen.getByRole("dialog"));

  assert.ok(screen.getByRole("heading", { name: "CSV import has blocking errors" }));
  const sheet = screen.getByRole("dialog");
  assert.match(sheet.textContent, /Row 2Seat label is required\./);
  assert.ok(sheet.querySelector(".sp-row-list li[data-blocked]"), "blocked rows carry the error edge");
  assert.match(sheet.textContent, /No draft data has changed/);

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
  const { container } = await render();

  await act(async () => chooseFile(fileInputs(container)[0], VALID_CSV));
  await waitFor(() => screen.getByRole("dialog"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Apply import" }));
  });

  await waitFor(() => screen.getByRole("alert"));
  assert.match(
    screen.getByRole("alert").textContent,
    /The draft changed while you were reviewing\. This page has been refreshed with the latest directory/
  );
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(refreshCalls, 1);
});

test("the 5 MB / type / empty guard refuses inline under the section before any sheet (D6-b)", async () => {
  let called = false;
  globalThis.__ct.actions.importAssignmentsCsvAction = async () => {
    called = true;
    return { ok: true, count: 0 };
  };
  const { container } = await render();
  const [csvInput, jsonInput] = fileInputs(container);

  await act(async () => chooseFile(csvInput, VALID_CSV, { name: "roster.xlsx" }));
  assert.equal(screen.getByRole("alert").textContent, "Choose a .csv file.");
  assert.equal(screen.queryByRole("dialog"), null);

  await act(async () => chooseFile(csvInput, VALID_CSV, { size: 7.2 * 1024 * 1024 }));
  assert.equal(screen.getByRole("alert").textContent, "This file is 7.2 MB — the limit is 5 MB.");

  await act(async () => chooseFile(csvInput, "", { size: 0 }));
  assert.equal(screen.getByRole("alert").textContent, "The CSV is empty.");

  // Missing columns: parsed, then refused inline — no blocked sheet for a
  // structural problem.
  await act(async () => chooseFile(csvInput, "seat_label,employee_name\nN01,Jane\n"));
  await waitFor(() => assert.match(screen.getByRole("alert").textContent, /Missing required columns:/));
  assert.equal(screen.queryByRole("dialog"), null);

  await act(async () => chooseFile(jsonInput, "{}", { name: "notes.txt" }));
  assert.ok(screen.getAllByRole("alert").some(el => el.textContent === "Choose a .json file — a file exported from this page."));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(called, false);
});

test("the triggers state the type and the limit in their own label and forward to a hidden, name-carrying input", async () => {
  const { container } = await render();
  const importButton = screen.getByRole("button", { name: "Import CSV · .csv up to 5 MB" });
  assert.ok(importButton.className.includes("cds-btn--primary"));
  const [csvInput, jsonInput] = fileInputs(container);
  assert.equal(csvInput.getAttribute("aria-hidden"), "true");
  assert.equal(csvInput.getAttribute("tabindex"), "-1");
  assert.equal(csvInput.getAttribute("aria-label"), "Import CSV · .csv up to 5 MB");
  assert.equal(jsonInput.getAttribute("aria-label"), "Restore draft snapshot…");
  assert.ok(screen.getByRole("button", { name: "Restore draft snapshot…" }).className.includes("cds-btn--tertiary"));
  assert.match(document.body.textContent, /\.json up to 5 MB — a file exported from this page\./);

  let clicked = 0;
  csvInput.click = () => { clicked += 1; };
  fireEvent.click(importButton);
  assert.equal(clicked, 1, "the button forwards its click to the hidden input");
});

test("exports are never disabled, an empty draft exports the header row only, and Reset draft is gone", async () => {
  const downloads = [];
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = blob => {
    downloads.push(blob);
    return "blob:test";
  };
  URL.revokeObjectURL = () => {};
  try {
    await render(defaultProps({ seats: [] }));
    const exportCsv = screen.getByRole("button", { name: "Export CSV" });
    assert.equal(exportCsv.disabled, false);
    assert.ok(screen.getByRole("button", { name: "Export draft snapshot" }).className.includes("cds-btn--primary"));
    assert.equal(screen.getByRole("button", { name: "Export draft snapshot" }).disabled, false);
    await act(async () => {
      fireEvent.click(exportCsv);
    });
    assert.equal(downloads.length, 1);
    assert.equal(await downloads[0].text(), `${CSV_HEADER}\n`);
    assert.equal(screen.queryByRole("button", { name: /Reset draft/ }), null);
    assert.doesNotMatch(document.body.textContent, /Reset draft to published/);
  } finally {
    URL.createObjectURL = originalCreate;
  }
});

test("snapshot restore: a valid snapshot opens the review, and confirming sends the snapshot plus the seat fence", async () => {
  const restoreCalls = [];
  globalThis.__ct.actions.restoreDraftSnapshotAction = async (...args) => {
    restoreCalls.push(args);
    return { ok: true };
  };
  const props = defaultProps();
  const snapshot = { seats: [seat("N01"), seat("N02"), seat("N03")], employees: [employee("emp-1", "Jane Doe")] };
  const { container } = await render(props);

  await act(async () => chooseFile(fileInputs(container)[1], JSON.stringify(snapshot), { name: "seat-map-export.json" }));
  await waitFor(() => screen.getByRole("dialog"));

  assert.ok(screen.getByRole("heading", { name: "Review draft snapshot restore" }));
  const sheet = screen.getByRole("dialog");
  assert.match(sheet.textContent, /3Draft seats/);
  assert.match(sheet.textContent, /1Employees/);
  assert.match(sheet.textContent, /Undo history is cleared\./);
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
  assert.match(visibleStatus().textContent, /Draft restored from seat-map-export\.json — the draft now matches the snapshot\./);
  assert.equal(screen.queryByRole("dialog"), null);
});

test("snapshot restore: 'Export the current draft first' downloads without closing the review and shows its done-state", async () => {
  const downloads = [];
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = blob => {
    downloads.push(blob);
    return "blob:test";
  };
  URL.revokeObjectURL = () => {};
  try {
    const { container } = await render();
    await act(async () => chooseFile(fileInputs(container)[1], JSON.stringify({ seats: [seat("N01")], employees: [] }), { name: "x.json" }));
    await waitFor(() => screen.getByRole("dialog"));
    const ghost = screen.getByRole("button", { name: "Export the current draft first" });
    assert.ok(ghost.className.includes("cds-btn--ghost"));
    await act(async () => {
      fireEvent.click(ghost);
    });
    assert.equal(downloads.length, 1);
    assert.ok(screen.getByRole("dialog"), "the review stays open");
    const done = screen.getByRole("button", { name: /^Exported \d/ });
    assert.equal(done.disabled, false, "the done-state stays a button");
    assert.equal(done.getAttribute("data-done"), "");
  } finally {
    URL.createObjectURL = originalCreate;
  }
});

test("snapshot restore: a stale-draft rejection keeps the review open with the server text and a Retry", async () => {
  let calls = 0;
  globalThis.__ct.actions.restoreDraftSnapshotAction = async () => {
    calls += 1;
    return { ok: false, message: "The draft changed in another session." };
  };
  const { container } = await render();
  await act(async () => chooseFile(fileInputs(container)[1], JSON.stringify({ seats: [seat("N01")], employees: [] }), { name: "x.json" }));
  await waitFor(() => screen.getByRole("dialog"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Restore draft snapshot" }));
  });
  await waitFor(() => screen.getByRole("alert"));
  const sheet = screen.getByRole("dialog");
  assert.ok(sheet.contains(screen.getByRole("alert")), "the MLS02 text renders inside the still-open review");
  assert.match(screen.getByRole("alert").textContent, /The draft changed in another session\. This page has been refreshed with the latest draft/);
  assert.equal(refreshCalls, 1);
  assert.equal(within(sheet).getByRole("button", { name: "Retry restore" }).disabled, false);
  assert.equal(calls, 1);
});

test("snapshot restore: a payload without seats/employees arrays is rejected before any review", async () => {
  let called = false;
  globalThis.__ct.actions.restoreDraftSnapshotAction = async () => {
    called = true;
    return { ok: true };
  };
  const { container } = await render();

  await act(async () => chooseFile(fileInputs(container)[1], JSON.stringify({ rows: [] }), { name: "x.json" }));

  await waitFor(() => screen.getByRole("alert"));
  assert.match(screen.getByRole("alert").textContent, /The snapshot must include seats and employees arrays/);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(called, false);
});

test("review sheets close on Escape without mutating anything", async () => {
  let called = false;
  globalThis.__ct.actions.importAssignmentsCsvAction = async () => {
    called = true;
    return { ok: true, count: 0 };
  };
  const { container } = await render();

  await act(async () => chooseFile(fileInputs(container)[0], VALID_CSV));
  await waitFor(() => screen.getByRole("dialog"));

  await act(async () => {
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(called, false);
});
