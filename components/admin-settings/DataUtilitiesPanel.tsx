"use client";

// Settings — import, export and recovery (PHASE2UX §1S; DECISIONS D6;
// PHASE3DS §1.26–§1.28; Phase 4 PR 4). The Settings archetype on the 776
// column: the callout first (guidance read BEFORE acting — loads with the
// page, never dismissed, no status), then two sections each with its own one
// primary: CSV assignments — Import CSV (primary, labelled trigger stating
// type + limit) · Export CSV (tertiary) · Download CSV template (ghost) and
// the columns + example line; Draft working-copy snapshots — Export draft
// snapshot (primary) · Restore draft snapshot… (tertiary, labelled trigger).
// Reset draft is GONE (ruling 22; D6-d): Discard draft changes in the map's
// publish flow owns that need; nothing on this page is destructive.
//
// Review-before-mutate: choosing a file only opens a review sheet; the
// mutations run from the sheets' primaries with the concurrency fences
// captured at parse time. Every unhappy path (wrong type, too large, empty,
// missing columns, bad snapshot shape) is an inline error under its section
// BEFORE any sheet opens (P2-6 / P3-16).

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clientActionErrorMessage } from "@/lib/clientActionError";
import { listActiveEmployeeExpectations, listDraftSeatExpectations, type DraftSeatExpectation, type EmployeeExpectation } from "@/lib/draftConcurrency";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { Employee, SeatWithEmployee } from "@/lib/types";
import { createAssignmentCsvTemplate, exportSeatsToAssignmentCsv, parseAssignmentCsv } from "@/lib/csv";
import { checkUpload, describeUploadLimit } from "@/lib/fileGuard";
import { notifyDraftStatusChanged } from "@/lib/draftStatusEvent";
import { importAssignmentsCsvAction, restoreDraftSnapshotAction } from "@/app/actions";
import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { CsvImportSheet } from "@/components/admin-settings/CsvImportSheet";
import { FileTrigger } from "@/components/admin-settings/FileTrigger";
import { SnapshotRestoreSheet } from "@/components/admin-settings/SnapshotRestoreSheet";

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
  fileName: string;
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
  fileName: string;
  exportedAt: string | null;
  seatCount: number;
  employeeCount: number;
};

function isDraftSnapshot(value: unknown): value is DraftSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DraftSnapshot>;
  return Array.isArray(candidate.seats) && Array.isArray(candidate.employees);
}

function readExportedAt(value: unknown): string | null {
  const stamp = (value as { exportedAt?: unknown } | null)?.exportedAt;
  if (typeof stamp !== "string") return null;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function clockLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(date);
}

const CSV_COLUMNS = "seat_label, employee_name, employee_email, position, department, zone, status, notes";
const CSV_EXAMPLE = "A-12, Jane Doe, , Associate, Litigation, North Wing, assigned, Window seat";

export function DataUtilitiesPanel({ seats, employees }: DataUtilitiesPanelProps) {
  const router = useRouter();
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvNotice, setCsvNotice] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotNotice, setSnapshotNotice] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [csvReview, setCsvReview] = useState<CsvImportReview | null>(null);
  const [jsonReview, setJsonReview] = useState<JsonRestoreReview | null>(null);
  const [exportedAtLabel, setExportedAtLabel] = useState<string | null>(null);
  const [busyOp, setBusyOp] = useState<"csv-parse" | "csv-apply" | "json-parse" | "json-restore" | null>(null);

  const busy = pending;

  function run(op: NonNullable<typeof busyOp>, work: () => Promise<void>) {
    setBusyOp(op);
    startTransition(async () => {
      try {
        await work();
      } finally {
        setBusyOp(null);
      }
    });
  }

  function reportCsvError(caught: unknown, fallback: string) {
    setCsvNotice(null);
    setCsvError(clientActionErrorMessage(caught, fallback));
  }

  function reportSnapshotError(caught: unknown, fallback: string) {
    setSnapshotNotice(null);
    setSnapshotError(clientActionErrorMessage(caught, fallback));
  }

  function closeCsvReview() {
    setCsvReview(null);
  }

  function closeJsonReview() {
    setJsonReview(null);
    setRestoreError(null);
    setExportedAtLabel(null);
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

  // D6-e: the export inside the review — same download, the review stays,
  // the button shows its done-state in place.
  function exportCurrentDraftFromReview() {
    exportDraftSnapshot();
    setExportedAtLabel(clockLabel(new Date()));
  }

  function importCsv(file: File | undefined) {
    if (!file) return;
    setCsvNotice(null);
    // Type, size and emptiness are refused HERE, inline, before any sheet.
    const refusal = checkUpload(file, "csv");
    if (refusal) {
      setCsvError(refusal);
      return;
    }

    run("csv-parse", async () => {
      try {
        setCsvError(null);
        const text = await file.text();
        const parsed = parseAssignmentCsv(text);

        const assignedCount = parsed.rows.filter(row => row.employee_name.trim()).length;
        const reservedCount = parsed.rows.filter(row => row.status === "reserved").length;
        const unavailableCount = parsed.rows.filter(row => row.status === "unavailable").length;
        const clearCount = parsed.rows.length - assignedCount;

        // Structural refusals (an empty file, missing columns — the parser
        // reports them on row 1) stay inline under the section; only
        // row-level issues reach the blocked review.
        const structural = parsed.issues.filter(issue => issue.row === 1);
        if (structural.length > 0) {
          setCsvError(structural.map(issue => issue.message).join(" "));
          return;
        }

        setCsvReview({
          text,
          fileName: file.name,
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
      } catch (caught) {
        reportCsvError(caught, "Could not import CSV.");
      }
    });
  }

  function confirmCsvImport() {
    if (!csvReview || csvReview.issues.length > 0) return;
    const review = csvReview;

    run("csv-apply", async () => {
      try {
        setCsvError(null);
        const payload = await importAssignmentsCsvAction(review.text, review.expectedSeats, review.expectedEmployees);
        setCsvReview(null);
        if (!payload.ok) {
          // MLS02 (PHASE2UX §1S.3): the reviewed rows went stale — close, refresh, re-review.
          setCsvNotice(null);
          setCsvError(`${payload.message} This page has been refreshed with the latest directory — review it and import the file again if it is still what you want.`);
          router.refresh();
          return;
        }
        setCsvNotice(`CSV import applied — ${payload.count.toLocaleString()} ${payload.count === 1 ? "row" : "rows"} updated in the draft.`);
        notifyDraftStatusChanged();
        router.refresh();
      } catch (caught) {
        setCsvReview(null);
        reportCsvError(caught, "Could not import CSV.");
      }
    });
  }

  function importJson(file: File | undefined) {
    if (!file) return;
    setSnapshotNotice(null);
    const refusal = checkUpload(file, "json");
    if (refusal) {
      setSnapshotError(refusal);
      return;
    }

    run("json-parse", async () => {
      try {
        setSnapshotError(null);
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;

        // Returned, not thrown: this is CLIENT-side validation with written
        // copy — routing it through the catch would let the digest-safe
        // fallback (clientActionErrorMessage) swallow the specific message.
        if (!isDraftSnapshot(parsed)) {
          setSnapshotError("The snapshot must include seats and employees arrays — choose a file exported from this page.");
          return;
        }
        if (parsed.seats.length === 0 && parsed.employees.length === 0) {
          setSnapshotError("Cannot restore an empty snapshot.");
          return;
        }

        setRestoreError(null);
        setExportedAtLabel(null);
        setJsonReview({
          snapshot: parsed,
          fileName: file.name,
          exportedAt: readExportedAt(parsed),
          seatCount: parsed.seats.length,
          employeeCount: parsed.employees.length
        });
      } catch (caught) {
        reportSnapshotError(caught, "Could not read the draft snapshot.");
      }
    });
  }

  function confirmJsonRestore() {
    if (!jsonReview) return;
    const review = jsonReview;

    run("json-restore", async () => {
      try {
        setSnapshotError(null);
        setRestoreError(null);
        // Fence on the draft this page loaded (the `seats` prop), so a restore
        // confirmed against stale data cannot silently revert edits another
        // admin committed since the page rendered.
        const result = await restoreDraftSnapshotAction(review.snapshot, listDraftSeatExpectations(seats));
        if (!result.ok) {
          // MLS02 (PHASE2UX §1S.4): the review STAYS with the server text; the
          // page refreshes underneath so the next confirm fences on the latest draft.
          setRestoreError(result.message);
          router.refresh();
          return;
        }
        setJsonReview(null);
        setExportedAtLabel(null);
        setSnapshotNotice(`Draft restored from ${review.fileName} — the draft now matches the snapshot.`);
        notifyDraftStatusChanged();
        router.refresh();
      } catch (caught) {
        setRestoreError(clientActionErrorMessage(caught, "Could not restore the draft snapshot."));
      }
    });
  }

  return (
    <div className="sp-settings">
      {/* The surface's shared in-flight region — always mounted (a region that
          mounts WITH its content is not reliably announced), sr-only sibling of
          the visible outcome notifications below, which own outcomes. */}
      <div role="status" aria-live="polite" className="sr-only">
        {busy ? "Working…" : ""}
      </div>

      {/* Callout (PHASE3DS §1.26): guidance read before acting — loads with
          the page, never dismissed, no icon, no status colour. */}
      <div className="sp-callout">
        <p>
          <strong>The published map is never touched until you publish.</strong>{" "}
          Restores replace the entire draft — review before confirming.
        </p>
      </div>

      <section className="sp-section" aria-labelledby="settings-csv-heading">
        <h2 id="settings-csv-heading">CSV assignments</h2>
        <p className="sp-section-helper">Imports update draft assignments; seat positions don&apos;t move.</p>
        <div className="sp-action-row">
          <FileTrigger
            label={`Import CSV · ${describeUploadLimit("csv")}`}
            name="csv"
            accept=".csv,text/csv"
            variant="primary"
            busy={busy && busyOp === "csv-parse"}
            disabled={busy && busyOp !== "csv-parse"}
            onFile={importCsv}
          />
          <button type="button" className="cds-btn cds-btn--tertiary cds-btn--md" onClick={exportCsv} disabled={busy}>Export CSV</button>
          <button type="button" className="cds-btn cds-btn--ghost cds-btn--md" onClick={downloadTemplate} disabled={busy}>Download CSV template</button>
        </div>
        {busy && busyOp === "csv-parse" ? (
          <p className="sp-progress-line"><span className="sp-skeleton" aria-hidden="true" />Reading the file…</p>
        ) : (
          <p className="sp-file-line">
            Columns: <code translate="no">{CSV_COLUMNS}</code> — e.g. <code translate="no">{CSV_EXAMPLE}</code>
          </p>
        )}
        {csvError && (
          <div role="alert" className="cds-notification cds-notification--error">
            <NotificationGlyph kind="error" />
            <div className="cds-notification-text">{csvError}</div>
          </div>
        )}
        {csvNotice && (
          <div role="status" className="cds-notification cds-notification--success">
            <NotificationGlyph kind="success" />
            <div className="cds-notification-text">{csvNotice}</div>
          </div>
        )}
      </section>

      <section className="sp-section" aria-labelledby="settings-snapshots-heading">
        {/* INFRA-02 (#277): this panel is a draft working copy, not a backup —
            the honest scope name and the disclaimer stay on screen. */}
        <h2 id="settings-snapshots-heading">Draft working-copy snapshots</h2>
        <p className="sp-section-helper">
          Draft seats and employees only. This is not a database backup: these snapshots do not include the published map, publish history, or user accounts.
        </p>
        <div className="sp-action-row">
          <button type="button" className="cds-btn cds-btn--primary cds-btn--md" onClick={exportDraftSnapshot}>Export draft snapshot</button>
          <FileTrigger
            label="Restore draft snapshot…"
            name="snapshot"
            accept=".json,application/json"
            variant="tertiary"
            busy={busy && busyOp === "json-parse"}
            disabled={busy && busyOp !== "json-parse"}
            onFile={importJson}
          />
        </div>
        {busy && busyOp === "json-parse" ? (
          <p className="sp-progress-line"><span className="sp-skeleton" aria-hidden="true" />Reading the file…</p>
        ) : (
          <p className="sp-file-line">{describeUploadLimit("json")} — a file exported from this page.</p>
        )}
        {snapshotError && (
          <div role="alert" className="cds-notification cds-notification--error">
            <NotificationGlyph kind="error" />
            <div className="cds-notification-text">{snapshotError}</div>
          </div>
        )}
        {snapshotNotice && (
          <div role="status" className="cds-notification cds-notification--success">
            <NotificationGlyph kind="success" />
            <div className="cds-notification-text">{snapshotNotice}</div>
          </div>
        )}
      </section>

      {csvReview && (
        <CsvImportSheet
          review={csvReview}
          busy={busy && busyOp === "csv-apply"}
          onCancel={closeCsvReview}
          onConfirm={confirmCsvImport}
        />
      )}

      {jsonReview && (
        <SnapshotRestoreSheet
          review={jsonReview}
          busy={busy && busyOp === "json-restore"}
          error={restoreError}
          exportedAtLabel={exportedAtLabel}
          onExportCurrent={exportCurrentDraftFromReview}
          onCancel={closeJsonReview}
          onConfirm={confirmJsonRestore}
        />
      )}
    </div>
  );
}
