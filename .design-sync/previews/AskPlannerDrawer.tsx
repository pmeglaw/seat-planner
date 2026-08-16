import { AskPlannerDrawer } from "seat-planner";

// Answers only arrive via askPlannerAction (shimmed to throw in the preview
// bundle), so these stories stay static: the open prompt state, never a
// queuedRequest (that would invoke the action). Drawer anchors fixed
// top-right on sm+ (top = --admin-chrome-h + 12px, a :root token). Wrapped in
// .admin-theme for the chrome/AI --admin-* tokens.

const handlers = {
  onClose: () => {},
  onHighlightSeats: () => {},
  onClearHighlights: () => {},
  onSelectSeat: () => {}
};

export const Default = () => (
  <div className="admin-theme">
    <AskPlannerDrawer
      open
      draftDirty={false}
      zones={["North Wing", "South Wing", "Records Annex"]}
      queuedRequest={null}
      highlightedSeatIds={[]}
      {...handlers}
    />
  </div>
);

// Unsaved inspector edits pending — the amber exclusion notice under the header.
export const DraftDirty = () => (
  <div className="admin-theme">
    <AskPlannerDrawer
      open
      draftDirty
      zones={["North Wing", "South Wing", "Records Annex"]}
      queuedRequest={null}
      highlightedSeatIds={[]}
      {...handlers}
    />
  </div>
);
