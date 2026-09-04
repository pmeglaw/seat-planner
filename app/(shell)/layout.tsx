import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { getSessionContext } from "@/lib/serverAuth";
import { deriveShellState, escapeIlikePattern } from "@/lib/shellState";
import { createClient } from "@/lib/supabase/server";

// Persistent chrome for every signed-in surface: /, /admin, /admin/management,
// /admin/settings, /reception. This layout renders the Phase 3 shell (header,
// left filter panel, Help / History / Account panels) exactly once per
// document load; client-side navigations between these routes swap only the
// content pane below it, so the shell never disappears into a loading wash
// between sections. The route group changes no URLs — it exists purely so
// these routes share this layout.
//
// Auth here is chrome-only (which links, whose email). Every page below
// still runs its own guard — getAdminPageContext / the reception session gate
// / the viewer's redirect — and the shared getSessionContext is React-cache()d,
// so layout + page together still cost ONE auth probe and ONE role lookup per
// server render.
//
// Shell facts (redesign-v2 PR 2, PHASE2UX §1.2 / §1.6): the last publish
// time and the signed-in person's own seat come from the VIEWER-SAFE
// published layer only — `seats` where layer = 'published' and the
// `published_employees` snapshot — because this layout mounts for viewers.
// Never the live `employees` table (tests/published-employee-snapshot.test.mjs).
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const { user, role } = await getSessionContext();

  // Anonymous visitors: render bare. The pages redirect to /login themselves,
  // and a chrome flash before that redirect would advertise controls the
  // visitor cannot use.
  if (!user) return children;

  const supabase = await createClient();
  const email = user.email ?? "";
  const [latestPublished, mySeatRow] = await Promise.all([
    supabase
      .from("seats")
      .select("updated_at")
      .eq("layer", "published")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => (data as { updated_at?: string | null } | null)?.updated_at ?? null),
    findMyPublishedSeat(supabase, email)
  ]);

  const initialShell = deriveShellState({ latestPublishedUpdatedAt: latestPublished, mySeatRow });

  return (
    <AppShell email={email} userId={user.id} isAdmin={role === "admin"} initialShell={initialShell}>
      {children}
    </AppShell>
  );
}

// Match the signed-in person to the published directory by email (the same
// rule lib/mySeat.ts applies for /my-seat), then read their published seat.
// Two small reads instead of the whole snapshot: this runs on every shell
// render.
async function findMyPublishedSeat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string
): Promise<{ label: string | null; floor: string | null } | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  const { data: person } = await supabase
    .from("published_employees")
    .select("id")
    .ilike("email", escapeIlikePattern(trimmed))
    .limit(1)
    .maybeSingle();
  if (!person?.id) return null;
  const { data: seat } = await supabase
    .from("seats")
    .select("label,floor")
    .eq("layer", "published")
    .eq("employee_id", person.id)
    .limit(1)
    .maybeSingle();
  return (seat as { label: string | null; floor: string | null } | null) ?? null;
}
