import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Shared prologue for the /admin* pages: refresh-safe client, login redirect,
// and the profiles.role check. This is UX-layer gating only — RLS and the
// per-action requireAdmin() remain the enforced boundary (CLAUDE.md).
export async function getAdminPageContext(nextPath: string) {
  await connection();
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${nextPath}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return { supabase, isAdmin: profile?.role === "admin" };
}
