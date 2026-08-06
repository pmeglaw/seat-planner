import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionContext } from "@/lib/serverAuth";

// Shared prologue for the /admin* pages: refresh-safe client, login redirect,
// and the profiles.role check. This is UX-layer gating only — RLS and the
// per-action requireAdmin() remain the enforced boundary (CLAUDE.md).
// The auth probe + role lookup live in getSessionContext (React-cache()d), so
// the (shell) layout's rail chrome and this per-page guard share ONE pair of
// Supabase round-trips per server render.
export async function getAdminPageContext(nextPath: string) {
  await connection();
  const { supabase, user, role } = await getSessionContext();

  if (!user) redirect(`/login?next=${nextPath}`);

  return { supabase, isAdmin: role === "admin", user };
}
