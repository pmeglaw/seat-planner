import { LoginForm } from "seat-planner";

// Single-surface login (design 1e): email + password stack, primary beneath,
// magic link behind an "or" divider below the primary. Self-contained — no props.
//
// The `login-theme` class is load-bearing: every colour the form paints comes
// from a `--login-*` custom property that app/login/page.tsx scopes to that
// class on its <main>. Without the wrapper the primary button paints
// `bg-[var(--login-accent)] text-white` against an undefined background — a
// white-on-white invisible button. The 368px column and --login-bg pane mirror
// the form pane of the real split-screen page.
export const Default = () => (
  <div
    className="login-theme"
    style={{
      display: "flex",
      justifyContent: "center",
      background: "var(--login-bg)",
      padding: "40px 24px"
    }}
  >
    <div style={{ width: 368 }}>
      <LoginForm />
    </div>
  </div>
);
