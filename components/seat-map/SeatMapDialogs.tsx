"use client";

// The seven confirm/review dialogs extracted verbatim from SeatMap.tsx
// (R-02a / M4 step 1 — extraction only, no behavior change). Each dialog owns
// its useDialogFocus ref so the aria-modal ↔ focus-hook pairing that
// tests/accessibility-source.test.mjs enforces stays a per-file invariant.
// All state and mutation logic stays in SeatMap; these components receive
// already-computed values and callbacks.

import { useEffect, useRef } from "react";
import { PUBLISH_IMPACT_NOTE } from "@/lib/copy";
import { formatDisplayName, formatSeatCode } from "@/lib/formatName";
import type {
  PublishChangeSummary,
  PublishDiffRow,
  PublishDiffRowKind
} from "@/lib/publishSummary";
import type { SeatWithEmployee } from "@/lib/types";
import { adminDangerButtonClassName, Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/CloseIcon";
import { StatusBadge, focusRingClass } from "@/components/ui/design-system";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

export function seatPersonLabel(seat: SeatWithEmployee | null) {
  return seat?.employee?.full_name ?? "Open";
}

export function buildSwapSummary(sourceSeat: SeatWithEmployee, targetSeat: SeatWithEmployee) {
  return `${sourceSeat.label} (${seatPersonLabel(sourceSeat)}) ↔ ${targetSeat.label} (${seatPersonLabel(targetSeat)})`;
}

const PUBLISH_DIFF_TAG_STYLES: Record<PublishDiffRowKind, { label: string; className: string }> = {
  assigned: { label: "Assigned", className: "border-[var(--sp-status-success-border)] bg-[var(--sp-status-success-surface)] text-[var(--sp-status-success-text)]" },
  added: { label: "Added", className: "border-[var(--sp-status-success-border)] bg-[var(--sp-status-success-surface)] text-[var(--sp-status-success-text)]" },
  vacated: { label: "Vacated", className: "border-[var(--sp-status-danger-border)] bg-[var(--sp-status-danger-surface)] text-[var(--admin-diff-vacated-text)]" },
  removed: { label: "Removed", className: "border-[var(--sp-status-danger-border)] bg-[var(--sp-status-danger-surface)] text-[var(--admin-diff-vacated-text)]" },
  reassigned: { label: "Reassigned", className: "border-[var(--sp-status-pending-border)] bg-[var(--sp-status-pending-surface)] text-[var(--sp-status-pending-text)]" },
  updated: { label: "Updated", className: "border-[var(--sp-editor-neutral-border)] bg-[var(--sp-editor-neutral-bg)] text-[var(--sp-text-helper)]" }
};

function PublishDiffTag({ kind }: { kind: PublishDiffRowKind }) {
  const style = PUBLISH_DIFF_TAG_STYLES[kind];
  return (
    <span className={["inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", style.className].join(" ")}>
      {style.label}
    </span>
  );
}

function PublishDiffChip({ kind, count }: { kind: PublishDiffRowKind; count: number }) {
  const style = PUBLISH_DIFF_TAG_STYLES[kind];
  return (
    <span className={["inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", style.className].join(" ")}>
      {count} {style.label.toLowerCase()}
    </span>
  );
}

export function VacateConfirmDialog({
  label,
  occupantName,
  pending,
  onCancel,
  onConfirm
}: {
  label: string;
  occupantName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const vacateConfirmDialogFocusRef = useDialogFocus<HTMLElement>();
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay-base)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
      <section
        ref={vacateConfirmDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vacate-seat-confirm-title"
        aria-describedby="vacate-seat-confirm-description"
        className="w-full max-w-md border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 text-[var(--sp-text-primary)] shadow-panel focus-visible:outline-none"
      >
        <h2 id="vacate-seat-confirm-title" className="text-base font-semibold">
          Vacate {formatSeatCode(label)}?
        </h2>
        <p id="vacate-seat-confirm-description" className="mt-2 text-sm leading-5 text-[var(--sp-text-secondary)]">
          This clears {formatDisplayName(occupantName)} from this draft seat. {PUBLISH_IMPACT_NOTE}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" onClick={onCancel} disabled={pending} className={["w-full", focusRingClass].join(" ")}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            disabled={pending}
            className={["w-full", adminDangerButtonClassName, focusRingClass].join(" ")}
          >
            Vacate seat
          </Button>
        </div>
      </section>
    </div>
  );
}

export function DeleteSeatConfirmDialog({
  label,
  pending,
  onCancel,
  onConfirm
}: {
  label: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const deleteSeatDialogFocusRef = useDialogFocus<HTMLElement>();
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay-base)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
      <section
        ref={deleteSeatDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-seat-confirm-title"
        aria-describedby="delete-seat-confirm-description"
        className="w-full max-w-md rounded-2xl border border-[var(--sp-border-subtle)] bg-[color-mix(in_srgb,var(--sp-layer-01)_95%,transparent)] p-4 text-[var(--sp-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="delete-seat-confirm-title" className="text-base font-semibold">Delete custom seat {label}?</h2>
            <p id="delete-seat-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-helper)]">
              Only available custom draft seats can be deleted. Original seats are protected.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-layer-accent)] hover:text-[var(--sp-text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
            aria-label="Cancel custom seat deletion"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--sp-editor-danger-border)] bg-[var(--sp-editor-danger-bg)] p-3 text-sm font-semibold leading-5 text-[var(--sp-editor-danger-text)]">
          This removes custom draft seats only. Published maps are unchanged until you publish.
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" onClick={onCancel} disabled={pending} className="w-full">
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={pending} className={`w-full ${adminDangerButtonClassName}`}>
            Delete seat
          </Button>
        </div>
      </section>
    </div>
  );
}

export function PublishReviewDialog({
  publishSummary,
  publishDiffRows,
  publishDiffCounts,
  actionError,
  pending,
  onClose,
  onConfirm
}: {
  publishSummary: PublishChangeSummary;
  publishDiffRows: PublishDiffRow[];
  publishDiffCounts: Record<PublishDiffRowKind, number>;
  actionError: string | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const publishReviewDialogFocusRef = useDialogFocus<HTMLElement>();
  const publishReadinessTitle = publishSummary.hasChanges ? "Ready to publish reviewed changes" : "Draft and viewer map are in sync";
  const publishReadinessBadgeTone = publishSummary.hasChanges ? "draft" : "published";
  const publishReadinessBadgeLabel = publishSummary.hasChanges ? "Ready" : "No changes";
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-background)_48%,transparent)] p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
      <section
        ref={publishReviewDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-review-title"
        aria-describedby="publish-review-description"
        className="flex max-h-[92vh] w-full sm:max-w-[560px] flex-col overflow-hidden border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 text-[var(--sp-text-primary)] shadow-[0_30px_90px_rgba(23,26,29,0.34)] backdrop-blur-2xl focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--sp-border-subtle)] pb-3">
          <div>
            <h2 id="publish-review-title" className="text-base font-semibold">Review draft before publishing</h2>
            <p id="publish-review-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-helper)]">
              Confirm the saved draft changes before they become visible in the read-only viewer.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={["relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-editor-neutral-bg)] hover:text-[var(--sp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40", focusRingClass].join(" ")}
            aria-label="Close publish review"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain py-4">
          {!publishSummary.hasChanges && (
            <p className="rounded-xl border border-[var(--sp-publish-no-change-border)] bg-[var(--sp-publish-no-change-bg)] p-3 text-sm font-semibold leading-5 text-[var(--sp-publish-no-change-text)]">
              No draft changes to publish. The saved draft already matches the currently published viewer map.
            </p>
          )}

          {publishSummary.hasChanges && (
          <>
          <div className="rounded-xl border border-[var(--sp-publish-ready-border)] bg-[var(--sp-publish-ready-bg)] p-3 text-[var(--sp-publish-ready-text)]">
            <StatusBadge tone={publishReadinessBadgeTone} className="!min-h-0 !bg-[color-mix(in_srgb,var(--sp-layer-01)_80%,transparent)] !px-2 !py-0.5 !text-xs !font-semibold !tracking-wide !text-[var(--sp-publish-ready-text)] !ring-[var(--sp-publish-ready-border)]">
              {publishReadinessBadgeLabel}
            </StatusBadge>
            <h3 className="mt-2 text-sm font-semibold text-[var(--sp-text-primary)]">{publishReadinessTitle}</h3>
            <p className="mt-1 text-xs font-semibold leading-4">Saved draft changes only — unsaved inspector edits are excluded.</p>
          </div>

          {actionError && !pending && (
            <div role="alert" className="mt-3 rounded-xl border border-[var(--sp-editor-error-border)] bg-[var(--sp-editor-error-bg)] p-3 text-sm font-semibold leading-5 text-[var(--sp-editor-error-text)]">
              <span className="font-semibold">Publish did not complete.</span> {actionError}
            </div>
          )}

          {pending && (
            <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-[var(--sp-editor-saving-border)] bg-[var(--sp-editor-saving-bg)] p-3 text-sm font-semibold leading-5 text-[var(--sp-editor-saving-text)]">
              Publishing reviewed draft changes. Viewer map stays unchanged until publish finishes.
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--sp-text-primary)]">
              {publishDiffRows.length} seat {publishDiffRows.length === 1 ? "change" : "changes"}
            </span>
            <PublishDiffChip kind="assigned" count={publishDiffCounts.assigned} />
            <PublishDiffChip kind="vacated" count={publishDiffCounts.vacated} />
            <PublishDiffChip kind="reassigned" count={publishDiffCounts.reassigned} />
            {publishDiffCounts.added > 0 && <PublishDiffChip kind="added" count={publishDiffCounts.added} />}
            {publishDiffCounts.removed > 0 && <PublishDiffChip kind="removed" count={publishDiffCounts.removed} />}
            {publishDiffCounts.updated > 0 && <PublishDiffChip kind="updated" count={publishDiffCounts.updated} />}
          </div>

          {publishDiffRows.length > 0 ? (
            <div className="mt-2 overflow-x-auto border border-[var(--sp-border-subtle)]">
              <div role="table" aria-label="Per-seat draft changes" className="max-h-56 min-w-[480px] overflow-y-auto">
                <div role="row" className="sticky top-0 z-10 grid grid-cols-[64px_1fr_1fr_96px] border-b border-[var(--sp-border-subtle)] bg-[var(--sp-editor-neutral-bg)]">
                  <span role="columnheader" className="px-3 py-1.5 text-xs font-semibold text-[var(--sp-text-helper)]">Seat</span>
                  <span role="columnheader" className="px-2.5 py-1.5 text-xs font-semibold text-[var(--sp-text-helper)]">Published now</span>
                  <span role="columnheader" className="px-2.5 py-1.5 text-xs font-semibold text-[var(--sp-text-helper)]">After publish</span>
                  <span role="columnheader" className="px-3 py-1.5 text-xs font-semibold text-[var(--sp-text-helper)]">Change</span>
                </div>
                {publishDiffRows.map(row => (
                  <div key={row.key} role="rowgroup" className="border-b border-[var(--sp-border-soft)] last:border-b-0">
                    <div role="row" className="grid grid-cols-[64px_1fr_1fr_96px] items-center">
                      <span role="cell" translate="no" className="px-3 py-2 font-mono text-xs font-semibold text-[var(--sp-text-primary)]">{row.label}</span>
                      <span role="cell" className="flex min-w-0 items-center gap-1.5 px-2.5 py-2 text-[12.5px] text-[var(--sp-text-helper)]">
                        <span className="truncate">{row.from}</span>
                        <span className="sr-only">changes to</span>
                        <span aria-hidden="true" className="flex-shrink-0 text-[var(--sp-text-helper)]">→</span>
                      </span>
                      <span role="cell" className="truncate px-2.5 py-2 text-[12.5px] font-semibold text-[var(--sp-text-primary)]">{row.to}</span>
                      <span role="cell" className="px-3 py-2"><PublishDiffTag kind={row.kind} /></span>
                    </div>
                    {row.detail && (
                      <div role="row" className="grid grid-cols-[64px_1fr]">
                        <span role="cell" aria-hidden="true" />
                        <span role="cell" aria-colspan={3} className="px-2.5 pb-2 text-xs leading-4 text-[var(--sp-text-helper)]">{row.detail}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 border border-[var(--sp-border-subtle)] p-3 text-xs font-semibold leading-5 text-[var(--sp-text-helper)]">
              No seat changes — only people details changed.
            </p>
          )}

          {publishSummary.employeeDetailChanges.length > 0 && (
            <div className="mt-3 border border-[var(--sp-border-subtle)] p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[var(--sp-text-primary)]">People details</h3>
                <span className="rounded-full bg-[var(--sp-editor-neutral-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--sp-text-helper)] ring-1 ring-[var(--sp-editor-neutral-border)]">{publishSummary.employeeDetailChanges.length}</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--sp-text-helper)]">
                {publishSummary.employeeDetailChanges.map(item => (
                  <li key={`${item.label}-${item.detail}`}>
                    <span className="font-semibold text-[var(--sp-text-primary)]">{item.label}</span> — {item.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 text-xs font-semibold text-[var(--sp-text-helper)]">
            Draft: {publishSummary.draftSeatCount} seats · Currently published: {publishSummary.publishedSeatCount} seats · Total publish changes: {publishSummary.totalChangeCount}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--sp-text-secondary)]">
            Publishing copies the saved draft map to the read-only viewer and clears Undo/Redo history after success. Until you publish, viewers keep seeing the currently published map.
          </p>
          </>
          )}
        </div>

        {/* Discard trigger relocated to the header kebab in v12 (Menu:
            "Discard draft changes") — this dialog and
            confirmDiscardDraftChanges (the one resetDraftToPublishedAction
            call site) are unchanged, only the opening control moved. */}
        <div className="grid grid-cols-[1fr_1.4fr] gap-2 border-t border-[var(--sp-border-subtle)] pt-3">
          <Button type="button" onClick={onClose} disabled={pending} className={["w-full h-12", focusRingClass].join(" ")}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onConfirm}
            disabled={pending || !publishSummary.hasChanges}
            title={publishSummary.hasChanges ? "Publish reviewed draft changes" : "No draft changes to publish"}
            className={["w-full h-12 !border-[var(--sp-button-primary)] !bg-[var(--sp-button-primary)] !text-white hover:!border-[var(--sp-button-primary-hover)] hover:!bg-[var(--sp-button-primary-hover)] disabled:!border-[var(--sp-editor-neutral-border)] disabled:!bg-[var(--sp-editor-neutral-bg)] disabled:!text-[var(--sp-text-helper)]", focusRingClass].join(" ")}
          >
            {pending ? "Publishing…" : actionError && publishSummary.hasChanges ? "Retry publish" : publishSummary.hasChanges ? (
              <>
                <span className="sm:hidden">Publish changes</span>
                <span className="hidden sm:inline">Publish reviewed changes</span>
              </>
            ) : "No changes to publish"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function DiscardDraftDialog({
  totalChangeCount,
  actionError,
  pending,
  onCancel,
  onConfirm
}: {
  totalChangeCount: number;
  actionError: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const discardDraftDialogFocusRef = useDialogFocus<HTMLElement>();
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-chrome-scrim)_45%,transparent)] p-3 backdrop-blur-[2px] sm:items-center">
      <section
        ref={discardDraftDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-draft-title"
        aria-describedby="discard-draft-description"
        onKeyDown={event => {
          if (event.key === "Escape" && !pending) {
            event.stopPropagation();
            onCancel();
          }
        }}
        className="w-full max-w-lg overscroll-contain border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 text-[var(--sp-text-primary)] shadow-panel focus-visible:outline-none"
      >
        <h2 id="discard-draft-title" className="text-base font-semibold">Discard all draft changes?</h2>
        <p id="discard-draft-description" className="mt-2 text-sm leading-5 text-[var(--sp-text-secondary)]">
          Every reviewed seat change ({totalChangeCount === 1 ? "1 change" : `${totalChangeCount} changes`}) is
          erased and the draft goes back to exactly what viewers see today. People edits in Management are kept.
          This cannot be undone — Undo/Redo history is cleared.
        </p>
        {actionError && (
          <p role="alert" className="mt-3 rounded-xl border border-[var(--sp-editor-error-border)] bg-[var(--sp-editor-error-bg)] p-3 text-sm font-semibold leading-5 text-[var(--sp-editor-error-text)]">
            {actionError}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" onClick={onCancel} disabled={pending} className={["w-full", focusRingClass].join(" ")}>
            Keep draft changes
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            disabled={pending}
            className={["w-full", adminDangerButtonClassName, focusRingClass].join(" ")}
          >
            {pending ? "Discarding…" : actionError ? "Retry discard" : "Discard everything"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function InspectorGuardDialog({
  seatLabel,
  actionDescription,
  pending,
  onKeepEditing,
  onDiscard,
  onSave
}: {
  seatLabel: string;
  actionDescription: string;
  pending: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const inspectorGuardDialogFocusRef = useDialogFocus<HTMLElement>();
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay-base)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-[60] sm:items-center">
      <section
        ref={inspectorGuardDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspector-unsaved-title"
        aria-describedby="inspector-unsaved-description"
        className="w-full max-w-md rounded-2xl border border-[var(--sp-border-subtle)] bg-[color-mix(in_srgb,var(--sp-layer-01)_95%,transparent)] p-4 text-[var(--sp-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl focus-visible:outline-none"
      >
        <div>
          <h2 id="inspector-unsaved-title" className="text-base font-semibold">Unsaved seat edits</h2>
          <p id="inspector-unsaved-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-helper)]">
            Save or discard changes to {seatLabel} before {actionDescription}
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button type="button" onClick={onKeepEditing} disabled={pending} className="w-full">
            Keep editing
          </Button>
          <Button type="button" variant="danger" onClick={onDiscard} disabled={pending} className="w-full">
            Discard
          </Button>
          <Button type="button" variant="primary" onClick={onSave} disabled={pending} className="w-full">
            Save changes
          </Button>
        </div>
      </section>
    </div>
  );
}

export function SwapConfirmDialog({
  swapSourceSeat,
  swapTargetSeat,
  actionError,
  pending,
  onCancel,
  onConfirm
}: {
  swapSourceSeat: SeatWithEmployee;
  swapTargetSeat: SeatWithEmployee;
  actionError: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const swapConfirmDialogFocusRef = useDialogFocus<HTMLElement>();
  // PR-4 (F-INT-4 family): a thrown swap error used to paint the canvas
  // banner UNDER this dialog's scrim — the dialog stayed open and looked
  // dead. The error now renders inline (same channel publish/discard use;
  // SeatMap suppresses the canvas banner while this dialog is open) and
  // takes focus so the failure is announced where the admin is looking.
  const swapErrorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (actionError && !pending) swapErrorRef.current?.focus();
  }, [actionError, pending]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay-base)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
      <section
        ref={swapConfirmDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-confirm-title"
        className="w-full max-w-md rounded-2xl border border-[var(--sp-border-subtle)] bg-[color-mix(in_srgb,var(--sp-layer-01)_95%,transparent)] p-4 text-[var(--sp-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="swap-confirm-title" className="text-base font-semibold">Confirm seat swap</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--sp-text-helper)]">This updates draft seats only. {PUBLISH_IMPACT_NOTE}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-layer-accent)] hover:text-[var(--sp-text-secondary)]"
            aria-label="Cancel swap confirmation"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <div className="rounded-xl border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-accent)] p-3">
            <div className="text-xs font-semibold text-[var(--sp-text-helper)]">Source</div>
            <div className="mt-1 text-sm font-semibold text-[var(--sp-text-primary)]">{swapSourceSeat.label}</div>
            <div className="text-sm text-[var(--sp-text-helper)]">{seatPersonLabel(swapSourceSeat)}</div>
          </div>
          <div className="rounded-xl border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-accent)] p-3">
            <div className="text-xs font-semibold text-[var(--sp-text-helper)]">Target</div>
            <div className="mt-1 text-sm font-semibold text-[var(--sp-text-primary)]">{swapTargetSeat.label}</div>
            <div className="text-sm text-[var(--sp-text-helper)]">{seatPersonLabel(swapTargetSeat)}</div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--sp-publish-viewer-impact-border)] bg-[var(--sp-publish-viewer-impact-bg)] p-3 text-sm font-semibold text-[var(--sp-publish-viewer-impact-text)]">
          {buildSwapSummary(swapSourceSeat, swapTargetSeat)}
        </div>

        {actionError && !pending && (
          <div
            ref={swapErrorRef}
            tabIndex={-1}
            role="alert"
            className="mt-4 rounded-xl border border-[var(--sp-editor-error-border)] bg-[var(--sp-editor-error-bg)] p-3 text-sm font-semibold leading-5 text-[var(--sp-editor-error-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
          >
            <span className="font-semibold">Swap did not complete.</span> {actionError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" onClick={onCancel} disabled={pending} className="w-full">
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm} disabled={pending} className="w-full">
            {actionError ? "Retry swap" : "Confirm swap"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function MoveEmployeeConfirmDialog({
  offerSwap,
  moveEmployeeSourceSeat,
  moveEmployeeTargetSeat,
  sourceEmployeeName,
  pending,
  onCancel,
  onConfirmSwap,
  onConfirmMove
}: {
  offerSwap: boolean;
  moveEmployeeSourceSeat: SeatWithEmployee;
  moveEmployeeTargetSeat: SeatWithEmployee;
  sourceEmployeeName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirmSwap: () => void;
  onConfirmMove: () => void;
}) {
  const moveEmployeeConfirmDialogFocusRef = useDialogFocus<HTMLElement>();
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay-base)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
      <section
        ref={moveEmployeeConfirmDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-employee-map-confirm-title"
        aria-describedby="move-employee-map-confirm-description"
        className="w-full max-w-md rounded-2xl border border-[var(--sp-border-subtle)] bg-[color-mix(in_srgb,var(--sp-layer-01)_95%,transparent)] p-4 text-[var(--sp-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl focus-visible:outline-none"
      >
        {offerSwap ? (
          <>
            <h2 id="move-employee-map-confirm-title" className="text-base font-semibold">
              Swap {formatDisplayName(sourceEmployeeName)} and {formatDisplayName(seatPersonLabel(moveEmployeeTargetSeat))}?
            </h2>
            <p id="move-employee-map-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-helper)]">
              {formatDisplayName(seatPersonLabel(moveEmployeeTargetSeat))} already sits at {formatSeatCode(moveEmployeeTargetSeat.label)}. Swapping moves them to {formatSeatCode(moveEmployeeSourceSeat.label)}. {PUBLISH_IMPACT_NOTE}
            </p>
            <div className="mt-4 rounded-xl border border-[var(--sp-publish-viewer-impact-border)] bg-[var(--sp-publish-viewer-impact-bg)] p-3 text-sm font-semibold text-[var(--sp-publish-viewer-impact-text)]">
              {buildSwapSummary(moveEmployeeSourceSeat, moveEmployeeTargetSeat)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={onCancel} disabled={pending} className="w-full">Cancel</Button>
              <Button type="button" variant="primary" onClick={onConfirmSwap} disabled={pending} className="w-full">Swap them</Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="move-employee-map-confirm-title" className="text-base font-semibold">
              Move {formatDisplayName(sourceEmployeeName)} to {formatSeatCode(moveEmployeeTargetSeat.label)}?
            </h2>
            <p id="move-employee-map-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-helper)]">
              They currently sit at {formatSeatCode(moveEmployeeSourceSeat.label)}. Moving frees {formatSeatCode(moveEmployeeSourceSeat.label)} (it becomes Open). {PUBLISH_IMPACT_NOTE}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={onCancel} disabled={pending} className="w-full">Cancel</Button>
              <Button type="button" variant="primary" onClick={onConfirmMove} disabled={pending} className="w-full">Move them</Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
