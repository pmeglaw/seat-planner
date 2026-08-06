import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ReceptionScreen } from "@/components/reception/ReceptionScreen";
import { buildReceptionDirectory } from "@/lib/receptionDirectory";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getSessionContext } from "@/lib/serverAuth";
import type { Employee, Seat } from "@/lib/types";

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
    fetchAllRows<Seat>(
      (from, to) =>
        supabase
          .from("seats")
          .select("*", { count: "exact" })
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
          .range(from, to),
      { label: "published employees" }
    )
  ]);

  const people = buildReceptionDirectory(employees, seats);

  return (
    // pl-12 clears the fixed rail; the svh calc offsets the AdminShellBar the
    // shell renders above this pane (both live in the (shell) layout now).
    <main className="reception-theme min-h-[calc(100svh-var(--admin-chrome-h))] bg-[var(--r-bg)] pl-12 text-[var(--r-text)]">
      {/* Skip-link landing: focusable zero-height marker (the link itself is
          the persistent rail's first focusable — AppShell maps this route to
          #reception-main). */}
      <div id="reception-main" tabIndex={-1} className="outline-none" />
      <ReceptionScreen people={people} />
    </main>
  );
}
