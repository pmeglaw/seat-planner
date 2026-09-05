"use client";

// The confirm dialogs extracted verbatim from SeatMap.tsx (the publish review
// left for PublishReviewSheet.tsx — the wide tearsheet — in Phase 4 PR 3b)
// (R-02a / M4 step 1 — extraction only, no behavior change). Each dialog owns
// its useDialogFocus ref so the aria-modal ↔ focus-hook pairing that
// tests/accessibility-source.test.mjs enforces stays a per-file invariant.
// All state and mutation logic stays in SeatMap; these components receive
// already-computed values and callbacks.

import { useEffect, useRef } from "react";
import { PUBLISH_IMPACT_NOTE } from "@/lib/copy";
import { floorOf } from "@/lib/floorIds";
import { FLOORS } from "@/lib/floors";
import { formatDisplayName, formatSeatCode } from "@/lib/formatName";
import type { SeatWithEmployee } from "@/lib/types";
import { adminDangerButtonClassName, Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/CloseIcon";
import { focusRingClass } from "@/components/ui/design-system";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

export function seatPersonLabel(seat: SeatWithEmployee | null) {
  return seat?.employee?.full_name ?? "Open";
}

export function buildSwapSummary(sourceSeat: SeatWithEmployee, targetSeat: SeatWithEmployee) {
  return `${sourceSeat.label} (${seatPersonLabel(sourceSeat)}) ↔ ${targetSeat.label} (${seatPersonLabel(targetSeat)})`;
}

/** Multi-floor PR-3: a swap or move may pair seats on different floors (the
 *  canvas auto-switches to reach the target). The confirm dialogs then name
 *  each seat's floor, so the admin reads "L02 · Floor 2" rather than
 *  wondering which plan a code belongs to. Same floor → no tag, as before. */
function crossFloorTag(seat: SeatWithEmployee, other: SeatWithEmployee) {
  return floorOf(seat) === floorOf(other) ? null : FLOORS[floorOf(seat)].tag;
}

function SeatFloorTag({ tag }: { tag: string | null }) {
  if (!tag) return null;
  return (
    <span className="ml-2 inline-flex rounded-full border border-[var(--sp-border-subtle)] px-1.5 py-0.5 align-middle text-xs font-semibold text-[var(--sp-text-helper)]">
      {tag}
    </span>
  );
}

export function VacateConfirmDialog({
  label,
  occupantName,
  actionError,
  pending,
  onCancel,
  onConfirm
}: {
  label: string;
  occupantName: string;
  actionError: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const vacateConfirmDialogFocusRef = useDialogFocus<HTMLElement>();
  // PR-5 (§8.1): the dialog now holds open until the action resolves, so a
  // failure renders here (PR-4 inline-alert recipe) instead of on the canvas
  // banner under the scrim; SeatMap suppresses that banner while this is open.
  const vacateErrorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (actionError && !pending) vacateErrorRef.current?.focus();
  }, [actionError, pending]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
      <section
        ref={vacateConfirmDialogFocusRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vacate-seat-confirm-title"
        aria-describedby="vacate-seat-confirm-description"
        className="w-full max-w-md border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 text-[var(--sp-text-primary)] shadow-sp focus-visible:outline-none"
      >
        <h2 id="vacate-seat-confirm-title" className="text-base font-semibold">
          Vacate {formatSeatCode(label)}?
        </h2>
        <p id="vacate-seat-confirm-description" className="mt-2 text-sm leading-5 text-[var(--sp-text-secondary)]">
          This clears {formatDisplayName(occupantName)} from this draft seat. {PUBLISH_IMPACT_NOTE}
        </p>
        {actionError && !pending && (
          <div
            ref={vacateErrorRef}
            tabIndex={-1}
            role="alert"
            className="mt-3 rounded-xl border border-[var(--sp-status-error-mark)] bg-[var(--sp-status-error-surface)] p-3 text-sm font-semibold leading-5 text-[var(--sp-status-error-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
          >
            <span className="font-semibold">Vacate did not complete.</span> {actionError}
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" onClick={onCancel} disabled={pending} className={["w-full", focusRingClass].join(" ")}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            loading={pending}
            className={["w-full", adminDangerButtonClassName, focusRingClass].join(" ")}
          >
            {pending ? "Vacating…" : actionError ? "Retry vacate" : "Vacate seat"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function DeleteSeatConfirmDialog({
  label,
  actionError,
  pending,
  onCancel,
  onConfirm
}: {
  label: string;
  actionError: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const deleteSeatDialogFocusRef = useDialogFocus<HTMLElement>();
  // PR-5 (§8.1): stays open through the round-trip — see VacateConfirmDialog.
  const deleteErrorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (actionError && !pending) deleteErrorRef.current?.focus();
  }, [actionError, pending]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
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
            disabled={pending}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-layer-accent)] hover:text-[var(--sp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
            aria-label="Cancel custom seat deletion"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--sp-status-error-mark)] bg-[var(--sp-status-error-surface)] p-3 text-sm font-semibold leading-5 text-[var(--sp-status-error-text)]">
          This removes custom draft seats only. Published maps are unchanged until you publish.
        </div>

        {actionError && !pending && (
          <div
            ref={deleteErrorRef}
            tabIndex={-1}
            role="alert"
            className="mt-4 rounded-xl border border-[var(--sp-status-error-mark)] bg-[var(--sp-status-error-surface)] p-3 text-sm font-semibold leading-5 text-[var(--sp-status-error-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
          >
            <span className="font-semibold">Delete did not complete.</span> {actionError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" onClick={onCancel} disabled={pending} className="w-full">
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} loading={pending} className={`w-full ${adminDangerButtonClassName}`}>
            {pending ? "Deleting…" : actionError ? "Retry delete" : "Delete seat"}
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
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay)_45%,transparent)] p-3 backdrop-blur-[2px] sm:items-center">
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
        className="w-full max-w-lg overscroll-contain border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 text-[var(--sp-text-primary)] shadow-sp focus-visible:outline-none"
      >
        <h2 id="discard-draft-title" className="text-base font-semibold">Discard all draft changes?</h2>
        <p id="discard-draft-description" className="mt-2 text-sm leading-5 text-[var(--sp-text-secondary)]">
          Every reviewed seat change ({totalChangeCount === 1 ? "1 change" : `${totalChangeCount} changes`}) is
          erased and the draft goes back to exactly what viewers see today. People edits in Management are kept.
          This cannot be undone — Undo/Redo history is cleared.
        </p>
        {actionError && (
          <p role="alert" className="mt-3 rounded-xl border border-[var(--sp-status-error-mark)] bg-[var(--sp-status-error-surface)] p-3 text-sm font-semibold leading-5 text-[var(--sp-status-error-text)]">
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
            loading={pending}
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
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-[60] sm:items-center">
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
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
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
            disabled={pending}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-layer-accent)] hover:text-[var(--sp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Cancel swap confirmation"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <div className="rounded-xl border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-accent)] p-3">
            <div className="text-xs font-semibold text-[var(--sp-text-secondary)]">Source</div>
            <div className="mt-1 text-sm font-semibold text-[var(--sp-text-primary)]">{swapSourceSeat.label}<SeatFloorTag tag={crossFloorTag(swapSourceSeat, swapTargetSeat)} /></div>
            <div className="text-sm text-[var(--sp-text-secondary)]">{seatPersonLabel(swapSourceSeat)}</div>
          </div>
          <div className="rounded-xl border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-accent)] p-3">
            <div className="text-xs font-semibold text-[var(--sp-text-secondary)]">Target</div>
            <div className="mt-1 text-sm font-semibold text-[var(--sp-text-primary)]">{swapTargetSeat.label}<SeatFloorTag tag={crossFloorTag(swapTargetSeat, swapSourceSeat)} /></div>
            <div className="text-sm text-[var(--sp-text-secondary)]">{seatPersonLabel(swapTargetSeat)}</div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--sp-status-warning-mark)] bg-[var(--sp-status-warning-surface)] p-3 text-sm font-semibold text-[var(--sp-status-warning-text)]">
          {buildSwapSummary(swapSourceSeat, swapTargetSeat)}
        </div>

        {actionError && !pending && (
          <div
            ref={swapErrorRef}
            tabIndex={-1}
            role="alert"
            className="mt-4 rounded-xl border border-[var(--sp-status-error-mark)] bg-[var(--sp-status-error-surface)] p-3 text-sm font-semibold leading-5 text-[var(--sp-status-error-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
          >
            <span className="font-semibold">Swap did not complete.</span> {actionError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" onClick={onCancel} disabled={pending} className="w-full">
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm} loading={pending} className="w-full">
            {pending ? "Swapping…" : actionError ? "Retry swap" : "Confirm swap"}
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
  actionError,
  pending,
  onCancel,
  onConfirmSwap,
  onConfirmMove
}: {
  offerSwap: boolean;
  moveEmployeeSourceSeat: SeatWithEmployee;
  moveEmployeeTargetSeat: SeatWithEmployee;
  sourceEmployeeName: string;
  actionError: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirmSwap: () => void;
  onConfirmMove: () => void;
}) {
  const moveEmployeeConfirmDialogFocusRef = useDialogFocus<HTMLElement>();
  // PR-5 (§8.1): stays open through the round-trip (both arms — the swap arm
  // runs executeSwap dialog-less, so this surface carries its pending story).
  const moveErrorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (actionError && !pending) moveErrorRef.current?.focus();
  }, [actionError, pending]);
  const moveErrorAlert = actionError && !pending ? (
    <div
      ref={moveErrorRef}
      tabIndex={-1}
      role="alert"
      className="mt-4 rounded-xl border border-[var(--sp-status-error-mark)] bg-[var(--sp-status-error-surface)] p-3 text-sm font-semibold leading-5 text-[var(--sp-status-error-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
    >
      <span className="font-semibold">Move did not complete.</span> {actionError}
    </div>
  ) : null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
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
              {formatDisplayName(seatPersonLabel(moveEmployeeTargetSeat))} already sits at {formatSeatCode(moveEmployeeTargetSeat.label)}<SeatFloorTag tag={crossFloorTag(moveEmployeeTargetSeat, moveEmployeeSourceSeat)} />. Swapping moves them to {formatSeatCode(moveEmployeeSourceSeat.label)}<SeatFloorTag tag={crossFloorTag(moveEmployeeSourceSeat, moveEmployeeTargetSeat)} />. {PUBLISH_IMPACT_NOTE}
            </p>
            <div className="mt-4 rounded-xl border border-[var(--sp-status-warning-mark)] bg-[var(--sp-status-warning-surface)] p-3 text-sm font-semibold text-[var(--sp-status-warning-text)]">
              {buildSwapSummary(moveEmployeeSourceSeat, moveEmployeeTargetSeat)}
            </div>
            {moveErrorAlert}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={onCancel} disabled={pending} className="w-full">Cancel</Button>
              <Button type="button" variant="primary" onClick={onConfirmSwap} loading={pending} className="w-full">
                {pending ? "Swapping…" : actionError ? "Retry swap" : "Swap them"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="move-employee-map-confirm-title" className="text-base font-semibold">
              Move {formatDisplayName(sourceEmployeeName)} to {formatSeatCode(moveEmployeeTargetSeat.label)}<SeatFloorTag tag={crossFloorTag(moveEmployeeTargetSeat, moveEmployeeSourceSeat)} />?
            </h2>
            <p id="move-employee-map-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-helper)]">
              They currently sit at {formatSeatCode(moveEmployeeSourceSeat.label)}<SeatFloorTag tag={crossFloorTag(moveEmployeeSourceSeat, moveEmployeeTargetSeat)} />. Moving frees {formatSeatCode(moveEmployeeSourceSeat.label)} (it becomes Open). {PUBLISH_IMPACT_NOTE}
            </p>
            {moveErrorAlert}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={onCancel} disabled={pending} className="w-full">Cancel</Button>
              <Button type="button" variant="primary" onClick={onConfirmMove} loading={pending} className="w-full">
                {pending ? "Moving…" : actionError ? "Retry move" : "Move them"}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
