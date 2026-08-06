import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Per-request session context shared by the persistent (shell) layout and the
// page rendering beneath it. React's cache() dedupes the auth probe and the
// profiles.role lookup across every caller inside ONE server render pass — so
// mounting the rail from a layout costs no extra Supabase round-trips over the
// pre-shell pages, which each did this work themselves.
//
// UX-layer identity only: callers use this to pick chrome (rail flavor, email
// cell) and to bounce anonymous visitors to /login. RLS and requireAdmin()
// remain the enforced security boundary (CLAUDE.md, layers 1–2).

type SessionContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User | null;
  role: "admin" | "viewer" | null;
};

export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, role: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return { supabase, user, role: profile?.role === "admin" ? "admin" : "viewer" };
});
