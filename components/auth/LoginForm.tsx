"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthMessage, safeNextPath } from "@/lib/authMessages";
import { cx, focusRingClass } from "@/components/ui/design-system";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nextPath, setNextPath] = useState("/");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"info" | "error" | "success">("info");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  // False through SSR and the first client render, true once effects run — the
  // only reliable "React is listening now" signal. Drives the submit button's
  // pre-hydration state; see the note above handleSubmit.
  const [hydrated, setHydrated] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHydrated(true);
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const next = safeNextPath(params.get("next"));
    setNextPath(next);
    if (error) {
      setMessage(friendlyAuthMessage(decodeURIComponent(error)));
      setMessageType("error");
    }
  }, []);

  function redirectAfterLogin() {
    router.push(nextPath);
    router.refresh();
  }

  async function signInWithPassword() {
    setBusy(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    setBusy(false);

    if (error) {
      setMessage(friendlyAuthMessage(error.message));
      setMessageType("error");
      return;
    }

    setMessage("Signed in. Redirecting…");
    setMessageType("success");
    redirectAfterLogin();
  }

  // Secondary action, not a mode (v12 slice 8, owner ruling 2026-08-04): one
  // click sends the link instead of switch-then-submit. It carries its own
  // email guard because it never passes through handleSubmit.
  async function sendMagicLink() {
    if (!email.trim()) {
      setMessage("Enter your work email to receive a sign-in link.");
      setMessageType("error");
      emailInputRef.current?.focus();
      return;
    }

    setBusy(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Never mint a new auth user from the login page — magic links are for
        // existing accounts only. Admins provision accounts.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`
      }
    });

    setBusy(false);

    if (error) {
      setMessage(friendlyAuthMessage(error.message));
      setMessageType("error");
      return;
    }

    setMessage("Check your email for the sign-in link. Use the newest email if you requested more than one link.");
    setMessageType("success");
  }

  async function sendPasswordReset() {
    if (!email.trim()) {
      setMessage("Enter your work email first, then request a password reset.");
      setMessageType("error");
      return;
    }

    setResetBusy(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/auth/update-password")}`
    });

    setResetBusy(false);

    if (error) {
      setMessage(friendlyAuthMessage(error.message));
      setMessageType("error");
      return;
    }

    setMessage("Password reset email sent. Open the newest email to set a new password.");
    setMessageType("success");
  }

  // Once hydrated, submit stays enabled and validates on submit so Enter works
  // everywhere and an empty click explains itself instead of hitting a silently
  // dead button.
  //
  // Before hydration there is no onSubmit yet, so a click ran the browser's
  // native submit: a GET back to /login that reloaded the page and threw away
  // whatever had been typed, with no message (UX-01, #276). Holding the button
  // disabled for that window keeps the input, and the "Starting up…" label keeps
  // the disabled state from being the silently dead button above — it says why.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (!email.trim()) {
      setMessage("Enter your work email and password to sign in.");
      setMessageType("error");
      emailInputRef.current?.focus();
      return;
    }

    if (!password.trim()) {
      setMessage("Enter your password to sign in, or use the Magic link button.");
      setMessageType("error");
      passwordInputRef.current?.focus();
      return;
    }

    void signInWithPassword();
  }

  // v12 filled field: the label sits ABOVE, and the input is a 40px well with a
  // bottom rule and no box. (This replaces the label-inside "fluid" pattern the
  // §06 prediction sketched — the shipped v12 handoff moved the label out.)
  //
  // Height is fixed and box-sizing is border-box (app/globals.css), so the
  // 1px → 2px rule change on focus cannot shift layout.
  //
  // The rule pair is specified together for a reason: --admin-field-rule
  // (#8d8d8d) on --admin-field-fill (#F4F4F4) measures 3.02:1, clearing WCAG
  // 1.4.11's 3:1 for an essential UI boundary — the single line that says
  // "this is an input" has to carry that on its own. The focus rule keeps
  // --admin-primary per the slice-1 ruling (accent stays #FF5715 for
  // underline/selected/search/focus); it reads ≈2.9:1 against the fill, the
  // same as before this restyle, and the doubling thickness is a second,
  // non-colour cue.
  const fieldLabelClass = "text-[12px] font-normal leading-[1.3] text-[var(--admin-text-secondary)]";
  const fieldShellClass =
    "mt-1 flex h-10 items-center border-b border-[var(--admin-field-rule)] bg-[var(--admin-field-fill)] px-3.5 transition-colors focus-within:border-b-2 focus-within:border-[var(--admin-primary)]";
  // outline-none is safe only because the shell above draws the focus rule.
  const fieldInputClass =
    "w-full border-0 bg-transparent p-0 text-[14px] font-normal leading-[1.4] text-[var(--admin-text-primary)] outline-none placeholder:text-[var(--admin-text-muted)]";

  return (
    <div className="w-full max-w-[440px] bg-white p-6 sm:px-10 sm:pb-9 sm:pt-10">
      <h1 className="text-2xl font-semibold text-[var(--admin-text-primary)]">Sign in</h1>
      <p className="mt-4 text-[13px] text-[var(--admin-text-secondary)]">
        Use your work email to access the internal seating map.
      </p>

      {/* Inputs are deliberately name-less: a pre-hydration native submit must
          not serialize the password into the URL (GET form default). */}
      <form onSubmit={handleSubmit} noValidate>
        {/* htmlFor/id rather than a wrapping label so the reset button can share
            the label's row while the field below still spans the full width.
            An id is not a name: the pre-hydration GET stays password-free. */}
        <div className="mt-6">
          <label htmlFor="login-email" className={fieldLabelClass}>Email</label>
          <div className={fieldShellClass}>
            <input
              id="login-email"
              ref={emailInputRef}
              type="email"
              spellCheck={false}
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className={fieldInputClass}
            />
          </div>
        </div>

        {/* Reset sits on the Password label row: it belongs to that field, and
            parking it under the buttons made it compete with them. */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="login-password" className={fieldLabelClass}>Password</label>
            <button
              type="button"
              onClick={sendPasswordReset}
              disabled={resetBusy}
              className="shrink-0 text-[12px] font-medium text-[var(--admin-primary-on-soft)] underline-offset-2 transition hover:underline disabled:cursor-not-allowed disabled:text-[var(--admin-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
            >
              {resetBusy ? "Sending reset email…" : "Forgot password?"}
            </button>
          </div>
          <div className={fieldShellClass}>
            <input
              id="login-password"
              ref={passwordInputRef}
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className={fieldInputClass}
            />
          </div>
        </div>

        {/* Two actions, not a mode switch (owner ruling): signing in and asking
            for a link are both one click from here. The 1px gap keeps them a
            single control block rather than two floating buttons. */}
        <div className="mt-6 flex gap-px">
          {/* Not the shared Button primitive, and the label is a DIRECT text
              child on purpose. Button centres its content, and wrapping the
              label in a span to get the label-left / arrow-right split made
              `button:text-is("Sign in")` stop matching — Playwright's text
              engine binds to the smallest element containing the text, so the
              span captured it and every authenticated e2e test lost its
              sign-in step (tests/e2e-auth/auth-helpers.ts). */}
          <button
            type="submit"
            disabled={busy || !hydrated}
            className={cx(
              "flex h-12 flex-[1.4] items-center justify-between gap-3 border border-[var(--sp-color-action-primary)] bg-[var(--sp-color-action-primary)] px-4 text-sm font-semibold leading-none text-white transition-colors",
              "hover:border-[var(--sp-color-action-primary-hover)] hover:bg-[var(--sp-color-action-primary-hover)]",
              focusRingClass,
              "disabled:cursor-not-allowed disabled:border-[var(--sp-color-border-subtle)] disabled:bg-[var(--sp-color-state-disabled)] disabled:text-[var(--sp-color-text-muted)]"
            )}
          >
            {!hydrated ? "Starting up…" : busy ? "Signing in…" : "Sign in"}
            {hydrated && !busy && (
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
                <path d="M4 10h11m0 0-4-4m4 4-4 4" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={busy || !hydrated}
            className="h-12 flex-1 border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 text-[13px] font-medium text-[var(--admin-text-primary)] transition-colors hover:bg-[var(--admin-surface-alt)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus-ring-color)]"
          >
            Magic link
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-[var(--admin-text-muted)]">
          Magic links are a fallback. Wait at least 60 seconds before requesting another link.
        </p>
      </form>

      {message && (
        <p
          role={messageType === "error" ? "alert" : "status"}
          aria-live={messageType === "error" ? "assertive" : "polite"}
          className={cx(
            "mt-4 border p-3 text-sm font-medium",
            messageType === "error" && "border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] text-[var(--admin-state-error-text)]",
            messageType === "success" && "border-[var(--admin-state-saved-border)] bg-[var(--admin-state-saved-bg)] text-[var(--admin-state-saved-text)]",
            messageType === "info" && "border-[var(--admin-border)] bg-[var(--admin-surface-alt)] text-[var(--admin-text-secondary)]"
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
