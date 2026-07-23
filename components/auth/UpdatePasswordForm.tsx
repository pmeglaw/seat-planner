"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { friendlyAuthMessage } from "@/lib/authMessages";
import { createClient } from "@/lib/supabase/client";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("success");
  const [busy, setBusy] = useState(false);

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password.length < 12) {
      setMessage("Use at least 12 characters for the new password.");
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
    router.push("/");
    router.refresh();
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft">
      <h1 className="text-xl font-bold text-slate-900">Set a new password</h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter a new password for your seat planner account.
      </p>

      <form onSubmit={updatePassword} noValidate>
        <label className="mt-5 block">
          <span className="text-sm font-semibold text-slate-700">New password</span>
          <input
            type="password"
            name="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-semibold text-slate-700">Confirm password</span>
          <input
            type="password"
            name="confirmPassword"
            value={confirmPassword}
            onChange={event => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
          />
        </label>

        <Button type="submit" className="mt-4 w-full" variant="primary" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </Button>
      </form>

      {message && (
        <p
          role={messageType === "error" ? "alert" : "status"}
          aria-live={messageType === "error" ? "assertive" : "polite"}
          className={[
            "mt-4 rounded-xl p-3 text-sm",
            messageType === "error"
              ? "bg-[var(--sp-color-state-danger-surface)] text-[var(--sp-color-state-danger-on-soft)]"
              : "bg-[var(--sp-color-state-success-surface)] text-[var(--sp-color-state-success-on-soft)]"
          ].join(" ")}
        >
          {message}
        </p>
      )}
    </div>
  );
}
