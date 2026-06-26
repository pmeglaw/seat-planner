import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SeatMap } from "@/components/seat-map/SeatMap";
import { createClient } from "@/lib/supabase/server";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  await connection();
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <main className="admin-theme flex min-h-screen items-center justify-center bg-[var(--admin-bg)] p-6 text-[var(--admin-text-primary)]">
        <section className="max-w-md rounded-2xl bg-white p-6 shadow-soft">
          <h1 className="text-lg font-bold text-slate-900">Admin access required</h1>
          <p className="mt-2 text-sm text-slate-600">
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

  if (seatsError || publishedSeatsError || employeesError || departmentsError || zonesError) {
    throw new Error(seatsError?.message ?? publishedSeatsError?.message ?? employeesError?.message ?? departmentsError?.message ?? zonesError?.message);
  }

  return (
    <main className="admin-theme min-h-screen bg-[var(--admin-bg)] text-[var(--admin-text-primary)]">
      <SeatMap
        seats={(seats ?? []) as SeatWithEmployee[]}
        publishedSeats={(publishedSeats ?? []) as SeatWithEmployee[]}
        employees={(employees ?? []) as Employee[]}
        departmentOptions={(departments ?? []) as DepartmentOption[]}
        zoneOptions={(zones ?? []) as ZoneOption[]}
        canEdit
      />
    </main>
  );
}
