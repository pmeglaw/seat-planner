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

  // UX-only role lookup: viewers should not see an Admin shortcut that always
  // fails for them. RLS + requireAdmin() stay the enforced boundary.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

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

  // publish_seat_map() re-inserts every published row, so updated_at defaults
  // to the publish moment — the max over published seats IS the last publish
  // time, with no extra table exposed to viewers. Formatted here (office
  // timezone) so the client renders a stable string with no hydration risk.
  const lastPublishedAt = seats.reduce<string | null>(
    (latest, seat) => (seat.updated_at && (!latest || seat.updated_at > latest) ? seat.updated_at : latest),
    null
  );
  const lastPublishedLabel = lastPublishedAt
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(lastPublishedAt))
    : null;

  return (
    <ViewerSeatFinder
      seats={seats}
      employees={(employees ?? []) as Employee[]}
      departmentOptions={(departments ?? []) as DepartmentOption[]}
      zoneOptions={(zones ?? []) as ZoneOption[]}
      showAdminShortcut={profile?.role === "admin"}
      lastPublishedLabel={lastPublishedLabel}
    />
  );
}
