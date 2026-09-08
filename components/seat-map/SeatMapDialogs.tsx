"use client";

// The map's confirm dialogs, extracted from SeatMap.tsx (R-02a / M4 step 1;
// the publish review left for PublishReviewSheet.tsx — the wide tearsheet —
// in Phase 4 PR 3b). All state and mutation logic stays in SeatMap; these
// components receive already-computed values and callbacks.
//
// Phase 4 PR 5b: every dialog here renders on the asset modal through the
// shared CarbonModal host (PHASE2UX §3 "Modal (Move / Swap / Delete confirms)
// → asset .cds-modal"; PHASE3DS §1.17 amendment; PHASE4BUILD §1.47, owner
// rulings R-1…R-3). The host owns the overlay (mousedown cancelled), the
// aria-modal section, useDialogFocus (first control = Cancel, Tab trap,
// restore), and Esc — never while busy. This file owns the copy, the verbs,
// the pending / error contracts and the footer buttons: secondary first,
// then the primary — `cds-btn--danger` on Vacate / Delete seat / Discard
// draft (data destruction), `cds-btn--primary` on Swap / Move (R-2). No ×:
// Cancel · Esc are the exits (R-3). The confirms are `role="alertdialog"`;
// the inspector guard — a choice, not an alert — stays `role="dialog"` on
// the one three-button footer (sheet amendment F, 25/25/50). Every dialog
// carries the asset's eyebrow (R-4, found at review): the verb family over
// the question — the guard carries the inspector's own eyebrow.
//
// Error placement (dialog-error-placement): the failure renders INSIDE the
// modal body as a focusable error notification and takes focus once the
// action settles; the primary relabels to `Retry <verb>`; Cancel disables
// while pending. Label expressions are kept character-for-character —
// pending-state-source pins them.

import { useEffect, useRef, type ReactNode } from "react";
import { PUBLISH_IMPACT_NOTE } from "@/lib/copy";
import { floorOf } from "@/lib/floorIds";
import { FLOORS } from "@/lib/floors";
import { formatDisplayName, formatSeatCode } from "@/lib/formatName";
import type { SeatWithEmployee } from "@/lib/types";
import { CarbonModal } from "@/components/ui/CarbonModal";
import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";

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

// The asset tag (D2′ floors tagged with `.cds-tag`) — the one rounded
// surface in the system; inline after the seat code.
function SeatFloorTag({ tag }: { tag: string | null }) {
  if (!tag) return null;
  return <span className="cds-tag ml-2 align-middle">{tag}</span>;
}

/** The in-modal error notification: glyph + text (two signals), role="alert",
 *  focusable so the dialog can land focus on it once the action settles. */
function DialogErrorNotification({
  errorRef,
  children
}: {
  errorRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div ref={errorRef} tabIndex={-1} role="alert" className="cds-notification cds-notification--error focus-visible:outline-none">
      <NotificationGlyph kind="error" />
      <div className="cds-notification-text">{children}</div>
    </div>
  );
}

// Focus lands on the error once the action has settled (not mid-flight).
function useSettledErrorFocus(actionError: string | null, pending: boolean) {
  const errorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (actionError && !pending) errorRef.current?.focus();
  }, [actionError, pending]);
  return errorRef;
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
  // PR-5 (§8.1): the dialog holds open until the action resolves, so a
  // failure renders here instead of on the canvas banner under the scrim;
  // SeatMap suppresses that banner while this is open.
  const vacateErrorRef = useSettledErrorFocus(actionError, pending);
  return (
    <CarbonModal
      titleId="vacate-seat-confirm-title"
      eyebrow="Vacate seat"
      title={`Vacate ${formatSeatCode(label)}?`}
      role="alertdialog"
      describedBy="vacate-seat-confirm-description"
      busy={pending}
      onEscape={onCancel}
      footer={
        <>
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="cds-btn cds-btn--danger" onClick={onConfirm} disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Vacating…" : actionError ? "Retry vacate" : "Vacate seat"}
          </button>
        </>
      }
    >
      <p id="vacate-seat-confirm-description">
        This clears {formatDisplayName(occupantName)} from this draft seat. {PUBLISH_IMPACT_NOTE}
      </p>
      {actionError && !pending && (
        <DialogErrorNotification errorRef={vacateErrorRef}>
          <strong>Vacate did not complete.</strong> {actionError}
        </DialogErrorNotification>
      )}
    </CarbonModal>
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
  // PR-5 (§8.1): stays open through the round-trip — see VacateConfirmDialog.
  const deleteErrorRef = useSettledErrorFocus(actionError, pending);
  return (
    <CarbonModal
      titleId="delete-seat-confirm-title"
      eyebrow="Delete seat"
      title={`Delete custom seat ${label}?`}
      role="alertdialog"
      describedBy="delete-seat-confirm-description"
      busy={pending}
      onEscape={onCancel}
      footer={
        <>
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="cds-btn cds-btn--danger" onClick={onConfirm} disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Deleting…" : actionError ? "Retry delete" : "Delete seat"}
          </button>
        </>
      }
    >
      <p id="delete-seat-confirm-description">
        Only available custom draft seats can be deleted. Original seats are protected.
      </p>
      {/* Body text, not an error-styled block: a scope statement, not a failure. */}
      <p>This removes custom draft seats only. Published maps are unchanged until you publish.</p>
      {actionError && !pending && (
        <DialogErrorNotification errorRef={deleteErrorRef}>
          <strong>Delete did not complete.</strong> {actionError}
        </DialogErrorNotification>
      )}
    </CarbonModal>
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
  // PR 5b: the discard error joins the other six — the focusable
  // notification with the verb line (it was a bare <p role="alert">).
  const discardErrorRef = useSettledErrorFocus(actionError, pending);
  return (
    <CarbonModal
      titleId="discard-draft-title"
      eyebrow="Discard draft changes"
      title="Discard all draft changes?"
      role="alertdialog"
      describedBy="discard-draft-description"
      busy={pending}
      onEscape={onCancel}
      footer={
        <>
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onCancel} disabled={pending}>
            Keep draft changes
          </button>
          <button type="button" className="cds-btn cds-btn--danger" onClick={onConfirm} disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Discarding…" : actionError ? "Retry discard" : "Discard everything"}
          </button>
        </>
      }
    >
      <p id="discard-draft-description">
        Every reviewed seat change ({totalChangeCount === 1 ? "1 change" : `${totalChangeCount} changes`}) is
        erased and the draft goes back to exactly what viewers see today. People edits in Management are kept.
        This cannot be undone — Undo/Redo history is cleared.
      </p>
      {actionError && !pending && (
        <DialogErrorNotification errorRef={discardErrorRef}>
          <strong>Discard did not complete.</strong> {actionError}
        </DialogErrorNotification>
      )}
    </CarbonModal>
  );
}

export function InspectorGuardDialog({
  seatLabel,
  eyebrow,
  actionDescription,
  pending,
  onKeepEditing,
  onDiscard,
  onSave
}: {
  seatLabel: string;
  /** The inspector's own eyebrow ("Seat CW01 · Center West") — the guard speaks for the panel it protects (R-4). */
  eyebrow: string;
  actionDescription: string;
  pending: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  // A choice, not an alert: `role="dialog"`, plain primary (Save changes),
  // Discard at secondary weight (PHASE3DS §1.24 dirty-close rule; R-2) on
  // Carbon's three-button footer (amendment F).
  return (
    <CarbonModal
      titleId="inspector-unsaved-title"
      eyebrow={eyebrow}
      title="Unsaved seat edits"
      describedBy="inspector-unsaved-description"
      busy={pending}
      onEscape={onKeepEditing}
      footerColumns={3}
      footer={
        <>
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onKeepEditing} disabled={pending}>
            Keep editing
          </button>
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onDiscard} disabled={pending}>
            Discard
          </button>
          <button type="button" className="cds-btn cds-btn--primary" onClick={onSave} disabled={pending}>
            Save changes
          </button>
        </>
      }
    >
      <p id="inspector-unsaved-description">
        Save or discard changes to {seatLabel} before {actionDescription}
      </p>
    </CarbonModal>
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
  // PR-4 (F-INT-4 family): a thrown swap error used to paint the canvas
  // banner UNDER this dialog's scrim — the dialog stayed open and looked
  // dead. The error renders inline (SeatMap suppresses the canvas banner
  // while this dialog is open) and takes focus so the failure is announced
  // where the admin is looking.
  const swapErrorRef = useSettledErrorFocus(actionError, pending);
  return (
    <CarbonModal
      titleId="swap-confirm-title"
      eyebrow="Swap seats"
      title="Confirm seat swap"
      role="alertdialog"
      describedBy="swap-confirm-description"
      busy={pending}
      onEscape={onCancel}
      footer={
        <>
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="cds-btn cds-btn--primary" onClick={onConfirm} disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Swapping…" : actionError ? "Retry swap" : "Confirm swap"}
          </button>
        </>
      }
    >
      <p id="swap-confirm-description">This updates draft seats only. {PUBLISH_IMPACT_NOTE}</p>
      <ul>
        <li>
          Source: {swapSourceSeat.label}
          <SeatFloorTag tag={crossFloorTag(swapSourceSeat, swapTargetSeat)} /> · {seatPersonLabel(swapSourceSeat)}
        </li>
        <li>
          Target: {swapTargetSeat.label}
          <SeatFloorTag tag={crossFloorTag(swapTargetSeat, swapSourceSeat)} /> · {seatPersonLabel(swapTargetSeat)}
        </li>
      </ul>
      <p>{buildSwapSummary(swapSourceSeat, swapTargetSeat)}</p>
      {actionError && !pending && (
        <DialogErrorNotification errorRef={swapErrorRef}>
          <strong>Swap did not complete.</strong> {actionError}
        </DialogErrorNotification>
      )}
    </CarbonModal>
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
  // PR-5 (§8.1): stays open through the round-trip (both arms — the swap arm
  // runs executeSwap dialog-less, so this surface carries its pending story).
  const moveErrorRef = useSettledErrorFocus(actionError, pending);
  const moveErrorAlert = actionError && !pending ? (
    <DialogErrorNotification errorRef={moveErrorRef}>
      <strong>Move did not complete.</strong> {actionError}
    </DialogErrorNotification>
  ) : null;
  const targetTag = crossFloorTag(moveEmployeeTargetSeat, moveEmployeeSourceSeat);
  const sourceTag = crossFloorTag(moveEmployeeSourceSeat, moveEmployeeTargetSeat);
  if (offerSwap) {
    return (
      <CarbonModal
        titleId="move-employee-map-confirm-title"
        eyebrow="Move employee"
        title={`Swap ${formatDisplayName(sourceEmployeeName)} and ${formatDisplayName(seatPersonLabel(moveEmployeeTargetSeat))}?`}
        role="alertdialog"
        describedBy="move-employee-map-confirm-description"
        busy={pending}
        onEscape={onCancel}
        footer={
          <>
            <button type="button" className="cds-btn cds-btn--secondary" onClick={onCancel} disabled={pending}>Cancel</button>
            <button type="button" className="cds-btn cds-btn--primary" onClick={onConfirmSwap} disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Swapping…" : actionError ? "Retry swap" : "Swap them"}
            </button>
          </>
        }
      >
        <p id="move-employee-map-confirm-description">
          {formatDisplayName(seatPersonLabel(moveEmployeeTargetSeat))} already sits at {formatSeatCode(moveEmployeeTargetSeat.label)}<SeatFloorTag tag={targetTag} />. Swapping moves them to {formatSeatCode(moveEmployeeSourceSeat.label)}<SeatFloorTag tag={sourceTag} />. {PUBLISH_IMPACT_NOTE}
        </p>
        <p>{buildSwapSummary(moveEmployeeSourceSeat, moveEmployeeTargetSeat)}</p>
        {moveErrorAlert}
      </CarbonModal>
    );
  }
  return (
    <CarbonModal
      titleId="move-employee-map-confirm-title"
      eyebrow="Move employee"
      title={<>Move {formatDisplayName(sourceEmployeeName)} to {formatSeatCode(moveEmployeeTargetSeat.label)}<SeatFloorTag tag={targetTag} />?</>}
      role="alertdialog"
      describedBy="move-employee-map-confirm-description"
      busy={pending}
      onEscape={onCancel}
      footer={
        <>
          <button type="button" className="cds-btn cds-btn--secondary" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="button" className="cds-btn cds-btn--primary" onClick={onConfirmMove} disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Moving…" : actionError ? "Retry move" : "Move them"}
          </button>
        </>
      }
    >
      <p id="move-employee-map-confirm-description">
        They currently sit at {formatSeatCode(moveEmployeeSourceSeat.label)}<SeatFloorTag tag={sourceTag} />. Moving frees {formatSeatCode(moveEmployeeSourceSeat.label)} (it becomes Open). {PUBLISH_IMPACT_NOTE}
      </p>
      {moveErrorAlert}
    </CarbonModal>
  );
}
