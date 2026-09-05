"use client";

// Management — the state and mutation host (PHASE2UX §1G; PHASE3DS §1.22–§1.25;
// Phase 4 PR 4). It owns the local working copies, every server-action call
// and the outcome banner; the surfaces are composed from siblings:
//   ManagementFrame        page header + the primary that follows the tab + line tabs
//   EmployeesTable         the index (toolbar count, sortable table, one Edit per row)
//   EmployeePanel          the 480 slide-over editor (create / edit, danger zone)
//   OptionList             departments / zones with inline rename + ⋯ Delete
//   OptionCreateModal      the one-field create modal (D5-c)
//   ManagementConfirmSheet the narrow tearsheet for Deactivate / Delete (owner ruling 2026-09-05)
//   CarbonModal            the dirty-close ask on top of the panel (P3-17)
// Review-before-mutate: every destructive path sets `managementConfirm` and
// only `confirmManagementDestructiveAction` calls the action; the sheet stays
// mounted until the action settles (finally-close).

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { clientActionErrorMessage } from "@/lib/clientActionError";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";
import {
  createDepartmentAction,
  createEmployeeAction,
  createZoneAction,
  deleteDepartmentAction,
  deleteEmployeeAction,
  deleteZoneAction,
  renameDepartmentAction,
  renameZoneAction,
  updateEmployeeAction
} from "@/app/actions";
import { buildDepartmentRoster, departmentKey } from "@/lib/departments";
import { withTabParam } from "@/lib/deepLink";
import { formatDisplayName } from "@/lib/formatName";
import { assignedCount as countAssigned } from "@/lib/managementCounts";
import type { OptionKind } from "@/lib/inlineRename";
import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { CarbonModal } from "@/components/ui/CarbonModal";
import { EmployeePanel } from "@/components/admin-management/EmployeePanel";
import { EmployeesTable, type EmployeeSortKey, type SortDirection } from "@/components/admin-management/EmployeesTable";
import { ManagementConfirmSheet } from "@/components/admin-management/ManagementConfirmSheet";
import { ManagementFrame, type ManagementTab } from "@/components/admin-management/ManagementFrame";
import { OptionCreateModal } from "@/components/admin-management/OptionCreateModal";
import { OptionList, type OptionRow } from "@/components/admin-management/OptionList";
import { emptyEmployeeForm, formFromEmployee, isFormDirty, type EmployeeForm } from "@/components/admin-management/employeeForm";

type AdminManagementPanelProps = {
  employees: Employee[];
  seats: SeatWithEmployee[];
  departmentOptions: DepartmentOption[];
  zoneOptions: ZoneOption[];
  /* Deep-link target from ?tab=; tabs are otherwise client state only, so
     without this a shared link always landed on Employees. */
  initialTab?: ManagementTab;
};

type ManagementConfirmState =
  | { kind: "employee"; employee: Employee; assignedSeatLabel: string }
  | { kind: "department"; name: string; affectedCount: number }
  | { kind: "zone"; name: string; affectedCount: number };

function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? "";
}

function countSeatsByZone(seats: SeatWithEmployee[]) {
  const counts = new Map<string, number>();
  seats.forEach(seat => {
    const zone = getSeatZone(seat).trim();
    if (!zone) return;
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  });
  return counts;
}

function upsertOptionByIdOrName<T extends { id: string; name: string }>(current: T[], next: T): T[] {
  const exists = current.some(option => option.id === next.id || option.name === next.name);
  if (!exists) return [...current, next].sort((a, b) => a.name.localeCompare(b.name));
  return current.map(option => (option.id === next.id || option.name === next.name ? next : option));
}

export function AdminManagementPanel({
  employees,
  seats,
  departmentOptions,
  zoneOptions,
  initialTab
}: AdminManagementPanelProps) {
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  // Panel-local save error: the page banner sits under the panel's scrim, so
  // save failures render inline in the panel (dialog-error-placement).
  const [employeeDialogError, setEmployeeDialogError] = useState<string | null>(null);
  // A refused deactivation renders in the panel's danger zone (PHASE2UX §1G.3).
  const [employeeDangerError, setEmployeeDangerError] = useState<string | null>(null);
  const [discardAskOpen, setDiscardAskOpen] = useState(false);
  const employeeDialogErrorRef = useRef<HTMLDivElement | null>(null);
  const employeeSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const employeeNameInputRef = useRef<HTMLInputElement | null>(null);
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [localDepartmentOptions, setLocalDepartmentOptions] = useState(departmentOptions);
  const [localZoneOptions, setLocalZoneOptions] = useState(zoneOptions);
  const [localSeats, setLocalSeats] = useState(seats);
  const [activeTab, setActiveTab] = useState<ManagementTab>(initialTab ?? "employees");
  // Deep-link (#196): the page already READS ?tab= (initialTab); mirror tab
  // switches back with a shallow replaceState so the URL stays shareable —
  // no router navigation (this page is force-dynamic; a soft navigation would
  // refetch the whole directory for a tab click). Idempotent at mount.
  useEffect(() => {
    const next = `${window.location.pathname}${withTabParam(window.location.search, activeTab, "employees")}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [activeTab]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<EmployeeSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [initialEmployeeForm, setInitialEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [createModal, setCreateModal] = useState<OptionKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managementConfirm, setManagementConfirm] = useState<ManagementConfirmState | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The transition's `pending` is one shared flag, but several confirming
  // controls are on screen at once — this names WHICH one is in flight so
  // only the pressed control shows its participle. Set synchronously in the
  // click handler, cleared when the transition settles. Resolves with the
  // work's value so an inline sink (a field helper) can receive the outcome.
  const [busyOp, setBusyOp] = useState<string | null>(null);
  function runManagementOp<T>(op: string, work: () => Promise<T>): Promise<T> {
    setBusyOp(op);
    return new Promise<T>((resolve, reject) => {
      startTransition(async () => {
        try {
          resolve(await work());
        } catch (errorValue) {
          reject(errorValue);
        } finally {
          setBusyOp(null);
        }
      });
    });
  }

  const activeEmployees = useMemo(
    () => [...localEmployees].filter(employee => employee.active).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [localEmployees]
  );

  // One roster for both tabs (E1): options ∪ employee departments, keyed
  // case-insensitively so counts can never disagree with the employee list.
  const departmentRoster = useMemo(
    () => buildDepartmentRoster(activeEmployees, localDepartmentOptions),
    [activeEmployees, localDepartmentOptions]
  );
  const departmentNames = useMemo(() => departmentRoster.map(row => row.name), [departmentRoster]);
  const departmentRows: OptionRow[] = useMemo(
    () => departmentRoster.map(row => ({ key: row.key, name: row.name, count: row.employeeCount, managed: row.managed })),
    [departmentRoster]
  );

  const zoneCounts = useMemo(() => countSeatsByZone(localSeats), [localSeats]);
  const zoneNames = useMemo(() => {
    const values = new Set<string>();
    localZoneOptions.filter(option => option.active).forEach(option => values.add(option.name));
    localSeats.forEach(seat => {
      const zone = getSeatZone(seat);
      if (zone) values.add(zone);
    });
    return Array.from(values).sort();
  }, [localSeats, localZoneOptions]);
  const zoneRows: OptionRow[] = useMemo(
    () => zoneNames.map(name => ({ key: name, name, count: zoneCounts.get(name) ?? 0, managed: true })),
    [zoneNames, zoneCounts]
  );

  // Scale readiness: one seat-label index instead of scanning every seat per
  // employee (the directory must survive 500/1,000/5,000 employees).
  const seatLabelByEmployeeId = useMemo(() => {
    const labels = new Map<string, string>();
    localSeats.forEach(seat => {
      if (seat.employee_id) labels.set(seat.employee_id, seat.label);
    });
    return labels;
  }, [localSeats]);
  const seatFloorByEmployeeId = useMemo(() => {
    const floors = new Map<string, string>();
    localSeats.forEach(seat => {
      if (seat.employee_id) floors.set(seat.employee_id, seat.floor);
    });
    return floors;
  }, [localSeats]);

  const filteredEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return activeEmployees.filter(employee => {
      const assignment = seatLabelByEmployeeId.get(employee.id) ?? "Unassigned";
      const haystack = [employee.full_name, employee.position, employee.department, employee.phone_extension, assignment].filter(Boolean).join(" ").toLowerCase();
      return !needle || haystack.includes(needle);
    });
  }, [activeEmployees, seatLabelByEmployeeId, search]);

  const sortedEmployees = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    const valueFor = (employee: Employee): string => {
      switch (sortKey) {
        case "department":
          return employee.department ?? "";
        case "position":
          return employee.position ?? "";
        case "extension":
          return employee.phone_extension ?? "";
        case "seat":
          return seatLabelByEmployeeId.get(employee.id) ?? "";
        case "status":
          return seatLabelByEmployeeId.has(employee.id) ? "Assigned" : "Unassigned";
        case "name":
        default:
          return employee.full_name;
      }
    };
    return [...filteredEmployees].sort((a, b) => {
      const primary = valueFor(a).localeCompare(valueFor(b), undefined, { numeric: true, sensitivity: "base" }) * direction;
      if (primary !== 0) return primary;
      // Stable tie-break by name so equal keys keep a deterministic order.
      return a.full_name.localeCompare(b.full_name);
    });
  }, [filteredEmployees, seatLabelByEmployeeId, sortKey, sortDirection]);

  function toggleSort(key: EmployeeSortKey) {
    if (sortKey === key) {
      setSortDirection(current => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const selectedEmployee = activeEmployees.find(employee => employee.id === selectedEmployeeId) ?? null;
  const selectedEmployeeSeatLabel = selectedEmployee ? seatLabelByEmployeeId.get(selectedEmployee.id) ?? "Unassigned" : "Unassigned";
  const selectedEmployeeDraftSeat = selectedEmployee ? seatLabelByEmployeeId.get(selectedEmployee.id) ?? null : null;
  const selectedEmployeeDraftFloor = selectedEmployee ? seatFloorByEmployeeId.get(selectedEmployee.id) ?? null : null;
  const assignedEmployees = countAssigned(activeEmployees, localSeats);
  const departmentChoices = useMemo(() => departmentRoster.map(row => ({ name: row.name, count: row.employeeCount })), [departmentRoster]);

  function showSuccess(nextMessage: string) {
    setError(null);
    setMessage(nextMessage);
  }

  // A plain string is a message an action *returned* (the validation path in
  // lib/schemas.ts) rather than threw, so it is already admin-facing and must
  // not be swallowed by the generic fallback.
  function dialogErrorMessage(errorValue: unknown, fallback: string) {
    if (typeof errorValue === "string" && errorValue.trim()) return errorValue;
    return clientActionErrorMessage(errorValue, fallback);
  }

  function showEmployeeDialogError(errorValue: unknown, fallback: string) {
    setEmployeeDialogError(dialogErrorMessage(errorValue, fallback));
    // Ruling: focus moves to the notification so the failure is the next
    // thing a keyboard or screen-reader admin meets.
    window.requestAnimationFrame(() => employeeDialogErrorRef.current?.focus());
  }

  // Panel danger zone (a refused deactivation): the panel stays open under
  // the closing sheet, so the reason lands beside the control that asked.
  function showDangerError(errorValue: unknown, fallback: string) {
    setEmployeeDangerError(dialogErrorMessage(errorValue, fallback));
  }

  // Field-level sink for the inline rename and the create modal: the message
  // is returned to the row, which paints it under its field — never a banner.
  function inlineError(errorValue: unknown, fallback: string): string {
    return dialogErrorMessage(errorValue, fallback);
  }

  function showError(errorValue: unknown, fallback: string) {
    setMessage(null);
    if (typeof errorValue === "string" && errorValue.trim()) {
      setError(errorValue);
      return;
    }
    setError(clientActionErrorMessage(errorValue, fallback));
  }

  function openAddEmployee() {
    setSelectedEmployeeId("");
    setEmployeeForm(emptyEmployeeForm);
    setInitialEmployeeForm(emptyEmployeeForm);
    setMessage(null);
    setError(null);
    setEmployeeDialogError(null);
    setEmployeeDangerError(null);
    setEmployeeDialogOpen(true);
    window.requestAnimationFrame(() => employeeNameInputRef.current?.focus());
  }

  function closeEmployeeDialog() {
    setEmployeeDialogOpen(false);
    setDiscardAskOpen(false);
    setEmployeeDialogError(null);
    setEmployeeDangerError(null);
  }

  // Cancel, Esc and the scrim all route through ONE dirty check (P3-17):
  // clean → close; dirty → the confirm modal on top of the panel.
  function requestCloseEmployeePanel() {
    if (isFormDirty(employeeForm, initialEmployeeForm)) {
      setDiscardAskOpen(true);
      return;
    }
    closeEmployeeDialog();
  }

  function keepEditing() {
    setDiscardAskOpen(false);
    window.requestAnimationFrame(() => employeeNameInputRef.current?.focus());
  }

  function editEmployee(employee: Employee) {
    const form = formFromEmployee(employee);
    setSelectedEmployeeId(employee.id);
    setEmployeeForm(form);
    setInitialEmployeeForm(form);
    setActiveTab("employees");
    setMessage(null);
    setError(null);
    setEmployeeDialogError(null);
    setEmployeeDangerError(null);
    setEmployeeDialogOpen(true);
    // Hand focus to the form the row just populated (critique action 8).
    window.requestAnimationFrame(() => employeeNameInputRef.current?.focus());
  }

  function saveEmployee() {
    void runManagementOp("employee-save", async () => {
      try {
        setError(null);
        setEmployeeDialogError(null);
        const payload = {
          fullName: employeeForm.fullName,
          position: employeeForm.position,
          department: employeeForm.department,
          phoneExtension: employeeForm.phoneExtension,
          email: employeeForm.email
        };
        const result = selectedEmployee
          ? await updateEmployeeAction({ employeeId: selectedEmployee.id, ...payload })
          : await createEmployeeAction(payload);
        // Validation failures come back rather than throwing, so the field-level
        // message survives production's digest stripping — surface it and stop.
        // Inside the still-open panel: values stay put, Save re-enables.
        if (!result.ok) {
          showEmployeeDialogError(result.message, "Could not save employee.");
          return;
        }

        const employee = result.employee;

        setLocalEmployees(current => {
          const exists = current.some(item => item.id === employee.id);
          if (!exists) return [...current, employee].sort((a, b) => a.full_name.localeCompare(b.full_name));
          return current.map(item => (item.id === employee.id ? employee : item));
        });
        setSelectedEmployeeId(employee.id);
        setEmployeeForm(formFromEmployee(employee));
        setInitialEmployeeForm(formFromEmployee(employee));
        // Close on success so the outcome banner behind the panel is the
        // thing the admin sees next.
        setEmployeeDialogOpen(false);
        showSuccess(`${formatDisplayName(employee.full_name)} saved.`);
      } catch (errorValue) {
        showEmployeeDialogError(errorValue, "Could not save employee.");
      }
    });
  }

  function deleteEmployee() {
    if (!selectedEmployee) return;
    setMessage(null);
    setError(null);
    setEmployeeDangerError(null);
    setConfirmError(null);
    // The sheet opens OVER the panel (owner ruling 2026-09-05): the person's
    // name stays visible behind, and a refusal lands back in the danger zone.
    setManagementConfirm({ kind: "employee", employee: selectedEmployee, assignedSeatLabel: selectedEmployeeSeatLabel });
  }

  async function createDepartment(name: string): Promise<string | null> {
    return runManagementOp("dept-create", async () => {
      try {
        setError(null);
        const result = await createDepartmentAction(name);
        if (!result.ok) return inlineError(result.message, "Could not add department.");
        const department = result.department;
        setLocalDepartmentOptions(current => upsertOptionByIdOrName(current, department));
        setCreateModal(null);
        showSuccess(`Department ${department.name} added.`);
        return null;
      } catch (errorValue) {
        return inlineError(errorValue, "Could not add department.");
      }
    });
  }

  function adoptDepartment(name: string) {
    void runManagementOp(`adopt-department:${name}`, async () => {
      try {
        setError(null);
        const result = await createDepartmentAction(name);
        if (!result.ok) {
          showError(result.message, "Could not add department to the managed list.");
          return;
        }
        const department = result.department;
        setLocalDepartmentOptions(current => upsertOptionByIdOrName(current, department));
        showSuccess(`Department ${department.name} added to the managed list.`);
      } catch (errorValue) {
        showError(errorValue, "Could not add department to the managed list.");
      }
    });
  }

  async function renameDepartment(from: string, to: string): Promise<string | null> {
    return runManagementOp("department-rename", async () => {
      try {
        setError(null);
        const result = await renameDepartmentAction({ from, to });
        if (!result.ok) return inlineError(result.message, "Could not rename department.");
        setLocalDepartmentOptions(current => [
          ...current.map(option => (option.name === result.from ? { ...option, active: false } : option)),
          { id: result.to, name: result.to, active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        ]);
        setLocalEmployees(current => current.map(employee => (
          departmentKey(employee.department) === departmentKey(result.from) ? { ...employee, department: result.to } : employee
        )));
        showSuccess(`Department renamed to ${result.to}.`);
        return null;
      } catch (errorValue) {
        return inlineError(errorValue, "Could not rename department.");
      }
    });
  }

  function deleteDepartment(name: string) {
    const count = departmentRoster.find(row => row.key === departmentKey(name))?.employeeCount ?? 0;
    setMessage(null);
    setError(null);
    setConfirmError(null);
    setManagementConfirm({ kind: "department", name, affectedCount: count });
  }

  async function createZone(name: string): Promise<string | null> {
    return runManagementOp("zone-create", async () => {
      try {
        setError(null);
        const result = await createZoneAction(name);
        if (!result.ok) return inlineError(result.message, "Could not add zone.");
        const zone = result.zone;
        setLocalZoneOptions(current => upsertOptionByIdOrName(current, zone));
        setCreateModal(null);
        showSuccess(`Zone ${zone.name} added.`);
        return null;
      } catch (errorValue) {
        return inlineError(errorValue, "Could not add zone.");
      }
    });
  }

  async function renameZone(from: string, to: string): Promise<string | null> {
    return runManagementOp("zone-rename", async () => {
      try {
        setError(null);
        const result = await renameZoneAction({ from, to });
        if (!result.ok) return inlineError(result.message, "Could not rename zone.");
        setLocalZoneOptions(current => [
          ...current.map(option => (option.name === result.from ? { ...option, active: false } : option)),
          { id: result.to, name: result.to, active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        ]);
        setLocalSeats(current => current.map(seat => (
          getSeatZone(seat) === result.from ? { ...seat, zone: result.to } : seat
        )));
        showSuccess(`Zone renamed to ${result.to}.`);
        return null;
      } catch (errorValue) {
        return inlineError(errorValue, "Could not rename zone.");
      }
    });
  }

  function deleteZone(name: string) {
    const count = zoneCounts.get(name) ?? 0;
    setMessage(null);
    setError(null);
    setConfirmError(null);
    setManagementConfirm({ kind: "zone", name, affectedCount: count });
  }

  function closeManagementConfirm() {
    setManagementConfirm(null);
    setConfirmError(null);
  }

  function confirmManagementDestructiveAction() {
    if (!managementConfirm) return;
    const action = managementConfirm;
    // Keep the sheet mounted (controls disabled on `pending`) until the action
    // settles — closing it up front left the table interactive during the
    // round-trip. Same pattern as the Settings reviews.

    void runManagementOp("management-confirm", async () => {
      try {
        setError(null);
        setConfirmError(null);

        if (action.kind === "employee") {
          const result = await deleteEmployeeAction(action.employee.id);
          if (!result.ok) {
            showDangerError(result.message, "Could not deactivate employee.");
            return;
          }
          setLocalEmployees(current => current.filter(employee => employee.id !== action.employee.id));
          setLocalSeats(current => current.map(seat => (
            seat.employee_id === action.employee.id ? { ...seat, employee_id: null, employee: null, status: "available" } : seat
          )));
          setSelectedEmployeeId("");
          setEmployeeForm(emptyEmployeeForm);
          setInitialEmployeeForm(emptyEmployeeForm);
          setEmployeeDialogOpen(false);
          showSuccess(`${formatDisplayName(action.employee.full_name)} deactivated.`);
          return;
        }

        if (action.kind === "department") {
          const result = await deleteDepartmentAction(action.name);
          if (!result.ok) {
            showError(result.message, "Could not delete department.");
            return;
          }
          setLocalDepartmentOptions(current => current.map(option => (option.name === action.name ? { ...option, active: false } : option)));
          setLocalEmployees(current => current.map(employee => (
            employee.department === action.name ? { ...employee, department: null } : employee
          )));
          showSuccess(`Department ${action.name} deleted.`);
          return;
        }

        const zoneResult = await deleteZoneAction(action.name);
        if (!zoneResult.ok) {
          showError(zoneResult.message, "Could not delete zone.");
          return;
        }
        setLocalZoneOptions(current => current.map(option => (option.name === action.name ? { ...option, active: false } : option)));
        setLocalSeats(current => current.map(seat => (
          getSeatZone(seat) === action.name ? { ...seat, zone: null } : seat
        )));
        showSuccess(`Zone ${action.name} deleted.`);
      } catch (errorValue) {
        const fallback = action.kind === "employee"
          ? "Could not deactivate employee."
          : action.kind === "department"
            ? "Could not delete department."
            : "Could not delete zone.";
        if (action.kind === "employee") showDangerError(errorValue, fallback);
        else showError(errorValue, fallback);
      } finally {
        setManagementConfirm(null);
      }
    });
  }

  function handlePrimary() {
    if (activeTab === "employees") openAddEmployee();
    else if (activeTab === "departments") setCreateModal("department");
    else setCreateModal("zone");
  }

  const selectedPersonName = selectedEmployee ? formatDisplayName(selectedEmployee.full_name) : employeeForm.fullName.trim();
  const saving = pending && busyOp === "employee-save";
  const saveLabel = saving
    ? selectedEmployee ? "Saving…" : "Adding…"
    : selectedEmployee ? "Save employee" : "Add employee";

  return (
    <>
      <ManagementFrame activeTab={activeTab} onTabChange={setActiveTab} onPrimary={handlePrimary} primaryDisabled={pending}>
        {/* The surface's shared in-flight region — always mounted (a region
            that mounts WITH its content is not reliably announced), sr-only
            sibling of the visible outcome notification, which owns outcomes. */}
        <div role="status" aria-live="polite" className="sr-only">
          {pending ? "Working…" : ""}
        </div>

        {(message || error) && (
          <div
            role={error ? "alert" : "status"}
            aria-live={error ? "assertive" : "polite"}
            className={error ? "cds-notification cds-notification--error" : "cds-notification cds-notification--success"}
          >
            <NotificationGlyph kind={error ? "error" : "success"} />
            <div className="cds-notification-text">{error ?? message}</div>
          </div>
        )}

        {activeTab === "employees" && (
          <section aria-labelledby="management-employees-heading">
            <h2 id="management-employees-heading" className="cds-visually-hidden">Employees</h2>
            <EmployeesTable
              sortedEmployees={sortedEmployees}
              totalActive={activeEmployees.length}
              assignedCount={assignedEmployees}
              search={search}
              onSearchChange={setSearch}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onToggleSort={toggleSort}
              seatLabelByEmployeeId={seatLabelByEmployeeId}
              selectedEmployeeId={selectedEmployeeId}
              onEdit={editEmployee}
            />
          </section>
        )}

        {activeTab === "departments" && (
          <section aria-labelledby="management-departments-heading" className="pt-4">
            <h2 id="management-departments-heading" className="cds-visually-hidden">Departments</h2>
            <p className="cds-helper mb-3">Employee departments are separate from physical seating zones.</p>
            <OptionList
              kind="department"
              rows={departmentRows}
              countNoun="employee"
              pending={pending}
              busyOp={busyOp}
              onRename={renameDepartment}
              onDelete={deleteDepartment}
              onAdopt={adoptDepartment}
              emptyTitle="No departments yet"
              emptyBody="Add a department to keep employee records easier to scan."
            />
          </section>
        )}

        {activeTab === "zones" && (
          <section aria-labelledby="management-zones-heading" className="pt-4">
            <h2 id="management-zones-heading" className="cds-visually-hidden">Zones</h2>
            <p className="cds-helper mb-3">Zones are physical map areas used for filtering and custom-seat label prefixes.</p>
            <OptionList
              kind="zone"
              rows={zoneRows}
              countNoun="draft seat"
              pending={pending}
              busyOp={busyOp}
              onRename={renameZone}
              onDelete={deleteZone}
              emptyTitle="No zones yet"
              emptyBody="Add a zone to organize map filters and custom-seat labels."
            />
          </section>
        )}
      </ManagementFrame>

      {employeeDialogOpen && (
        <EmployeePanel
          mode={selectedEmployee ? "edit" : "add"}
          personName={selectedPersonName}
          form={employeeForm}
          onFormChange={patch => setEmployeeForm(current => ({ ...current, ...patch }))}
          departmentChoices={departmentChoices}
          draftSeatLabel={selectedEmployeeDraftSeat}
          draftSeatFloor={selectedEmployeeDraftFloor}
          pending={pending}
          saving={saving}
          saveLabel={saveLabel}
          error={employeeDialogError}
          errorRef={employeeDialogErrorRef}
          onDismissError={() => {
            setEmployeeDialogError(null);
            employeeSaveButtonRef.current?.focus();
          }}
          onRetry={saveEmployee}
          saveButtonRef={employeeSaveButtonRef}
          nameInputRef={employeeNameInputRef}
          dangerError={employeeDangerError}
          onDeactivate={deleteEmployee}
          onRequestClose={requestCloseEmployeePanel}
          onSave={saveEmployee}
        />
      )}

      {employeeDialogOpen && discardAskOpen && (
        <CarbonModal
          titleId="management-discard-title"
          title={selectedEmployee ? `Discard changes to ${selectedPersonName}?` : "Discard this new employee?"}
          eyebrow="Unsaved edits"
          role="alertdialog"
          onEscape={keepEditing}
          footer={
            <>
              <button type="button" className="cds-btn cds-btn--secondary" onClick={keepEditing}>Keep editing</button>
              <button type="button" className="cds-btn cds-btn--primary" onClick={closeEmployeeDialog}>Discard changes</button>
            </>
          }
        >
          The edits in this panel are not saved. Keep editing to return to them.
        </CarbonModal>
      )}

      {createModal && (
        <OptionCreateModal
          kind={createModal}
          existing={createModal === "department" ? departmentNames : zoneNames}
          pending={pending}
          busy={pending && busyOp === (createModal === "department" ? "dept-create" : "zone-create")}
          onCancel={() => { if (!pending) setCreateModal(null); }}
          onCreate={createModal === "department" ? createDepartment : createZone}
        />
      )}

      {managementConfirm && (
        <ManagementConfirmSheet
          view={
            managementConfirm.kind === "employee"
              ? { kind: "employee", personName: formatDisplayName(managementConfirm.employee.full_name), seatLabel: managementConfirm.assignedSeatLabel === "Unassigned" ? null : managementConfirm.assignedSeatLabel }
              : managementConfirm
          }
          pending={pending}
          busy={pending && busyOp === "management-confirm"}
          error={confirmError}
          onCancel={closeManagementConfirm}
          onConfirm={confirmManagementDestructiveAction}
        />
      )}
    </>
  );
}
