"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { Employee, SeatWithEmployee } from "@/lib/types";
import { createAssignmentCsvTemplate, exportSeatsToAssignmentCsv, parseAssignmentCsv } from "@/lib/csv";
import { importAssignmentsCsvAction } from "@/app/actions";

type AdvancedDrawerProps = {
  open: boolean;
  seats: SeatWithEmployee[];
  employees: Employee[];
  selectedSeat: SeatWithEmployee | null;
  addSeatMode: boolean;
  moveSeatMode: boolean;
  swapSeatMode: boolean;
  pending: boolean;
  onClose: () => void;
  onStartAddSeat: () => void;
  onCancelAddSeat: () => void;
  onStartSwapSeat: () => void;
  onCancelSwapSeat: () => void;
  onPublish: () => void;
  onToggleMoveSeat: () => void;
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

type CommandButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  description: string;
  tone?: "default" | "active" | "danger";
};

function CommandButton({ label, description, tone = "default", className = "", ...props }: CommandButtonProps) {
  const toneClassName = tone === "active"
    ? "border-orange-100 bg-orange-50/80 text-brand-dark hover:border-orange-200 hover:bg-orange-100/80"
    : tone === "danger"
      ? "border-transparent bg-rose-50/70 text-rose-700 hover:border-rose-100 hover:bg-rose-100/70"
      : "border-transparent bg-slate-50/80 text-slate-900 hover:border-orange-100 hover:bg-white";
  const descriptionClassName = tone === "danger" ? "text-rose-600" : tone === "active" ? "text-brand-dark/70" : "text-slate-500";

  return (
    <button
      type="button"
      className={[
        "flex min-h-[50px] w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition active:scale-[0.985] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-50",
        toneClassName,
        className
      ].join(" ")}
      {...props}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-extrabold">{label}</span>
        <span className={["mt-0.5 block truncate text-xs font-medium", descriptionClassName].join(" ")}>{description}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-sm font-black opacity-40">&gt;</span>
    </button>
  );
}

function ToolGroup({ title, description, children, defaultOpen = false }: { title: string; description: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details {...(defaultOpen ? { open: true } : {})} className="group rounded-xl border border-transparent bg-slate-50/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-left transition active:scale-[0.99] marker:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-extrabold text-slate-900">{title}</span>
          <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{description}</span>
        </span>
        <span className="shrink-0 text-xs font-black text-slate-400 transition group-open:rotate-90">&gt;</span>
      </summary>
      <div className="space-y-2 border-t border-white/80 px-3 pb-3 pt-2">
        {children}
      </div>
    </details>
  );
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
  selectedSeat,
  addSeatMode,
  moveSeatMode,
  swapSeatMode,
  pending,
  onClose,
  onStartAddSeat,
  onCancelAddSeat,
  onStartSwapSeat,
  onCancelSwapSeat,
  onPublish,
  onToggleMoveSeat,
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

  const busy = pending || localPending;
  const selectedSeatIsCustom = Boolean(selectedSeat?.is_custom);

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
        className="fixed inset-x-3 bottom-3 z-50 flex max-h-[82vh] flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/95 p-3 shadow-[0_24px_70px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[66px] sm:max-h-[calc(100vh-80px)] sm:w-[360px] sm:max-w-[calc(100vw-2rem)]"
      >
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 id="advanced-drawer-title" className="text-base font-black text-slate-950">Map tools</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Map actions, seat tools, and publishing.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-slate-100 active:scale-95">
            Close
          </button>
        </div>

        {localError && (
          <div className="mb-3 whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-700">
            {localError}
          </div>
        )}

        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain pr-1">
          <section className="space-y-2">
            <div>
              <div className="text-sm font-extrabold text-slate-900">Quick actions</div>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Common draft map commands</p>
            </div>
            <div className="space-y-2">
              <CommandButton
                label={addSeatMode ? "Cancel Add Seat" : "Add Seat"}
                description={addSeatMode ? "Return to normal map selection" : "Place a new custom draft marker"}
                tone="active"
                onClick={addSeatMode ? onCancelAddSeat : onStartAddSeat}
                disabled={busy}
              />
              <CommandButton
                label={swapSeatMode ? "Cancel Swap" : "Swap Seats"}
                description={swapSeatMode ? "Leave swap mode without changes" : "Select source, target, then confirm"}
                tone={swapSeatMode ? "active" : "default"}
                onClick={swapSeatMode ? onCancelSwapSeat : onStartSwapSeat}
                disabled={busy}
              />
              <CommandButton
                label={moveSeatMode ? "Lock Seat" : "Move Seat"}
                description={selectedSeat ? `Drag ${selectedSeat.label} on the map` : "Select a seat first"}
                tone={moveSeatMode ? "active" : "default"}
                onClick={onToggleMoveSeat}
                disabled={busy || !selectedSeat}
              />
              <CommandButton
                label="Clear Selection"
                description={selectedSeat ? `Deselect ${selectedSeat.label}` : "Select a seat first"}
                onClick={onClearSelection}
                disabled={busy || !selectedSeat}
              />
            </div>
          </section>

          <ToolGroup title="Layout tools" description="Custom seat placement">
            <p className="text-xs leading-5 text-slate-500">
              {selectedSeat
                ? selectedSeatIsCustom
                  ? `Custom seat ${selectedSeat.label} can be moved or deleted.`
                  : `Original seat ${selectedSeat.label} is deletion protected.`
                : "Add Seat assigns the zone and next label automatically when you click inside a seating zone."}
            </p>
          </ToolGroup>

          <ToolGroup title="CSV and backups" description="Draft import and export">
            <div className="space-y-2">
              <CommandButton label="Blank CSV" description="Download assignment template" onClick={downloadTemplate} disabled={busy} />
              <CommandButton label="Export CSV" description="Download draft assignments" onClick={exportCsv} disabled={busy} />
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={event => importCsv(event.target.files?.[0])} />
              <CommandButton label="Import CSV" description="Apply assignment updates with undo" onClick={() => fileInputRef.current?.click()} disabled={busy} />
            </div>
            <p className="text-xs leading-5 text-slate-500">CSV imports update draft assignments only. Marker positions stay fixed.</p>
          </ToolGroup>

          <ToolGroup title="Management" description="Directory, departments, and zones">
            <Link
              href="/admin/management"
              onClick={onClose}
              className="flex min-h-[58px] w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-left text-slate-900 shadow-sm transition hover:border-orange-200 hover:bg-orange-50/50 active:scale-[0.985] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold">Open Management</span>
                <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">Edit people, departments, and zones</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-sm font-black opacity-40">&gt;</span>
            </Link>
          </ToolGroup>

          <ToolGroup title="Publishing" description="Send draft map to viewers">
            <p className="text-xs leading-5 text-slate-500">Publishing copies the current draft map to the viewer-facing map after a confirmation summary.</p>
            <CommandButton label="Publish Draft Map" description="Copy draft seating to the viewer map" tone="active" onClick={onPublish} disabled={busy} />
          </ToolGroup>

          <ToolGroup title="Advanced recovery" description="Developer backup restore">
            <div className="space-y-2">
              <CommandButton
                label="Export JSON Backup"
                description="Download full draft recovery data"
                onClick={() => downloadJson("seat-map-export.json", { exportedAt: new Date().toISOString(), seats, employees })}
                disabled={busy}
              />
              <input ref={jsonInputRef} type="file" accept=".json,application/json" className="hidden" onChange={event => importJson(event.target.files?.[0])} />
              <CommandButton
                label="Import JSON Backup"
                description="Restore full draft data with undo"
                onClick={() => jsonInputRef.current?.click()}
                disabled={busy}
              />
            </div>
          </ToolGroup>

          <ToolGroup title="Destructive actions" description="Custom seat deletion only">
            <p className="text-xs leading-5 text-slate-500">Only custom draft seats can be deleted. Original seeded seats are protected.</p>
            <CommandButton
              label="Delete Selected Custom Seat"
              description={selectedSeatIsCustom ? `Remove ${selectedSeat?.label} from draft` : "Select a custom seat first"}
              tone="danger"
              onClick={deleteSelectedCustomSeat}
              disabled={busy || !selectedSeatIsCustom}
            />
          </ToolGroup>
        </div>
      </aside>
    </>
  );
}
