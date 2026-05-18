"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthMessage, safeNextPath } from "@/lib/authMessages";
import { Button } from "@/components/ui/Button";

type LoginMode = "password" | "magic";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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

  const canSubmitPassword = Boolean(email.trim() && password.trim() && !busy);
  const canSubmitMagicLink = Boolean(email.trim() && !busy);

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft">
      <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
      <p className="mt-2 text-sm text-slate-600">
        Use your work email to access the internal seating map.
      </p>

      <div className="mt-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMode("password")}
          className={cx(
            "rounded-xl px-3 py-2 text-sm font-semibold transition",
            mode === "password" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
          )}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => setMode("magic")}
          className={cx(
            "rounded-xl px-3 py-2 text-sm font-semibold transition",
            mode === "magic" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
          )}
        >
          Magic link
        </button>
      </div>

      <label className="mt-5 block">
        <span className="text-sm font-semibold text-slate-700">Email</span>
        <input
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
        />
      </label>

      {mode === "password" ? (
        <>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
            />
          </label>

          <Button className="mt-4 w-full" variant="primary" onClick={signInWithPassword} disabled={!canSubmitPassword}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>

          <button
            type="button"
            onClick={sendPasswordReset}
            disabled={resetBusy || !email.trim()}
            className="mt-3 w-full text-sm font-semibold text-brand hover:text-brand-dark disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {resetBusy ? "Sending reset email…" : "Forgot password?"}
          </button>
        </>
      ) : (
        <>
          <Button className="mt-4 w-full" variant="primary" onClick={sendMagicLink} disabled={!canSubmitMagicLink}>
            {busy ? "Sending…" : "Send magic link"}
          </Button>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Magic links are a fallback. Wait at least 60 seconds before requesting another link.
          </p>
        </>
      )}

      {message && (
        <p
          role={messageType === "error" ? "alert" : "status"}
          aria-live={messageType === "error" ? "assertive" : "polite"}
          className={cx(
            "mt-4 rounded-xl p-3 text-sm",
            messageType === "error" && "bg-rose-50 text-rose-700",
            messageType === "success" && "bg-emerald-50 text-emerald-700",
            messageType === "info" && "bg-slate-50 text-slate-700"
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
