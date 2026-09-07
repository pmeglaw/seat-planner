import Link from "next/link";
import { SeatMap } from "@/components/seat-map/SeatMap";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getAdminPageContext } from "@/lib/adminPageGuard";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const { supabase, isAdmin } = await getAdminPageContext("/admin");

  if (!isAdmin) {
    // Deep links can still land viewers here (the in-app Admin shortcut is
    // role-gated), so the page must offer a way back instead of a dead end.
    // The shared 403 card (DECISIONS D5-d; PR 4 built it for Management and
    // Settings, PR 5 brings this page onto it): the asset empty state on the
    // route card, its tertiary on the WHITE card (layer-02), never layer-01 —
    // 4.14:1 there is recorded not-gated (PHASE4BUILD §1.22). The sheet paints
    // `.sp-route-card` layer-01 (PHASE3DS §1.29), so the surface is set inline
    // (a utility class loses to the sheet's later rule). The shell header
    // already carries the product name (O-12).
    return (
      <main className="flex min-h-0 flex-1 items-start justify-center bg-[var(--sp-background)] p-8">
        <section className="sp-route-card w-full" style={{ background: "var(--sp-layer-02)" }}>
          <div className="cds-empty">
            <h2>Admin access required</h2>
            <p>You are signed in, but your profile does not have admin permissions. Ask an admin to upgrade your role if you need to edit the seat map.</p>
            <div className="cds-empty-actions">
              <Link href="/" className="cds-btn cds-btn--tertiary cds-btn--md">Back to seat map</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Paged, not bare selects: PostgREST truncates at the project row cap and
  // says nothing. On the admin map that is worse than on the viewer — an admin
  // could publish a draft believing it complete when half of it never loaded.
  //
  // The two layers stay as two explicit queries rather than one parameterised
  // helper: which layer each surface reads is the central invariant of this
  // codebase, and it is asserted by grepping this file
  // (tests/accessibility-source.test.mjs). A `layer` variable would satisfy the
  // compiler and quietly destroy that check.
  // All six queries are independent, so they fire together: awaited one by
  // one they serialized ~6 database round-trips into the blocking render of
  // a force-dynamic page, which read as seconds of dead time after a rail
  // click. publishedEmployees is the viewer-facing snapshot, loaded so the
  // publish review can diff live employee details against what viewers
  // currently see.
  const [seats, publishedSeats, employees, publishedEmployees, departmentsResult, zonesResult] = await Promise.all([
    fetchAllRows<SeatWithEmployee>(
      (from, to) =>
        supabase
          .from("seats")
          .select("*, employee:employees(*)", { count: "exact" })
          .eq("layer", "draft")
          .order("label")
          .range(from, to),
      { label: "draft seats" }
    ),
    fetchAllRows<SeatWithEmployee>(
      (from, to) =>
        supabase
          .from("seats")
          .select("*, employee:employees(*)", { count: "exact" })
          .eq("layer", "published")
          .order("label")
          .range(from, to),
      { label: "published seats" }
    ),
    fetchAllRows<Employee>(
      (from, to) =>
        supabase
          .from("employees")
          .select("*", { count: "exact" })
          .eq("active", true)
          .order("full_name")
          .order("id")
          .range(from, to),
      { label: "employees" }
    ),
    fetchAllRows<Employee>(
      (from, to) =>
        supabase
          .from("published_employees")
          .select("*", { count: "exact" })
          .order("full_name")
          .order("id")
          .range(from, to),
      { label: "published employees" }
    ),
    supabase.from("department_options").select("*").eq("active", true).order("name"),
    supabase.from("zone_options").select("*").eq("active", true).order("name")
  ]);

  const { data: departments, error: departmentsError } = departmentsResult;
  const { data: zones, error: zonesError } = zonesResult;

  // Seat and employee failures already threw inside fetchAllRows.
  if (departmentsError || zonesError) {
    throw new Error(departmentsError?.message ?? zonesError?.message);
  }

  return (
    // div, not <main>: SeatMap renders the page's real <main> internally, and
    // nesting a second one trips axe landmark-no-duplicate-main.
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)]">
      <SeatMap
        seats={seats}
        publishedSeats={publishedSeats}
        employees={employees}
        publishedEmployees={publishedEmployees}
        departmentOptions={(departments ?? []) as DepartmentOption[]}
        zoneOptions={(zones ?? []) as ZoneOption[]}
        canEdit
      />
    </div>
  );
}
