"use client";

// Review CSV import — the narrow tearsheet (PHASE2UX §1S.3; PHASE3DS §1.28,
// block 26): 720 centred, top 112 under the header, over the overlay, NO ×
// (Cancel is the exit; Esc = Cancel, not while busy). Body: five count cards
// (a reading surface, not tiles), the consequence line, and — when blocked —
// an alert above the scrolling row list with the blocked rows carrying the
// error edge; the primary is then disabled with its reason above the footer
// ("Fix CSV first" — never a bare disabled button). Footer 64, right-aligned:
// Cancel (secondary) · Apply import (primary, 224 min, "Applying…" +
// aria-busy; Cancel disabled for the transaction). The review-before-mutate
// guardrail (bulk-destructive-action-safety-source): nothing writes until
// this sheet's primary is pressed.

import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

export type CsvReviewView = {
  fileName: string;
  rowCount: number;
  assignedCount: number;
  clearCount: number;
  reservedCount: number;
  unavailableCount: number;
  issues: Array<{ row: number; message: string }>;
};

export function CsvImportSheet({
  review,
  busy,
  onCancel,
  onConfirm
}: {
  review: CsvReviewView;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const csvReviewDialogFocusRef = useDialogFocus<HTMLElement>();
  const blocked = review.issues.length > 0;

  return (
    <div className="sp-tearsheet-host" data-open="" data-tearsheet-host="">
      <div className="sp-tearsheet-overlay" />
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
            onCancel();
          }
        }}
        className="sp-tearsheet sp-tearsheet--narrow focus-visible:outline-none"
      >
        <div className="sp-tearsheet-header">
          <h2 id="csv-import-review-title">{blocked ? "CSV import has blocking errors" : "Review CSV import"}</h2>
          <p id="csv-import-review-description" className="text-[var(--sp-text-secondary)]">
            <span translate="no">{review.fileName}</span> · {review.rowCount.toLocaleString()} {review.rowCount === 1 ? "row" : "rows"} read. CSV imports update saved draft assignments only. Marker positions and the published viewer map will not change until you publish.
          </p>
        </div>

        <div className="sp-tearsheet-body">
          <div className="sp-count-cards">
            <CountCard label="Rows" value={review.rowCount} />
            <CountCard label="Assignments" value={review.assignedCount} />
            <CountCard label="Cleared" value={review.clearCount} />
            <CountCard label="Reserved" value={review.reservedCount} />
            <CountCard label="Unavailable" value={review.unavailableCount} />
          </div>

          <p className="sp-consequence">
            Applies to the draft only. Marker positions and the published map do not change until you publish.
          </p>

          {blocked && (
            <>
              <div className="cds-notification cds-notification--error" role="alert">
                <NotificationGlyph kind="error" />
                <div className="cds-notification-text">
                  <strong>Blocking validation errors</strong>
                  <p>Fix these rows in the CSV, then import the file again. No draft data has changed.</p>
                </div>
              </div>
              <ul className="sp-row-list" aria-label="Rows with errors">
                {review.issues.map((issue, index) => (
                  <li key={`${issue.row}-${issue.message}-${index}`} data-blocked="">
                    <span>Row {issue.row}</span>
                    <span>{issue.message}</span>
                    <span className="sp-row-meta">blocked</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {blocked && (
          <p className="sp-tearsheet-reason">Apply is disabled until the rows above are fixed — no draft data has changed.</p>
        )}
        <div className="sp-tearsheet-footer">
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onCancel} disabled={busy}>
            {blocked ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            className="cds-btn cds-btn--primary"
            onClick={onConfirm}
            disabled={blocked || busy}
            aria-busy={busy || undefined}
          >
            {busy ? "Applying…" : blocked ? "Fix CSV first" : "Apply import"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="sp-count-card">
      <span className="sp-count-numeral">{value.toLocaleString()}</span>
      <span className="sp-count-label">{label}</span>
    </div>
  );
}
