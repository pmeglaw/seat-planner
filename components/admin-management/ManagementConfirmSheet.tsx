"use client";

// Destructive confirmations — Deactivate employee · Delete department · Delete
// zone — as the NARROW TEARSHEET (owner ruling 2026-09-05, PHASE4BUILD §1.38;
// amends DECISIONS D5-b / D5-c and PHASE3DS §1.24, which drew a confirm modal
// on top of the panel). Same anatomy as the 3a publish sheet: `.sp-tearsheet`
// + `.sp-tearsheet--narrow` (720 centred, top 112 under the header), the
// overlay, NO × — Cancel is the exit; Esc = Cancel, never while busy. Body:
// the impact section (heading + the shipped consequence copy) and the publish
// line. Footer 64, right-aligned: Cancel (secondary) · the danger primary
// (`.cds-btn--danger`, min-width 224 — sheet amendment B) — danger only on
// this confirm step. Stays mounted until the action settles (buttons disabled
// on pending, the primary aria-busy with its participle); a failure renders
// inside the sheet with Retry. Opens OVER the employee panel (z 8000 > 7001)
// for Deactivate; nothing chains past it — a tearsheet never opens a modal
// from inside (P3-17).

import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

export type ManagementConfirmView =
  | { kind: "employee"; personName: string; seatLabel: string | null }
  | { kind: "department"; name: string; affectedCount: number }
  | { kind: "zone"; name: string; affectedCount: number };

function plural(count: number, noun: string) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

export function ManagementConfirmSheet({
  view,
  pending,
  busy,
  error,
  onCancel,
  onConfirm
}: {
  view: ManagementConfirmView;
  pending: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const managementConfirmDialogFocusRef = useDialogFocus<HTMLElement>();

  const title =
    view.kind === "employee"
      ? `Deactivate ${view.personName}?`
      : view.kind === "department"
        ? `Delete department “${view.name}”?`
        : `Delete zone “${view.name}”?`;
  const eyebrow = view.kind === "employee" ? "Deactivate employee" : view.kind === "department" ? "Delete department" : "Delete zone";
  const impactHeading = view.kind === "employee" ? "Deactivation impact" : view.kind === "department" ? "Department delete impact" : "Zone delete impact";
  const primaryLabel = busy
    ? (view.kind === "employee" ? "Deactivating…" : "Deleting…")
    : view.kind === "employee"
      ? "Deactivate employee"
      : view.kind === "department"
        ? "Delete department"
        : "Delete zone";

  return (
    <div className="sp-tearsheet-host" data-open="" data-tearsheet-host="">
      {/* The overlay is inert; a pointer on it must not pull focus out of the
          trap (PR 4 smoke, step 10): mousedown is cancelled so the focused
          control keeps focus and Esc / Tab still reach the sheet. */}
      <div className="sp-tearsheet-overlay" onMouseDown={event => event.preventDefault()} />
      <section
        ref={managementConfirmDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="management-confirm-title"
        aria-describedby="management-confirm-description"
        onKeyDown={event => {
          if (event.key === "Escape" && !pending) {
            event.stopPropagation();
            onCancel();
          }
        }}
        className="sp-tearsheet sp-tearsheet--narrow focus-visible:outline-none"
      >
        <div className="sp-tearsheet-header">
          <p className="cds-modal-eyebrow">{eyebrow}</p>
          <h2 id="management-confirm-title">{title}</h2>
          <p id="management-confirm-description" className="text-[var(--sp-text-secondary)]">
            Moderate impact — the consequences are spelled out below. Nothing changes until you confirm.
          </p>
        </div>

        <div className="sp-tearsheet-body">
          {error && !busy && (
            <div className="cds-notification cds-notification--error" role="alert">
              <NotificationGlyph kind="error" />
              <div className="cds-notification-text">
                <strong>{view.kind === "employee" ? "Deactivation did not complete." : "Delete did not complete."}</strong>
                <p>{error}</p>
              </div>
              <button type="button" className="cds-btn cds-btn--ghost" onClick={onConfirm}>Retry</button>
            </div>
          )}

          <div className="sp-tearsheet-section">{impactHeading}</div>
          <p className="sp-consequence">
            {view.kind === "employee" && (
              view.seatLabel
                ? <>Current draft seat: <strong translate="no">{view.seatLabel}</strong>. This clears that draft assignment and keeps the employee inactive.</>
                : <>Current draft seat: <strong>Unassigned</strong>. This removes the employee from the active directory.</>
            )}
            {view.kind === "department" && (
              <>Clears this department from <strong>{plural(view.affectedCount, "active employee")}</strong>. Employee records remain active and physical seat zones are unchanged.</>
            )}
            {view.kind === "zone" && (
              <>Clears this physical zone from <strong>{plural(view.affectedCount, "draft seat")}</strong>. Seat markers and employees remain in place.</>
            )}
          </p>
          <p className="sp-consequence text-[var(--sp-text-secondary)]">
            {view.kind === "employee"
              ? "The published map everyone sees won't change until you publish again."
              : view.kind === "department"
                ? "Viewers keep seeing current people details until you publish. Seat assignments are unchanged."
                : "This updates draft zone metadata only. The published viewer map is unchanged until publish."}
          </p>
        </div>

        <div className="sp-tearsheet-footer">
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="cds-btn cds-btn--danger" onClick={onConfirm} disabled={pending} aria-busy={busy || undefined}>
            {primaryLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
