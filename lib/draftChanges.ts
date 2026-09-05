// One source for "changed in draft" (Phase 4 PR 3b, P3-14): the ◇ badge on a
// pill, the inspector's "Changed in draft" note and the legend's draft count
// all read the SAME set, derived from the publish diff — never a second
// ad-hoc comparison that could disagree with what the review sheet lists.
import type { PublishChangeSummary } from "@/lib/publishSummary";

// Seat labels the publish review would list as changed on the draft layer,
// plus the seat each person with a pending detail edit sits in (PR 3b smoke
// step 3, 2026-09-05: the inspector's Department / Job title / Extension edit
// a PERSON, the header counted it as "Draft — 1 change", and no seat carried
// the ◇ — the pill and inspector that show the changed detail must badge).
// Removed seats are not on the draft map (nothing to badge); a person with no
// draft seat has no pill to badge (the review sheet still lists them).
export function draftChangedSeatLabels(
  summary: Pick<PublishChangeSummary, "addedSeats" | "assignmentChanges" | "vacatedSeats" | "statusChanges" | "otherChanges" | "employeeDetailChanges">,
  draftSeats: ReadonlyArray<{ label: string; employee_id: string | null }> = []
): Set<string> {
  const labels = new Set(
    [
      ...summary.addedSeats,
      ...summary.assignmentChanges,
      ...summary.vacatedSeats,
      ...summary.statusChanges,
      ...summary.otherChanges
    ].map(item => item.label)
  );
  const changedPeople = new Set(summary.employeeDetailChanges.map(item => item.employeeId).filter((id): id is string => Boolean(id)));
  if (changedPeople.size) {
    for (const seat of draftSeats) {
      if (seat.employee_id && changedPeople.has(seat.employee_id)) labels.add(seat.label);
    }
  }
  return labels;
}
