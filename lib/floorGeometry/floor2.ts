import { IDENTITY_TRANSFORM, type FloorGeometry, type FloorPlan } from "@/lib/floorGeometry/types";

// Floor 2 · Litigation — data only. Multi-floor PR-2 ships this EMPTY: the
// 2nd-floor drawing does not exist yet, so the floor has no plan asset (the
// registry derives `mapped` from that), no calibration areas, no zone
// rectangles and no office rooms. The viewer and admin render the floor as a
// roster until slice B fills these in and the first floor-2 seat is
// published (lib/floors.ts, floorIsLive).
//
// Imports ONLY the two leaves (lib/floorIds, lib/floorGeometry/types) —
// tests/floors.test.mjs pins that, because the geometry modules import THIS
// file and a value import back at them would be a load-time cycle.

export const FLOOR_2_GEOMETRY: FloorGeometry = {
  calibrationAreas: [],
  previewTransform: IDENTITY_TRANSFORM,
  zoneRects: [],
  officeRooms: []
};

export const FLOOR_2_PLAN: FloorPlan | null = null;
