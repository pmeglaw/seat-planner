// One source for "changed in draft" (Phase 4 PR 3b, P3-14): the ◇ badge on a
// pill, the inspector's "Changed in draft" note and the legend's draft count
// all read the SAME set, derived from the publish diff — never a second
// ad-hoc comparison that could disagree with what the review sheet lists.
import type { PublishChangeSummary } from "@/lib/publishSummary";

// Seat labels the publish review would list as changed on the draft layer.
// Removed seats are not on the draft map (nothing to badge); employee-detail
// changes are people edits, not seat changes (they have no seat label).
export function draftChangedSeatLabels(summary: Pick<PublishChangeSummary, "addedSeats" | "assignmentChanges" | "vacatedSeats" | "statusChanges" | "otherChanges">): Set<string> {
  return new Set(
    [
      ...summary.addedSeats,
      ...summary.assignmentChanges,
      ...summary.vacatedSeats,
      ...summary.statusChanges,
      ...summary.otherChanges
    ].map(item => item.label)
  );
}
