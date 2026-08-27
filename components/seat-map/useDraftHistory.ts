"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  DRAFT_HISTORY_STORAGE_KEY,
  canAdoptPersistedHistory,
  canRedoDraftHistory,
  canUndoDraftHistory,
  clearDraftHistory,
  createDraftHistory,
  createDraftSnapshot,
  deserializeDraftHistory,
  draftStatesEquivalent,
  parseAddedSeatLabel,
  pushDraftHistory,
  redoDraftHistory,
  serializeDraftHistory,
  undoDraftHistory,
  type DraftHistoryState,
  type DraftSnapshot
} from "@/lib/draftHistory";
import { clientActionErrorMessage } from "@/lib/clientActionError";
import { listDraftSeatExpectations } from "@/lib/draftConcurrency";
import { restoreDraftSnapshotAction } from "@/app/actions";
import type { Employee, SeatWithEmployee } from "@/lib/types";

type RestoredPayload = {
  seats: SeatWithEmployee[];
  employees: Employee[];
};

type UseDraftHistoryArgs = {
  canEdit: boolean;
  localSeats: SeatWithEmployee[];
  localEmployees: Employee[];
  inspectorDirty: boolean;
  /**
   * Apply a restored server payload. Parent owns local state + mode cleanup.
   * `options.selectSeatLabel` is set when redoing an "Add …" entry so the
   * newly restored seat can be re-selected.
   */
  onRestored: (payload: RestoredPayload, options?: { selectSeatLabel?: string }) => void;
  /** Concurrency fence or client-side adjacency break. */
  onStaleDraft: (message: string) => void;
  onNotice: (text: string | null, tone?: "success" | "neutral") => void;
  onError: (message: string | null) => void;
};

export type UseDraftHistoryReturn = {
  draftHistory: DraftHistoryState;
  undoAvailable: boolean;
  redoAvailable: boolean;
  lastUndoLabel: string | null;
  nextRedoLabel: string | null;
  mutationInFlight: boolean;
  setMutationInFlight: (value: boolean) => void;
  /**
   * Which history restore is currently round-tripping ("Undo" / "Redo"),
   * so the icon buttons can swap their glyph for a spinner (PR-5 §8.1 —
   * `mutationInFlight` alone is true for EVERY mutation, not just these).
   */
  historyOpInFlight: "Undo" | "Redo" | null;
  captureDraftSnapshot: () => DraftSnapshot;
  recordDraftHistory: (
    label: string,
    before: DraftSnapshot,
    afterSeats: SeatWithEmployee[],
    afterEmployees: Employee[]
  ) => void;
  undoDraftEdit: () => void;
  redoDraftEdit: () => void;
  clearHistory: () => void;
  activityForSeat: (seatLabel: string | undefined) => string[];
};

/**
 * Owns the admin draft undo/redo stacks, sessionStorage persistence,
 * the adjacency invariant, and the restore server-action path.
 *
 * Parent keeps live localSeats/localEmployees and mode/selection state.
 */
export function useDraftHistory({
  canEdit,
  localSeats,
  localEmployees,
  inspectorDirty,
  onRestored,
  onStaleDraft,
  onNotice,
  onError
}: UseDraftHistoryArgs): UseDraftHistoryReturn {
  const [draftHistory, setDraftHistory] = useState(() => createDraftHistory());
  const [mutationInFlight, setMutationInFlight] = useState(false);
  const [historyOpInFlight, setHistoryOpInFlight] = useState<"Undo" | "Redo" | null>(null);
  const [, startTransition] = useTransition();

  // --- Persistence (sessionStorage, per-tab) --------------------------------

  // Adopt on mount only. Same adjacency rule that guards every undo click.
  useEffect(() => {
    if (!canEdit) return;
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(DRAFT_HISTORY_STORAGE_KEY);
    } catch {
      return;
    }
    const persisted = deserializeDraftHistory(stored);
    if (!persisted) return;
    setDraftHistory(current => {
      if (canUndoDraftHistory(current) || canRedoDraftHistory(current)) return current;
      return canAdoptPersistedHistory(persisted, createDraftSnapshot(localSeats, localEmployees))
        ? persisted
        : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  // Mirror every change; cleared stacks also clear the key.
  useEffect(() => {
    if (!canEdit) return;
    try {
      if (canUndoDraftHistory(draftHistory) || canRedoDraftHistory(draftHistory)) {
        window.sessionStorage.setItem(DRAFT_HISTORY_STORAGE_KEY, serializeDraftHistory(draftHistory));
      } else {
        window.sessionStorage.removeItem(DRAFT_HISTORY_STORAGE_KEY);
      }
    } catch {
      // Storage unavailable or over quota: degrade to in-memory only.
    }
  }, [canEdit, draftHistory]);

  // --- Core ops -------------------------------------------------------------

  const captureDraftSnapshot = useCallback(
    () => createDraftSnapshot(localSeats, localEmployees),
    [localSeats, localEmployees]
  );

  const recordDraftHistory = useCallback(
    (label: string, before: DraftSnapshot, afterSeats: SeatWithEmployee[], afterEmployees: Employee[]) => {
      const after = createDraftSnapshot(afterSeats, afterEmployees);
      setDraftHistory(current => pushDraftHistory(current, { label, before, after }));
    },
    []
  );

  const clearHistory = useCallback(() => {
    setDraftHistory(clearDraftHistory());
  }, []);

  const restoreHistorySnapshot = useCallback(
    (
      snapshot: DraftSnapshot,
      nextHistory: DraftHistoryState,
      actionLabel: "Undo" | "Redo",
      notice: string,
      selectRestoredSeatLabel?: string
    ) => {
      if (inspectorDirty) {
        onNotice(null);
        onError("Save or discard the selected seat edits before using Undo or Redo.");
        return;
      }

      startTransition(async () => {
        setMutationInFlight(true);
        setHistoryOpInFlight(actionLabel);
        try {
          onError(null);
          onNotice(null);
          // Fence on the draft this page currently holds (NOT the snapshot).
          const result = await restoreDraftSnapshotAction(
            snapshot,
            listDraftSeatExpectations(localSeats)
          );
          if (!result.ok) {
            onStaleDraft(result.message);
            return;
          }
          onRestored(result, selectRestoredSeatLabel ? { selectSeatLabel: selectRestoredSeatLabel } : undefined);
          setDraftHistory(nextHistory);
          onNotice(notice);
        } catch (error) {
          onNotice(null);
          onError(clientActionErrorMessage(error, `Could not ${actionLabel.toLowerCase()} draft edit.`));
        } finally {
          setMutationInFlight(false);
          setHistoryOpInFlight(null);
        }
      });
    },
    [inspectorDirty, localSeats, onError, onNotice, onRestored, onStaleDraft]
  );

  // Live draft must still equal the state the entry left it in.
  const historyAdjacencyBroken = useCallback(
    (expectedCurrent: DraftSnapshot) =>
      !draftStatesEquivalent(createDraftSnapshot(localSeats, localEmployees), expectedCurrent),
    [localSeats, localEmployees]
  );

  const undoDraftEdit = useCallback(() => {
    const result = undoDraftHistory(draftHistory);
    if (!result) return;
    if (historyAdjacencyBroken(result.entry.after)) {
      onStaleDraft(
        "The draft changed in another session after this edit was made, so undoing it is no longer safe."
      );
      return;
    }
    restoreHistorySnapshot(result.snapshot, result.history, "Undo", `Undid ${result.entry.label}.`);
  }, [draftHistory, historyAdjacencyBroken, onStaleDraft, restoreHistorySnapshot]);

  const redoDraftEdit = useCallback(() => {
    const result = redoDraftHistory(draftHistory);
    if (!result) return;
    if (historyAdjacencyBroken(result.entry.before)) {
      onStaleDraft(
        "The draft changed in another session after this edit was undone, so redoing it is no longer safe."
      );
      return;
    }
    const addSeatLabel = parseAddedSeatLabel(result.entry.label) ?? undefined;
    restoreHistorySnapshot(
      result.snapshot,
      result.history,
      "Redo",
      `Redid ${result.entry.label}.`,
      addSeatLabel
    );
  }, [draftHistory, historyAdjacencyBroken, onStaleDraft, restoreHistorySnapshot]);

  // --- Derived --------------------------------------------------------------

  const undoAvailable = canUndoDraftHistory(draftHistory);
  const redoAvailable = canRedoDraftHistory(draftHistory);
  const lastUndoLabel = draftHistory.undoStack.at(-1)?.label ?? null;
  const nextRedoLabel = draftHistory.redoStack.at(-1)?.label ?? null;

  const activityForSeat = useCallback(
    (seatLabel: string | undefined) => {
      if (!seatLabel) return [];
      return draftHistory.undoStack
        .filter(entry => entry.label.split(/\s+/).includes(seatLabel))
        .slice(-5)
        .reverse()
        .map(entry => entry.label);
    },
    [draftHistory]
  );

  return {
    draftHistory,
    undoAvailable,
    redoAvailable,
    lastUndoLabel,
    nextRedoLabel,
    mutationInFlight,
    setMutationInFlight,
    historyOpInFlight,
    captureDraftSnapshot,
    recordDraftHistory,
    undoDraftEdit,
    redoDraftEdit,
    clearHistory,
    activityForSeat
  };
}
