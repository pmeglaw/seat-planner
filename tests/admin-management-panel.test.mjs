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
// banner (the region with rendered text, not the sr-only sibling).
const visibleStatus = () => screen.getAllByRole("status").find(el => !el.className.includes("sr-only"));

// Interaction tests for the real AdminManagementPanel (Phase 4 PR 4 shape:
// frame + tabs, EmployeesTable, EmployeePanel, OptionList, the create modal
// and the narrow confirm sheet). The bulk-destructive-action-safety-source
// test pins that the confirmation surface EXISTS in the source; these pin that
// it actually gates the mutations: deactivation is double-gated (panel ->
// impact sheet), the department/zone deletes state their blast radius before
// applying, cancel paths never call a server action, and a failed action keeps
// the row — plus the PR 4 contracts (tabs, count, two row stops, dirty close,
// inline rename, create modal).

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


// Phase 4 PR 4 (PHASE2UX §1G): the confirmation surface is the narrow
// tearsheet OVER the still-open panel (owner ruling 2026-09-05), so two
// dialogs can be mounted at once — every lookup names the one it means.
const confirmSheet = name => screen.getByRole("dialog", { name });
const panel = () => screen.getByRole("dialog", { name: /employee$/ });
const tab = name => screen.getByRole("tab", { name });

async function openEditJane() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Edit Jane Doe" }));
  });
  assert.ok(screen.getByRole("heading", { name: "Edit employee" }));
}

async function openDeactivateSheet() {
  await openEditJane();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Deactivate…" }));
  });
  return confirmSheet(/Deactivate Jane Doe\?/);
}

test("deactivation is double-gated: panel -> impact sheet -> action, and the row leaves the table", async () => {
  const deleteCalls = [];
  globalThis.__ct.actions.deleteEmployeeAction = async (...args) => {
    deleteCalls.push(args);
    return { ok: true };
  };
  await renderPanel();

  // Gate 1: the employee panel. Gate 2: the impact sheet, naming the person
  // and their draft seat — the panel stays open behind it.
  const confirm = await openDeactivateSheet();
  assert.match(confirm.textContent, /Current draft seat: N01\./);
  assert.ok(panel(), "the panel stays mounted under the sheet");
  assert.equal(deleteCalls.length, 0);

  await act(async () => {
    fireEvent.click(within(confirm).getByRole("button", { name: "Deactivate employee" }));
  });
  await waitFor(() => assert.deepEqual(deleteCalls, [["emp-1"]]));

  await waitFor(() => assert.ok(visibleStatus()));
  assert.match(visibleStatus().textContent, /Jane Doe deactivated\./);
  // The sheet and the panel are gone; the directory row is gone; the untouched employee remains.
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(screen.queryByRole("button", { name: "Edit Jane Doe" }), null);
  assert.ok(screen.getByRole("button", { name: "Edit Bob Field" }));
});

test("cancelling the deactivation sheet never calls the action and returns to the panel", async () => {
  let called = false;
  globalThis.__ct.actions.deleteEmployeeAction = async () => {
    called = true;
    return { ok: true };
  };
  await renderPanel();

  const confirm = await openDeactivateSheet();
  await act(async () => {
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
  });

  assert.equal(screen.queryByRole("dialog", { name: /Deactivate Jane Doe\?/ }), null);
  assert.ok(screen.getByRole("heading", { name: "Edit employee" }), "the panel is still open");
  assert.equal(called, false);
  assert.ok(screen.getByRole("button", { name: "Edit Jane Doe" }));
});

test("a failed deactivation surfaces the server message in the panel's danger zone and keeps the row", async () => {
  globalThis.__ct.actions.deleteEmployeeAction = async () => ({
    ok: false,
    message: "Employee has pending edits elsewhere."
  });
  await renderPanel();

  const confirm = await openDeactivateSheet();
  await act(async () => {
    fireEvent.click(within(confirm).getByRole("button", { name: "Deactivate employee" }));
  });

  await waitFor(() => screen.getByRole("alert"));
  const alert = screen.getByRole("alert");
  assert.match(alert.textContent, /Employee has pending edits elsewhere\./);
  assert.ok(panel().contains(alert), "the refusal renders inside the still-open panel");
  assert.ok(screen.getByRole("button", { name: "Edit Jane Doe" }));
});

async function openRowDelete(name) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: `More actions for ${name}` }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: `Delete ${name}` }));
  });
}

test("department delete states its blast radius and only calls the action on confirm", async () => {
  const deleteCalls = [];
  globalThis.__ct.actions.deleteDepartmentAction = async (...args) => {
    deleteCalls.push(args);
    return { ok: true };
  };
  await renderPanel();

  await act(async () => {
    fireEvent.click(tab("Departments"));
  });
  await openRowDelete("Intake");

  const confirm = confirmSheet(/Delete department “Intake”\?/);
  // Jane is Intake's one active member — the count the admin is confirming.
  assert.match(confirm.textContent, /Clears this department from 1 active employee\./);
  assert.equal(deleteCalls.length, 0);

  await act(async () => {
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete department" }));
  });
  await waitFor(() => assert.deepEqual(deleteCalls, [["Intake"]]));
  assert.match(visibleStatus().textContent, /Department Intake deleted\./);
});

test("zone delete states the affected draft-seat count and only calls the action on confirm", async () => {
  const deleteCalls = [];
  globalThis.__ct.actions.deleteZoneAction = async (...args) => {
    deleteCalls.push(args);
    return { ok: true };
  };
  await renderPanel();

  await act(async () => {
    fireEvent.click(tab("Zones"));
  });
  await openRowDelete("North Pod");

  const confirm = confirmSheet(/Delete zone “North Pod”\?/);
  // Both fixture seats sit in North Pod.
  assert.match(confirm.textContent, /Clears this physical zone from 2 draft seats\./);
  assert.equal(deleteCalls.length, 0);

  await act(async () => {
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete zone" }));
  });
  await waitFor(() => assert.deepEqual(deleteCalls, [["North Pod"]]));
  assert.match(visibleStatus().textContent, /Zone North Pod deleted\./);
});

test("the add-employee save stays disabled until a name is entered", async () => {
  await renderPanel();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Add employee" }));
  });

  const dialog = panel();
  const save = within(dialog).getByRole("button", { name: "Add employee" });
  assert.equal(save.disabled, true);
  // A blank editor is an add: no Deactivate affordance to misfire on.
  assert.equal(screen.queryByRole("button", { name: "Deactivate…" }), null);

  const nameInput = within(dialog).getByLabelText(/^Name/);
  await act(async () => {
    fireEvent.change(nameInput, { target: { value: "New Person" } });
  });
  assert.equal(save.disabled, false);
});

// AUDIT-2 §8.2: with zero employees and no active search, the old empty branch
// said "No employees match this search" — blaming a query that does not exist
// and pointing nowhere. First-run names the actual state and the next step.
test("an empty directory with no search shows the first-run state, not the search excuse", async () => {
  await renderPanel({ ...defaultProps(), employees: [] });
  assert.doesNotMatch(document.body.textContent, /No employees match this search/);
  assert.match(document.body.textContent, /No employees yet/i);
  assert.match(document.body.textContent, /Add employee|CSV/);
});

test("a search matching nobody still blames the search and suggests adjusting it", async () => {
  await renderPanel();
  fireEvent.change(screen.getByPlaceholderText("Search employees…"), { target: { value: "zzz-nobody" } });
  assert.match(document.body.textContent, /No employees match this search/);
});

// ---------------------------------------------------------------------------
// Phase 4 PR 4 — the frame, the count, the row's two stops, the dirty-close
// ask, inline rename, the create modal (PHASE2UX §1G; PHASE3DS §1.22–§1.25).
// ---------------------------------------------------------------------------

test("tabs: one real tablist in a named navigation landmark; arrows move and select; the primary follows the tab; ?tab= mirrors it", async () => {
  await renderPanel();
  const nav = screen.getByRole("navigation", { name: "Management sections" });
  const tablist = within(nav).getByRole("tablist");
  assert.deepEqual(within(tablist).getAllByRole("tab").map(el => el.textContent), ["Employees", "Departments", "Zones"]);
  assert.equal(tab("Employees").getAttribute("aria-selected"), "true");
  assert.equal(screen.getByRole("button", { name: "Add employee" }).className.includes("cds-btn--primary"), true);
  assert.equal(screen.getAllByRole("button").filter(el => el.className.includes("cds-btn--primary")).length, 1, "one primary per section");

  await act(async () => {
    fireEvent.keyDown(tab("Employees"), { key: "ArrowRight" });
  });
  assert.equal(tab("Departments").getAttribute("aria-selected"), "true");
  assert.ok(screen.getByRole("button", { name: "Add department" }), "the primary's verb follows the tab");
  assert.equal(screen.queryByRole("button", { name: "Add employee" }), null);
  assert.equal(new URLSearchParams(window.location.search).get("tab"), "departments");

  await act(async () => {
    fireEvent.keyDown(tab("Departments"), { key: "End" });
  });
  assert.equal(tab("Zones").getAttribute("aria-selected"), "true");
  assert.ok(screen.getByRole("button", { name: "Add zone" }));
  // Publish History left this page for the History panel (D5).
  assert.equal(screen.queryByRole("tab", { name: /history/i }), null);
});

test("a ?tab= deep link lands on that section", async () => {
  await renderPanel({ ...defaultProps(), initialTab: "zones" });
  assert.equal(tab("Zones").getAttribute("aria-selected"), "true");
  assert.ok(screen.getByRole("button", { name: "More actions for North Pod" }));
});

test("the toolbar count is live and zero-inclusive: total · assigned · unassigned at rest, matches while filtering", async () => {
  await renderPanel();
  const count = () => document.querySelector(".cds-toolbar-count");
  assert.equal(count().getAttribute("aria-live"), "polite");
  assert.equal(count().textContent, "2 employees · 1 assigned · 1 unassigned");
  fireEvent.change(screen.getByPlaceholderText("Search employees…"), { target: { value: "jane" } });
  assert.equal(count().textContent, "1 of 2 match");
  fireEvent.change(screen.getByPlaceholderText("Search employees…"), { target: { value: "zzz" } });
  assert.equal(count().textContent, "0 of 2 match");
});

test("each row exposes exactly two tab stops — the seat code link and the ghost Edit — and the status carries a mark plus a label", async () => {
  await renderPanel();
  const row = screen.getByRole("button", { name: "Edit Jane Doe" }).closest("tr");
  assert.equal(row.getAttribute("tabindex"), null, "the row is a mouse shortcut, not a tab stop");
  const stops = [...row.querySelectorAll("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
  assert.deepEqual(stops.map(el => el.tagName.toLowerCase()), ["a", "button"]);
  assert.equal(stops[0].getAttribute("href"), "/admin?seat=N01");
  assert.equal(stops[0].textContent, "N01");
  assert.ok(row.querySelector(".sp-seat-mark"), "status draws a mark");
  assert.match(row.textContent, /Assigned/);
  // Bob has no seat: no link, "Unassigned" with the hollow mark.
  const bobRow = screen.getByRole("button", { name: "Edit Bob Field" }).closest("tr");
  assert.equal(bobRow.querySelector("a"), null);
  assert.match(bobRow.textContent, /Unassigned/);
});

test("only the last row's Edit tooltip flips above its button — every other row hangs below (PHASE3DS §1.23 amendment D)", async () => {
  // jsdom has no layout, so the hit test that proves the tooltip paints lives in
  // the e2e-auth page-frames spec; this pins the placement attribute that drives it.
  await renderPanel();
  const hosts = [...document.querySelectorAll("[data-directory-row] .sp-has-tooltip")];
  assert.equal(hosts.length, 2);
  assert.equal(hosts[0].getAttribute("data-tooltip-placement"), null, "the first row keeps the below placement");
  assert.equal(hosts[1].getAttribute("data-tooltip-placement"), "above", "the last row flips above");
  assert.equal(hosts[1].querySelector(".sp-tooltip")?.textContent, "Edit");
});

test("closing the panel is one dirty check: clean Esc closes; dirty Esc asks on top, Keep editing returns, Discard closes", async () => {
  await renderPanel();
  await openEditJane();
  // Clean: Esc closes at once.
  await act(async () => {
    fireEvent.keyDown(panel(), { key: "Escape" });
  });
  assert.equal(screen.queryByRole("dialog"), null);

  await openEditJane();
  await act(async () => {
    fireEvent.change(within(panel()).getByLabelText("Position"), { target: { value: "Senior Analyst" } });
  });
  await act(async () => {
    fireEvent.keyDown(panel(), { key: "Escape" });
  });
  const ask = screen.getByRole("alertdialog", { name: "Discard changes to Jane Doe?" });
  assert.ok(ask.className.includes("cds-modal"), "the ask is the asset modal on top of the panel");
  assert.ok(within(ask).getByRole("button", { name: "Keep editing" }).className.includes("cds-btn--secondary"));
  assert.ok(within(ask).getByRole("button", { name: "Discard changes" }).className.includes("cds-btn--primary"), "a plain primary, not danger");

  await act(async () => {
    fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
  });
  assert.equal(screen.queryByRole("alertdialog"), null);
  assert.equal(within(panel()).getByLabelText("Position").value, "Senior Analyst", "the edits survive");

  // The scrim is Cancel too, through the same check.
  await act(async () => {
    fireEvent.click(document.querySelector(".cds-side-panel-catch"));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  });
  assert.equal(screen.queryByRole("dialog"), null);
});

test("inline rename: Enter saves through the action, Esc cancels without a call, unchanged disables Save", async () => {
  const renameCalls = [];
  globalThis.__ct.actions.renameDepartmentAction = async args => {
    renameCalls.push(args);
    return { ok: true, from: args.from, to: args.to };
  };
  await renderPanel();
  await act(async () => {
    fireEvent.click(tab("Departments"));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  });
  const field = screen.getByLabelText("Department name");
  assert.equal(field.value, "Intake");
  assert.equal(screen.getByRole("button", { name: "Save" }).disabled, true, "unchanged → nothing to save");

  // Esc cancels: no call, the row is back.
  await act(async () => {
    fireEvent.change(field, { target: { value: "Client Intake" } });
  });
  await act(async () => {
    fireEvent.keyDown(field, { key: "Escape" });
  });
  assert.equal(renameCalls.length, 0);
  assert.ok(screen.getByRole("button", { name: "Rename" }));
  assert.match(document.body.textContent, /Intake/);

  // Enter saves.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  });
  const field2 = screen.getByLabelText("Department name");
  await act(async () => {
    fireEvent.change(field2, { target: { value: "Client Intake" } });
  });
  await act(async () => {
    fireEvent.keyDown(field2, { key: "Enter" });
  });
  await waitFor(() => assert.deepEqual(renameCalls, [{ from: "Intake", to: "Client Intake" }]));
  await waitFor(() => assert.match(visibleStatus().textContent, /Department renamed to Client Intake\./));
  assert.ok(screen.getByRole("button", { name: "More actions for Client Intake" }));
});

test("inline rename: a duplicate name is invalid on blur — helper under the field, Save disabled, no call", async () => {
  let called = false;
  globalThis.__ct.actions.renameZoneAction = async () => {
    called = true;
    return { ok: true };
  };
  const props = defaultProps();
  props.zoneOptions = [option("zone-north", "North Pod"), option("zone-south", "South Pod")];
  await renderPanel(props);
  await act(async () => {
    fireEvent.click(tab("Zones"));
  });
  await act(async () => {
    fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[1]);
  });
  const field = screen.getByLabelText("Zone name");
  assert.equal(field.value, "South Pod");
  await act(async () => {
    fireEvent.change(field, { target: { value: "north pod" } });
  });
  await act(async () => {
    fireEvent.blur(field);
  });
  assert.equal(field.getAttribute("aria-invalid"), "true");
  const helper = document.getElementById(field.getAttribute("aria-describedby"));
  assert.equal(helper.textContent, "A zone named “North Pod” already exists. Rename it from the list instead.");
  assert.equal(screen.getByRole("button", { name: "Save" }).disabled, true);
  await act(async () => {
    fireEvent.keyDown(field, { key: "Enter" });
  });
  assert.equal(called, false, "blur validates; nothing commits while invalid");
  assert.equal(screen.queryByRole("alert"), null, "the error is the field helper, never a banner");
});

test("the header primary opens the one-field create modal, which only calls the action on its primary", async () => {
  const createCalls = [];
  globalThis.__ct.actions.createDepartmentAction = async name => {
    createCalls.push(name);
    return { ok: true, department: option("dept-new", name) };
  };
  await renderPanel();
  await act(async () => {
    fireEvent.click(tab("Departments"));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Add department" }));
  });
  const modal = screen.getByRole("dialog", { name: "Add department" });
  assert.ok(modal.className.includes("cds-modal"));
  const submit = within(modal).getByRole("button", { name: "Add department" });
  assert.equal(submit.disabled, true);
  assert.equal(createCalls.length, 0);

  await act(async () => {
    fireEvent.change(within(modal).getByLabelText("Name"), { target: { value: "Compliance" } });
  });
  assert.equal(submit.disabled, false);
  await act(async () => {
    fireEvent.click(submit);
  });
  await waitFor(() => assert.deepEqual(createCalls, ["Compliance"]));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.match(visibleStatus().textContent, /Department Compliance added\./);
  assert.ok(screen.getByRole("button", { name: "More actions for Compliance" }));
});
