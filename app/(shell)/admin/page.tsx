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
    return (
      <main className="admin-theme flex min-h-[calc(100svh-var(--admin-chrome-h))] items-center justify-center bg-[var(--admin-bg)] p-6 text-[var(--admin-text-primary)]">
        <section className="w-full max-w-md border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-elevation-2">
          <div className="flex items-center gap-2 border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] px-5 py-2.5 text-[12.5px] font-semibold text-[var(--admin-chrome-text)]">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark, unoptimized on purpose */}
              <img src="/images/megeredchian-mark.png?v=ma-2026-128" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
            </span>
            Megeredchian Law <span className="font-normal text-[var(--admin-chrome-muted)]">· Seat Planner</span>
          </div>
          <div className="p-6">
            <h1 className="text-lg font-semibold">Admin access required</h1>
            <p className="mt-2 text-sm text-[var(--admin-text-secondary)]">
              You are signed in, but your profile does not have admin permissions. Ask an admin to upgrade your role if you need to edit the seat map.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex min-h-9 items-center justify-center border border-[var(--admin-primary-cta)] bg-[var(--admin-primary-cta)] px-4 py-2 text-sm font-semibold leading-none text-white transition-colors hover:border-[var(--admin-primary-cta-hover)] hover:bg-[var(--admin-primary-cta-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] focus-visible:ring-offset-2"
            >
              Back to seat map
            </Link>
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
    <div className="admin-theme min-h-[calc(100svh-var(--admin-chrome-h))] bg-[var(--admin-bg)] text-[var(--admin-text-primary)]">
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
