import { AdminManagementPanel } from "@/components/admin-management/AdminManagementPanel";
import { AdminShellBar } from "@/components/ui/AdminShellBar";
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

  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("*, employee:employees(*)")
    .eq("layer", "draft")
    .order("label");

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("*")
    .eq("active", true)
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

  if (seatsError || employeesError || departmentsError || zonesError) {
    throw new Error(seatsError?.message ?? employeesError?.message ?? departmentsError?.message ?? zonesError?.message);
  }

  return (
    <div className="admin-theme flex min-h-screen flex-col bg-[var(--admin-bg)]">
      <AdminShellBar page="management" email={user.email ?? ""} roleLabel="Admin" />
      {/* Skip-link landing: focusable zero-height marker; the next Tab enters
          the panel content. */}
      <div id="admin-subpage-main" tabIndex={-1} className="outline-none" />
      <AdminManagementPanel
        seats={(seats ?? []) as SeatWithEmployee[]}
        employees={(employees ?? []) as Employee[]}
        departmentOptions={(departments ?? []) as DepartmentOption[]}
        zoneOptions={(zones ?? []) as ZoneOption[]}
        initialTab={initialTab}
      />
    </div>
  );
}
