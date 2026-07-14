import Link from "next/link";
import { SeatMap } from "@/components/seat-map/SeatMap";
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
      <main className="admin-theme flex min-h-screen items-center justify-center bg-[var(--admin-bg)] p-6 text-[var(--admin-text-primary)]">
        <section className="w-full max-w-md border border-[var(--admin-border)] bg-white shadow-[var(--admin-elevation-2-shadow)]">
          <div className="flex items-center gap-2 border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] px-5 py-2.5 text-[12.5px] font-semibold text-[var(--admin-chrome-text)]">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark, unoptimized on purpose */}
              <img src="/images/megeredchian-mark.png?v=tight" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
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

  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("*, employee:employees(*)")
    .eq("layer", "draft")
    .order("label");

  const { data: publishedSeats, error: publishedSeatsError } = await supabase
    .from("seats")
    .select("*, employee:employees(*)")
    .eq("layer", "published")
    .order("label");

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("*")
    .eq("active", true)
    .order("full_name");

  // Viewer-facing snapshot, loaded so the publish review can diff live
  // employee details against what viewers currently see.
  const { data: publishedEmployees, error: publishedEmployeesError } = await supabase
    .from("published_employees")
    .select("*")
    .order("full_name");

  const { data: departments, error: departmentsError } = await supabase
    .from("department_options")
    .select("*")
    .eq("active", true)
    .order("name");

  const { data: zones, error: zonesError } = await supabase
    .from("zone_options")
    .select("*")
    .eq("active", true)
    .order("name");

  if (seatsError || publishedSeatsError || employeesError || publishedEmployeesError || departmentsError || zonesError) {
    throw new Error(seatsError?.message ?? publishedSeatsError?.message ?? employeesError?.message ?? publishedEmployeesError?.message ?? departmentsError?.message ?? zonesError?.message);
  }

  return (
    <main className="admin-theme min-h-screen bg-[var(--admin-bg)] text-[var(--admin-text-primary)]">
      <SeatMap
        seats={(seats ?? []) as SeatWithEmployee[]}
        publishedSeats={(publishedSeats ?? []) as SeatWithEmployee[]}
        employees={(employees ?? []) as Employee[]}
        publishedEmployees={(publishedEmployees ?? []) as Employee[]}
        departmentOptions={(departments ?? []) as DepartmentOption[]}
        zoneOptions={(zones ?? []) as ZoneOption[]}
        canEdit
      />
    </main>
  );
}
