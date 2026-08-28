import { PublishReviewDialog } from "seat-planner";
import type { ReactNode } from "react";

// Publish review = the gate between the shared draft and the read-only viewer.
// Shapes mirror lib/publishSummary.ts: PublishChangeSummary + PublishDiffRow[]
// + a full Record of the six diff-row kinds. All stories wrapped in
// .admin-theme (diff tags, ready panel, CTA all read --sp-* role tokens).

type Item = { label: string; detail: string };

const summary = (over: {
  draftSeatCount: number;
  publishedSeatCount: number;
  addedSeats?: Item[];
  removedSeats?: Item[];
  assignmentChanges?: Item[];
  vacatedSeats?: Item[];
  statusChanges?: Item[];
  otherChanges?: Item[];
  employeeDetailChanges?: Item[];
  updatedSeatCount: number;
  totalChangeCount: number;
  hasChanges: boolean;
}) => ({
  addedSeats: [],
  removedSeats: [],
  assignmentChanges: [],
  vacatedSeats: [],
  statusChanges: [],
  otherChanges: [],
  employeeDetailChanges: [],
  ...over
});

const counts = (over: Partial<Record<"added" | "removed" | "assigned" | "vacated" | "reassigned" | "updated", number>> = {}) => ({
  added: 0,
  removed: 0,
  assigned: 0,
  vacated: 0,
  reassigned: 0,
  updated: 0,
  ...over
});

// Explicit stage: the harness story root is transformed, so the fixed overlay
// resolves against this wrapper — without a real height the backdrop collapses
// and the dialog top clips above the shot. 512 = 560 viewport minus gutters.
const stage = { position: "relative" as const, height: 512, transform: "translateZ(0)" };

const Frame = ({ children }: { children: ReactNode }) => <div className="admin-theme" style={stage}>{children}</div>;

// Mixed review: Marcus Webb takes A-12 from Anahit Petrosyan (who moves to
// A-14), B-03 opens up, C-02 keeps Dana Whitfield but her seat notes changed,
// and a custom Estate Planning seat D-07 is new — plus two directory edits.
export const Default = () => (
  <Frame>
    <PublishReviewDialog
      publishSummary={summary({
        draftSeatCount: 48,
        publishedSeatCount: 47,
        addedSeats: [{ label: "D-07", detail: "Estate Planning · Open seat" }],
        assignmentChanges: [
          { label: "A-12", detail: "Anahit Petrosyan -> Marcus Webb" },
          { label: "A-14", detail: "Open -> Anahit Petrosyan" }
        ],
        vacatedSeats: [{ label: "B-03", detail: "Marcus Webb -> Open" }],
        otherChanges: [{ label: "C-02", detail: "Notes changed" }],
        employeeDetailChanges: [
          { label: "Marcus Webb", detail: "Title Associate Attorney -> Senior Associate" },
          { label: "Silva Torosyan", detail: "New in the viewer directory" }
        ],
        updatedSeatCount: 4,
        totalChangeCount: 7,
        hasChanges: true
      })}
      publishDiffRows={[
        { key: "a-12", label: "A-12", kind: "reassigned", from: "Anahit Petrosyan", to: "Marcus Webb", detail: "Department Litigation -> Intake" },
        { key: "a-14", label: "A-14", kind: "assigned", from: "Open seat", to: "Anahit Petrosyan", detail: null },
        { key: "b-03", label: "B-03", kind: "vacated", from: "Marcus Webb", to: "Open seat", detail: null },
        { key: "c-02", label: "C-02", kind: "updated", from: "Dana Whitfield", to: "Dana Whitfield", detail: "Notes changed" },
        { key: "d-07", label: "D-07", kind: "added", from: "—", to: "Open seat", detail: "Estate Planning" }
      ]}
      publishDiffCounts={counts({ assigned: 1, vacated: 1, reassigned: 1, added: 1, updated: 1 })}
      actionError={null}
      pending={false}
      onClose={() => {}}
      onConfirm={() => {}}
    />
  </Frame>
);

// Directory-only publish: no seat rows, only people details changed — the
// zero-chip row plus the "No seat changes" fallback and People details list.
export const PeopleDetailsOnly = () => (
  <Frame>
    <PublishReviewDialog
      publishSummary={summary({
        draftSeatCount: 47,
        publishedSeatCount: 47,
        employeeDetailChanges: [
          { label: "Anahit Petrosyan", detail: "Ext. 204 -> 219" },
          { label: "Dana Whitfield", detail: "Title Records Clerk -> Senior Records Clerk" },
          { label: "Rafael Ortiz", detail: "New in the viewer directory" }
        ],
        updatedSeatCount: 0,
        totalChangeCount: 3,
        hasChanges: true
      })}
      publishDiffRows={[]}
      publishDiffCounts={counts()}
      actionError={null}
      pending={false}
      onClose={() => {}}
      onConfirm={() => {}}
    />
  </Frame>
);

// Draft already matches the viewer: green in-sync panel, publish CTA disabled.
export const NoChanges = () => (
  <Frame>
    <PublishReviewDialog
      publishSummary={summary({
        draftSeatCount: 47,
        publishedSeatCount: 47,
        updatedSeatCount: 0,
        totalChangeCount: 0,
        hasChanges: false
      })}
      publishDiffRows={[]}
      publishDiffCounts={counts()}
      actionError={null}
      pending={false}
      onClose={() => {}}
      onConfirm={() => {}}
    />
  </Frame>
);
