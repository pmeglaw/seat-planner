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

// Interaction tests for the real AdminManagementPanel (Management tab), the
// surface fronting the directory's destructive actions. The
// bulk-destructive-action-safety-source test pins that the confirmation
// dialog EXISTS in the source; these pin that it actually gates the
// mutations: deactivation is double-gated (editor -> impact confirm), the
// department/zone deletes state their blast radius before applying, cancel
// paths never call a server action, and a failed action keeps the row.

let AdminManagementPanel;
before(async () => {
  ({ AdminManagementPanel } = await loadComponent("@/components/admin-management/AdminManagementPanel"));
});
afterEach(() => cleanup());

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

function defaultProps() {
  const jane = employee("emp-1", "Jane Doe", { department: "Intake" });
  return {
    employees: [jane, employee("emp-2", "Bob Field")],
    seats: [seat("N01", { status: "assigned", employee_id: "emp-1", employee: jane }), seat("N02")],
    departmentOptions: [option("dept-intake", "Intake")],
    zoneOptions: [option("zone-north", "North Pod")]
  };
}

beforeEach(() => {
  configureContext({ actions: {} });
});

async function renderPanel(props = defaultProps()) {
  return renderElement(React.createElement(AdminManagementPanel, props));
}

test("deactivation is double-gated: editor -> impact confirm -> action, and the row leaves the table", async () => {
  const deleteCalls = [];
  globalThis.__ct.actions.deleteEmployeeAction = async (...args) => {
    deleteCalls.push(args);
    return { ok: true };
  };
  await renderPanel();

  // Gate 1: the employee editor.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Edit Jane Doe" }));
  });
  assert.ok(screen.getByText("Edit employee"));

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
  });

  // Gate 2: the impact confirmation, naming the person and their draft seat.
  const confirm = screen.getByRole("dialog");
  assert.match(confirm.textContent, /Deactivate Jane Doe\?/);
  assert.match(confirm.textContent, /Current draft seat: N01\./);
  assert.equal(deleteCalls.length, 0);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Deactivate employee" }));
  });
  await waitFor(() => assert.deepEqual(deleteCalls, [["emp-1"]]));

  await waitFor(() => screen.getByRole("status"));
  assert.match(screen.getByRole("status").textContent, /Jane Doe deactivated\./);
  // The directory row is gone; the untouched employee remains.
  assert.equal(screen.queryByRole("button", { name: "Edit Jane Doe" }), null);
  assert.ok(screen.getByRole("button", { name: "Edit Bob Field" }));
});

test("cancelling the deactivation confirm never calls the action", async () => {
  let called = false;
  globalThis.__ct.actions.deleteEmployeeAction = async () => {
    called = true;
    return { ok: true };
  };
  await renderPanel();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Edit Jane Doe" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  });

  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(called, false);
  assert.ok(screen.getByRole("button", { name: "Edit Jane Doe" }));
});

test("a failed deactivation surfaces the server message and keeps the row", async () => {
  globalThis.__ct.actions.deleteEmployeeAction = async () => ({
    ok: false,
    message: "Employee has pending edits elsewhere."
  });
  await renderPanel();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Edit Jane Doe" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Deactivate employee" }));
  });

  await waitFor(() => screen.getByRole("alert"));
  assert.match(screen.getByRole("alert").textContent, /Employee has pending edits elsewhere\./);
  assert.ok(screen.getByRole("button", { name: "Edit Jane Doe" }));
});

test("department delete states its blast radius and only calls the action on confirm", async () => {
  const deleteCalls = [];
  globalThis.__ct.actions.deleteDepartmentAction = async (...args) => {
    deleteCalls.push(args);
    return { ok: true };
  };
  await renderPanel();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Departments" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Delete Intake" }));
  });

  const confirm = screen.getByRole("dialog");
  assert.match(confirm.textContent, /Delete department “Intake”\?/);
  // Jane is Intake's one active member — the count the admin is confirming.
  assert.match(confirm.textContent, /Clears this department from 1 active employee\./);
  assert.equal(deleteCalls.length, 0);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Delete department" }));
  });
  await waitFor(() => assert.deepEqual(deleteCalls, [["Intake"]]));
  assert.match(screen.getByRole("status").textContent, /Department Intake deleted\./);
});

test("zone delete states the affected draft-seat count and only calls the action on confirm", async () => {
  const deleteCalls = [];
  globalThis.__ct.actions.deleteZoneAction = async (...args) => {
    deleteCalls.push(args);
    return { ok: true };
  };
  await renderPanel();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Zones" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Delete North Pod" }));
  });

  const confirm = screen.getByRole("dialog");
  assert.match(confirm.textContent, /Delete zone “North Pod”\?/);
  // Both fixture seats sit in North Pod.
  assert.match(confirm.textContent, /Clears this physical zone from 2 draft seats\./);
  assert.equal(deleteCalls.length, 0);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Delete zone" }));
  });
  await waitFor(() => assert.deepEqual(deleteCalls, [["North Pod"]]));
  assert.match(screen.getByRole("status").textContent, /Zone North Pod deleted\./);
});

test("the add-employee save stays disabled until a name is entered", async () => {
  await renderPanel();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Add employee/ }));
  });

  const dialog = screen.getByRole("dialog");
  const save = screen.getByRole("button", { name: "Add employee" });
  assert.equal(save.disabled, true);
  // A blank editor is an add: no Deactivate affordance to misfire on.
  assert.equal(screen.queryByRole("button", { name: "Deactivate" }), null);

  const nameInput = dialog.querySelector("input");
  await act(async () => {
    fireEvent.change(nameInput, { target: { value: "New Person" } });
  });
  assert.equal(save.disabled, false);
});
