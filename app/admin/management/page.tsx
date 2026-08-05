import { AdminManagementPanel } from "@/components/admin-management/AdminManagementPanel";
import { AdminShellBar } from "@/components/ui/AdminShellBar";
import { AppRail } from "@/components/ui/AppRail";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { getAdminPageContext } from "@/lib/adminPageGuard";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const managementTabIds = ["employees", "departments", "zones", "publishHistory"] as const;
type ManagementTabId = (typeof managementTabIds)[number];

function parseTabParam(value: string | string[] | undefined): ManagementTabId | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return managementTabIds.find(id => id === candidate);
}

export default async function AdminManagementPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, isAdmin, user } = await getAdminPageContext("/admin/management");
  const initialTab = parseTabParam((await searchParams)?.tab);

  if (!isAdmin) {
    return (
      <main className="admin-theme flex min-h-screen items-center justify-center bg-[var(--admin-bg)] p-6">
        <section className="max-w-md border border-[var(--admin-border)] bg-[var(--admin-surface)] p-6 shadow-elevation-2">
          <h1 className="text-lg font-semibold text-[var(--admin-text-primary)]">Admin access required</h1>
          <p className="mt-2 text-sm text-[var(--admin-text-secondary)]">
            You are signed in, but your profile does not have admin permissions.
          </p>
        </section>
      </main>
    );
  }

  // Paged: an unbounded select is silently truncated at the project row cap,
  // which here would hide people from the directory with no indication.
  // Independent queries fire together — serial awaits stacked round-trips
  // into this force-dynamic render (seconds of dead time after a rail click).
  const [seats, employees, departmentsResult, zonesResult] = await Promise.all([
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
    fetchAllRows<Employee>(
      (from, to) =>
        supabase
          .from("employees")
          .select("*", { count: "exact" })
          .eq("active", true)
          .order("full_name")
          .range(from, to),
      { label: "employees" }
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
    // pl-12 clears the v12 left rail, which is position:fixed and does not
    // participate in this flex column (mirrors SeatMap.tsx's root).
    <div className="admin-theme flex min-h-screen flex-col bg-[var(--admin-bg)] pl-12">
      <AppRail
        active="management"
        email={user.email ?? ""}
        roleLabel="Admin"
        skipLink={{ href: "#admin-subpage-main", label: "Skip to content" }}
      />
      <AdminShellBar />
      {/* Skip-link landing: focusable zero-height marker; the next Tab enters
          the panel content. */}
      <div id="admin-subpage-main" tabIndex={-1} className="outline-none" />
      <AdminManagementPanel
        seats={seats}
        employees={employees}
        departmentOptions={(departments ?? []) as DepartmentOption[]}
        zoneOptions={(zones ?? []) as ZoneOption[]}
        initialTab={initialTab}
      />
    </div>
  );
}
