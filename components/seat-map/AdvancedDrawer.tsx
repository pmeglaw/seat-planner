"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { exportSeatsToAssignmentCsv } from "@/lib/csv";
import {
  createDepartmentAction,
  createEmployeeAction,
  createZoneAction,
  deleteDepartmentAction,
  deleteEmployeeAction,
  deleteZoneAction,
  importAssignmentsCsvAction,
  renameDepartmentAction,
  renameZoneAction,
  updateEmployeeAction
} from "@/app/actions";
import { Button } from "@/components/ui/Button";

type AdvancedDrawerProps = {
  open: boolean;
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions: DepartmentOption[];
  zoneOptions: ZoneOption[];
  selectedSeat: SeatWithEmployee | null;
  addSeatMode: boolean;
  addSeatZone: string;
  moveSeatMode: boolean;
  pending: boolean;
  showNames: boolean;
  onClose: () => void;
  onStartAddSeat: () => void;
  onCancelAddSeat: () => void;
  onAddSeatZoneChange: (zone: string) => void;
  onPublish: () => void;
  onToggleMoveSeat: () => void;
  onToggleShowNames: () => void;
  onClearSelection: () => void;
  onEmployeeCreated: (employee: Employee) => void;
  onEmployeeUpdated: (employee: Employee) => void;
  onEmployeeDeleted: (employeeId: string) => void;
  onDepartmentCreated: (department: DepartmentOption) => void;
  onDepartmentRenamed: (from: string, to: string) => void;
  onDepartmentDeleted: (department: string) => void;
  onZoneCreated: (zone: ZoneOption) => void;
  onZoneRenamed: (from: string, to: string) => void;
  onZoneDeleted: (zone: string) => void;
  onCsvImported: (payload: { seats: SeatWithEmployee[]; employees: Employee[] }) => void;
  onError: (message: string | null) => void;
};

type EmployeeForm = {
  fullName: string;
  position: string;
  department: string;
};

const emptyEmployeeForm: EmployeeForm = {
  fullName: "",
  position: "",
  department: ""
};

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadJson(filename: string, payload: unknown) {
  downloadFile(filename, JSON.stringify(payload, null, 2), "application/json");
}

function formFromEmployee(employee: Employee): EmployeeForm {
  return {
    fullName: employee.full_name,
    position: employee.position ?? "",
    department: employee.department ?? ""
  };
}

export function AdvancedDrawer({
  open,
  seats,
  employees,
  departmentOptions,
  zoneOptions,
  selectedSeat,
  addSeatMode,
  addSeatZone,
  moveSeatMode,
  pending,
  showNames,
  onClose,
  onStartAddSeat,
  onCancelAddSeat,
  onAddSeatZoneChange,
  onPublish,
  onToggleMoveSeat,
  onToggleShowNames,
  onClearSelection,
  onEmployeeCreated,
  onEmployeeUpdated,
  onEmployeeDeleted,
  onDepartmentCreated,
  onDepartmentRenamed,
  onDepartmentDeleted,
  onZoneCreated,
  onZoneRenamed,
  onZoneDeleted,
  onCsvImported,
  onError
}: AdvancedDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [nextDepartmentName, setNextDepartmentName] = useState("");
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [selectedZone, setSelectedZone] = useState("");
  const [nextZoneName, setNextZoneName] = useState("");
  const [newZoneName, setNewZoneName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [localPending, startTransition] = useTransition();

  const sortedEmployees = useMemo(
    () => [...employees].filter(employee => employee.active).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [employees]
  );

  const departments = useMemo(() => {
    const values = new Set<string>();
    departmentOptions.filter(item => item.active).forEach(item => values.add(item.name));
    sortedEmployees.forEach(employee => {
      if (employee.department) values.add(employee.department);
    });
    return Array.from(values).sort();
  }, [departmentOptions, sortedEmployees]);

  const zones = useMemo(() => {
    const values = new Set<string>();
    zoneOptions.filter(item => item.active).forEach(item => values.add(item.name));
    seats.forEach(seat => {
      if (seat.zone) values.add(seat.zone);
      else if (seat.department) values.add(seat.department);
    });
    return Array.from(values).sort();
  }, [seats, zoneOptions]);

  const selectedEmployee = sortedEmployees.find(employee => employee.id === selectedEmployeeId) ?? null;
  const busy = pending || localPending;
  const fieldClassName = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100";

  useEffect(() => {
    if (!selectedEmployee) {
      setEmployeeForm(emptyEmployeeForm);
      return;
    }
    setEmployeeForm(formFromEmployee(selectedEmployee));
  }, [selectedEmployee]);

  useEffect(() => {
    if (selectedDepartment && !departments.includes(selectedDepartment)) {
      setSelectedDepartment("");
      setNextDepartmentName("");
    }
  }, [departments, selectedDepartment]);

  useEffect(() => {
    if (selectedZone && !zones.includes(selectedZone)) {
      setSelectedZone("");
      setNextZoneName("");
    }
  }, [selectedZone, zones]);

  if (!open) return null;

  function reportError(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback;
    setLocalError(message);
    onError(message);
  }

  function resetError() {
    setLocalError(null);
    onError(null);
  }

  function createEmployee() {
    startTransition(async () => {
      try {
        resetError();
        const employee = await createEmployeeAction(employeeForm);
        onEmployeeCreated(employee);
        setSelectedEmployeeId(employee.id);
        setEmployeeForm(formFromEmployee(employee));
      } catch (error) {
        reportError(error, "Could not create employee.");
      }
    });
  }

  function saveEmployee() {
    if (!selectedEmployeeId) return;

    startTransition(async () => {
      try {
        resetError();
        const employee = await updateEmployeeAction({ employeeId: selectedEmployeeId, ...employeeForm });
        onEmployeeUpdated(employee);
        setEmployeeForm(formFromEmployee(employee));
      } catch (error) {
        reportError(error, "Could not save employee.");
      }
    });
  }

  function deleteEmployee() {
    if (!selectedEmployee) return;
    const confirmed = window.confirm(`Delete ${selectedEmployee.full_name}? This deactivates the employee and clears draft assignments only.`);
    if (!confirmed) return;

    startTransition(async () => {
      try {
        resetError();
        await deleteEmployeeAction(selectedEmployee.id);
        onEmployeeDeleted(selectedEmployee.id);
        setSelectedEmployeeId("");
        setEmployeeForm(emptyEmployeeForm);
      } catch (error) {
        reportError(error, "Could not delete employee.");
      }
    });
  }

  function createDepartment() {
    startTransition(async () => {
      try {
        resetError();
        const department = await createDepartmentAction(newDepartmentName);
        onDepartmentCreated(department);
        setSelectedDepartment(department.name);
        setNextDepartmentName(department.name);
        setNewDepartmentName("");
      } catch (error) {
        reportError(error, "Could not add department.");
      }
    });
  }

  function selectDepartment(value: string) {
    setSelectedDepartment(value);
    setNextDepartmentName(value);
  }

  function renameDepartment() {
    if (!selectedDepartment) return;

    startTransition(async () => {
      try {
        resetError();
        const result = await renameDepartmentAction({ from: selectedDepartment, to: nextDepartmentName });
        onDepartmentRenamed(result.from, result.to);
        setSelectedDepartment(result.to);
        setNextDepartmentName(result.to);
      } catch (error) {
        reportError(error, "Could not rename department.");
      }
    });
  }

  function deleteDepartment() {
    if (!selectedDepartment) return;
    const confirmed = window.confirm(`Delete department "${selectedDepartment}" from employees?`);
    if (!confirmed) return;

    startTransition(async () => {
      try {
        resetError();
        const result = await deleteDepartmentAction(selectedDepartment);
        onDepartmentDeleted(result.department);
        setSelectedDepartment("");
        setNextDepartmentName("");
      } catch (error) {
        reportError(error, "Could not delete department.");
      }
    });
  }

  function createZone() {
    startTransition(async () => {
      try {
        resetError();
        const zone = await createZoneAction(newZoneName);
        onZoneCreated(zone);
        setSelectedZone(zone.name);
        setNextZoneName(zone.name);
        setNewZoneName("");
      } catch (error) {
        reportError(error, "Could not add zone.");
      }
    });
  }

  function selectZone(value: string) {
    setSelectedZone(value);
    setNextZoneName(value);
  }

  function renameZone() {
    if (!selectedZone) return;

    startTransition(async () => {
      try {
        resetError();
        const result = await renameZoneAction({ from: selectedZone, to: nextZoneName });
        onZoneRenamed(result.from, result.to);
        setSelectedZone(result.to);
        setNextZoneName(result.to);
      } catch (error) {
        reportError(error, "Could not rename zone.");
      }
    });
  }

  function deleteZone() {
    if (!selectedZone) return;
    const confirmed = window.confirm(`Delete zone "${selectedZone}" from draft seats?`);
    if (!confirmed) return;

    startTransition(async () => {
      try {
        resetError();
        const result = await deleteZoneAction(selectedZone);
        onZoneDeleted(result.zone);
        setSelectedZone("");
        setNextZoneName("");
      } catch (error) {
        reportError(error, "Could not delete zone.");
      }
    });
  }

  function exportCsv() {
    downloadFile("seat-assignments.csv", exportSeatsToAssignmentCsv(seats), "text/csv;charset=utf-8");
  }

  function importCsv(file: File | undefined) {
    if (!file) return;

    startTransition(async () => {
      try {
        resetError();
        const text = await file.text();
        const payload = await importAssignmentsCsvAction(text);
        onCsvImported({ seats: payload.seats, employees: payload.employees });
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        reportError(error, "Could not import CSV.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close advanced drawer"
        className="fixed inset-0 z-40 cursor-default bg-slate-950/25 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <aside className="fixed right-3 top-[68px] z-50 max-h-[calc(100vh-82px)] w-[400px] max-w-[calc(100vw-1.5rem)] overflow-auto rounded-3xl border border-white/70 bg-white/96 p-4 shadow-soft backdrop-blur">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Advanced</h2>
            <p className="mt-1 text-xs text-slate-500">Map utilities and admin management tools. Assignment edits stay in the seat inspector.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>

        {localError && (
          <div className="mb-3 whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-700">
            {localError}
          </div>
        )}

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Map view</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button type="button" onClick={onToggleShowNames} disabled={busy}>
                {showNames ? "Hide Names" : "Show Names"}
              </Button>
              <Button type="button" onClick={onClearSelection} disabled={busy}>Clear Selection</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Seat utilities</div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-slate-600">Zone for new seats</span>
              <select value={addSeatZone} onChange={event => onAddSeatZoneChange(event.target.value)} className={fieldClassName} disabled={busy || addSeatMode}>
                <option value="all">Generic seat ID</option>
                {zones.map(zone => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </label>
            <div className="mt-3 flex flex-col gap-2">
              {addSeatMode ? (
                <Button type="button" variant="danger" onClick={onCancelAddSeat} disabled={busy}>Cancel Add Seat</Button>
              ) : (
                <Button type="button" variant="primary" onClick={onStartAddSeat} disabled={busy}>Add Seat</Button>
              )}
              <Button type="button" onClick={onToggleMoveSeat} disabled={busy || !selectedSeat}>
                {moveSeatMode ? "Lock Selected Seat" : "Move Selected Seat"}
              </Button>
              <p className="text-xs leading-5 text-slate-500">
                {selectedSeat ? `Selected: ${selectedSeat.label}` : "Select a seat first to use move tools."}
              </p>
              <Button type="button" onClick={onPublish} disabled={busy}>Publish Draft Map</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">CSV tools</div>
            <div className="mt-3 flex flex-col gap-2">
              <Button type="button" onClick={exportCsv} disabled={busy}>Export CSV</Button>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={event => importCsv(event.target.files?.[0])} />
              <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>Import CSV</Button>
              <Button
                type="button"
                onClick={() => downloadJson("seat-map-export.json", { exportedAt: new Date().toISOString(), seats, employees })}
                disabled={busy}
              >
                Export JSON
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">CSV import updates draft assignments only. It never changes marker coordinates.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Admin Management</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">Employees, departments, and zones are separate from map utilities. A dedicated management page can replace this section in a later pass.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Employees</div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-slate-600">Select employee</span>
              <select value={selectedEmployeeId} onChange={event => setSelectedEmployeeId(event.target.value)} className={fieldClassName}>
                <option value="">New employee</option>
                {sortedEmployees.map(employee => (
                  <option key={employee.id} value={employee.id}>{employee.full_name}</option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Name</span>
                <input value={employeeForm.fullName} onChange={event => setEmployeeForm(current => ({ ...current, fullName: event.target.value }))} className={fieldClassName} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Position</span>
                <input value={employeeForm.position} onChange={event => setEmployeeForm(current => ({ ...current, position: event.target.value }))} className={fieldClassName} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Department</span>
                <input list="department-options" value={employeeForm.department} onChange={event => setEmployeeForm(current => ({ ...current, department: event.target.value }))} className={fieldClassName} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="primary" onClick={selectedEmployee ? saveEmployee : createEmployee} disabled={busy || !employeeForm.fullName.trim()}>
                {selectedEmployee ? "Save Employee" : "Add Employee"}
              </Button>
              {selectedEmployee && (
                <Button type="button" variant="danger" onClick={deleteEmployee} disabled={busy}>Delete</Button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Departments</div>
            <div className="mt-3 flex gap-2">
              <input value={newDepartmentName} onChange={event => setNewDepartmentName(event.target.value)} placeholder="New department" className={fieldClassName} />
              <Button type="button" onClick={createDepartment} disabled={busy || !newDepartmentName.trim()}>Add</Button>
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-slate-600">Existing department</span>
              <select value={selectedDepartment} onChange={event => selectDepartment(event.target.value)} className={fieldClassName}>
                <option value="">Select department</option>
                {departments.map(department => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </label>
            {selectedDepartment && (
              <div className="mt-3 flex flex-col gap-2">
                <input value={nextDepartmentName} onChange={event => setNextDepartmentName(event.target.value)} className={fieldClassName} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={renameDepartment} disabled={busy || !nextDepartmentName.trim()}>Rename</Button>
                  <Button type="button" variant="danger" onClick={deleteDepartment} disabled={busy}>Delete</Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Zones</div>
            <div className="mt-3 flex gap-2">
              <input value={newZoneName} onChange={event => setNewZoneName(event.target.value)} placeholder="New zone" className={fieldClassName} />
              <Button type="button" onClick={createZone} disabled={busy || !newZoneName.trim()}>Add</Button>
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-slate-600">Existing zone</span>
              <select value={selectedZone} onChange={event => selectZone(event.target.value)} className={fieldClassName}>
                <option value="">Select zone</option>
                {zones.map(zone => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </label>
            {selectedZone && (
              <div className="mt-3 flex flex-col gap-2">
                <input value={nextZoneName} onChange={event => setNextZoneName(event.target.value)} className={fieldClassName} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={renameZone} disabled={busy || !nextZoneName.trim()}>Rename</Button>
                  <Button type="button" variant="danger" onClick={deleteZone} disabled={busy}>Delete</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <datalist id="department-options">
          {departments.map(department => <option key={department} value={department} />)}
        </datalist>
      </aside>
    </>
  );
}
