"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
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
import { Button } from "@/components/ui/Button";

type EmployeeForm = {
  fullName: string;
  position: string;
  department: string;
};

type AdminManagementPanelProps = {
  employees: Employee[];
  seats: SeatWithEmployee[];
  departmentOptions: DepartmentOption[];
  zoneOptions: ZoneOption[];
};

type ManagementTab = "employees" | "departments" | "zones";

const emptyEmployeeForm: EmployeeForm = {
  fullName: "",
  position: "",
  department: ""
};

function formFromEmployee(employee: Employee): EmployeeForm {
  return {
    fullName: employee.full_name,
    position: employee.position ?? "",
    department: employee.department ?? ""
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

function countEmployeesByDepartment(employees: Employee[]) {
  const counts = new Map<string, number>();
  employees.forEach(employee => {
    const department = employee.department?.trim();
    if (!department) return;
    counts.set(department, (counts.get(department) ?? 0) + 1);
  });
  return counts;
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

export function AdminManagementPanel({
  employees,
  seats,
  departmentOptions,
  zoneOptions
}: AdminManagementPanelProps) {
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [localDepartmentOptions, setLocalDepartmentOptions] = useState(departmentOptions);
  const [localZoneOptions, setLocalZoneOptions] = useState(zoneOptions);
  const [localSeats, setLocalSeats] = useState(seats);
  const [activeTab, setActiveTab] = useState<ManagementTab>("employees");
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [editingDepartment, setEditingDepartment] = useState("");
  const [departmentDraft, setDepartmentDraft] = useState("");
  const [newZoneName, setNewZoneName] = useState("");
  const [editingZone, setEditingZone] = useState("");
  const [zoneDraft, setZoneDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeEmployees = useMemo(
    () => [...localEmployees].filter(employee => employee.active).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [localEmployees]
  );

  const departmentNames = useMemo(() => {
    const values = new Set<string>();
    localDepartmentOptions.filter(option => option.active).forEach(option => values.add(option.name));
    activeEmployees.forEach(employee => {
      if (employee.department) values.add(employee.department);
    });
    return Array.from(values).sort();
  }, [activeEmployees, localDepartmentOptions]);

  const zoneNames = useMemo(() => {
    const values = new Set<string>();
    localZoneOptions.filter(option => option.active).forEach(option => values.add(option.name));
    localSeats.forEach(seat => {
      const zone = getSeatZone(seat);
      if (zone) values.add(zone);
    });
    return Array.from(values).sort();
  }, [localSeats, localZoneOptions]);

  const departmentCounts = useMemo(() => countEmployeesByDepartment(activeEmployees), [activeEmployees]);
  const zoneCounts = useMemo(() => countSeatsByZone(localSeats), [localSeats]);

  const filteredEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return activeEmployees.filter(employee => {
      const assignment = getAssignedSeatLabel(employee.id, localSeats);
      const haystack = [employee.full_name, employee.position, employee.department, assignment].filter(Boolean).join(" ").toLowerCase();
      return !needle || haystack.includes(needle);
    });
  }, [activeEmployees, localSeats, search]);

  const selectedEmployee = activeEmployees.find(employee => employee.id === selectedEmployeeId) ?? null;
  const selectedEmployeeSeatLabel = selectedEmployee ? getAssignedSeatLabel(selectedEmployee.id, localSeats) : "Unassigned";
  const assignedEmployees = activeEmployees.filter(employee => localSeats.some(seat => seat.employee_id === employee.id)).length;
  const unassignedEmployees = activeEmployees.length - assignedEmployees;
  const fieldClassName = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100";

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
          department: employeeForm.department
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
    const assignedSeat = getAssignedSeatLabel(selectedEmployee.id, localSeats);
    const confirmed = window.confirm(`Deactivate ${selectedEmployee.full_name}?${assignedSeat !== "Unassigned" ? ` Draft assignment at ${assignedSeat} will be cleared.` : ""}`);
    if (!confirmed) return;

    startTransition(async () => {
      try {
        setError(null);
        await deleteEmployeeAction(selectedEmployee.id);
        setLocalEmployees(current => current.filter(employee => employee.id !== selectedEmployee.id));
        setLocalSeats(current => current.map(seat => (
          seat.employee_id === selectedEmployee.id ? { ...seat, employee_id: null, employee: null, status: "available" } : seat
        )));
        startNewEmployee();
        showSuccess(`${selectedEmployee.full_name} deactivated.`);
      } catch (errorValue) {
        showError(errorValue, "Could not deactivate employee.");
      }
    });
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
          employee.department === result.from ? { ...employee, department: result.to } : employee
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
    const count = departmentCounts.get(name) ?? 0;
    const confirmed = window.confirm(`Delete department "${name}"? This clears it from ${count} employee${count === 1 ? "" : "s"}.`);
    if (!confirmed) return;

    startTransition(async () => {
      try {
        setError(null);
        await deleteDepartmentAction(name);
        setLocalDepartmentOptions(current => current.map(option => (option.name === name ? { ...option, active: false } : option)));
        setLocalEmployees(current => current.map(employee => (
          employee.department === name ? { ...employee, department: null } : employee
        )));
        showSuccess(`Department ${name} deleted.`);
      } catch (errorValue) {
        showError(errorValue, "Could not delete department.");
      }
    });
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
    const confirmed = window.confirm(`Delete zone "${name}"? This clears it from ${count} draft seat${count === 1 ? "" : "s"}.`);
    if (!confirmed) return;

    startTransition(async () => {
      try {
        setError(null);
        await deleteZoneAction(name);
        setLocalZoneOptions(current => current.map(option => (option.name === name ? { ...option, active: false } : option)));
        setLocalSeats(current => current.map(seat => (
          getSeatZone(seat) === name ? { ...seat, zone: null } : seat
        )));
        showSuccess(`Zone ${name} deleted.`);
      } catch (errorValue) {
        showError(errorValue, "Could not delete zone.");
      }
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-4 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-3xl border border-white/10 bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Admin tools</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">Management</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Manage employees, departments, and physical map zones outside the daily seat-assignment workflow.
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
          <div className={["rounded-2xl border px-4 py-3 text-sm font-semibold", error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"].join(" ")}>{error ?? message}</div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white p-4 shadow-soft">
            <div className="text-2xl font-black">{activeEmployees.length}</div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Active employees</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white p-4 shadow-soft">
            <div className="text-2xl font-black">{assignedEmployees}</div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Assigned</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white p-4 shadow-soft">
            <div className="text-2xl font-black">{unassignedEmployees}</div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Unassigned</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white p-4 shadow-soft">
            <div className="text-2xl font-black">{zoneNames.length}</div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Active zones</div>
          </div>
        </section>

        <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/10 p-2 text-white backdrop-blur">
          {(["employees", "departments", "zones"] as ManagementTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={["rounded-xl px-4 py-2 text-sm font-bold capitalize transition", activeTab === tab ? "bg-white text-slate-950" : "bg-white/10 text-white hover:bg-white/15"].join(" ")}
            >
              {tab}
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
                  placeholder="Search employees, positions, departments, seats..."
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
                          <div className="mt-1 truncate text-xs text-slate-500">{[employee.position, employee.department].filter(Boolean).join(" · ") || "No position or department"}</div>
                          <div className="mt-2 text-xs font-bold text-slate-600">{seatLabel}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
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
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Position</span>
                  <input value={employeeForm.position} onChange={event => setEmployeeForm(current => ({ ...current, position: event.target.value }))} className={fieldClassName} />
                </label>
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
              <div className="flex gap-2">
                <input value={newDepartmentName} onChange={event => setNewDepartmentName(event.target.value)} placeholder="New department" className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100" />
                <Button type="button" variant="primary" onClick={createDepartment} disabled={pending || !newDepartmentName.trim()}>Add</Button>
              </div>
            </div>
            <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {departmentNames.map(name => (
                <div key={name} className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-black text-slate-950">{name}</div>
                    <div className="text-xs text-slate-500">{departmentCounts.get(name) ?? 0} employee{(departmentCounts.get(name) ?? 0) === 1 ? "" : "s"}</div>
                  </div>
                  {editingDepartment === name ? (
                    <div className="flex flex-1 flex-col gap-2 md:max-w-md md:flex-row">
                      <input value={departmentDraft} onChange={event => setDepartmentDraft(event.target.value)} className={fieldClassName} />
                      <Button type="button" onClick={renameDepartment} disabled={pending || !departmentDraft.trim()}>Save</Button>
                      <Button type="button" onClick={() => setEditingDepartment("")} disabled={pending}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => beginDepartmentRename(name)} disabled={pending}>Rename</Button>
                      <Button type="button" variant="danger" onClick={() => deleteDepartment(name)} disabled={pending}>Delete</Button>
                    </div>
                  )}
                </div>
              ))}
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
              <div className="flex gap-2">
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
            </div>
          </section>
        )}

        <datalist id="management-department-options">
          {departmentNames.map(name => <option key={name} value={name} />)}
        </datalist>
      </div>
    </main>
  );
}
