import { VacateConfirmDialog } from "seat-planner";

// Fixed inset-0 overlay. The harness story root is transformed (translateZ),
// so position:fixed resolves against it — and a fixed-only child gives it 0px
// height, which collapses the backdrop and centers the card on a zero line
// (top half above the shot). Give the wrapper the stage explicitly: own
// transform + 512px (560 viewport minus the 24px capture gutters).
// Wrapped in .admin-theme: the card + danger CTA read --admin-* tokens.

const stage = { position: "relative" as const, height: 512, transform: "translateZ(0)" };

export const Default = () => (
  <div className="admin-theme" style={stage}>
    <VacateConfirmDialog
      label="A-12"
      occupantName="Anahit Petrosyan"
      pending={false}
      onCancel={() => {}}
      onConfirm={() => {}}
    />
  </div>
);
