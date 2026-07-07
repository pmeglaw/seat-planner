import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminManagementPanel } from "@/components/admin-management/AdminManagementPanel";
import { createClient } from "@/lib/supabase/server";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminManagementPage() {
  await connection();
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin/management");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <main className="admin-theme flex min-h-screen items-center justify-center bg-[var(--admin-chrome-bg)] p-6">
        <section className="max-w-md rounded-2xl bg-[var(--admin-surface)] p-6 shadow-soft">
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
    <AdminManagementPanel
      seats={(seats ?? []) as SeatWithEmployee[]}
      employees={(employees ?? []) as Employee[]}
      departmentOptions={(departments ?? []) as DepartmentOption[]}
      zoneOptions={(zones ?? []) as ZoneOption[]}
    />
  );
}
