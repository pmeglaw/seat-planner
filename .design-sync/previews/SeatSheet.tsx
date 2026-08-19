import { SeatSheet } from "seat-planner";

// The viewer's /my-seat surface: one person's seat assignment drawn as an
// architect's plan sheet. Every mark is real data in the app — desks sit at
// true published visual coordinates — so the fixture below is shaped exactly
// like what app/my-seat/page.tsx passes: seats already run through
// seatsToVisualSeats, neighbors already picked and ordered by pickNeighbors.

type Person = {
  id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  phone_extension: string | null;
  email: string | null;
};

const person = (id: string, full_name: string, position: string | null, department: string | null, phone_extension: string | null): Person => ({
  id,
  full_name,
  position,
  department,
  phone_extension,
  email: `${full_name.toLowerCase().replace(/[^a-z]+/g, ".")}@megeredchianlaw.com`
});

const employee = (p: Person) => ({
  ...p,
  avatar_url: null,
  active: true,
  created_at: "2026-01-06T09:00:00.000Z",
  updated_at: "2026-08-12T16:20:00.000Z"
});

const seat = (label: string, x: number, y: number, occupant: Person | null, zone: string) => ({
  id: `seat-${label}`,
  seat_key: label.toLowerCase(),
  label,
  x,
  y,
  status: (occupant ? "assigned" : "available") as "assigned" | "available",
  layer: "published" as const,
  employee_id: occupant?.id ?? null,
  zone,
  department: occupant?.department ?? null,
  notes: null,
  is_custom: false,
  created_at: "2026-01-06T09:00:00.000Z",
  updated_at: "2026-08-12T16:20:00.000Z",
  employee: occupant ? employee(occupant) : null
});

const me = person("emp-1", "Ani Sarkisian", "Associate Attorney", "Litigation", "218");
const neighborPeople = [
  person("emp-2", "Dana Whitfield", "Paralegal", "Litigation", "221"),
  person("emp-3", "Marcus Ibarra", "Associate Attorney", "Litigation", "225"),
  person("emp-4", "Priya Raman", "Legal Assistant", "Intake", "204"),
  person("emp-5", "Tomás Delgado", "Case Manager", "Intake", "209")
];

const ZONE = "West wing";

const mySeat = seat("W12", 0.352, 0.474, me, ZONE);
const neighbors = [
  seat("W13", 0.386, 0.474, neighborPeople[0], ZONE),
  seat("W11", 0.318, 0.474, neighborPeople[1], ZONE),
  seat("W22", 0.352, 0.552, neighborPeople[2], ZONE),
  seat("W23", 0.386, 0.552, neighborPeople[3], ZONE)
];
// Context desks: inside the drawn window, unnamed on the sheet by design.
const contextSeats = [
  seat("W10", 0.284, 0.474, null, ZONE),
  seat("W21", 0.318, 0.552, null, ZONE),
  seat("W24", 0.420, 0.552, null, ZONE),
  seat("W14", 0.420, 0.474, null, ZONE)
];

// The sheet draws itself in on mount (stroke-dashoffset + opacity keyframes).
// Headless capture pauses CSS animations on their FIRST frame, which is
// opacity 0 — the card came back as an empty drawing frame. These rules are
// the component's own `prefers-reduced-motion: reduce` branch, applied
// unconditionally so the card shows the settled sheet a reader actually sees.
const SETTLED_CSS = `
.mss-sheet svg .mss-draw,
.mss-sheet svg .mss-settle,
.mss-sheet .mss-info > *,
.mss-sheet .mss-notice > *,
.mss-sheet .mss-title-block {
  animation: none !important;
  stroke-dashoffset: 0 !important;
  opacity: 1 !important;
  transform: none !important;
}`;

export const AssignedSeat = () => (
  <>
  <style>{SETTLED_CSS}</style>
  <SeatSheet
    employee={employee(me)}
    mySeat={mySeat}
    neighbors={neighbors}
    allSeats={[mySeat, ...neighbors, ...contextSeats]}
    lastPublishedLabel="12 August 2026"
  />
  </>
);
