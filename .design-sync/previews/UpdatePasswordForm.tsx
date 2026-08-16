import { UpdatePasswordForm } from "seat-planner";

// UpdatePasswordForm is the /auth/update-password card: self-contained state
// (empty fields, idle button) — only the initial render is reachable from
// props. The real page centers it on the app canvas, mirrored here.

export const RecoveryCard = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      padding: "48px 32px",
      background: "var(--sp-color-canvas, #F7F6F2)"
    }}
  >
    <UpdatePasswordForm />
  </div>
);
