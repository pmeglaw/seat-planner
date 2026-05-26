"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { createAssignmentCsvTemplate, exportSeatsToAssignmentCsv, parseAssignmentCsv } from "@/lib/csv";
import { importAssignmentsCsvAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";

type AdvancedDrawerProps = {
  open: boolean;
  seats: SeatWithEmployee[];
  employees: Employee[];
  zoneOptions: ZoneOption[];
  selectedSeat: SeatWithEmployee | null;
  addSeatMode: boolean;
  addSeatZone: string;
  moveSeatMode: boolean;
  swapSeatMode: boolean;
  pending: boolean;
  showNames: boolean;
  onClose: () => void;
  onStartAddSeat: () => void;
  onCancelAddSeat: () => void;
  onAddSeatZoneChange: (zone: string) => void;
  onStartSwapSeat: () => void;
  onCancelSwapSeat: () => void;
  onPublish: () => void;
  onToggleMoveSeat: () => void;
  onToggleShowNames: () => void;
  onClearSelection: () => void;
  onDeleteSelectedSeat: () => void;
  onBeforeCsvImport: () => DraftSnapshot;
  onCsvImported: (payload: { seats: SeatWithEmployee[]; employees: Employee[]; count: number }, beforeSnapshot: DraftSnapshot) => void;
  onJsonImported: (snapshot: DraftSnapshot, beforeSnapshot: DraftSnapshot) => Promise<void>;
  onError: (message: string | null) => void;
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

function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? "";
}

function formatCsvIssues(issues: Array<{ row: number; message: string }>) {
  return issues.map(issue => `Row ${issue.row}: ${issue.message}`).join("\n");
}

function buildCsvPreviewMessage(rowCount: number, assignedCount: number, clearCount: number, reservedCount: number, unavailableCount: number) {
  return [
    "Review CSV import before applying?",
    "",
    `Rows: ${rowCount}`,
    `Assignments: ${assignedCount}`,
    `Rows clearing assignments: ${clearCount}`,
    `Reserved seats: ${reservedCount}`,
    `Unavailable seats: ${unavailableCount}`,
    "",
    "This updates draft assignments only.",
    "Marker positions and the published viewer map will not change.",
    "Undo is available after import until the next publish."
  ].join("\n");
}

function isDraftSnapshot(value: unknown): value is DraftSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DraftSnapshot>;
  return Array.isArray(candidate.seats) && Array.isArray(candidate.employees);
}

export function AdvancedDrawer({
  open,
  seats,
  employees,
  zoneOptions,
  selectedSeat,
  addSeatMode,
  addSeatZone,
  moveSeatMode,
  swapSeatMode,
  pending,
  showNames,
  onClose,
  onStartAddSeat,
  onCancelAddSeat,
  onAddSeatZoneChange,
  onStartSwapSeat,
  onCancelSwapSeat,
  onPublish,
  onToggleMoveSeat,
  onToggleShowNames,
  onClearSelection,
  onDeleteSelectedSeat,
  onBeforeCsvImport,
  onCsvImported,
  onJsonImported,
  onError
}: AdvancedDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localPending, startTransition] = useTransition();

  const zones = useMemo(() => {
    const values = new Set<string>();
    zoneOptions.filter(item => item.active).forEach(item => values.add(item.name));
    seats.forEach(seat => {
      const zone = getSeatZone(seat);
      if (zone) values.add(zone);
    });
    return Array.from(values).sort();
  }, [seats, zoneOptions]);

  const busy = pending || localPending;
  const selectedSeatIsCustom = Boolean(selectedSeat?.is_custom);
  const fieldClassName = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-orange-100";
  const sectionClassName = "border-t border-slate-100 pt-4";

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

  function deleteSelectedCustomSeat() {
    if (!selectedSeat) {
      reportError(new Error("Select a custom seat first."), "Select a custom seat first.");
      return;
    }

    if (!selectedSeat.is_custom) {
      reportError(new Error(`${selectedSeat.label} is an original seat and cannot be deleted.`), "Original seats are protected.");
      return;
    }

    onDeleteSelectedSeat();
  }

  function exportCsv() {
    downloadFile("seat-assignments.csv", exportSeatsToAssignmentCsv(seats), "text/csv;charset=utf-8");
  }

  function downloadTemplate() {
    downloadFile("seat-assignments-template.csv", createAssignmentCsvTemplate(), "text/csv;charset=utf-8");
  }

  function importCsv(file: File | undefined) {
    if (!file) return;

    startTransition(async () => {
      try {
        resetError();
        const text = await file.text();
        const parsed = parseAssignmentCsv(text);

        if (parsed.issues.length > 0) {
          throw new Error(formatCsvIssues(parsed.issues));
        }

        const assignedCount = parsed.rows.filter(row => row.employee_name.trim()).length;
        const reservedCount = parsed.rows.filter(row => row.status === "reserved").length;
        const unavailableCount = parsed.rows.filter(row => row.status === "unavailable").length;
        const clearCount = parsed.rows.length - assignedCount;
        const confirmed = window.confirm(buildCsvPreviewMessage(parsed.rows.length, assignedCount, clearCount, reservedCount, unavailableCount));
        if (!confirmed) return;

        const beforeSnapshot = onBeforeCsvImport();
        const payload = await importAssignmentsCsvAction(text);
        onCsvImported({ seats: payload.seats, employees: payload.employees, count: payload.count }, beforeSnapshot);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        reportError(error, "Could not import CSV.");
      }
    });
  }

  function importJson(file: File | undefined) {
    if (!file) return;

    startTransition(async () => {
      try {
        resetError();
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;

        if (!isDraftSnapshot(parsed)) {
          throw new Error("JSON backup must include seats and employees arrays.");
        }

        const confirmed = window.confirm(
          [
            "Import this JSON backup into the draft map?",
            "",
            `Seats: ${parsed.seats.length}`,
            `Employees: ${parsed.employees.length}`,
            "",
            "This restores draft data only.",
            "The published viewer map will not change until publish.",
            "Undo is available after import until the next publish."
          ].join("\n")
        );
        if (!confirmed) return;

        const beforeSnapshot = onBeforeCsvImport();
        await onJsonImported(parsed, beforeSnapshot);
        if (jsonInputRef.current) jsonInputRef.current.value = "";
      } catch (error) {
        reportError(error, "Could not import JSON backup.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close advanced drawer"
        className="fixed inset-0 z-40 cursor-default bg-slate-950/22 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="advanced-drawer-title"
        className="fixed inset-x-3 bottom-3 z-50 max-h-[82vh] overflow-auto rounded-lg border border-slate-200 bg-white/95 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.2)] backdrop-blur sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[66px] sm:max-h-[calc(100vh-80px)] sm:w-[420px] sm:max-w-[calc(100vw-2rem)]"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="advanced-drawer-title" className="text-base font-black text-slate-950">Tools</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Common draft actions first. Heavier changes stay grouped below.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>

        {localError && (
          <div className="mb-3 whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-700">
            {localError}
          </div>
        )}

        <div className="space-y-4">
          <section className="space-y-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Quick actions</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {selectedSeat ? `Selected: ${selectedSeat.label}` : "Select a source seat on the map for seat-specific tools."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={addSeatMode ? "secondary" : "primary"} onClick={addSeatMode ? onCancelAddSeat : onStartAddSeat} disabled={busy}>
                {addSeatMode ? "Cancel Add Seat" : "Add Seat"}
              </Button>
              <Button type="button" onClick={swapSeatMode ? onCancelSwapSeat : onStartSwapSeat} disabled={busy}>
                {swapSeatMode ? "Cancel Swap" : "Swap Seats"}
              </Button>
              <Button
                type="button"
                onClick={() => downloadJson("seat-map-export.json", { exportedAt: new Date().toISOString(), seats, employees })}
                disabled={busy}
              >
                Export JSON
              </Button>
              <input ref={jsonInputRef} type="file" accept=".json,application/json" className="hidden" onChange={event => importJson(event.target.files?.[0])} />
              <Button type="button" onClick={() => jsonInputRef.current?.click()} disabled={busy}>
                Import JSON
              </Button>
            </div>
          </section>

          <section className={sectionClassName}>
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Layout tools</div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-slate-600">Zone for new custom seats</span>
              <select value={addSeatZone} onChange={event => onAddSeatZoneChange(event.target.value)} className={fieldClassName} disabled={busy || addSeatMode}>
                <option value="all">Generic seat ID</option>
                {zones.map(zone => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button type="button" onClick={onToggleMoveSeat} disabled={busy || !selectedSeat}>
                {moveSeatMode ? "Lock Seat" : "Move Seat"}
              </Button>
              <Button type="button" onClick={onToggleShowNames} disabled={busy}>
                {showNames ? "Hide Names" : "Show Names"}
              </Button>
              <Button type="button" onClick={onClearSelection} disabled={busy}>Clear Selection</Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {selectedSeat
                ? selectedSeatIsCustom
                  ? `Selected custom seat: ${selectedSeat.label}`
                  : `Selected original seat: ${selectedSeat.label} · deletion protected`
                : "Select a seat first to use move or swap."}
            </p>
          </section>

          <section className={sectionClassName}>
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">CSV and backups</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">CSV imports update draft assignments only. Marker positions stay fixed.</p>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" onClick={downloadTemplate} disabled={busy}>Blank CSV</Button>
              <Button type="button" onClick={exportCsv} disabled={busy}>Export CSV</Button>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={event => importCsv(event.target.files?.[0])} />
              <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>Import CSV</Button>
            </div>
          </section>

          <section className={sectionClassName}>
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Management</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Employee, department, and zone edits live on the dedicated management page.</p>
            <Link
              href="/admin/management"
              onClick={onClose}
              className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Open Management
            </Link>
          </section>

          <section className={sectionClassName}>
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Publishing</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Publishing copies the current draft map to the viewer-facing map after a confirmation summary.</p>
            <Button type="button" className="mt-3 w-full" onClick={onPublish} disabled={busy}>Publish Draft Map</Button>
          </section>

          <section className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <div className="text-[11px] font-black uppercase tracking-wide text-rose-600">Destructive actions</div>
            <p className="mt-1 text-xs leading-5 text-rose-700">Only custom draft seats can be deleted. Original seeded seats are protected.</p>
            <Button type="button" variant="danger" className="mt-3 w-full" onClick={deleteSelectedCustomSeat} disabled={busy || !selectedSeatIsCustom}>
              Delete Selected Custom Seat
            </Button>
          </section>
        </div>
      </aside>
    </>
  );
}
