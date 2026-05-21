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

  const fieldClassName = "mt-1 w-full rounded-xl border border-white/70 bg-white/82 px-3 py-2 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] outline-none backdrop-blur focus:border-brand focus:bg-white/95 focus:ring-4 focus:ring-orange-100";
  const iconButtonClassName = "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/60 bg-white/58 text-sm font-black text-slate-600 shadow-sm transition hover:bg-white/88";

  if (collapsed) {
    return (
      <aside className="fixed right-3 top-[84px] z-40">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand inspector"
          title="Expand inspector"
          className="flex min-h-[220px] w-[46px] flex-col items-center justify-center rounded-2xl border border-white/70 bg-white/72 px-2 py-3 shadow-soft backdrop-blur-xl transition hover:bg-white/88"
        >
          <span className="rotate-180 text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-700 [writing-mode:vertical-rl]">Inspector</span>
          <span className="mt-2 rotate-180 text-[10px] text-slate-400 [writing-mode:vertical-rl]">{selectedSeat.label}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="fixed right-3 top-[78px] z-40 max-h-[calc(100vh-90px)] w-[332px] max-w-[calc(100vw-1.5rem)] overflow-auto rounded-3xl border border-white/65 bg-white/72 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/62">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/50 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Seat Assignment</h2>
          <p className="mt-1 text-xs text-slate-500">{selectedSeat.label}{isDirty ? " · Unsaved changes" : ""}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{selectedSeat.status}</span>
            <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-800">{selectedSeatZone}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{selectedSeat.is_custom ? "Custom seat" : "Original seat"}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onToggleCollapse} aria-label="Collapse inspector" title="Collapse inspector" className={iconButtonClassName}>−</button>
          <button type="button" onClick={onClose} aria-label="Close inspector" title="Close" className={iconButtonClassName}>×</button>
        </div>
      </div>

      {canEdit ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="rounded-2xl border border-white/60 bg-white/60 p-3 text-xs leading-5 text-slate-600 backdrop-blur">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
              {hasCurrentAssignment ? "Assigned seat" : "Open seat"}
            </div>
            <p className="mt-1">
              {hasCurrentAssignment
                ? `Update the assignment details or vacate ${selectedSeat.label} from the draft map.`
                : "Choose an employee name to assign this draft seat."}
            </p>
          </div>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Employee Name</span>
            <input
              list="seat-inspector-employee-options"
              value={form.employeeName}
              onChange={handleEmployeeNameChange}
              placeholder="Search or enter employee name"
              className={fieldClassName}
            />
            <span className="mt-1 block text-[11px] leading-4 text-slate-500">
              Existing names are matched automatically. A new name creates an active employee record when saved.
            </span>
          </label>

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

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Notes</span>
            <textarea value={form.notes} onChange={event => handleTextChange("notes", event)} className={`${fieldClassName} min-h-24`} />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</span>
            <select value={effectiveStatus} onChange={handleStatusChange} disabled={hasAssignedPerson} className={fieldClassName}>
              {hasAssignedPerson && <option value="assigned">Assigned</option>}
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="unavailable">Unavailable</option>
            </select>
            <span className="mt-1 block text-[11px] leading-4 text-slate-500">
              Employee assignment automatically sets the status to assigned. Empty seats stay available unless marked reserved or unavailable.
            </span>
          </label>

          {localError && (
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/86 p-2 text-xs font-semibold text-rose-700 backdrop-blur">
              {localError}
            </div>
          )}

          <div className="grid gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={pending || !isDirty} className="w-full">
              {hasCurrentAssignment ? "Update Assignment" : "Assign Seat"}
            </Button>
            {hasCurrentAssignment && (
              <Button type="button" variant="danger" onClick={handleVacateSeat} disabled={pending} className="w-full">
                Vacate Seat
              </Button>
            )}
          </div>

          <datalist id="seat-inspector-employee-options">
            {sortedEmployees.map(employee => <option key={employee.id} value={employee.full_name} />)}
          </datalist>
        </form>
      ) : (
        <div className="rounded-xl border border-white/60 bg-white/68 p-3 text-sm backdrop-blur">
          <div className="font-bold text-slate-900">{selectedSeat.employee?.full_name ?? "Unassigned"}</div>
          <div className="mt-1 text-slate-500">{selectedSeat.employee?.position ?? selectedSeat.zone ?? selectedSeat.department ?? "No position"}</div>
          <div className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{selectedSeat.status}</div>
        </div>
      )}
    </aside>
  );
}
