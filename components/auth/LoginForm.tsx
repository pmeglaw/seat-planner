"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthMessage, safeNextPath } from "@/lib/authMessages";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/design-system";

type LoginMode = "password" | "magic";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("password");
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

  async function sendMagicLink() {
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
      setMessage(mode === "password" ? "Enter your work email and password to sign in." : "Enter your work email to receive a sign-in link.");
      setMessageType("error");
      emailInputRef.current?.focus();
      return;
    }

    if (mode === "password") {
      if (!password.trim()) {
        setMessage("Enter your password to sign in, or use the magic-link tab.");
        setMessageType("error");
        passwordInputRef.current?.focus();
        return;
      }
      void signInWithPassword();
      return;
    }

    void sendMagicLink();
  }

  // Shell login card (Figma "Login / Refined"): field boxes are 36px flat
  // rectangles on border-strong; focus is a 2px brand-accent stroke.
  const fieldClass = "mt-1.5 h-9 w-full border border-[var(--admin-border-strong)] bg-white px-3 text-sm text-[var(--admin-text-primary)] outline-none transition placeholder:text-[var(--admin-text-muted)] focus:border-[var(--admin-primary)] focus:ring-1 focus:ring-inset focus:ring-[var(--admin-primary)]";

  const tabClass = (active: boolean) =>
    cx(
      "flex h-[38px] flex-1 flex-col items-center justify-between pt-2.5 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]",
      active
        ? "bg-white font-semibold text-[var(--admin-text-primary)]"
        : "text-[var(--admin-text-secondary)] hover:text-[var(--admin-text-primary)]"
    );

  const tabIndicatorClass = (active: boolean) =>
    cx("h-0.5 w-[100px] max-w-full", active ? "bg-[var(--admin-primary-cta)]" : "bg-transparent");

  return (
    <div className="w-full max-w-[440px] bg-white p-6 sm:px-10 sm:pb-9 sm:pt-10">
      <h1 className="text-2xl font-semibold text-[var(--admin-text-primary)]">Sign in</h1>
      <p className="mt-4 text-[13px] text-[var(--admin-text-secondary)]">
        Use your work email to access the internal seating map.
      </p>

      <div className="mt-4 flex bg-[var(--admin-surface-alt)]">
        <button
          type="button"
          onClick={() => setMode("password")}
          aria-pressed={mode === "password"}
          className={tabClass(mode === "password")}
        >
          Password
          <span aria-hidden="true" className={tabIndicatorClass(mode === "password")} />
        </button>
        <button
          type="button"
          onClick={() => setMode("magic")}
          aria-pressed={mode === "magic"}
          className={tabClass(mode === "magic")}
        >
          Magic link
          <span aria-hidden="true" className={tabIndicatorClass(mode === "magic")} />
        </button>
      </div>

      {/* Inputs are deliberately name-less: a pre-hydration native submit must
          not serialize the password into the URL (GET form default). */}
      <form onSubmit={handleSubmit} noValidate>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-[var(--admin-text-primary)]">Email</span>
        <input
          ref={emailInputRef}
          type="email"
          spellCheck={false}
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          className={fieldClass}
        />
      </label>

      {mode === "password" ? (
        <>
          <label className="mt-4 block">
            <span className="text-xs font-medium text-[var(--admin-text-primary)]">Password</span>
            <input
              ref={passwordInputRef}
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className={fieldClass}
            />
          </label>

          <Button type="submit" className="mt-4 w-full" variant="primary" disabled={busy || !hydrated}>
            {!hydrated ? "Starting up…" : busy ? "Signing in…" : "Sign in"}
          </Button>

          <button
            type="button"
            onClick={sendPasswordReset}
            disabled={resetBusy}
            className="mt-4 w-full text-center text-[13px] font-medium text-[var(--admin-text-secondary)] transition hover:text-[var(--admin-text-primary)] disabled:cursor-not-allowed disabled:text-[var(--admin-text-muted)]"
          >
            {resetBusy ? "Sending reset email…" : "Forgot password?"}
          </button>
        </>
      ) : (
        <>
          <Button type="submit" className="mt-4 w-full" variant="primary" disabled={busy || !hydrated}>
            {!hydrated ? "Starting up…" : busy ? "Sending…" : "Send magic link"}
          </Button>

          <p className="mt-4 text-xs leading-relaxed text-[var(--admin-text-muted)]">
            Magic links are a fallback. Wait at least 60 seconds before requesting another link.
          </p>
        </>
      )}
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
