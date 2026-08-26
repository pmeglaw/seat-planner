"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clientActionErrorMessage } from "@/lib/clientActionError";
import { listActiveEmployeeExpectations, listDraftSeatExpectations, type DraftSeatExpectation, type EmployeeExpectation } from "@/lib/draftConcurrency";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { Employee, SeatWithEmployee } from "@/lib/types";
import { createAssignmentCsvTemplate, exportSeatsToAssignmentCsv, parseAssignmentCsv } from "@/lib/csv";
import { importAssignmentsCsvAction, resetDraftToPublishedAction, restoreDraftSnapshotAction } from "@/app/actions";
import { buildPublishChangeSummary } from "@/lib/publishSummary";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/CloseIcon";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

type DataUtilitiesPanelProps = {
  seats: SeatWithEmployee[];
  publishedSeats: SeatWithEmployee[];
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
  /**
   * Concurrency fence: the draft as this page held it when the CSV was parsed
   * for review — the state the admin is actually looking at while confirming.
   */
  expectedSeats: DraftSeatExpectation[];
  /**
   * Employee-directory fence: the ACTIVE directory as held at parse time —
   * the import overwrites matched employee rows, so people data is reviewed
   * state too (20260806140000, issue #328).
   */
  expectedEmployees: EmployeeExpectation[];
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
    <div className={["border p-3", tone === "warn" ? "border-[var(--sp-editor-dirty-border)] bg-[var(--sp-editor-dirty-bg)]" : "border-[var(--sp-border-subtle)] bg-[var(--sp-background)]"].join(" ")}>
      <div className={["text-xs font-medium", tone === "warn" ? "text-[var(--sp-editor-dirty-text)]" : "text-[var(--sp-text-helper)]"].join(" ")}>
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-[var(--sp-text-primary)]">{value.toLocaleString()}</div>
    </div>
  );
}

// v12 (#14): the utility rows became tiles. The affordance mark still carries
// the honesty rule from the 2026-07-16 critique — a download arrow means the
// file lands immediately, the ↗ means a review dialog opens first.
function UtilityTile({ label, description, tone = "default", affordance = "review", wide = false, disabled, onClick }: { label: string; description: string; tone?: "default" | "danger"; affordance?: "download" | "review"; wide?: boolean; disabled?: boolean; onClick: () => void }) {
  const isDanger = tone === "danger";

  return (
    <button
      type="button"
      aria-label={`${label}. ${description}`}
      title={description}
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative min-h-[96px] p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus)] disabled:cursor-not-allowed disabled:opacity-50",
        wide ? "sm:col-span-full" : "",
        isDanger
          ? "bg-[var(--sp-status-danger-surface)] hover:bg-[var(--sp-status-danger-surface-hover)]"
          : "bg-[var(--sp-layer-01)] hover:bg-[var(--sp-layer-hover)]"
      ].join(" ")}
    >
      <span className={["block text-[13.5px] font-semibold", isDanger ? "text-[var(--sp-status-danger-strong)]" : "text-[var(--sp-text-primary)]"].join(" ")}>{label}</span>
      <span className={["mt-1 block max-w-[38ch] pr-6 text-[12.5px] leading-5", isDanger ? "text-[var(--sp-status-danger-text)]" : "text-[var(--sp-text-helper)]"].join(" ")}>{description}</span>
      <span aria-hidden="true" className={["absolute bottom-3 right-3", isDanger ? "text-[var(--sp-status-danger-strong)]" : "text-[var(--sp-status-neutral-mark)]"].join(" ")}>
        {affordance === "download" ? (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M10 3v9M6.5 9 10 12.5 13.5 9M4 16.5h12" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M6 14 14 6M8 6h6v6" />
          </svg>
        )}
      </span>
    </button>
  );
}

export function DataUtilitiesPanel({ seats, publishedSeats, employees }: DataUtilitiesPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const csvReviewDialogFocusRef = useDialogFocus<HTMLElement>();
  const jsonReviewDialogFocusRef = useDialogFocus<HTMLElement>();
  const resetReviewDialogFocusRef = useDialogFocus<HTMLElement>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [csvReview, setCsvReview] = useState<CsvImportReview | null>(null);
  const [jsonReview, setJsonReview] = useState<JsonRestoreReview | null>(null);
  const [resetReviewOpen, setResetReviewOpen] = useState(false);
  // Seat-only diff for the reset review: employees deliberately excluded —
  // reset never touches the directory (owner-confirmed people contract).
  const resetSummary = buildPublishChangeSummary(seats, publishedSeats);

  const busy = pending;

  function reportError(caught: unknown, fallback: string) {
    setNotice(null);
    setError(clientActionErrorMessage(caught, fallback));
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

  function exportDraftSnapshot() {
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
          // Fences captured at parse time: confirming applies the CSV against
          // the draft AND the employee directory the admin reviewed, not
          // whatever either becomes while the review sits open.
          expectedSeats: listDraftSeatExpectations(seats),
          expectedEmployees: listActiveEmployeeExpectations(employees),
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
        const payload = await importAssignmentsCsvAction(review.text, review.expectedSeats, review.expectedEmployees);
        setCsvReview(null);
        if (!payload.ok) {
          setNotice(null);
          setError(`${payload.message} This page has been refreshed with the latest draft — review it and try the import again if it is still what you want.`);
          router.refresh();
          return;
        }
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

        // Returned, not thrown: this is CLIENT-side validation with written
        // copy — routing it through the catch would let the digest-safe
        // fallback (clientActionErrorMessage) swallow the specific message.
        if (!isDraftSnapshot(parsed)) {
          setNotice(null);
          setError("Draft snapshot must include seats and employees arrays.");
          return;
        }

        setJsonReview({
          snapshot: parsed,
          seatCount: parsed.seats.length,
          employeeCount: parsed.employees.length
        });

        if (jsonInputRef.current) jsonInputRef.current.value = "";
      } catch (caught) {
        reportError(caught, "Could not import the draft snapshot.");
      }
    });
  }

  function openResetReview() {
    resetMessages();
    if (!resetSummary.hasChanges) {
      setNotice("The draft already matches the published map — nothing to reset.");
      return;
    }
    setResetReviewOpen(true);
  }

  function confirmResetToPublished() {
    startTransition(async () => {
      try {
        resetMessages();
        // Fence on the draft this page loaded, same as JSON restore: a reset
        // confirmed against stale data cannot silently erase another admin's
        // newer edits.
        const result = await resetDraftToPublishedAction(listDraftSeatExpectations(seats));
        setResetReviewOpen(false);
        if (!result.ok) {
          setNotice(null);
          setError(`${result.message} This page has been refreshed with the latest draft — review it and try the reset again if it is still what you want.`);
          router.refresh();
          return;
        }
        setNotice("Draft reset to the published map. Seat changes were discarded; people edits in Management were kept.");
        router.refresh();
      } catch (caught) {
        setResetReviewOpen(false);
        reportError(caught, "Could not reset the draft to the published map.");
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
        reportError(caught, "Could not import the draft snapshot.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="whitespace-pre-wrap border border-[var(--sp-editor-error-border)] bg-[var(--sp-editor-error-bg)] p-3 text-sm font-medium text-[var(--sp-editor-error-text)]">
          {error}
        </div>
      )}

      {notice && (
        <div role="status" className="border border-[var(--sp-editor-clean-border)] bg-[var(--sp-editor-clean-bg)] p-3 text-sm font-semibold text-[var(--sp-editor-clean-text)]">
          {notice}
        </div>
      )}

      {/* White fill, not an amber wash: this is standing guidance, and a tinted
          banner would read as an active warning every time the page loads. */}
      <div className="flex items-start gap-2.5 border-l-[3px] border-[var(--sp-status-pending-strong)] bg-[var(--sp-layer-01)] px-3.5 py-3 shadow-[0_1px_2px_rgba(22,22,22,0.06)]">
        <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--sp-status-pending-mark)] text-xs font-bold leading-none text-[var(--sp-text-primary)]">!</span>
        <p className="text-[12.5px] leading-5 text-[var(--sp-text-primary)]">
          <strong className="font-semibold">The published map is never touched until you publish.</strong>{" "}
          Restores replace the entire draft — review before confirming.
        </p>
      </div>

      <section>
        {/* Uppercased in CSS, not in the string: the source keeps the honest
            scope names the INFRA-02 guardrail (#277) pinned. */}
        <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-[var(--sp-text-secondary)]">CSV assignments</h2>
        <p className="mb-2 mt-1 text-xs leading-5 text-[var(--sp-text-helper)]">
          Imports update draft assignments; seat positions don&apos;t move.
        </p>
        <div className="grid gap-px border border-[var(--sp-border-subtle)] bg-[var(--sp-border-subtle)] [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          <UtilityTile label="Download CSV template" description="A blank assignment sheet to fill in" affordance="download" onClick={downloadTemplate} disabled={busy} />
          <UtilityTile label="Export CSV" description="Download draft assignments" affordance="download" onClick={exportCsv} disabled={busy} />
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={event => importCsv(event.target.files?.[0])} />
          <UtilityTile label="Import CSV" description="Review parsed rows before applying — nothing writes until you confirm" wide onClick={() => fileInputRef.current?.click()} disabled={busy} />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-[var(--sp-status-danger-strong)]">Draft working-copy snapshots</h2>
        <p className="mb-2 mt-1 text-xs leading-5 text-[var(--sp-text-helper)]">
          Draft seats and employees only. Restoring replaces the entire draft map, so review carefully before confirming.
          These snapshots are not a database backup: they do not include the published map, publish history, or user accounts.
        </p>
        <div className="grid gap-px border border-[var(--sp-border-subtle)] bg-[var(--sp-border-subtle)] [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          <UtilityTile label="Export draft snapshot" description="Download draft seats and employees as JSON" affordance="download" onClick={exportDraftSnapshot} disabled={busy} />
          <input ref={jsonInputRef} type="file" accept=".json,application/json" className="hidden" onChange={event => importJson(event.target.files?.[0])} />
          <UtilityTile label="Restore draft snapshot" description="Review a draft snapshot before restoring" onClick={() => jsonInputRef.current?.click()} disabled={busy} />
          <UtilityTile label="Reset draft to published" description="Discard every draft seat change; people edits are kept" tone="danger" wide onClick={openResetReview} disabled={busy} />
        </div>
      </section>

      {resetReviewOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-chrome-scrim)_45%,transparent)] p-3 backdrop-blur-[2px] sm:items-center">
          <section
            ref={resetReviewDialogFocusRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-review-title"
            aria-describedby="reset-review-description"
            onKeyDown={event => {
              if (event.key === "Escape" && !busy) {
                event.stopPropagation();
                setResetReviewOpen(false);
              }
            }}
            className="w-full max-w-lg overscroll-contain border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 text-[var(--sp-text-primary)] shadow-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="reset-review-title" className="text-base font-semibold">Reset draft to published?</h2>
                <p id="reset-review-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-secondary)]">
                  Every draft seat change is erased and the draft goes back to exactly what viewers see today.
                  People edits in Management are kept. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetReviewOpen(false)}
                disabled={busy}
                className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-editor-neutral-bg)] hover:text-[var(--sp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
                aria-label="Close reset review"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ReviewCountCard label="Added seats erased" value={resetSummary.addedSeats.length} tone={resetSummary.addedSeats.length > 0 ? "warn" : "default"} />
              <ReviewCountCard label="Updated seats reverted" value={resetSummary.updatedSeatCount} tone={resetSummary.updatedSeatCount > 0 ? "warn" : "default"} />
              <ReviewCountCard label="Removed seats restored" value={resetSummary.removedSeats.length} tone={resetSummary.removedSeats.length > 0 ? "warn" : "default"} />
              <ReviewCountCard label="Total changes discarded" value={resetSummary.totalChangeCount} tone="warn" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => setResetReviewOpen(false)} disabled={busy} className="w-full">
                Keep draft changes
              </Button>
              <Button type="button" variant="danger" onClick={confirmResetToPublished} disabled={busy} className="w-full">
                {busy ? "Resetting…" : "Reset to published"}
              </Button>
            </div>
          </section>
        </div>
      )}

      {csvReview && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-chrome-scrim)_45%,transparent)] p-3 backdrop-blur-[2px] sm:items-center">
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
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 text-[var(--sp-text-primary)] shadow-panel"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--sp-border-subtle)] pb-3">
              <div>
                <h2 id="csv-import-review-title" className="text-base font-semibold">
                  {csvReview.issues.length > 0 ? "CSV import has blocking errors" : "Review CSV import"}
                </h2>
                <p id="csv-import-review-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-helper)]">
                  CSV imports update saved draft assignments only. Marker positions and the published viewer map will not change until you publish.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCsvReview}
                disabled={busy}
                className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-editor-neutral-bg)] hover:text-[var(--sp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
                aria-label="Close CSV import review"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain py-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <ReviewCountCard label="Rows" value={csvReview.rowCount} tone={csvReview.rowCount > 0 ? "warn" : "default"} />
                <ReviewCountCard label="Assignments" value={csvReview.assignedCount} tone={csvReview.assignedCount > 0 ? "warn" : "default"} />
                <ReviewCountCard label="Cleared" value={csvReview.clearCount} tone={csvReview.clearCount > 0 ? "warn" : "default"} />
                <ReviewCountCard label="Reserved" value={csvReview.reservedCount} tone={csvReview.reservedCount > 0 ? "warn" : "default"} />
                <ReviewCountCard label="Unavailable" value={csvReview.unavailableCount} tone={csvReview.unavailableCount > 0 ? "warn" : "default"} />
              </div>

              {csvReview.issues.length > 0 ? (
                <div className="mt-3 border border-[var(--sp-editor-error-border)] bg-[var(--sp-editor-error-bg)] p-3 text-sm text-[var(--sp-editor-error-text)]">
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
                <div className="mt-3 border border-[var(--sp-brand-border)] bg-[var(--sp-brand-wash)] p-3 text-sm font-semibold leading-5 text-[var(--sp-brand-text)]">
                  This applies the CSV to the draft map only. Viewers will not see these changes until you publish.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[var(--sp-border-subtle)] pt-3">
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
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-chrome-scrim)_45%,transparent)] p-3 backdrop-blur-[2px] sm:items-center">
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
            className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 text-[var(--sp-text-primary)] shadow-panel"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--sp-border-subtle)] pb-3">
              <div>
                <h2 id="json-restore-review-title" className="text-base font-semibold">Review draft snapshot restore</h2>
                <p id="json-restore-review-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-helper)]">
                  A draft snapshot covers draft seats and employees only. The published viewer map will not change until you publish.
                </p>
              </div>
              <button
                type="button"
                onClick={closeJsonReview}
                disabled={busy}
                className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-editor-neutral-bg)] hover:text-[var(--sp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
                aria-label="Close draft snapshot restore review"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain py-4">
              <div className="grid grid-cols-2 gap-2">
                <ReviewCountCard label="Draft seats" value={jsonReview.seatCount} tone="warn" />
                <ReviewCountCard label="Employees" value={jsonReview.employeeCount} tone="warn" />
              </div>

              <div className="mt-3 border border-[var(--sp-brand-border)] bg-[var(--sp-brand-wash)] p-3 text-sm font-semibold leading-5 text-[var(--sp-brand-text)]">
                This can replace draft assignments, custom seats, notes, and employee details in the draft. Viewers will not see restored data until publish.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[var(--sp-border-subtle)] pt-3">
              <Button type="button" onClick={closeJsonReview} disabled={busy} className="w-full">
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmJsonRestore} disabled={busy} className="w-full">
                Restore draft snapshot
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
