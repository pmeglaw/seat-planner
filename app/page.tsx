import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ViewerSeatFinder } from "@/components/seat-map/ViewerSeatFinder";
import { fetchAllRows } from "@/lib/fetchAllRows";
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
  //
  // Viewer people data comes ONLY from the published_employees snapshot
  // (replaced atomically at publish time) — never the live employees table,
  // which is the admins' draft-side working set. Employee edits therefore
  // wait for publish, exactly like seat edits. The employee join is stitched
  // here because seats' FK points at employees, not the snapshot.
  // Paged, not a bare select: PostgREST truncates at the project row cap and
  // says nothing, which would render a partial floor plan that looks whole.
  //
  // Everything below only needs user.id, so it all fires together — serial
  // awaits stacked round-trips into this force-dynamic render.
  const [profileResult, seatRows, employees, departmentsResult, zonesResult] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    fetchAllRows<SeatWithEmployee>(
      (from, to) =>
        supabase
          .from("seats")
          .select("*", { count: "exact" })
          .eq("layer", "published")
          .order("label")
          .range(from, to),
      { label: "published seats" }
    ),
    fetchAllRows<Employee>(
      (from, to) =>
        supabase
          .from("published_employees")
          .select("*", { count: "exact" })
          .eq("active", true)
          .order("full_name")
          .order("id")
          .range(from, to),
      { label: "published employees" }
    ),
    supabase.from("department_options").select("*").eq("active", true).order("name"),
    supabase.from("zone_options").select("*").eq("active", true).order("name")
  ]);
  const { data: profile } = profileResult;

  const employeesById = new Map(employees.map(employee => [employee.id, employee]));
  const seats = seatRows.map(seat => ({
    ...seat,
    employee: seat.employee_id ? employeesById.get(seat.employee_id) ?? null : null
  }));

  const { data: departments } = departmentsResult;
  const { data: zones } = zonesResult;

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
      accountEmail={user.email ?? ""}
      accountRoleLabel={profile?.role === "admin" ? "Admin" : "Viewer"}
    />
  );
}
