import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";

// PR-3 (F-DK-1): `.login-theme` scopes the login zone's token values (light
// AND dark — app/globals.css §3.8) over this page, mirroring the form pane of
// app/login/page.tsx: themed background, 368px centered column, the same
// one-shot Carbon entrance. No sp-zone-chrome / data-chrome here — this page
// has no brand panel, and the form pane on /login is plain themed surface, so
// the #435 focus re-anchor behaves identically on both. The reset journey
// (login → email → here → login) reads as one app because the recipes match.
export default function UpdatePasswordPage() {
  return (
    <main className="login-theme flex min-h-screen items-center justify-center bg-[var(--sp-background)] px-6 py-10 sm:px-10">
      <div className="w-full max-w-[368px] motion-safe:animate-[login-rise-in_0.5s_cubic-bezier(0,0,0.38,0.9)_both]">
        <UpdatePasswordForm />
      </div>
    </main>
  );
}
