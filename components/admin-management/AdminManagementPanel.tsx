"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { getLatestPublishEvent, getPublishHistoryActor, type PublishHistoryEvent } from "@/lib/publishHistory";
import {
  createDepartmentAction,
  createEmployeeAction,
  createZoneAction,
  deleteDepartmentAction,
  deleteEmployeeAction,
  deleteZoneAction,
  getPublishHistoryAction,
  renameDepartmentAction,
  renameZoneAction,
  updateEmployeeAction
} from "@/app/actions";
import { buildDepartmentRoster, departmentKey } from "@/lib/departments";
import { Button } from "@/components/ui/Button";

type EmployeeForm = {
  fullName: string;
  position: string;
  department: string;
  phoneExtension: string;
};

type AdminManagementPanelProps = {
  employees: Employee[];
  seats: SeatWithEmployee[];
  departmentOptions: DepartmentOption[];
  zoneOptions: ZoneOption[];
  initialTab?: ManagementTab;
  initialPublishHistoryEvents?: PublishHistoryEvent[];
};

type ManagementTab = "employees" | "departments" | "zones" | "publishHistory";

type PublishHistoryState = {
  status: "idle" | "loading" | "loaded" | "error";
  events: PublishHistoryEvent[];
  error: string | null;
};

type ManagementConfirmState =
  | { kind: "employee"; employee: Employee; assignedSeatLabel: string }
  | { kind: "department"; name: string; affectedCount: number }
  | { kind: "zone"; name: string; affectedCount: number };

const managementTabs: Array<{ id: ManagementTab; label: string }> = [
  { id: "employees", label: "Employees" },
  { id: "departments", label: "Departments" },
  { id: "zones", label: "Zones" },
  { id: "publishHistory", label: "Publish History" }
];

const emptyEmployeeForm: EmployeeForm = {
  fullName: "",
  position: "",
  department: "",
  phoneExtension: ""
};

function formFromEmployee(employee: Employee): EmployeeForm {
  return {
    fullName: employee.full_name,
    position: employee.position ?? "",
    department: employee.department ?? "",
    phoneExtension: employee.phone_extension ?? ""
  };
}

function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? "";
}

function getAssignedSeatLabel(employeeId: string, seats: SeatWithEmployee[]) {
  return seats.find(seat => seat.employee_id === employeeId)?.label ?? "Unassigned";
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("") || "?";
}

function formatPublishDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Unknown date";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
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

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export function AdminManagementPanel({
  employees,
  seats,
  departmentOptions,
  zoneOptions,
  initialTab = "employees",
  initialPublishHistoryEvents
}: AdminManagementPanelProps) {
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [localDepartmentOptions, setLocalDepartmentOptions] = useState(departmentOptions);
  const [localZoneOptions, setLocalZoneOptions] = useState(zoneOptions);
  const [localSeats, setLocalSeats] = useState(seats);
  const [activeTab, setActiveTab] = useState<ManagementTab>(initialTab);
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [editingDepartment, setEditingDepartment] = useState("");
  const [departmentDraft, setDepartmentDraft] = useState("");
  const [newZoneName, setNewZoneName] = useState("");
  const [editingZone, setEditingZone] = useState("");
  const [zoneDraft, setZoneDraft] = useState("");
  const [publishHistoryState, setPublishHistoryState] = useState<PublishHistoryState>({
    status: initialPublishHistoryEvents ? "loaded" : "idle",
    events: initialPublishHistoryEvents ?? [],
    error: null
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managementConfirm, setManagementConfirm] = useState<ManagementConfirmState | null>(null);
  const [pending, startTransition] = useTransition();

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

  const zoneNames = useMemo(() => {
    const values = new Set<string>();
    localZoneOptions.filter(option => option.active).forEach(option => values.add(option.name));
    localSeats.forEach(seat => {
      const zone = getSeatZone(seat);
      if (zone) values.add(zone);
    });
    return Array.from(values).sort();
  }, [localSeats, localZoneOptions]);

  const zoneCounts = useMemo(() => countSeatsByZone(localSeats), [localSeats]);

  const filteredEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return activeEmployees.filter(employee => {
      const assignment = getAssignedSeatLabel(employee.id, localSeats);
      const haystack = [employee.full_name, employee.position, employee.department, employee.phone_extension, assignment].filter(Boolean).join(" ").toLowerCase();
      return !needle || haystack.includes(needle);
    });
  }, [activeEmployees, localSeats, search]);

  const selectedEmployee = activeEmployees.find(employee => employee.id === selectedEmployeeId) ?? null;
  const selectedEmployeeSeatLabel = selectedEmployee ? getAssignedSeatLabel(selectedEmployee.id, localSeats) : "Unassigned";
  const assignedEmployees = activeEmployees.filter(employee => localSeats.some(seat => seat.employee_id === employee.id)).length;
  const unassignedEmployees = activeEmployees.length - assignedEmployees;
  const latestPublish = getLatestPublishEvent(publishHistoryState.events);
  const managementSummaryCards = [
    { label: "Draft seats", value: localSeats.length, detail: "Editable map" },
    { label: "Active employees", value: activeEmployees.length, detail: "Directory" },
    { label: "Assigned", value: assignedEmployees, detail: "Draft seats" },
    { label: "Unassigned", value: unassignedEmployees, detail: "Employees" },
    { label: "Active zones", value: zoneNames.length, detail: "Filters" }
  ];
  const fieldClassName = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100";

  const loadPublishHistory = useCallback(async () => {
    setPublishHistoryState(current => ({
      ...current,
      status: "loading",
      error: null
    }));

    try {
      const events = await getPublishHistoryAction();
      setPublishHistoryState({
        status: "loaded",
        events,
        error: null
      });
    } catch (errorValue) {
      setPublishHistoryState(current => ({
        ...current,
        status: "error",
        error: errorValue instanceof Error ? errorValue.message : "Could not load publish history."
      }));
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "publishHistory" || publishHistoryState.status !== "idle") return;
    void loadPublishHistory();
  }, [activeTab, loadPublishHistory, publishHistoryState.status]);

  function showSuccess(nextMessage: string) {
    setError(null);
    setMessage(nextMessage);
  }

  function showError(errorValue: unknown, fallback: string) {
    setMessage(null);
    setError(errorValue instanceof Error ? errorValue.message : fallback);
  }

  function startNewEmployee() {
    setSelectedEmployeeId("");
    setEmployeeForm(emptyEmployeeForm);
    setMessage(null);
    setError(null);
  }

  function editEmployee(employee: Employee) {
    setSelectedEmployeeId(employee.id);
    setEmployeeForm(formFromEmployee(employee));
    setActiveTab("employees");
    setMessage(null);
    setError(null);
  }

  function saveEmployee() {
    startTransition(async () => {
      try {
        setError(null);
        const payload = {
          fullName: employeeForm.fullName,
          position: employeeForm.position,
          department: employeeForm.department,
          phoneExtension: employeeForm.phoneExtension
        };
        const employee = selectedEmployee
          ? await updateEmployeeAction({ employeeId: selectedEmployee.id, ...payload })
          : await createEmployeeAction(payload);

        setLocalEmployees(current => {
          const exists = current.some(item => item.id === employee.id);
          if (!exists) return [...current, employee].sort((a, b) => a.full_name.localeCompare(b.full_name));
          return current.map(item => (item.id === employee.id ? employee : item));
        });
        setSelectedEmployeeId(employee.id);
        setEmployeeForm(formFromEmployee(employee));
        showSuccess(`${employee.full_name} saved.`);
      } catch (errorValue) {
        showError(errorValue, "Could not save employee.");
      }
    });
  }

  function deleteEmployee() {
    if (!selectedEmployee) return;

    setMessage(null);
    setError(null);
    setManagementConfirm({ kind: "employee", employee: selectedEmployee, assignedSeatLabel: selectedEmployeeSeatLabel });
  }

  function createDepartment() {
    startTransition(async () => {
      try {
        setError(null);
        const department = await createDepartmentAction(newDepartmentName);
        setLocalDepartmentOptions(current => {
          const exists = current.some(option => option.id === department.id || option.name === department.name);
          if (!exists) return [...current, department].sort((a, b) => a.name.localeCompare(b.name));
          return current.map(option => (option.id === department.id || option.name === department.name ? department : option));
        });
        setNewDepartmentName("");
        showSuccess(`Department ${department.name} added.`);
      } catch (errorValue) {
        showError(errorValue, "Could not add department.");
      }
    });
  }

  function adoptDepartment(name: string) {
    startTransition(async () => {
      try {
        setError(null);
        const department = await createDepartmentAction(name);
        setLocalDepartmentOptions(current => {
          const exists = current.some(option => option.id === department.id || option.name === department.name);
          if (!exists) return [...current, department].sort((a, b) => a.name.localeCompare(b.name));
          return current.map(option => (option.id === department.id || option.name === department.name ? department : option));
        });
        showSuccess(`Department ${department.name} added to the managed list.`);
      } catch (errorValue) {
        showError(errorValue, "Could not add department to the managed list.");
      }
    });
  }

  function beginDepartmentRename(name: string) {
    setEditingDepartment(name);
    setDepartmentDraft(name);
    setMessage(null);
    setError(null);
  }

  function renameDepartment() {
    if (!editingDepartment) return;
    startTransition(async () => {
      try {
        setError(null);
        const result = await renameDepartmentAction({ from: editingDepartment, to: departmentDraft });
        setLocalDepartmentOptions(current => [
          ...current.map(option => (option.name === result.from ? { ...option, active: false } : option)),
          { id: result.to, name: result.to, active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        ]);
        setLocalEmployees(current => current.map(employee => (
          departmentKey(employee.department) === departmentKey(result.from) ? { ...employee, department: result.to } : employee
        )));
        setEditingDepartment("");
        setDepartmentDraft("");
        showSuccess(`Department renamed to ${result.to}.`);
      } catch (errorValue) {
        showError(errorValue, "Could not rename department.");
      }
    });
  }

  function deleteDepartment(name: string) {
    const count = departmentRoster.find(row => row.key === departmentKey(name))?.employeeCount ?? 0;
    setMessage(null);
    setError(null);
    setManagementConfirm({ kind: "department", name, affectedCount: count });
  }

  function createZone() {
    startTransition(async () => {
      try {
        setError(null);
        const zone = await createZoneAction(newZoneName);
        setLocalZoneOptions(current => {
          const exists = current.some(option => option.id === zone.id || option.name === zone.name);
          if (!exists) return [...current, zone].sort((a, b) => a.name.localeCompare(b.name));
          return current.map(option => (option.id === zone.id || option.name === zone.name ? zone : option));
        });
        setNewZoneName("");
        showSuccess(`Zone ${zone.name} added.`);
      } catch (errorValue) {
        showError(errorValue, "Could not add zone.");
      }
    });
  }

  function beginZoneRename(name: string) {
    setEditingZone(name);
    setZoneDraft(name);
    setMessage(null);
    setError(null);
  }

  function renameZone() {
    if (!editingZone) return;
    startTransition(async () => {
      try {
        setError(null);
        const result = await renameZoneAction({ from: editingZone, to: zoneDraft });
        setLocalZoneOptions(current => [
          ...current.map(option => (option.name === result.from ? { ...option, active: false } : option)),
          { id: result.to, name: result.to, active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        ]);
        setLocalSeats(current => current.map(seat => (
          getSeatZone(seat) === result.from ? { ...seat, zone: result.to } : seat
        )));
        setEditingZone("");
        setZoneDraft("");
        showSuccess(`Zone renamed to ${result.to}.`);
      } catch (errorValue) {
        showError(errorValue, "Could not rename zone.");
      }
    });
  }

  function deleteZone(name: string) {
    const count = zoneCounts.get(name) ?? 0;
    setMessage(null);
    setError(null);
    setManagementConfirm({ kind: "zone", name, affectedCount: count });
  }

  function closeManagementConfirm() {
    setManagementConfirm(null);
  }

  function confirmManagementDestructiveAction() {
    if (!managementConfirm) return;
    const action = managementConfirm;
    setManagementConfirm(null);

    startTransition(async () => {
      try {
        setError(null);

        if (action.kind === "employee") {
          await deleteEmployeeAction(action.employee.id);
          setLocalEmployees(current => current.filter(employee => employee.id !== action.employee.id));
          setLocalSeats(current => current.map(seat => (
            seat.employee_id === action.employee.id ? { ...seat, employee_id: null, employee: null, status: "available" } : seat
          )));
          setSelectedEmployeeId("");
          setEmployeeForm(emptyEmployeeForm);
          showSuccess(`${action.employee.full_name} deactivated.`);
          return;
        }

        if (action.kind === "department") {
          await deleteDepartmentAction(action.name);
          setLocalDepartmentOptions(current => current.map(option => (option.name === action.name ? { ...option, active: false } : option)));
          setLocalEmployees(current => current.map(employee => (
            employee.department === action.name ? { ...employee, department: null } : employee
          )));
          showSuccess(`Department ${action.name} deleted.`);
          return;
        }

        await deleteZoneAction(action.name);
        setLocalZoneOptions(current => current.map(option => (option.name === action.name ? { ...option, active: false } : option)));
        setLocalSeats(current => current.map(seat => (
          getSeatZone(seat) === action.name ? { ...seat, zone: null } : seat
        )));
        showSuccess(`Zone ${action.name} deleted.`);
      } catch (errorValue) {
        showError(
          errorValue,
          action.kind === "employee"
            ? "Could not deactivate employee."
            : action.kind === "department"
              ? "Could not delete department."
              : "Could not delete zone."
        );
      }
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-slate-950 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Admin tools</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">Management</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Manage people, departments, zones, and publish audit visibility outside the daily seat-map workflow.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin" className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                Back to seat map
              </Link>
            </div>
          </div>
        </header>

        {(message || error) && (
          <div
            role={error ? "alert" : "status"}
            aria-live={error ? "assertive" : "polite"}
            className={["rounded-2xl border px-4 py-3 text-sm font-semibold", error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"].join(" ")}
          >
            {error ?? message}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {managementSummaryCards.map(card => (
            <div key={card.label} className="rounded-2xl border border-white/10 bg-white p-4 shadow-soft">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-2xl font-black">{card.value}</div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{card.detail}</div>
              </div>
              <div className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</div>
            </div>
          ))}
        </section>

        <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/10 p-1.5 text-white backdrop-blur">
          {managementTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={["rounded-xl px-4 py-2 text-sm font-bold transition", activeTab === tab.id ? "bg-white text-slate-950 shadow-sm" : "bg-white/10 text-white hover:bg-white/15"].join(" ")}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "employees" && (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-3xl border border-white/10 bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-black">Employees</h2>
                  <p className="text-sm text-slate-500">Search, edit, and deactivate employees without touching marker tools.</p>
                </div>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search employees..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100 md:w-80"
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
                {filteredEmployees.map(employee => {
                  const seatLabel = getAssignedSeatLabel(employee.id, localSeats);
                  return (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => editEmployee(employee)}
                      className={["rounded-2xl border p-3 text-left transition", selectedEmployeeId === employee.id ? "border-brand bg-orange-50" : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/40"].join(" ")}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-black text-brand-dark">{getInitials(employee.full_name)}</div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-slate-950">{employee.full_name}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {[employee.position, employee.department, employee.phone_extension ? `Ext. ${employee.phone_extension}` : null].filter(Boolean).join(" · ") || "No position or department"}
                          </div>
                          <div className="mt-2 text-xs font-bold text-slate-600">{seatLabel}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {filteredEmployees.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 lg:col-span-2">
                    <div className="font-black text-slate-950">No employees match this search</div>
                    <p className="mt-1">Try a different name, department, position, or seat label.</p>
                  </div>
                )}
              </div>
            </div>

            <aside className="rounded-3xl border border-white/10 bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">{selectedEmployee ? "Edit employee" : "Add employee"}</h2>
                  <p className="text-sm text-slate-500">Changes update the employee directory and draft seat references.</p>
                </div>
                <Button type="button" onClick={startNewEmployee} disabled={pending}>New</Button>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Name</span>
                  <input value={employeeForm.fullName} onChange={event => setEmployeeForm(current => ({ ...current, fullName: event.target.value }))} className={fieldClassName} />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Position</span>
                    <input value={employeeForm.position} onChange={event => setEmployeeForm(current => ({ ...current, position: event.target.value }))} className={fieldClassName} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Phone Ext.</span>
                    <input value={employeeForm.phoneExtension} onChange={event => setEmployeeForm(current => ({ ...current, phoneExtension: event.target.value }))} className={fieldClassName} inputMode="numeric" />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Department</span>
                  <input list="management-department-options" value={employeeForm.department} onChange={event => setEmployeeForm(current => ({ ...current, department: event.target.value }))} className={fieldClassName} />
                </label>
              </div>
              {selectedEmployee && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <div className="font-black uppercase tracking-wide">Deactivation impact</div>
                  <div className="mt-1">
                    Current draft seat: <span className="font-bold">{selectedEmployeeSeatLabel}</span>.
                    {selectedEmployeeSeatLabel === "Unassigned"
                      ? " Deactivation removes this employee from the active directory."
                      : " Deactivation clears this draft assignment. Published assignments are protected server-side."}
                  </div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="primary" onClick={saveEmployee} disabled={pending || !employeeForm.fullName.trim()}>{selectedEmployee ? "Save employee" : "Add employee"}</Button>
                {selectedEmployee && <Button type="button" variant="danger" onClick={deleteEmployee} disabled={pending}>Deactivate</Button>}
              </div>
            </aside>
          </section>
        )}

        {activeTab === "departments" && (
          <section className="rounded-3xl border border-white/10 bg-white p-4 shadow-soft">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-black">Departments</h2>
                <p className="text-sm text-slate-500">Employee departments are separate from physical seating zones.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <input value={newDepartmentName} onChange={event => setNewDepartmentName(event.target.value)} placeholder="New department" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100" />
                <Button type="button" variant="primary" onClick={createDepartment} disabled={pending || !newDepartmentName.trim()}>Add</Button>
              </div>
            </div>
            <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {departmentRoster.map(row => (
                <div key={row.key} className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-950">{row.name}</span>
                      {!row.managed && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Not in managed list</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{row.employeeCount} employee{row.employeeCount === 1 ? "" : "s"}</div>
                  </div>
                  {editingDepartment === row.name ? (
                    <div className="flex flex-1 flex-col gap-2 md:max-w-md md:flex-row">
                      <input value={departmentDraft} onChange={event => setDepartmentDraft(event.target.value)} className={fieldClassName} />
                      <Button type="button" onClick={renameDepartment} disabled={pending || !departmentDraft.trim()}>Save</Button>
                      <Button type="button" onClick={() => setEditingDepartment("")} disabled={pending}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {!row.managed && (
                        <Button type="button" onClick={() => adoptDepartment(row.name)} disabled={pending}>Add to list</Button>
                      )}
                      <Button type="button" onClick={() => beginDepartmentRename(row.name)} disabled={pending}>Rename</Button>
                      <Button type="button" variant="danger" onClick={() => deleteDepartment(row.name)} disabled={pending}>Delete</Button>
                    </div>
                  )}
                </div>
              ))}
              {departmentNames.length === 0 && (
                <div className="p-5 text-sm text-slate-500">
                  <div className="font-black text-slate-950">No departments yet</div>
                  <p className="mt-1">Add a department to keep employee records easier to scan.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "zones" && (
          <section className="rounded-3xl border border-white/10 bg-white p-4 shadow-soft">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-black">Zones</h2>
                <p className="text-sm text-slate-500">Zones are physical map areas used for filtering and custom-seat label prefixes.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <input value={newZoneName} onChange={event => setNewZoneName(event.target.value)} placeholder="New zone" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100" />
                <Button type="button" variant="primary" onClick={createZone} disabled={pending || !newZoneName.trim()}>Add</Button>
              </div>
            </div>
            <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {zoneNames.map(name => (
                <div key={name} className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-black text-slate-950">{name}</div>
                    <div className="text-xs text-slate-500">{zoneCounts.get(name) ?? 0} draft seat{(zoneCounts.get(name) ?? 0) === 1 ? "" : "s"}</div>
                  </div>
                  {editingZone === name ? (
                    <div className="flex flex-1 flex-col gap-2 md:max-w-md md:flex-row">
                      <input value={zoneDraft} onChange={event => setZoneDraft(event.target.value)} className={fieldClassName} />
                      <Button type="button" onClick={renameZone} disabled={pending || !zoneDraft.trim()}>Save</Button>
                      <Button type="button" onClick={() => setEditingZone("")} disabled={pending}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => beginZoneRename(name)} disabled={pending}>Rename</Button>
                      <Button type="button" variant="danger" onClick={() => deleteZone(name)} disabled={pending}>Delete</Button>
                    </div>
                  )}
                </div>
              ))}
              {zoneNames.length === 0 && (
                <div className="p-5 text-sm text-slate-500">
                  <div className="font-black text-slate-950">No zones yet</div>
                  <p className="mt-1">Add a zone to organize map filters and custom-seat labels.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "publishHistory" && (
          <section className="rounded-3xl border border-white/10 bg-white p-4 shadow-soft sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-lg font-black">Publish History</h2>
                <p className="text-sm leading-6 text-slate-500">
                  Recent completed publishes from the draft map, including published seat count and admin identity when the profile can be resolved.
                </p>
              </div>
              <Button type="button" onClick={loadPublishHistory} disabled={publishHistoryState.status === "loading"}>
                {publishHistoryState.status === "loading" ? "Loading" : "Refresh history"}
              </Button>
            </div>

            {publishHistoryState.status === "loading" && (
              <>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="h-14 animate-pulse rounded-xl bg-white" />
                    <div className="h-14 animate-pulse rounded-xl bg-white" />
                    <div className="h-14 animate-pulse rounded-xl bg-white" />
                  </div>
                </div>
                <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {[0, 1, 2].map(item => (
                    <div key={item} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_80px]">
                      <div className="h-5 animate-pulse rounded bg-slate-100" />
                      <div className="h-5 animate-pulse rounded bg-slate-100" />
                      <div className="h-5 animate-pulse rounded bg-slate-100" />
                      <div className="h-5 animate-pulse rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              </>
            )}

            {publishHistoryState.status === "error" && (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-black">Could not load publish history.</div>
                  <div className="mt-1 whitespace-pre-wrap">{publishHistoryState.error}</div>
                </div>
                <Button type="button" variant="danger" onClick={loadPublishHistory}>
                  Retry
                </Button>
              </div>
            )}

            {publishHistoryState.status === "loaded" && publishHistoryState.events.length === 0 && (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6">
                <h3 className="text-sm font-black text-slate-950">No publish events yet</h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
                  Published maps will appear here after the first successful publish audit event is written.
                </p>
              </div>
            )}

            {publishHistoryState.status === "loaded" && publishHistoryState.events.length > 0 && (
              <>
                {latestPublish && (
                  <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
                    <div className="text-[11px] font-black uppercase tracking-wide text-brand-dark">Latest Publish</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-orange-700">Created</div>
                        <div className="mt-1 text-sm font-black text-slate-950">{formatPublishDate(latestPublish.created_at)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-orange-700">Seat Count</div>
                        <div className="mt-1 text-sm font-black text-slate-950">{latestPublish.seat_count.toLocaleString()}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold uppercase tracking-wide text-orange-700">Published By</div>
                        <div className="mt-1 break-all text-sm font-black text-slate-950" title={latestPublish.published_by ?? undefined}>
                          {getPublishHistoryActor(latestPublish)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="hidden grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_80px] bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500 md:grid">
                    <div>Created At</div>
                    <div>Seat Count</div>
                    <div>Published By</div>
                    <div>State</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {publishHistoryState.events.map((event, index) => (
                      <div
                        key={`${event.created_at}-${event.published_by ?? "unknown"}-${index}`}
                        className="grid gap-3 p-3 text-sm md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_80px] md:items-center"
                      >
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 md:hidden">Created At</div>
                          <div className="font-semibold text-slate-950">{formatPublishDate(event.created_at)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 md:hidden">Seat Count</div>
                          <div className="font-black text-slate-950">{event.seat_count.toLocaleString()}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 md:hidden">Published By</div>
                          <div className="break-all font-semibold text-slate-700" title={event.published_by ?? undefined}>
                            {getPublishHistoryActor(event)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 md:hidden">State</div>
                          {index === 0 ? (
                            <span className="inline-flex rounded-full bg-orange-100 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-brand-dark">Latest</span>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">Previous</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        <datalist id="management-department-options">
          {departmentNames.map(name => <option key={name} value={name} />)}
        </datalist>
      </div>

      {managementConfirm && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/35 p-3 backdrop-blur-[2px] sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="management-confirm-title"
            aria-describedby="management-confirm-description"
            onKeyDown={event => {
              if (event.key === "Escape" && !pending) {
                event.stopPropagation();
                closeManagementConfirm();
              }
            }}
            className="w-full max-w-lg rounded-2xl border border-white/70 bg-white/95 p-4 text-slate-950 shadow-[0_26px_80px_rgba(15,23,42,0.28)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="management-confirm-title" className="text-base font-black">
                  {managementConfirm.kind === "employee"
                    ? `Deactivate ${managementConfirm.employee.full_name}?`
                    : managementConfirm.kind === "department"
                      ? `Delete department "${managementConfirm.name}"?`
                      : `Delete zone "${managementConfirm.name}"?`}
                </h2>
                <p id="management-confirm-description" className="mt-1 text-sm leading-5 text-slate-500">
                  Review the exact management impact before applying this cleanup.
                </p>
              </div>
              <button
                type="button"
                onClick={closeManagementConfirm}
                disabled={pending}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
                aria-label="Cancel management confirmation"
              >
                x
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {managementConfirm.kind === "employee" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm leading-5 text-amber-900">
                  <div className="font-black uppercase tracking-wide">Deactivation impact</div>
                  <div className="mt-1">
                    Current draft seat: <span className="font-bold">{managementConfirm.assignedSeatLabel}</span>.
                    {managementConfirm.assignedSeatLabel === "Unassigned"
                      ? " This removes the employee from the active directory."
                      : " This clears that draft assignment and keeps the employee inactive."}
                  </div>
                </div>
              )}

              {managementConfirm.kind === "department" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm leading-5 text-amber-900">
                  <div className="font-black uppercase tracking-wide">Department delete impact</div>
                  <div className="mt-1">
                    Clears this department from <span className="font-bold">{pluralize(managementConfirm.affectedCount, "active employee")}</span>. Employee records remain active and physical seat zones are unchanged.
                  </div>
                </div>
              )}

              {managementConfirm.kind === "zone" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm leading-5 text-amber-900">
                  <div className="font-black uppercase tracking-wide">Zone delete impact</div>
                  <div className="mt-1">
                    Clears this physical zone from <span className="font-bold">{pluralize(managementConfirm.affectedCount, "draft seat")}</span>. Seat markers and employees remain in place.
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-sm font-semibold leading-5 text-brand-dark">
                {managementConfirm.kind === "employee"
                  ? "Published assignments are protected server-side. Publish draft changes when ready."
                  : managementConfirm.kind === "department"
                    ? "This changes employee metadata and can affect viewer employee detail text immediately. Seat assignments are unchanged."
                    : "This updates draft zone metadata only. The published viewer map is unchanged until publish."}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={closeManagementConfirm} disabled={pending} className="w-full">
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmManagementDestructiveAction} disabled={pending} className="w-full">
                {managementConfirm.kind === "employee"
                  ? "Deactivate employee"
                  : managementConfirm.kind === "department"
                    ? "Delete department"
                    : "Delete zone"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
