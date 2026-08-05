import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ReceptionScreen } from "@/components/reception/ReceptionScreen";
import { AdminShellBar } from "@/components/ui/AdminShellBar";
import { AppRail } from "@/components/ui/AppRail";
import { buildReceptionDirectory } from "@/lib/receptionDirectory";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { createClient } from "@/lib/supabase/server";
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
export default async function ReceptionPage() {
  await connection();
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/reception");

  // UX-only role lookup: picks the rail flavor (admins get the full admin
  // nav, viewers a role-safe rail). RLS stays the enforced boundary.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";

  const seats = await fetchAllRows<Seat>(
    (from, to) =>
      supabase
        .from("seats")
        .select("*", { count: "exact" })
        .eq("layer", "published")
        .order("label")
        .range(from, to),
    { label: "published seats" }
  );

  const employees = await fetchAllRows<Employee>(
    (from, to) =>
      supabase
        .from("published_employees")
        .select("*", { count: "exact" })
        .eq("active", true)
        .order("full_name")
        .range(from, to),
    { label: "published employees" }
  );

  const people = buildReceptionDirectory(employees, seats);

  return (
    // pl-12 clears the fixed v12 left rail (mirrors the admin sub-pages).
    <main className="reception-theme min-h-screen bg-[var(--r-bg)] pl-12 text-[var(--r-text)]">
      <AppRail
        active="reception"
        railMode={isAdmin ? "admin" : "viewer"}
        email={user.email ?? ""}
        roleLabel={isAdmin ? "Admin" : "Viewer"}
        skipLink={{ href: "#reception-main", label: "Skip to content" }}
      />
      <AdminShellBar />
      {/* Skip-link landing: focusable zero-height marker (same pattern as the
          admin sub-pages). */}
      <div id="reception-main" tabIndex={-1} className="outline-none" />
      <ReceptionScreen people={people} />
    </main>
  );
}
