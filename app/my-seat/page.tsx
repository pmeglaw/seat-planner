import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SeatSheet, SeatSheetNotice } from "@/components/seat-map/SeatSheet";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { floorOf } from "@/lib/floorIds";
import { floorLabel, floorOfPerson, floorOrdinal } from "@/lib/floors";
import { seatsToVisualSeats } from "@/lib/mapLayoutTransform";
import { findEmployeeByEmail, findSeatForEmployee, pickNeighbors } from "@/lib/mySeat";
import { createClient } from "@/lib/supabase/server";
import type { Employee } from "@/lib/types";
import { VIEWER_SEAT_COLUMNS, withNullNotes, type ViewerSeatRow } from "@/lib/viewerSeatColumns";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "My seat · Seat Planner"
};

// The viewer's own seat, rendered as a plan sheet. Same data rules as the
// viewer map (app/page.tsx): published seats + the published_employees
// snapshot ONLY — never the live employees table. Identity comes from the
// signed-in user's email matched against the snapshot; accounts without a
// directory entry (or without a seat) get a sheet-voiced notice, not an error.
export default async function MySeatPage() {
  await connection();
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/my-seat");

  const [seatRows, employees] = await Promise.all([
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
    )
  ]);

  const employeesById = new Map(employees.map(employee => [employee.id, employee]));
  const seats = seatsToVisualSeats(
    seatRows.map(seat => ({
      ...withNullNotes(seat),
      employee: seat.employee_id ? employeesById.get(seat.employee_id) ?? null : null
    }))
  );

  const me = findEmployeeByEmail(employees, user.email);
  if (!me) {
    return (
      <SeatSheetNotice
        heading="Your account is not in the published directory"
        detail={`No published employee record matches ${user.email ?? "your account"}. If you were added recently, your entry appears after the next map publish — ask an admin to publish, or to check the email on your directory record.`}
        issuedFor={user.email ?? "Unknown account"}
      />
    );
  }

  const mySeat = findSeatForEmployee(seats, me.id);
  if (!mySeat) {
    // Multi-floor PR-2: while the interim rule holds, a seat-less directory
    // member works on the floor that is not mapped yet — a location, not an
    // absence (lib/floors floorOfPerson, one home for the inference).
    const interimFloor = floorOfPerson(null, seats);
    if (interimFloor) {
      return (
        <SeatSheetNotice
          heading={`You work on ${floorLabel(interimFloor)}`}
          detail={`The ${floorOrdinal(interimFloor)}-floor plan is not mapped yet. Your extension and department are in the directory; a desk appears here once the floor is mapped and published.`}
          issuedFor={me.full_name}
        />
      );
    }
    return (
      <SeatSheetNotice
        heading="No seat assigned yet"
        detail="You are in the published directory, but no published seat carries your name. Seat assignments appear here after an admin assigns a seat and publishes the map."
        issuedFor={me.full_name}
      />
    );
  }

  // The sheet draws ONE floor: neighbours and context desks come from the
  // seat's own floor (a desk upstairs can share coordinates with one below).
  const myFloor = floorOf(mySeat);
  const floorSeats = seats.filter(seat => floorOf(seat) === myFloor);

  // Same derivation as app/page.tsx: publish re-inserts every row, so the max
  // updated_at over published seats IS the last publish time.
  const lastPublishedAt = seats.reduce<string | null>(
    (latest, seat) => (seat.updated_at && (!latest || seat.updated_at > latest) ? seat.updated_at : latest),
    null
  );
  const lastPublishedLabel = lastPublishedAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Los_Angeles"
      }).format(new Date(lastPublishedAt))
    : null;

  return (
    <SeatSheet
      employee={me}
      mySeat={mySeat}
      neighbors={pickNeighbors(floorSeats, mySeat)}
      allSeats={floorSeats}
      floorLabel={floorLabel(myFloor)}
      lastPublishedLabel={lastPublishedLabel}
    />
  );
}
