"use client";

import { useState } from "react";
import { cx, focusRingClass } from "@/components/ui/design-system";
import { friendlyAuthMessage, MIN_PASSWORD_LENGTH } from "@/lib/authMessages";
import { assignLocation } from "@/lib/fullNavigation";
import { createClient } from "@/lib/supabase/client";

// PR-3 (AUDIT-2 F-DK-1): this form shares one user journey with the login
// page — reset email → set password → sign in — so it wears the login form's
// exact vocabulary (components/auth/LoginForm.tsx is canonical; the class
// recipes below are copied from its fieldShellClass / fieldLabelClass /
// fieldInputClass / primaryButtonClass, not reinvented). The page route wraps
// this component in `.login-theme` (app/auth/update-password/page.tsx), which
// is what makes every --sp-* token below resolve in BOTH themes — the old
// hardcoded white card was the last pre-token auth surface and was unreadable
// in dark. Field-level validation stays out of scope here (F-FRM, PR-11):
// errors keep announcing through the message block, so the field shells never
// take an invalid state.

// Copied from LoginForm's fieldShellClass, minus the invalid/trailing arms
// this form does not use. The `color:` hint inside border-b-[...] is
// load-bearing — see the LoginForm comment on Tailwind v3's var() type
// ambiguity. Rest rules split by position (LoginForm's 1.4.11 note): the
// first field's subtle rule is the divider between two flush fills, the
// stack's bottom edge keeps --sp-border-strong as the "this is an input"
// boundary.
const fieldShellClass = (restRule: "subtle" | "strong") =>
  cx(
    "relative flex h-14 flex-col justify-center bg-[var(--sp-field)] px-4 transition-[background-color] hover:bg-[var(--sp-field-hover)]",
    restRule === "subtle"
      ? "border-b border-b-[color:var(--sp-border-subtle)]"
      : "border-b border-b-[color:var(--sp-border-strong)]",
    "has-[input:focus]:border-b-2 has-[input:focus]:border-b-[color:var(--sp-button-primary)]"
  );
const fieldLabelClass = "block text-xs font-normal leading-[1.3] text-[var(--sp-text-secondary)]";
// outline-none is safe only because the shell above draws the focus rule.
const fieldInputClass =
  "mt-1 w-full border-0 bg-transparent p-0 text-[13.5px] font-normal leading-[1.4] tracking-[2px] text-[var(--sp-text-primary)] caret-[var(--sp-button-primary)] outline-none placeholder:text-[var(--sp-text-placeholder)]";

export function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("success");
  const [busy, setBusy] = useState(false);

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(`Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.`);
      setMessageType("error");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setMessageType("error");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage(friendlyAuthMessage(error.message));
      setMessageType("error");
      return;
    }

    setMessage("Password updated. Redirecting…");
    setMessageType("success");
    // Full document load — the session credential just changed; see
    // lib/fullNavigation.ts for why this must not be router.push + refresh.
    assignLocation("/");
  }

  return (
    <div className="flex w-full flex-col">
      <h1 className="text-[28px] font-normal leading-[1.25] text-[var(--sp-text-primary)]">Set a new password</h1>
      <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--sp-text-secondary)]">
        Enter a new password for your seat planner account.
      </p>

      <form onSubmit={updatePassword} noValidate>
        <div className="mt-6">
          <div className={fieldShellClass("subtle")}>
            <label htmlFor="update-password-new" className={fieldLabelClass}>
              New password
            </label>
            <input
              id="update-password-new"
              type="password"
              name="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              className={fieldInputClass}
            />
          </div>
          <div className={fieldShellClass("strong")}>
            <label htmlFor="update-password-confirm" className={fieldLabelClass}>
              Confirm password
            </label>
            <input
              id="update-password-confirm"
              type="password"
              name="confirmPassword"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className={fieldInputClass}
            />
          </div>
        </div>

        {/* Same policy hint the login meta row carries, interpolating the
            shared constant so it can never drift from the enforced minimum. */}
        <p className="mt-2 text-xs text-[var(--sp-text-helper)]">
          Passwords are at least {MIN_PASSWORD_LENGTH} characters.
        </p>

        {/* LoginForm's primary recipe (label left, glyph right, 48px). The
            spinner swaps into the arrow slot while the update is in flight —
            same treatment the login primary uses. text-white is deliberate:
            the 1e primary is a white label on the theme-constant copper. */}
        <button
          type="submit"
          disabled={busy}
          className={cx(
            "mt-6 flex h-12 w-full items-center justify-between gap-3 bg-[var(--sp-button-primary)] px-4 text-[13.5px] font-medium leading-none text-white",
            "hover:bg-[var(--sp-button-primary-hover)] active:bg-[var(--sp-button-primary-hover)]",
            focusRingClass,
            "disabled:cursor-not-allowed disabled:bg-[var(--sp-field)] disabled:text-[var(--sp-text-helper)]"
          )}
        >
          {busy ? "Updating…" : "Update password"}
          {busy ? (
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
            />
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 shrink-0"
            >
              <path d="M4 10h11m0 0-4-4m4 4-4 4" />
            </svg>
          )}
        </button>
      </form>

      {message && (
        <p
          role={messageType === "error" ? "alert" : "status"}
          aria-live={messageType === "error" ? "assertive" : "polite"}
          className={[
            "mt-4 p-3 text-sm",
            messageType === "error"
              ? "bg-[var(--sp-status-error-surface)] text-[var(--sp-status-error-text)]"
              : "bg-[var(--sp-status-success-surface)] text-[var(--sp-status-success-text)]"
          ].join(" ")}
        >
          {message}
        </p>
      )}
    </div>
  );
}
