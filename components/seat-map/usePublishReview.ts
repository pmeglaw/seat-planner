"use client";

// Publish-review state and flow extracted from SeatMap.tsx (R-02a / M4
// step 2 — extraction only, no behavior change). The hook owns the review
// dialog's open state, the concurrency fence captured when the review opens,
// the publish/discard confirm handlers, and the draft-vs-published diff
// memos. SeatMap keeps the live draft mirrors, the shared transition and
// mutation-in-flight gates, and the stale-draft recovery — they arrive here
// as inputs so publish and discard stay on the same commit pipeline (same
// pending flag, same MLS02 recovery) as every other draft mutation.

import { useMemo, useState, type TransitionStartFunction } from "react";
import { publishSeatMapAction, resetDraftToPublishedAction } from "@/app/actions";
import {
  listActiveEmployeeExpectations,
  listDraftSeatExpectations,
  type DraftSeatExpectation,
  type EmployeeExpectation
} from "@/lib/draftConcurrency";
import {
  buildPublishChangeSummary,
  buildPublishDiffRows,
  type PublishDiffRowKind
} from "@/lib/publishSummary";
import { normalizeSeats } from "@/lib/seatNormalize";
import type { Employee, SeatWithEmployee } from "@/lib/types";

export function usePublishReview({
  localSeats,
  localEmployees,
  localPublishedSeats,
  localPublishedEmployees,
  inspectorDirty,
  startTransition,
  setMutationInFlight,
  setActionError,
  setActionNotice,
  setStaleDraftNotice,
  setLocalPublishedSeats,
  setLocalPublishedEmployees,
  clearHistory,
  applyRestoredDraftPayload,
  handleStaleDraft
}: {
  localSeats: SeatWithEmployee[];
  localEmployees: Employee[];
  localPublishedSeats: SeatWithEmployee[];
  localPublishedEmployees: Employee[];
  inspectorDirty: boolean;
  startTransition: TransitionStartFunction;
  setMutationInFlight: (value: boolean) => void;
  setActionError: (message: string | null) => void;
  setActionNotice: (text: string | null, tone?: "success" | "neutral") => void;
  setStaleDraftNotice: (message: string | null) => void;
  setLocalPublishedSeats: (seats: SeatWithEmployee[]) => void;
  setLocalPublishedEmployees: (employees: Employee[]) => void;
  clearHistory: () => void;
  applyRestoredDraftPayload: (payload: { seats: SeatWithEmployee[]; employees: Employee[] }) => void;
  handleStaleDraft: (message: string) => void;
}) {
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  // Concurrency fence for publish: the draft exactly as the review dialog
  // rendered it. Captured when the dialog opens so confirm publishes what the
  // admin approved, not whatever the draft has become since.
  const [publishReviewExpectations, setPublishReviewExpectations] = useState<DraftSeatExpectation[]>([]);
  const [publishReviewEmployeeExpectations, setPublishReviewEmployeeExpectations] = useState<EmployeeExpectation[]>([]);
  // Second confirm layer for "discard all draft changes" — the publish review
  // dialog is the change-by-change review; this is the explicit destructive
  // confirmation on top of it (#reset, owner request 2026-07-23).
  const [discardDraftConfirmOpen, setDiscardDraftConfirmOpen] = useState(false);

  const publishSummary = useMemo(
    () => buildPublishChangeSummary(localSeats, localPublishedSeats, {
      employees: localEmployees,
      publishedEmployees: localPublishedEmployees
    }),
    [localSeats, localPublishedSeats, localEmployees, localPublishedEmployees]
  );
  const publishDiffRows = useMemo(
    () => buildPublishDiffRows(localSeats, localPublishedSeats),
    [localSeats, localPublishedSeats]
  );
  const publishDiffCounts = useMemo(() => {
    const counts: Record<PublishDiffRowKind, number> = { added: 0, removed: 0, assigned: 0, vacated: 0, reassigned: 0, updated: 0 };
    publishDiffRows.forEach(row => { counts[row.kind] += 1; });
    return counts;
  }, [publishDiffRows]);

  function openPublishReview() {
    if (inspectorDirty) {
      setActionNotice(null);
      setActionError("Publish review blocked: Save or discard the selected seat edits before publishing. The publish review only includes saved draft changes.");
      return;
    }

    setActionError(null);
    setActionNotice(null);
    setPublishReviewExpectations(listDraftSeatExpectations(localSeats));
    // Publish also ships the ACTIVE employee directory into the viewer
    // snapshot, so the review's fence covers people data too.
    setPublishReviewEmployeeExpectations(listActiveEmployeeExpectations(localEmployees));
    setPublishReviewOpen(true);
  }

  function confirmPublishDraftMap() {
    const nextPublishedSeats = normalizeSeats(localSeats);
    // Publish also replaces the viewer's employee snapshot with the active
    // live directory; mirror that locally so the summary reads "in sync".
    const nextPublishedEmployees = localEmployees.filter(employee => employee.active);
    setActionError(null);
    setActionNotice(null);
    startTransition(async () => {
      setMutationInFlight(true);
      try {
        const result = await publishSeatMapAction(publishReviewExpectations, publishReviewEmployeeExpectations);
        if (!result.ok) {
          setPublishReviewOpen(false);
          handleStaleDraft(result.message);
          return;
        }
        setLocalPublishedSeats(nextPublishedSeats);
        setLocalPublishedEmployees(nextPublishedEmployees);
        clearHistory();
        setPublishReviewOpen(false);
        setActionNotice("Draft map published. Undo/Redo history was cleared.");
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not publish seat map.");
      } finally {
        setMutationInFlight(false);
      }
    });
  }

  function confirmDiscardDraftChanges() {
    setActionError(null);
    setActionNotice(null);
    startTransition(async () => {
      setMutationInFlight(true);
      try {
        setStaleDraftNotice(null);
        // Fence on the draft this page holds: if another session advanced the
        // draft, discarding would silently erase their edits — reject + reload.
        const result = await resetDraftToPublishedAction(listDraftSeatExpectations(localSeats));
        if (!result.ok) {
          setDiscardDraftConfirmOpen(false);
          setPublishReviewOpen(false);
          handleStaleDraft(result.message);
          return;
        }
        applyRestoredDraftPayload(result);
        clearHistory();
        setDiscardDraftConfirmOpen(false);
        setPublishReviewOpen(false);
        setActionNotice("All draft changes discarded — the draft matches the published map again. Undo/Redo history was cleared.");
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not discard draft changes.");
      } finally {
        setMutationInFlight(false);
      }
    });
  }

  return {
    publishReviewOpen,
    setPublishReviewOpen,
    discardDraftConfirmOpen,
    setDiscardDraftConfirmOpen,
    publishSummary,
    publishDiffRows,
    publishDiffCounts,
    openPublishReview,
    confirmPublishDraftMap,
    confirmDiscardDraftChanges
  };
}
