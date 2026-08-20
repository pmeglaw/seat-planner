import { AskPlannerDrawer } from "seat-planner";

// Answers only arrive via askPlannerAction (shimmed to throw in the preview
// bundle), so these stories stay static: the open prompt state, never a
// queuedRequest (that would invoke the action). Drawer anchors fixed
// top-right on sm+ (top = --admin-chrome-h + 12px, a :root token). Wrapped in
// .admin-theme for the chrome/AI --admin-* tokens.

// Explicit stage: the harness story root is transformed, so the drawer's
// `fixed` positioning resolves against this wrapper. Without a real height the
// wrapper collapses to 0px, the `fixed inset-0` scrim paints nothing (drawer
// floats on bare white) and the panel is pushed down by the root's 24px
// padding until its bottom edge runs off the 900x620 frame. The negative
// margin cancels that padding so the stage — and the scrim — fill the shot.
const stage = {
  position: "relative" as const,
  height: 620,
  margin: -24,
  transform: "translateZ(0)"
};

const handlers = {
  onClose: () => {},
  onHighlightSeats: () => {},
  onClearHighlights: () => {},
  onSelectSeat: () => {}
};

export const Default = () => (
  <div className="admin-theme" style={stage}>
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

// Unsaved inspector edits pending — the teal exclusion notice under the header
// (the amber status family was retired in #421).
export const DraftDirty = () => (
  <div className="admin-theme" style={stage}>
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
