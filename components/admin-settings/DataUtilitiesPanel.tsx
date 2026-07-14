"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listDraftSeatExpectations } from "@/lib/draftConcurrency";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { Employee, SeatWithEmployee } from "@/lib/types";
import { createAssignmentCsvTemplate, exportSeatsToAssignmentCsv, parseAssignmentCsv } from "@/lib/csv";
import { importAssignmentsCsvAction, restoreDraftSnapshotAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

type DataUtilitiesPanelProps = {
  seats: SeatWithEmployee[];
  employees: Employee[];
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

type CsvImportReview = {
  text: string;
  rowCount: number;
  assignedCount: number;
  clearCount: number;
  reservedCount: number;
  unavailableCount: number;
  issues: Array<{ row: number; message: string }>;
};

type JsonRestoreReview = {
  snapshot: DraftSnapshot;
  seatCount: number;
  employeeCount: number;
};

function isDraftSnapshot(value: unknown): value is DraftSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DraftSnapshot>;
  return Array.isArray(candidate.seats) && Array.isArray(candidate.employees);
}

function ReviewCountCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" }) {
  return (
    <div className={["border p-3", tone === "warn" ? "border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)]" : "border-[var(--admin-border)] bg-[var(--admin-surface-muted)]"].join(" ")}>
      <div className={["text-[10px] font-medium", tone === "warn" ? "text-[var(--admin-state-dirty-text)]" : "text-[var(--admin-text-muted)]"].join(" ")}>
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-[var(--admin-text-primary)]">{value.toLocaleString()}</div>
    </div>
  );
}

function UtilityButton({ label, description, tone = "default", disabled, onClick }: { label: string; description: string; tone?: "default" | "danger"; disabled?: boolean; onClick: () => void }) {
  const toneClassName = tone === "danger"
    ? "border-[var(--admin-state-danger-border)] bg-[var(--admin-state-danger-bg)] text-[var(--admin-state-danger-text)] hover:border-[var(--admin-danger)] hover:bg-[var(--admin-danger-soft)]"
    : "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-primary)] hover:border-[var(--admin-border-strong)] hover:bg-[var(--admin-surface-alt)]";
  const descriptionClassName = tone === "danger" ? "text-[var(--admin-state-danger-text)]" : "text-[var(--admin-text-muted)]";

  return (
    <button
      type="button"
      aria-label={`${label}. ${description}`}
      title={description}
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex min-h-[50px] w-full items-center justify-between gap-3 border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50",
        toneClassName
      ].join(" ")}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className={["mt-0.5 block truncate text-xs font-medium", descriptionClassName].join(" ")}>{description}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-sm font-semibold opacity-40">&gt;</span>
    </button>
  );
}

export function DataUtilitiesPanel({ seats, employees }: DataUtilitiesPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const csvReviewDialogFocusRef = useDialogFocus<HTMLElement>();
  const jsonReviewDialogFocusRef = useDialogFocus<HTMLElement>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [csvReview, setCsvReview] = useState<CsvImportReview | null>(null);
  const [jsonReview, setJsonReview] = useState<JsonRestoreReview | null>(null);

  const busy = pending;

  function reportError(caught: unknown, fallback: string) {
    setNotice(null);
    setError(caught instanceof Error ? caught.message : fallback);
  }

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  function closeCsvReview() {
    setCsvReview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeJsonReview() {
    setJsonReview(null);
    if (jsonInputRef.current) jsonInputRef.current.value = "";
  }

  function exportCsv() {
    downloadFile("seat-assignments.csv", exportSeatsToAssignmentCsv(seats), "text/csv;charset=utf-8");
  }

  function downloadTemplate() {
    downloadFile("seat-assignments-template.csv", createAssignmentCsvTemplate(), "text/csv;charset=utf-8");
  }

  function exportJsonBackup() {
    downloadJson("seat-map-export.json", { exportedAt: new Date().toISOString(), seats, employees });
  }

  function importCsv(file: File | undefined) {
    if (!file) return;

    startTransition(async () => {
      try {
        resetMessages();
        const text = await file.text();
        const parsed = parseAssignmentCsv(text);

        const assignedCount = parsed.rows.filter(row => row.employee_name.trim()).length;
        const reservedCount = parsed.rows.filter(row => row.status === "reserved").length;
        const unavailableCount = parsed.rows.filter(row => row.status === "unavailable").length;
        const clearCount = parsed.rows.length - assignedCount;

        setCsvReview({
          text,
          rowCount: parsed.rows.length,
          assignedCount,
          clearCount,
          reservedCount,
          unavailableCount,
          issues: parsed.issues
        });

        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (caught) {
        reportError(caught, "Could not import CSV.");
      }
    });
  }

  function confirmCsvImport() {
    if (!csvReview || csvReview.issues.length > 0) return;
    const review = csvReview;

    startTransition(async () => {
      try {
        resetMessages();
        const payload = await importAssignmentsCsvAction(review.text);
        setCsvReview(null);
        setNotice(`CSV import applied. ${payload.count.toLocaleString()} rows updated in the draft.`);
        router.refresh();
      } catch (caught) {
        setCsvReview(null);
        reportError(caught, "Could not import CSV.");
      }
    });
  }

  function importJson(file: File | undefined) {
    if (!file) return;

    startTransition(async () => {
      try {
        resetMessages();
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;

        if (!isDraftSnapshot(parsed)) {
          throw new Error("JSON backup must include seats and employees arrays.");
        }

        setJsonReview({
          snapshot: parsed,
          seatCount: parsed.seats.length,
          employeeCount: parsed.employees.length
        });

        if (jsonInputRef.current) jsonInputRef.current.value = "";
      } catch (caught) {
        reportError(caught, "Could not import JSON backup.");
      }
    });
  }

  function confirmJsonRestore() {
    if (!jsonReview) return;
    const review = jsonReview;

    startTransition(async () => {
      try {
        resetMessages();
        // Fence on the draft this page loaded (the `seats` prop), so a restore
        // confirmed against stale data cannot silently revert edits another
        // admin committed since the page rendered.
        const result = await restoreDraftSnapshotAction(review.snapshot, listDraftSeatExpectations(seats));
        setJsonReview(null);
        if (!result.ok) {
          setNotice(null);
          setError(`${result.message} This page has been refreshed with the latest draft — review it and try the restore again if it is still what you want.`);
          router.refresh();
          return;
        }
        setNotice("Draft backup restored. The draft layer now matches the imported snapshot.");
        router.refresh();
      } catch (caught) {
        setJsonReview(null);
        reportError(caught, "Could not import JSON backup.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="whitespace-pre-wrap border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] p-3 text-sm font-medium text-[var(--admin-state-error-text)]">
          {error}
        </div>
      )}

      {notice && (
        <div role="status" className="border border-[var(--admin-state-clean-border)] bg-[var(--admin-state-clean-bg)] p-3 text-sm font-semibold text-[var(--admin-state-clean-text)]">
          {notice}
        </div>
      )}

      <section className="border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-[var(--admin-elevation-2-shadow)]">
        <h2 className="text-sm font-semibold text-[var(--admin-text-primary)]">CSV assignments</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--admin-text-muted)]">
          CSV imports update draft assignments only. Marker positions stay fixed.
        </p>
        <div className="mt-3 space-y-2">
          <UtilityButton label="Blank CSV" description="Download assignment template" onClick={downloadTemplate} disabled={busy} />
          <UtilityButton label="Export CSV" description="Download draft assignments" onClick={exportCsv} disabled={busy} />
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={event => importCsv(event.target.files?.[0])} />
          <UtilityButton label="Import CSV" description="Review parsed rows before applying" onClick={() => fileInputRef.current?.click()} disabled={busy} />
        </div>
      </section>

      <section className="border border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] p-4 shadow-[var(--admin-elevation-2-shadow)]">
        <h2 className="text-sm font-semibold text-[var(--admin-state-dirty-text)]">Advanced recovery</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--admin-state-dirty-text)]">
          Full backup and restore. Restoring replaces the entire draft map, so review carefully before confirming.
        </p>
        <div className="mt-3 space-y-2">
          <UtilityButton label="Export JSON backup" description="Download full draft recovery data" onClick={exportJsonBackup} disabled={busy} />
          <input ref={jsonInputRef} type="file" accept=".json,application/json" className="hidden" onChange={event => importJson(event.target.files?.[0])} />
          <UtilityButton label="Restore JSON backup" description="Review a full draft backup before restoring" onClick={() => jsonInputRef.current?.click()} disabled={busy} />
        </div>
      </section>

      {csvReview && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--admin-chrome-bg)]/45 p-3 backdrop-blur-[2px] sm:items-center">
          <section
            ref={csvReviewDialogFocusRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-import-review-title"
            aria-describedby="csv-import-review-description"
            onKeyDown={event => {
              if (event.key === "Escape" && !busy) {
                event.stopPropagation();
                closeCsvReview();
              }
            }}
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-[var(--admin-text-primary)] shadow-[var(--admin-shadow-panel)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-border)] pb-3">
              <div>
                <h2 id="csv-import-review-title" className="text-base font-semibold">
                  {csvReview.issues.length > 0 ? "CSV import has blocking errors" : "Review CSV import"}
                </h2>
                <p id="csv-import-review-description" className="mt-1 text-sm leading-5 text-[var(--admin-text-muted)]">
                  CSV imports update saved draft assignments only. Marker positions and the published viewer map will not change until you publish.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCsvReview}
                disabled={busy}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--admin-text-subtle)] transition hover:bg-[var(--admin-state-neutral-bg)] hover:text-[var(--admin-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                aria-label="Close CSV import review"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4"><path d="m5.5 5.5 9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto py-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <ReviewCountCard label="Rows" value={csvReview.rowCount} tone={csvReview.rowCount > 0 ? "warn" : "default"} />
                <ReviewCountCard label="Assignments" value={csvReview.assignedCount} tone={csvReview.assignedCount > 0 ? "warn" : "default"} />
                <ReviewCountCard label="Cleared" value={csvReview.clearCount} tone={csvReview.clearCount > 0 ? "warn" : "default"} />
                <ReviewCountCard label="Reserved" value={csvReview.reservedCount} tone={csvReview.reservedCount > 0 ? "warn" : "default"} />
                <ReviewCountCard label="Unavailable" value={csvReview.unavailableCount} tone={csvReview.unavailableCount > 0 ? "warn" : "default"} />
              </div>

              {csvReview.issues.length > 0 ? (
                <div className="mt-3 border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] p-3 text-sm text-[var(--admin-state-error-text)]">
                  <div className="font-semibold">Blocking validation errors</div>
                  <p className="mt-1 leading-5">
                    Fix these rows in the CSV, then import the file again. No draft data has changed.
                  </p>
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs font-semibold leading-5">
                    {csvReview.issues.map((issue, index) => (
                      <li key={`${issue.row}-${issue.message}-${index}`}>
                        Row {issue.row}: {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-3 border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] p-3 text-sm font-semibold leading-5 text-[var(--admin-primary-on-soft)]">
                  This applies the CSV to the draft map only. Viewers will not see these changes until you publish.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[var(--admin-border)] pt-3">
              <Button type="button" onClick={closeCsvReview} disabled={busy} className="w-full">
                {csvReview.issues.length > 0 ? "Close" : "Cancel"}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={confirmCsvImport}
                disabled={busy || csvReview.issues.length > 0}
                title={csvReview.issues.length > 0 ? "Fix blocking validation errors before importing" : "Apply CSV updates to the draft map"}
                className="w-full"
              >
                {csvReview.issues.length > 0 ? "Fix CSV first" : "Apply import"}
              </Button>
            </div>
          </section>
        </div>
      )}

      {jsonReview && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--admin-chrome-bg)]/45 p-3 backdrop-blur-[2px] sm:items-center">
          <section
            ref={jsonReviewDialogFocusRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="json-restore-review-title"
            aria-describedby="json-restore-review-description"
            onKeyDown={event => {
              if (event.key === "Escape" && !busy) {
                event.stopPropagation();
                closeJsonReview();
              }
            }}
            className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-[var(--admin-text-primary)] shadow-[var(--admin-shadow-panel)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-border)] pb-3">
              <div>
                <h2 id="json-restore-review-title" className="text-base font-semibold">Review JSON restore</h2>
                <p id="json-restore-review-description" className="mt-1 text-sm leading-5 text-[var(--admin-text-muted)]">
                  JSON restore imports a full draft backup. The published viewer map will not change until you publish.
                </p>
              </div>
              <button
                type="button"
                onClick={closeJsonReview}
                disabled={busy}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--admin-text-subtle)] transition hover:bg-[var(--admin-state-neutral-bg)] hover:text-[var(--admin-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                aria-label="Close JSON restore review"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4"><path d="m5.5 5.5 9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto py-4">
              <div className="grid grid-cols-2 gap-2">
                <ReviewCountCard label="Draft seats" value={jsonReview.seatCount} tone="warn" />
                <ReviewCountCard label="Employees" value={jsonReview.employeeCount} tone="warn" />
              </div>

              <div className="mt-3 border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] p-3 text-sm font-semibold leading-5 text-[var(--admin-primary-on-soft)]">
                This can replace draft assignments, custom seats, notes, and employee details in the draft. Viewers will not see restored data until publish.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[var(--admin-border)] pt-3">
              <Button type="button" onClick={closeJsonReview} disabled={busy} className="w-full">
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmJsonRestore} disabled={busy} className="w-full">
                Restore draft backup
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
