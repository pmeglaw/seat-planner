"use client";

import { useCallback, useTransition } from "react";
import { updateSeatAction } from "@/app/actions";
import { buildVacateSeatInput, classifySeatUpdateResult, type SeatDraftOutcome } from "@/lib/seatDraftActions";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { SeatWithEmployee } from "@/lib/types";

/**
 * The React half of the shared seat-draft actions. The payload and the result
 * classification live in lib/seatDraftActions.ts, where the node test tier can
 * reach them; this file owns only what needs React — the transition, and the two
 * side effects it would be dangerous for a second caller to forget:
 *
 *   1. the UNDO SNAPSHOT. `onBeforeSeatUpdate` must be captured before the write
 *      and handed to `onSeatUpdated` after it, or the edit lands with no history
 *      entry and Undo silently skips it.
 *   2. the STALE-DRAFT FENCE. A rejected write is not an error to display; it
 *      means this client's view predates another admin's edit, so the caller has
 *      to reload the draft and clear undo history. A surface that merely showed
 *      the message would leave the user re-arming the same rejected write.
 *
 * Everything surface-local — the inspector's form reset, its error summary, its
 * save feedback — stays with the caller, because those genuinely differ: the
 * inspector's icon-row Vacate (v12 slice 4; formerly the canvas action bar)
 * has no form to settle.
 */

type SeatDraftActionCallbacks = {
  /** Capture the pre-mutation draft so Undo can restore it. */
  onBeforeSeatUpdate: () => DraftSnapshot;
  /** Commit the result to the parent's local state and record undo history. */
  onSeatUpdated: (seat: SeatWithEmployee, beforeSnapshot: DraftSnapshot) => void;
  /** The concurrency fence fired; the parent reloads the draft and resets history. */
  onStaleDraft: (message: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  /**
   * Surface-local sync, run INSIDE the transition immediately before
   * `onSeatUpdated`. It exists so a caller holding its own copy of the seat (the
   * inspector's form) can settle it in the same tick as the shared commit,
   * preserving the ordering the inline implementation had.
   */
  onSaved?: (seat: SeatWithEmployee) => void;
};

export function useSeatDraftActions({
  onBeforeSeatUpdate,
  onSeatUpdated,
  onStaleDraft,
  onDirtyChange,
  onSaved
}: SeatDraftActionCallbacks) {
  const [pending, startTransition] = useTransition();

  const vacateSeat = useCallback(
    (seat: SeatWithEmployee) =>
      new Promise<SeatDraftOutcome>(resolve => {
        // Captured before the transition opens: the snapshot must describe the
        // draft as it stood when the user pressed the button, not after any
        // concurrent state settles.
        const beforeSnapshot = onBeforeSeatUpdate();

        startTransition(async () => {
          try {
            const outcome = classifySeatUpdateResult(await updateSeatAction(buildVacateSeatInput(seat)));

            if (outcome.kind === "saved") {
              onDirtyChange(false);
              onSaved?.(outcome.seat);
              onSeatUpdated(outcome.seat, beforeSnapshot);
            } else if (outcome.kind === "stale") {
              onDirtyChange(false);
              onStaleDraft(outcome.message);
            }

            resolve(outcome);
          } catch (error) {
            // Only genuinely unexpected failures (network, auth) reach here —
            // expected failures arrive as data so the message survives
            // production's digest stripping.
            resolve({
              kind: "failed",
              message: error instanceof Error ? error.message : "Could not vacate seat."
            });
          }
        });
      }),
    [onBeforeSeatUpdate, onDirtyChange, onSaved, onSeatUpdated, onStaleDraft]
  );

  return { pending, vacateSeat };
}
