import { LoginForm } from "seat-planner";

// Single-surface login (design 1e): email + password stack, primary beneath,
// magic link behind an "or" divider below the primary. Self-contained — no props.
export const Default = () => (
  <div style={{ maxWidth: 420, margin: "0 auto" }}>
    <LoginForm />
  </div>
);
