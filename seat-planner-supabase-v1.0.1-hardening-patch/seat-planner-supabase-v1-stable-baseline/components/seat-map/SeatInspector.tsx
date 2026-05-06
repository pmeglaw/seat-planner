"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { Employee, SeatStatus, SeatWithEmployee } from "@/lib/types";
import { deleteSeatAction, updateSeatAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";

type SeatInspectorProps = {
  seat: SeatWithEmployee | null;
  employees: Employee[];
  canEdit: boolean;
  moveSeatMode: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  onToggleMoveMode: () => void;
  onSeatUpdated: (seat: SeatWithEmployee) => void;
  onSeatDeleted: (seatId: string) => void;
  onError: (message: string | null) => void;
  onDirtyChange: (dirty: boolean) => void;
};

type SeatInspectorForm = {
  label: string;
  employeeId: string;
  employeeName: string;
  employeePosition: string;
  department: string;
  status: SeatStatus;
  notes: string;
};

const emptyForm: SeatInspectorForm = {
  label: "",
  employeeId: "",
  employeeName: "",
  employeePosition: "",
  department: "",
  status: "available",
  notes: ""
};

function formFromSeat(seat: SeatWithEmployee): SeatInspectorForm {
  return {
    label: seat.label,
    employeeId: seat.employee_id ?? "",
    employeeName: seat.employee?.full_name ?? "",
    employeePosition: seat.employee?.position ?? "",
    department: seat.department ?? seat.employee?.department ?? "",
    status: seat.status,
    notes: seat.notes ?? ""
  };
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
  canEdit,
  moveSeatMode,
  collapsed,
  onClose,
  onToggleCollapse,
  onToggleMoveMode,
  onSeatUpdated,
  onSeatDeleted,
  onError,
  onDirtyChange
}: SeatInspectorProps) {
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const [form, setForm] = useState<SeatInspectorForm>(emptyForm);
  const [initialForm, setInitialForm] = useState<SeatInspectorForm>(emptyForm);
  const activeSeatIdRef = useRef<string | null>(null);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [employees]
  );

  const isDirty = useMemo(() => !formsEqual(form, initialForm), [form, initialForm]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!seat) {
      activeSeatIdRef.current = null;
      setForm(emptyForm);
      setInitialForm(emptyForm);
      setLocalError(null);
      onDirtyChange(false);
      return;
    }

    if (activeSeatIdRef.current !== seat.id) {
      const nextForm = formFromSeat(seat);
      activeSeatIdRef.current = seat.id;
      setForm(nextForm);
      setInitialForm(nextForm);
      setLocalError(null);
      onError(null);
      onDirtyChange(false);
    }
  }, [seat, onDirtyChange, onError]);

  if (!seat) return null;

  const selectedSeat = seat;

  function updateField<K extends keyof SeatInspectorForm>(field: K, value: SeatInspectorForm[K]) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function handleEmployeeSelect(event: ChangeEvent<HTMLSelectElement>) {
    const employeeId = event.target.value;
    const employee = sortedEmployees.find(emp => emp.id === employeeId) ?? null;

    if (!employee) {
      setForm(current => ({
        ...current,
        employeeId: "",
        employeeName: "",
        employeePosition: "",
        status: current.status === "assigned" ? "available" : current.status
      }));
      return;
    }

    setForm(current => ({
      ...current,
      employeeId: employee.id,
      employeeName: employee.full_name,
      employeePosition: employee.position ?? "",
      department: employee.department ?? current.department,
      status: "assigned"
    }));
  }

  function handleTextChange(
    field: keyof Omit<SeatInspectorForm, "status">,
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    updateField(field, event.target.value);
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    updateField("status", event.target.value as SeatStatus);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (form.status === "assigned" && !form.employeeId && !form.employeeName.trim()) {
      const message = "Assigned seats require an employee name or selected employee.";
      setLocalError(message);
      onError(message);
      return;
    }

    startTransition(async () => {
      try {
        setLocalError(null);
        onError(null);
        const updated = await updateSeatAction({
          seatId: selectedSeat.id,
          label: form.label,
          status: form.status,
          employeeId: form.employeeId || null,
          employeeName: form.employeeName.trim() || null,
          employeePosition: form.employeePosition.trim() || null,
          department: form.department.trim() || null,
          notes: form.notes.trim() || null
        });
        const nextForm = formFromSeat(updated);
        setForm(nextForm);
        setInitialForm(nextForm);
        onDirtyChange(false);
        onSeatUpdated(updated);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save seat.";
        setLocalError(message);
        onError(message);
      }
    });
  }

  function handleDelete() {
    const confirmed = window.confirm(`Delete ${selectedSeat.label}? This removes the draft seat marker.`);
    if (!confirmed) return;

    startTransition(async () => {
      try {
        setLocalError(null);
        onError(null);
        await deleteSeatAction(selectedSeat.id);
        onDirtyChange(false);
        onSeatDeleted(selectedSeat.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not delete seat.";
        setLocalError(message);
        onError(message);
      }
    });
  }

  const fieldClassName = "mt-1 w-full rounded-xl border border-white/70 bg-white/82 px-3 py-2 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] outline-none backdrop-blur focus:border-brand focus:bg-white/95 focus:ring-4 focus:ring-orange-100";

  if (collapsed) {
    return (
      <aside className="fixed right-3 top-[84px] z-40">
        <button
          type="button"
          onClick={onToggleCollapse}
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
          <h2 className="text-base font-bold text-slate-900">Seat Inspector</h2>
          <p className="mt-1 text-xs text-slate-500">{selectedSeat.label}{isDirty ? " · Unsaved changes" : ""}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onToggleCollapse} className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-white/70">Collapse</button>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-white/70">Close</button>
        </div>
      </div>

      {canEdit ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Seat label</span>
            <input value={form.label} onChange={event => handleTextChange("label", event)} className={fieldClassName} />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Assigned employee</span>
            <select value={form.employeeId} onChange={handleEmployeeSelect} className={fieldClassName}>
              <option value="">Unassigned</option>
              {sortedEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Employee name</span>
            <input value={form.employeeName} onChange={event => handleTextChange("employeeName", event)} className={fieldClassName} />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Position</span>
            <input value={form.employeePosition} onChange={event => handleTextChange("employeePosition", event)} className={fieldClassName} />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Department</span>
            <input value={form.department} onChange={event => handleTextChange("department", event)} className={fieldClassName} />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</span>
            <select value={form.status} onChange={handleStatusChange} className={fieldClassName}>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="reserved">Reserved</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Notes</span>
            <textarea value={form.notes} onChange={event => handleTextChange("notes", event)} className={`${fieldClassName} min-h-24`} />
          </label>

          {localError && (
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/86 p-2 text-xs font-semibold text-rose-700 backdrop-blur">
              {localError}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={pending || !isDirty}>Save Seat</Button>
            <Button type="button" onClick={onToggleMoveMode} disabled={pending}>
              {moveSeatMode ? "Lock Seat" : "Move Seat"}
            </Button>
            <Button type="button" variant="danger" onClick={handleDelete} disabled={pending}>Delete</Button>
          </div>

          {moveSeatMode && (
            <p className="rounded-xl border border-orange-100 bg-orange-50/86 p-2 text-xs font-semibold text-orange-800 backdrop-blur">
              Move Seat mode is active. Drag this selected marker, then release to save.
            </p>
          )}
        </form>
      ) : (
        <div className="rounded-xl border border-white/60 bg-white/68 p-3 text-sm backdrop-blur">
          <div className="font-bold text-slate-900">{selectedSeat.employee?.full_name ?? "Unassigned"}</div>
          <div className="mt-1 text-slate-500">{selectedSeat.employee?.position ?? selectedSeat.department ?? "No position"}</div>
          <div className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{selectedSeat.status}</div>
        </div>
      )}
    </aside>
  );
}
