// THROWAWAY concept fixture — "Seat Sheet" new-hire assignment card.
//
// Sample data only: names are invented, callout distances are eyeballed.
// To preview the sheet with real office data, edit this file — nothing else
// reads it. The seat/zone vernacular (label "E06", zone "East Pod") matches
// the production map fixtures in ../map-redesign/fixtureSeats.ts.

export type SheetCallout = {
  /** Circled key on the plan drawing; the list below the seat code repeats it. */
  key: 1 | 2 | 3 | 4;
  label: string;
  detail: string;
};

export const SEAT_SHEET = {
  hire: {
    name: "Alex Petrosyan",
    position: "Case Manager",
    department: "Case Management",
    startDate: "2026-08-24"
  },
  seat: {
    label: "E06",
    zone: "East Pod",
    floor: "Suite 200"
  },
  callouts: [
    { key: 1, label: "Your neighbors", detail: "Daniel (E05) and Maria (E04), Case Management" },
    { key: 2, label: "Nearest printer", detail: "Copy alcove, northeast corner — 20 ft" },
    { key: 3, label: "Kitchen", detail: "West wall, past Center Desks — coffee at 8 AM" },
    { key: 4, label: "Nearest exit", detail: "East corridor door, behind your pod" }
  ] satisfies SheetCallout[],
  titleBlock: {
    sheetNo: "A-101",
    scale: "NTS",
    drawnBy: "SEAT PLANNER",
    date: "2026-08-16",
    revision: "0",
    issuedFor: "ORIENTATION — SAMPLE DATA"
  }
} as const;
