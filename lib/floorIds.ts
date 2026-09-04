// The floor identity LEAF (multi-floor, 2026-09-01). Zero imports on purpose:
// the geometry modules (lib/mapLayoutTransform, lib/seatZones,
// lib/officeRoomWash) will import this file (PR-2), and the registry
// lib/floors.ts (PR-2) imports THEM — so anything heavier here would close an
// ESM value cycle that throws a TDZ ReferenceError at module load.
//
// The id list mirrors the SQL CHECK in
// supabase/migrations/20260901120000_seats_floor.sql (`seats_floor_known`);
// tests/floor-ids.test.mjs pins the two lists against each other. Change both.
//
// The garage (Floor 1) is deliberately absent — see the floor menu (components/seat-map/FloorMenuButton.tsx).

export type FloorId = "3" | "2";

export const FLOOR_IDS: readonly FloorId[] = ["3", "2"];

// Every seat that predates the column is on Floor 3: the column default says
// so, and so does floorOf() for any row or fixture that never carried it.
export const DEFAULT_FLOOR: FloorId = "3";

export function isFloorId(value: unknown): value is FloorId {
  return typeof value === "string" && (FLOOR_IDS as readonly string[]).includes(value);
}

export function floorOf(seat: { floor?: string | null } | null | undefined): FloorId {
  const floor = seat?.floor;
  return isFloorId(floor) ? floor : DEFAULT_FLOOR;
}
