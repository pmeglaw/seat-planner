import { AdminManagementPanel } from "@/components/admin-management/AdminManagementPanel";
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
  const { supabase, isAdmin } = await getAdminPageContext("/admin/management");
  const initialTab = parseTabParam((await searchParams)?.tab);

  if (!isAdmin) {
    return (
      <main className="admin-theme flex min-h-[calc(100svh-var(--admin-chrome-h))] items-center justify-center bg-[var(--admin-bg)] p-6">
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
          .order("id")
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
    // pl-12 clears the v12 left rail — position:fixed, mounted by the (shell)
    // layout's persistent AppShell along with the AppTopBar above this
    // pane (hence the svh calc: bar height comes off the pane's min-height).
    // The skip link itself lives in the rail (AppShell maps this route to
    // #admin-subpage-main); this page owns the landing marker below.
    <div className="admin-theme flex h-[calc(100svh-var(--admin-chrome-h))] flex-col overflow-hidden bg-[var(--admin-bg)] pl-12">
      {/* Skip-link landing: focusable zero-height marker; the next Tab enters
          the panel content. */}
      <div id="admin-subpage-main" tabIndex={-1} className="outline-none" />
      {/* Desktop: the document never scrolls (viewer-map contract) — long
          content scrolls inside this focusable region instead (tabIndex +
          aria-label per axe scrollable-region-must-be-focusable). */}
      <div
        role="region"
        aria-label="Management"
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]"
      >
        <AdminManagementPanel
          seats={seats}
          employees={employees}
          departmentOptions={(departments ?? []) as DepartmentOption[]}
          zoneOptions={(zones ?? []) as ZoneOption[]}
          initialTab={initialTab}
        />
      </div>
    </div>
  );
}
