"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
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

  // Submit stays enabled and validates on submit so Enter works everywhere and
  // an empty click explains itself instead of hitting a silently dead button.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (!email.trim()) {
      setMessage(mode === "password" ? "Enter your work email and password to sign in." : "Enter your work email to receive a sign-in link.");
      setMessageType("error");
      return;
    }

    if (mode === "password") {
      if (!password.trim()) {
        setMessage("Enter your password to sign in, or use the magic-link tab.");
        setMessageType("error");
        return;
      }
      void signInWithPassword();
      return;
    }

    void sendMagicLink();
  }

  const fieldClass = "mt-1 w-full border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--admin-text-primary)] outline-none transition placeholder:text-[var(--admin-text-muted)] hover:border-[var(--admin-border-strong)] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)]";

  return (
    <div className="w-full max-w-md border border-[var(--admin-border)] bg-white shadow-[var(--admin-elevation-2-shadow)]">
      <div className="flex items-center gap-2 border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] px-5 py-2.5 text-[12.5px] font-semibold text-[var(--admin-chrome-text)]">
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark, unoptimized on purpose */}
          <img src="/images/megeredchian-mark.png?v=tight" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
        </span>
        Megeredchian Law <span className="font-normal text-[var(--admin-chrome-muted)]">· Seat Planner</span>
      </div>
      <div className="p-6">
      <h1 className="text-xl font-semibold text-[var(--admin-text-primary)]">Sign in</h1>
      <p className="mt-2 text-sm text-[var(--admin-text-secondary)]">
        Use your work email to access the internal seating map.
      </p>

      <div className="mt-5 grid grid-cols-2 border border-[var(--admin-border)] bg-[var(--admin-surface-alt)] p-1">
        <button
          type="button"
          onClick={() => setMode("password")}
          className={cx(
            "border-b-2 px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]",
            mode === "password" ? "border-[var(--admin-primary)] bg-white text-[var(--admin-text-primary)]" : "border-transparent text-[var(--admin-text-muted)] hover:text-[var(--admin-text-primary)]"
          )}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => setMode("magic")}
          className={cx(
            "border-b-2 px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]",
            mode === "magic" ? "border-[var(--admin-primary)] bg-white text-[var(--admin-text-primary)]" : "border-transparent text-[var(--admin-text-muted)] hover:text-[var(--admin-text-primary)]"
          )}
        >
          Magic link
        </button>
      </div>

      {/* Inputs are deliberately name-less: a pre-hydration native submit must
          not serialize the password into the URL (GET form default). */}
      <form onSubmit={handleSubmit} noValidate>
      <label className="mt-5 block">
        <span className="text-sm font-semibold text-[var(--admin-text-secondary)]">Email</span>
        <input
          type="email"
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
            <span className="text-sm font-semibold text-[var(--admin-text-secondary)]">Password</span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className={fieldClass}
            />
          </label>

          <Button type="submit" className="mt-4 w-full" variant="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>

          <button
            type="button"
            onClick={sendPasswordReset}
            disabled={resetBusy}
            className="mt-3 w-full text-sm font-semibold text-[var(--admin-primary-cta)] transition hover:text-[var(--admin-primary-cta-hover)] disabled:cursor-not-allowed disabled:text-[var(--admin-text-muted)]"
          >
            {resetBusy ? "Sending reset email…" : "Forgot password?"}
          </button>
        </>
      ) : (
        <>
          <Button type="submit" className="mt-4 w-full" variant="primary" disabled={busy}>
            {busy ? "Sending…" : "Send magic link"}
          </Button>

          <p className="mt-3 text-xs leading-relaxed text-[var(--admin-text-muted)]">
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
    </div>
  );
}
