import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ReceptionScreen } from "@/components/reception/ReceptionScreen";
import { buildReceptionDirectory } from "@/lib/receptionDirectory";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getSessionContext } from "@/lib/serverAuth";
import type { Employee } from "@/lib/types";
import { VIEWER_SEAT_COLUMNS, withNullNotes, type ViewerSeatRow } from "@/lib/viewerSeatColumns";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Reception — front-desk call routing. Read-only for ANY signed-in role
// (viewer or admin), so this page gates on session only — deliberately not
// getAdminPageContext, which is for admin-only pages. Like the viewer map, it
// reads exclusively the published layer: published_employees (the publish-time
// snapshot) + layer='published' seats. Never the live employees table, never
// draft seats — extension/directory edits reach this screen at the next
// publish, exactly like seat edits reach the viewer map.
//
// The rail + brand bar come from the (shell) layout's persistent AppShell
// (which also owns the rail flavor: admins get the full nav, viewers the
// role-safe rail). getSessionContext is React-cache()d, so this page's user
// check shares the layout's single auth probe.
export default async function ReceptionPage() {
  await connection();
  const { supabase, user } = await getSessionContext();

  if (!user) redirect("/login?next=/reception");

  // Both queries only need the session, so they fire together — serial
  // awaits stacked round-trips into this force-dynamic render.
  const [seats, employees] = await Promise.all([
    fetchAllRows<ViewerSeatRow>(
      (from, to) =>
        supabase
          .from("seats")
          .select(VIEWER_SEAT_COLUMNS, { count: "exact" })
          .eq("layer", "published")
          .order("label")
          .range(from, to),
      { label: "published seats" }
    ),
    fetchAllRows<Employee>(
      (from, to) =>
        supabase
          .from("published_employees")
          .select("*", { count: "exact" })
          .eq("active", true)
          .order("full_name")
          .order("id")
          .range(from, to),
      { label: "published employees" }
    )
  ]);

  const people = buildReceptionDirectory(employees, seats.map(withNullNotes));

  return (
    // pl-12 clears the fixed rail; the svh calc offsets the AppTopBar the
    // shell renders above this pane (both live in the (shell) layout now).
    <main className="reception-theme flex min-h-[calc(100svh-var(--sp-chrome-height))] flex-col bg-[var(--sp-background)] pl-12 text-[var(--sp-text-primary)] lg:h-[calc(100svh-var(--sp-chrome-height))] lg:min-h-0 lg:overflow-hidden">
      {/* Skip-link landing: focusable zero-height marker (the link itself is
          the persistent rail's first focusable — AppShell maps this route to
          #reception-main). */}
      <div id="reception-main" tabIndex={-1} className="outline-none" />
      {/* Desktop: the document never scrolls (viewer-map contract) — the
          directory scrolls inside this focusable region instead (tabIndex +
          aria-label per axe scrollable-region-must-be-focusable). */}
      <div
        role="region"
        aria-label="Reception directory"
        tabIndex={0}
        className="flex-1 [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-interactive)] lg:min-h-0 lg:overflow-y-auto"
      >
        <ReceptionScreen people={people} />
      </div>
    </main>
  );
}
