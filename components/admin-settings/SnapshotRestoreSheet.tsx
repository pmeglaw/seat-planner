"use client";

// Review draft snapshot restore — the narrow tearsheet (PHASE2UX §1S.4;
// DECISIONS D6-c / D6-e; PHASE3DS §1.28). Body: two count cards with the
// file's name and export date, the CONSEQUENCES list (one line each), then
// "Export the current draft first" — a ghost button (an action, not a link)
// that downloads the current draft without closing the review and shows its
// done-state in place ("✓ Exported 14:02"), never disabled. Footer 64,
// right-aligned: Cancel (secondary) · Restore draft snapshot (primary, 224
// min, "Restoring…" + aria-busy; Cancel disabled for the transaction). MLS02:
// the server text as an inline error at the top of the body with the
// refreshed-draft note — the review stays open (P3-17: nothing chains into a
// modal). No ×.

import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { CountCard } from "@/components/admin-settings/CsvImportSheet";

export type SnapshotReviewView = {
  fileName: string;
  exportedAt: string | null;
  seatCount: number;
  employeeCount: number;
};

export function SnapshotRestoreSheet({
  review,
  busy,
  error,
  exportedAtLabel,
  onExportCurrent,
  onCancel,
  onConfirm
}: {
  review: SnapshotReviewView;
  busy: boolean;
  error: string | null;
  /** "14:02" once the current draft was exported from inside the review; null before. */
  exportedAtLabel: string | null;
  onExportCurrent: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const jsonReviewDialogFocusRef = useDialogFocus<HTMLElement>();

  return (
    <div className="sp-tearsheet-host" data-open="" data-tearsheet-host="">
      <div className="sp-tearsheet-overlay" />
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
            onCancel();
          }
        }}
        className="sp-tearsheet sp-tearsheet--narrow focus-visible:outline-none"
      >
        <div className="sp-tearsheet-header">
          <h2 id="json-restore-review-title">Review draft snapshot restore</h2>
          <p id="json-restore-review-description" className="text-[var(--sp-text-secondary)]">
            <span translate="no">{review.fileName}</span>{review.exportedAt ? ` · exported ${review.exportedAt}` : ""}. A draft snapshot covers draft seats and employees only. The published viewer map will not change until you publish.
          </p>
        </div>

        <div className="sp-tearsheet-body">
          {error && !busy && (
            <div className="cds-notification cds-notification--error" role="alert">
              <NotificationGlyph kind="error" />
              <div className="cds-notification-text">
                <strong>Restore did not complete.</strong>
                <p>{error} This page has been refreshed with the latest draft — review it and try the restore again if it is still what you want.</p>
              </div>
              <button type="button" className="cds-btn cds-btn--ghost" onClick={onConfirm}>Retry restore</button>
            </div>
          )}

          <div className="sp-count-cards">
            <CountCard label="Draft seats" value={review.seatCount} />
            <CountCard label="Employees" value={review.employeeCount} />
          </div>

          <div>
            <div className="sp-tearsheet-section">What restoring does</div>
            <p className="sp-consequence">This can replace draft assignments, custom seats, notes, and employee details in the draft:</p>
            <ul className="sp-consequence-list">
              <li>Every draft seat assignment is replaced by the file&apos;s.</li>
              <li>Custom seats not in the file are deleted.</li>
              <li>Employee details are updated — never deleted.</li>
              <li>The published map is untouched until you publish.</li>
              <li>Undo history is cleared.</li>
            </ul>
          </div>

          {/* D6-e: an action, not a link — the done-state replaces the label and it stays a button. */}
          <button type="button" className="cds-btn cds-btn--ghost" onClick={onExportCurrent} data-done={exportedAtLabel ? "" : undefined}>
            {exportedAtLabel ? (
              <>
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3 3L13 4.5" fill="none" stroke="currentColor" strokeWidth={1.5} /></svg>
                Exported {exportedAtLabel}
              </>
            ) : "Export the current draft first"}
          </button>
        </div>

        <div className="sp-tearsheet-footer">
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="cds-btn cds-btn--primary" onClick={onConfirm} disabled={busy} aria-busy={busy || undefined}>
            {busy ? "Restoring…" : "Restore draft snapshot"}
          </button>
        </div>
      </section>
    </div>
  );
}
