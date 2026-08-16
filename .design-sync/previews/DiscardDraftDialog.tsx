import { DiscardDraftDialog } from "seat-planner";

// Destructive whole-draft reset. Admin-theme wrapper: card, error panel and
// danger CTA read --admin-* tokens. Explicit stage: the harness story root is
// transformed, so the fixed overlay resolves against this wrapper — without a
// real height the backdrop collapses and the card top clips above the shot.

const stage = { position: "relative" as const, height: 512, transform: "translateZ(0)" };

export const Default = () => (
  <div className="admin-theme" style={stage}>
    <DiscardDraftDialog
      totalChangeCount={12}
      actionError={null}
      pending={false}
      onCancel={() => {}}
      onConfirm={() => {}}
    />
  </div>
);

// Failed discard: inline error panel + the CTA relabelled "Retry discard".
export const ErrorRetry = () => (
  <div className="admin-theme" style={stage}>
    <DiscardDraftDialog
      totalChangeCount={12}
      actionError="The draft changed in another session. Refresh to load the latest draft, then retry."
      pending={false}
      onCancel={() => {}}
      onConfirm={() => {}}
    />
  </div>
);
