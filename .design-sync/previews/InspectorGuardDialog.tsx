import { InspectorGuardDialog } from "seat-planner";

// Unsaved-edits guard. actionDescription mirrors SeatMap's
// describeInspectorGuardAction copy ("opening another seat."). Admin-theme
// wrapper: the Button primitives read --sp-* role tokens. Explicit stage: the
// harness story root is transformed, so the fixed overlay resolves against
// this wrapper — without a real height the backdrop collapses and the card
// top clips above the shot.

const stage = { position: "relative" as const, height: 512, transform: "translateZ(0)" };

export const Default = () => (
  <div className="admin-theme" style={stage}>
    <InspectorGuardDialog
      seatLabel="A-12"
      actionDescription="opening another seat."
      pending={false}
      onKeepEditing={() => {}}
      onDiscard={() => {}}
      onSave={() => {}}
    />
  </div>
);
