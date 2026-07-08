import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ViewerSeatFinder } from "@/components/seat-map/ViewerSeatFinder";
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

  if (!user) redirect("/login?next=/");

  // Viewer people data comes ONLY from the published_employees snapshot
  // (replaced atomically at publish time) — never the live employees table,
  // which is the admins' draft-side working set. Employee edits therefore
  // wait for publish, exactly like seat edits. The employee join is stitched
  // here because seats' FK points at employees, not the snapshot.
  const { data: seatRows, error: seatsError } = await supabase
    .from("seats")
    .select("*")
    .eq("layer", "published")
    .order("label");

  const { data: employees, error: employeesError } = await supabase
    .from("published_employees")
    .select("*")
    .eq("active", true)
    .order("full_name");

  const employeesById = new Map(((employees ?? []) as Employee[]).map(employee => [employee.id, employee]));
  const seats = ((seatRows ?? []) as SeatWithEmployee[]).map(seat => ({
    ...seat,
    employee: seat.employee_id ? employeesById.get(seat.employee_id) ?? null : null
  }));

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
    <ViewerSeatFinder
      seats={seats}
      employees={(employees ?? []) as Employee[]}
      departmentOptions={(departments ?? []) as DepartmentOption[]}
      zoneOptions={(zones ?? []) as ZoneOption[]}
    />
  );
}
