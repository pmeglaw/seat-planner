import { UpdatePasswordForm } from "seat-planner";

// UpdatePasswordForm is the /auth/update-password card: self-contained state
// (empty fields, idle button) — only the initial render is reachable from
// props.
//
// The `login-theme` class is load-bearing, exactly as it is for LoginForm:
// app/auth/update-password/page.tsx scopes the login zone's token values onto
// its <main>, and every colour this form paints reads a `--sp-*` role that
// only that zone re-points. Without the wrapper `--sp-field` is undefined
// anywhere outside `.admin-theme`/`.login-theme`, so both password inputs lose
// their fill, and the primary paints the app-wide `--sp-button-primary`
// (#D23F0A) instead of the login copper (#B85207). The 368px column and
// --sp-background pane mirror the real page.
export const RecoveryCard = () => (
  <div
    className="login-theme"
    style={{
      display: "flex",
      justifyContent: "center",
      background: "var(--sp-background)",
      padding: "48px 32px"
    }}
  >
    <div style={{ width: 368 }}>
      <UpdatePasswordForm />
    </div>
  </div>
);
