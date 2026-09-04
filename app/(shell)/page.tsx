import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ViewerSeatFinder } from "@/components/seat-map/ViewerSeatFinder";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { floorOfPerson, urlFloorFor } from "@/lib/floors";
import { findEmployeeByEmail, findSeatForEmployee } from "@/lib/mySeat";
import { getSessionContext } from "@/lib/serverAuth";
import { VIEWER_SEAT_COLUMNS, withNullNotes, type ViewerSeatRow } from "@/lib/viewerSeatColumns";
import type { DepartmentOption, Employee, ZoneOption } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstParam(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ?? null;
}

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  // The (shell) layout already probed the session for its chrome; the shared
  // context is React-cache()d, so this costs no second auth round-trip.
  const { supabase, user } = await getSessionContext();

  if (!user) redirect("/login?next=/");

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
  const [seatRows, employees, departmentsResult, zonesResult] = await Promise.all([
    fetchAllRows<ViewerSeatRow>(
      (from, to) =>
        supabase
          .from("seats")
          .select(VIEWER_SEAT_COLUMNS, { count: "exact" })
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
  const employeesById = new Map(employees.map(employee => [employee.id, employee]));
  const seats = seatRows.map(seat => ({
    ...withNullNotes(seat),
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

  // Multi-floor landing (owner ruling 2026-09-01: land on your own floor,
  // remember the last one). The server contributes the two facts it can know
  // — what the URL asks for (?seat= wins over ?floor=) and the signed-in
  // person's own floor, matched by email against the SAME published snapshot
  // (no second table read, no second auth probe; the remembered floor is
  // client-only and slots in between on mount). An unseated directory member
  // lands on the roster floor while the interim rule holds.
  const params = (await searchParams) ?? {};
  const urlFloor = urlFloorFor(seats, { seat: firstParam(params.seat), floor: firstParam(params.floor) });
  const me = findEmployeeByEmail(employees, user.email);
  const ownFloor = me ? floorOfPerson(findSeatForEmployee(seats, me.id), seats) : null;

  return (
    <ViewerSeatFinder
      seats={seats}
      employees={(employees ?? []) as Employee[]}
      departmentOptions={(departments ?? []) as DepartmentOption[]}
      zoneOptions={(zones ?? []) as ZoneOption[]}
      lastPublishedLabel={lastPublishedLabel}
      landing={{ urlFloor, ownFloor }}
    />
  );
}
