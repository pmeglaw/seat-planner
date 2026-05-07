import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SeatMap } from "@/components/seat-map/SeatMap";
import { createClient } from "@/lib/supabase/server";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  await connection();
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("*, employee:employees(*)")
    .eq("layer", "published")
    .order("label");

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("*")
    .eq("active", true)
    .order("full_name");

  const { data: departments } = await supabase
    .from("department_options")
    .select("*")
    .eq("active", true)
    .order("name");

  const { data: zones } = await supabase
    .from("zone_options")
    .select("*")
    .eq("active", true)
    .order("name");

  if (seatsError || employeesError) {
    throw new Error(seatsError?.message ?? employeesError?.message);
  }

  return (
    <SeatMap
      seats={(seats ?? []) as SeatWithEmployee[]}
      employees={(employees ?? []) as Employee[]}
      departmentOptions={(departments ?? []) as DepartmentOption[]}
      zoneOptions={(zones ?? []) as ZoneOption[]}
      canEdit={false}
    />
  );
}
