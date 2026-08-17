import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeatSheet, SeatSheetNotice } from "@/components/seat-map/SeatSheet";
import { seatsToVisualSeats } from "@/lib/mapLayoutTransform";
import { pickNeighbors } from "@/lib/mySeat";
import type { Employee, SeatWithEmployee } from "@/lib/types";
import { FIXTURE_SEATS } from "../map-redesign/fixtureSeats";

export const metadata: Metadata = {
  title: "Seat Planner · My seat sheet (preview)",
  description:
    "Prototype-only preview of the /my-seat Seat Sheet, fed with the map-redesign fixture seats so the populated state is inspectable without production data.",
  robots: { index: false, follow: false }
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

// Adapts the map-redesign fixtures (real coordinates, inline names) to the
// SeatWithEmployee shape /my-seat produces, then renders the REAL sheet
// component through the REAL neighbor picker — only the data source is fake.
function fixtureAsSeats(): SeatWithEmployee[] {
  const stamp = "2026-08-16T00:00:00Z";
  return FIXTURE_SEATS.map((seat, index) => {
    const employee: Employee | null = seat.full_name
      ? {
          id: `fixture-emp-${index}`,
          full_name: seat.full_name,
          position: seat.position,
          department: seat.emp_department,
          phone_extension: seat.phone_extension,
          email: null,
          avatar_url: null,
          active: true,
          created_at: stamp,
          updated_at: stamp
        }
      : null;
    return {
      id: `fixture-seat-${index}`,
      seat_key: seat.seat_key,
      label: seat.label,
      x: seat.x,
      y: seat.y,
      status: seat.status,
      layer: "published",
      employee_id: employee?.id ?? null,
      zone: seat.zone,
      department: null,
      notes: null,
      is_custom: seat.is_custom,
      created_at: stamp,
      updated_at: stamp,
      employee
    };
  });
}

export default async function MySeatSheetPreviewPage({
  searchParams
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (!prototypesEnabled()) {
    notFound();
  }

  // ?state=notice previews the sheet-voiced empty state.
  if ((await searchParams).state === "notice") {
    return (
      <SeatSheetNotice
        heading="No seat assigned yet"
        detail="You are in the published directory, but no published seat carries your name. Seat assignments appear here after an admin assigns a seat and publishes the map."
        issuedFor="Preview account"
      />
    );
  }

  const seats = seatsToVisualSeats(fixtureAsSeats());
  const mySeat = seats.find(seat => seat.employee) ?? null;
  if (!mySeat?.employee) {
    throw new Error("map-redesign fixtures no longer include an assigned seat — pick a new preview subject");
  }

  return (
    <SeatSheet
      employee={mySeat.employee}
      mySeat={mySeat}
      neighbors={pickNeighbors(seats, mySeat)}
      allSeats={seats}
      lastPublishedLabel="Aug 16, 2026"
    />
  );
}
