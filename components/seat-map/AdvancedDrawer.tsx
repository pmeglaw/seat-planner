"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
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
  onDeleteSelectedSeat: () => void;
  onCsvImported: (payload: { seats: SeatWithEmployee[]; employees: Employee[] }) => void;
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
    "Import CSV into the draft map?",
    "",
    `Rows: ${rowCount}`,
    `Assignments: ${assignedCount}`,
    `Rows clearing assignments: ${clearCount}`,
    `Reserved seats: ${reservedCount}`,
    `Unavailable seats: ${unavailableCount}`,
    "",
    "This updates draft assignments only and will not move markers."
  ].join("\n");
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
  onDeleteSelectedSeat,
  onCsvImported,
  onError
}: AdvancedDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const fieldClassName = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100";
  const sectionClassName = "rounded-2xl border border-slate-200 bg-slate-50 p-3";

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
            <p className="mt-1 text-xs text-slate-500">Draft map tools, import/export, publishing, and protected actions.</p>
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
          <div className={sectionClassName}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">View utilities</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button type="button" onClick={onToggleShowNames} disabled={busy}>
                {showNames ? "Hide Names" : "Show Names"}
              </Button>
              <Button type="button" onClick={onClearSelection} disabled={busy}>Clear Selection</Button>
            </div>
          </div>

          <div className={sectionClassName}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Draft map tools</div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-slate-600">Zone for new custom seats</span>
              <select value={addSeatZone} onChange={event => onAddSeatZoneChange(event.target.value)} className={fieldClassName} disabled={busy || addSeatMode}>
                <option value="all">Generic seat ID</option>
                {zones.map(zone => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </label>
            <div className="mt-3 flex flex-col gap-2">
              {addSeatMode ? (
                <Button type="button" onClick={onCancelAddSeat} disabled={busy}>Cancel Add Seat</Button>
              ) : (
                <Button type="button" variant="primary" onClick={onStartAddSeat} disabled={busy}>Add Custom Seat</Button>
              )}
              <Button type="button" onClick={onToggleMoveSeat} disabled={busy || !selectedSeat}>
                {moveSeatMode ? "Lock Selected Seat" : "Move Selected Seat"}
              </Button>
              <p className="text-xs leading-5 text-slate-500">
                {selectedSeat
                  ? selectedSeatIsCustom
                    ? `Selected custom seat: ${selectedSeat.label}`
                    : `Selected original seat: ${selectedSeat.label} · deletion protected`
                  : "Select a seat first to use move tools."}
              </p>
            </div>
          </div>

          <div className={sectionClassName}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">CSV and backups</div>
            <div className="mt-3 flex flex-col gap-2">
              <Button type="button" onClick={downloadTemplate} disabled={busy}>Download CSV Template</Button>
              <Button type="button" onClick={exportCsv} disabled={busy}>Export Current CSV</Button>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={event => importCsv(event.target.files?.[0])} />
              <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>Import CSV</Button>
              <Button
                type="button"
                onClick={() => downloadJson("seat-map-export.json", { exportedAt: new Date().toISOString(), seats, employees })}
                disabled={busy}
              >
                Export JSON Backup
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">CSV import previews changes first, updates draft assignments only, and never changes marker coordinates.</p>
          </div>

          <div className={sectionClassName}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Management</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Employee, department, and zone edits live on the dedicated management page.</p>
            <Link
              href="/admin/management"
              onClick={onClose}
              className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Open Management
            </Link>
          </div>

          <div className={sectionClassName}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Publishing</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Publishing copies the current draft map to the viewer-facing map after a confirmation summary.</p>
            <Button type="button" className="mt-3 w-full" onClick={onPublish} disabled={busy}>Publish Draft Map</Button>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-rose-600">Destructive actions</div>
            <p className="mt-1 text-xs leading-5 text-rose-700">Only custom draft seats can be deleted. Original seeded seats are protected.</p>
            <Button type="button" variant="danger" className="mt-3 w-full" onClick={deleteSelectedCustomSeat} disabled={busy || !selectedSeatIsCustom}>
              Delete Selected Custom Seat
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
