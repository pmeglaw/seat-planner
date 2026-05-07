"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) setMessage(decodeURIComponent(error));
  }, []);

  async function signIn() {
    setBusy(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`
      }
    });

    setBusy(false);
    setMessage(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft">
      <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
      <p className="mt-2 text-sm text-slate-600">
        Use your work email to access the internal seating map.
      </p>

      <label className="mt-5 block">
        <span className="text-sm font-semibold text-slate-700">Email</span>
        <input
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="you@company.com"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
        />
      </label>

      <Button className="mt-4 w-full" variant="primary" onClick={signIn} disabled={busy || !email.trim()}>
        {busy ? "Sending…" : "Send magic link"}
      </Button>

      {message && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
    </div>
  );
}
