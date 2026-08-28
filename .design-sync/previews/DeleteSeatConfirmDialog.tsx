import { DeleteSeatConfirmDialog } from "seat-planner";

// Only custom draft seats can be deleted — label reads as one of the
// admin-added overflow seats. Admin-theme wrapper: danger callout + buttons
// read --sp-* role tokens. Explicit stage: the harness story root is
// transformed, so the fixed overlay resolves against this wrapper — without a
// real height the backdrop collapses and the card top clips above the shot.

const stage = { position: "relative" as const, height: 512, transform: "translateZ(0)" };

export const Default = () => (
  <div className="admin-theme" style={stage}>
    <DeleteSeatConfirmDialog
      label="D-07"
      pending={false}
      onCancel={() => {}}
      onConfirm={() => {}}
    />
  </div>
);
