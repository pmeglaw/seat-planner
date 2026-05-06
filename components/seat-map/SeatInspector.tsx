"use client";

import { useMemo, useState, useTransition } from "react";
import type { FormEvent } from "react";
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
};

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
  onError
}: SeatInspectorProps) {
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [employees]
  );

  if (!seat) return null;

  const selectedSeat = seat;

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        setLocalError(null);
        onError(null);
        const updated = await updateSeatAction({
          seatId: selectedSeat.id,
          label: String(formData.get("label") ?? ""),
          status: String(formData.get("status") ?? "available") as SeatStatus,
          employeeId: String(formData.get("employeeId") ?? "") || null,
          employeeName: String(formData.get("employeeName") ?? "") || null,
          employeePosition: String(formData.get("employeePosition") ?? "") || null,
          department: String(formData.get("department") ?? "") || null,
          notes: String(formData.get("notes") ?? "") || null
        });
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
        onSeatDeleted(selectedSeat.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not delete seat.";
        setLocalError(message);
        onError(message);
      }
    });
  }

  const fieldClassName = "mt-1 w-full rounded-xl border border-white/70 bg-white/82 px-3 py-2 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] outline-none backdrop-blur focus:border-brand focus:bg-white/95 focus:ring-4 focus:ring-orange-100";

  return (
    <aside className="fixed right-3 top-[78px] z-40 max-h-[calc(100vh-90px)] w-[332px] max-w-[calc(100vw-1.5rem)] overflow-auto rounded-3xl border border-white/65 bg-white/72 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/62">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/50 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Seat Inspector</h2>
          <p className="mt-1 text-xs text-slate-500">{selectedSeat.label}</p>
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
            <input name="label" defaultValue={selectedSeat.label} className={fieldClassName} />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Assigned employee</span>
            <select name="employeeId" defaultValue={selectedSeat.employee_id ?? ""} className={fieldClassName}>
              <option value="">Unassigned</option>
              {sortedEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Employee name</span>
            <input name="employeeName" defaultValue={selectedSeat.employee?.full_name ?? ""} className={fieldClassName} />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Position</span>
            <input name="employeePosition" defaultValue={selectedSeat.employee?.position ?? ""} className={fieldClassName} />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Department</span>
            <input name="department" defaultValue={selectedSeat.department ?? selectedSeat.employee?.department ?? ""} className={fieldClassName} />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</span>
            <select name="status" defaultValue={selectedSeat.status} className={fieldClassName}>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="reserved">Reserved</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Notes</span>
            <textarea name="notes" defaultValue={selectedSeat.notes ?? ""} className={`${fieldClassName} min-h-24`} />
          </label>

          {localError && (
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/86 p-2 text-xs font-semibold text-rose-700 backdrop-blur">
              {localError}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={pending}>Save Seat</Button>
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
