"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee } from "@/lib/types";
import { updateSeatAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";

type SeatInspectorProps = {
  seat: SeatWithEmployee | null;
  employees: Employee[];
  departmentOptions: DepartmentOption[];
  canEdit: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  onBeforeSeatUpdate: () => DraftSnapshot;
  onSeatUpdated: (seat: SeatWithEmployee, beforeSnapshot: DraftSnapshot) => void;
  onError: (message: string | null) => void;
  onDirtyChange: (dirty: boolean) => void;
};

type SeatInspectorForm = {
  label: string;
  employeeId: string;
  employeeName: string;
  employeePosition: string;
  department: string;
  zone: string;
  status: SeatStatus;
  notes: string;
};

const emptyForm: SeatInspectorForm = {
  label: "",
  employeeId: "",
  employeeName: "",
  employeePosition: "",
  department: "",
  zone: "",
  status: "available",
  notes: ""
};

function formFromSeat(seat: SeatWithEmployee): SeatInspectorForm {
  return {
    label: seat.label,
    employeeId: seat.employee_id ?? "",
    employeeName: seat.employee?.full_name ?? "",
    employeePosition: seat.employee?.position ?? "",
    department: seat.employee?.department ?? "",
    zone: seat.zone ?? seat.department ?? "",
    status: seat.status,
    notes: seat.notes ?? ""
  };
}

function formSnapshot(form: SeatInspectorForm) {
  return JSON.stringify(form);
}

function formsEqual(left: SeatInspectorForm, right: SeatInspectorForm) {
  return Object.keys(emptyForm).every(key => {
    const formKey = key as keyof SeatInspectorForm;
    return left[formKey] === right[formKey];
  });
}

export function SeatInspector({
  seat,
  employees,
  departmentOptions,
  canEdit,
  collapsed,
  onClose,
  onToggleCollapse,
  onBeforeSeatUpdate,
  onSeatUpdated,
  onError,
  onDirtyChange
}: SeatInspectorProps) {
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const [form, setForm] = useState<SeatInspectorForm>(emptyForm);
  const [initialForm, setInitialForm] = useState<SeatInspectorForm>(emptyForm);
  const activeSeatIdRef = useRef<string | null>(null);
  const activeSeatSnapshotRef = useRef(formSnapshot(emptyForm));

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
    if (form.department) values.add(form.department);
    return Array.from(values).sort();
  }, [departmentOptions, sortedEmployees, form.department]);

  const isDirty = useMemo(() => !formsEqual(form, initialForm), [form, initialForm]);
  const hasAssignedPerson = Boolean(form.employeeId || form.employeeName.trim());
  const effectiveStatus: SeatStatus = hasAssignedPerson ? "assigned" : form.status === "assigned" ? "available" : form.status;
  const matchedEmployee = useMemo(() => {
    const cleanName = form.employeeName.trim().toLowerCase();
    if (!cleanName) return null;
    return sortedEmployees.find(employee => employee.full_name.trim().toLowerCase() === cleanName) ?? null;
  }, [form.employeeName, sortedEmployees]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!seat) {
      activeSeatIdRef.current = null;
      activeSeatSnapshotRef.current = formSnapshot(emptyForm);
      setForm(emptyForm);
      setInitialForm(emptyForm);
      setLocalError(null);
      onDirtyChange(false);
      return;
    }

    const nextForm = formFromSeat(seat);
    const nextSnapshot = formSnapshot(nextForm);
    const isNewSeat = activeSeatIdRef.current !== seat.id;

    if (isNewSeat || (!isDirty && activeSeatSnapshotRef.current !== nextSnapshot)) {
      activeSeatIdRef.current = seat.id;
      activeSeatSnapshotRef.current = nextSnapshot;
      setForm(nextForm);
      setInitialForm(nextForm);
      setLocalError(null);
      onError(null);
      onDirtyChange(false);
    }
  }, [seat, isDirty, onDirtyChange, onError]);

  if (!seat) return null;

  const selectedSeat = seat;
  const selectedSeatZone = selectedSeat.zone ?? selectedSeat.department ?? "No zone";
  const selectedSeatEmployeeName = selectedSeat.employee?.full_name ?? "this employee";
  const hasCurrentAssignment = Boolean(selectedSeat.employee_id);
  const employeeNameValue = form.employeeName.trim();
  const assignmentStateText = employeeNameValue
    ? matchedEmployee
      ? "Matched existing employee"
      : "New employee will be created"
    : "No employee assigned";

  function updateField<K extends keyof SeatInspectorForm>(field: K, value: SeatInspectorForm[K]) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function findEmployeeByName(name: string) {
    const cleanName = name.trim().toLowerCase();
    if (!cleanName) return null;
    return sortedEmployees.find(employee => employee.full_name.trim().toLowerCase() === cleanName) ?? null;
  }

  function handleEmployeeNameChange(event: ChangeEvent<HTMLInputElement>) {
    const employeeName = event.target.value;
    const matchedEmployee = findEmployeeByName(employeeName);

    setForm(current => {
      const nextStatus: SeatStatus = employeeName.trim()
        ? "assigned"
        : current.status === "reserved" || current.status === "unavailable"
          ? current.status
          : "available";

      if (!matchedEmployee) {
        return {
          ...current,
          employeeId: "",
          employeeName,
          status: nextStatus
        };
      }

      return {
        ...current,
        employeeId: matchedEmployee.id,
        employeeName: matchedEmployee.full_name,
        employeePosition: matchedEmployee.position ?? "",
        department: matchedEmployee.department ?? current.department,
        status: "assigned"
      };
    });
  }

  function handleTextChange(
    field: keyof Omit<SeatInspectorForm, "status" | "employeeId" | "employeeName" | "zone" | "label">,
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    updateField(field, event.target.value);
  }

  function handleDepartmentChange(event: ChangeEvent<HTMLSelectElement>) {
    updateField("department", event.target.value);
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    updateField("status", event.target.value as SeatStatus);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const employeeName = form.employeeName.trim();
    const matchedEmployee = findEmployeeByName(employeeName);
    const employeeId = matchedEmployee?.id ?? (form.employeeId || null);
    const nextStatus: SeatStatus = employeeId || employeeName
      ? "assigned"
      : form.status === "reserved" || form.status === "unavailable"
        ? form.status
        : "available";

    if (nextStatus === "assigned" && !employeeId && !employeeName) {
      const message = "Assigned seats require an employee name.";
      setLocalError(message);
      onError(message);
      return;
    }

    const beforeSnapshot = onBeforeSeatUpdate();

    startTransition(async () => {
      try {
        setLocalError(null);
        onError(null);
        const updated = await updateSeatAction({
          seatId: selectedSeat.id,
          label: form.label,
          status: nextStatus,
          employeeId,
          employeeName: employeeName || null,
          employeePosition: form.employeePosition.trim() || null,
          department: form.department.trim() || null,
          zone: selectedSeat.zone ?? selectedSeat.department ?? null,
          notes: form.notes.trim() || null
        });
        const nextForm = formFromSeat(updated);
        activeSeatSnapshotRef.current = formSnapshot(nextForm);
        setForm(nextForm);
        setInitialForm(nextForm);
        onDirtyChange(false);
        onSeatUpdated(updated, beforeSnapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update assignment.";
        setLocalError(message);
        onError(message);
      }
    });
  }

  function handleResetEdits() {
    setForm(initialForm);
    setLocalError(null);
    onError(null);
  }

  function handleVacateSeat() {
    if (!hasCurrentAssignment || pending) return;

    const confirmed = window.confirm(
      [
        `Vacate ${selectedSeat.label}?`,
        "",
        `This clears ${selectedSeatEmployeeName} from this draft seat.`,
        ...(isDirty ? ["Any unsaved inspector edits will be discarded."] : []),
        "The published viewer map will not change until the draft is published."
      ].join("\n")
    );

    if (!confirmed) return;

    const beforeSnapshot = onBeforeSeatUpdate();

    startTransition(async () => {
      try {
        setLocalError(null);
        onError(null);
        const updated = await updateSeatAction({
          seatId: selectedSeat.id,
          label: selectedSeat.label,
          status: "available",
          employeeId: null,
          employeeName: null,
          employeePosition: null,
          department: null,
          zone: selectedSeat.zone ?? selectedSeat.department ?? null,
          notes: selectedSeat.notes?.trim() || null
        });
        const nextForm = formFromSeat(updated);
        activeSeatSnapshotRef.current = formSnapshot(nextForm);
        setForm(nextForm);
        setInitialForm(nextForm);
        onDirtyChange(false);
        onSeatUpdated(updated, beforeSnapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not vacate seat.";
        setLocalError(message);
        onError(message);
      }
    });
  }

  const fieldClassName = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-500";
  const iconButtonClassName = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100";

  if (collapsed) {
    return (
      <aside className="fixed right-3 top-[76px] z-40">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand inspector"
          title="Expand inspector"
          className="flex min-h-[210px] w-[46px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white/92 px-2 py-3 text-slate-700 shadow-[0_14px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl transition hover:bg-white"
        >
          <span className="rotate-180 text-[11px] font-extrabold uppercase tracking-[0.18em] [writing-mode:vertical-rl]">Inspector</span>
          <span className="mt-2 rotate-180 text-[10px] text-slate-400 [writing-mode:vertical-rl]">{selectedSeat.label}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="fixed inset-x-3 bottom-3 z-40 max-h-[72vh] overflow-auto rounded-lg border border-slate-200 bg-white/95 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/90 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[76px] sm:max-h-[calc(100vh-90px)] sm:w-[360px] sm:max-w-[calc(100vw-2rem)]">
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black leading-none text-slate-950">{selectedSeat.label}</h2>
            {isDirty && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">Unsaved</span>}
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">{canEdit ? "Draft seat details" : "Published read-only details"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{selectedSeat.status}</span>
            <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-800">{selectedSeatZone}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{selectedSeat.is_custom ? "Custom" : "Original"}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onToggleCollapse} aria-label="Collapse inspector" title="Collapse inspector" className={iconButtonClassName}>-</button>
          <button type="button" onClick={onClose} aria-label="Close inspector" title="Close" className={iconButtonClassName}>x</button>
        </div>
      </div>

      {canEdit ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="space-y-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Assignment</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {hasCurrentAssignment ? `Currently assigned to ${selectedSeatEmployeeName}.` : "Open draft seat."}
              </p>
            </div>

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Employee name</span>
              <input
                list="seat-inspector-employee-options"
                value={form.employeeName}
                onChange={handleEmployeeNameChange}
                placeholder="Search or enter employee name"
                className={fieldClassName}
              />
              <span className={["mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide", employeeNameValue ? "bg-orange-50 text-brand-dark ring-1 ring-orange-100" : "bg-slate-100 text-slate-500"].join(" ")}>
                {assignmentStateText}
              </span>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Position</span>
                <input value={form.employeePosition} onChange={event => handleTextChange("employeePosition", event)} className={fieldClassName} />
              </label>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Department</span>
                <select value={form.department} onChange={handleDepartmentChange} className={fieldClassName}>
                  <option value="">No department</option>
                  {departments.map(department => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-4">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Seat state</div>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</span>
              <select value={effectiveStatus} onChange={handleStatusChange} disabled={hasAssignedPerson} className={fieldClassName}>
                {hasAssignedPerson && <option value="assigned">Assigned</option>}
                <option value="available">Available</option>
                <option value="reserved">Reserved</option>
                <option value="unavailable">Unavailable</option>
              </select>
              {hasAssignedPerson && (
                <span className="mt-1 block text-[11px] leading-4 text-slate-500">Assigned seats keep assigned status until the employee is removed.</span>
              )}
            </label>

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Notes</span>
              <textarea value={form.notes} onChange={event => handleTextChange("notes", event)} className={`${fieldClassName} min-h-24`} />
            </label>
          </section>

          {localError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-700">
              {localError}
            </div>
          )}

          <div className="grid gap-2 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="submit" variant="primary" disabled={pending || !isDirty} className="w-full">
                {hasCurrentAssignment ? "Save changes" : "Assign seat"}
              </Button>
              <Button type="button" onClick={handleResetEdits} disabled={pending || !isDirty} className="w-full">
                Discard edits
              </Button>
            </div>
            {hasCurrentAssignment && (
              <Button type="button" variant="danger" onClick={handleVacateSeat} disabled={pending} className="w-full">
                Vacate seat
              </Button>
            )}
          </div>

          <datalist id="seat-inspector-employee-options">
            {sortedEmployees.map(employee => <option key={employee.id} value={employee.full_name} />)}
          </datalist>
        </form>
      ) : (
        <div className="space-y-4 text-sm">
          <section>
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Assignment</div>
            <div className="mt-2 text-base font-black text-slate-950">{selectedSeat.employee?.full_name ?? "Unassigned"}</div>
            <div className="mt-1 text-sm text-slate-500">{selectedSeat.employee?.position ?? "No position"}</div>
            {selectedSeat.employee?.department && <div className="mt-1 text-sm text-slate-500">{selectedSeat.employee.department}</div>}
          </section>
          <section className="border-t border-slate-100 pt-4">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Seat</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-bold uppercase tracking-wide text-slate-400">Status</div>
                <div className="mt-1 font-black text-slate-900">{selectedSeat.status}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="font-bold uppercase tracking-wide text-slate-400">Zone</div>
                <div className="mt-1 font-black text-slate-900">{selectedSeatZone}</div>
              </div>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
