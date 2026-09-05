// LEAF — zero `@/` imports. The geometry vocabulary shared by every floor:
// calibration areas (saved -> visual per-area linear fits), zone rectangles,
// office-room rectangles and the plan asset. lib/mapLayoutTransform,
// lib/seatZones and the retired lib/officeRoomWash (PR 3a) keep their floor-3 literals where they
// have always been and import only the TYPES from here; the floor-2 data
// module (lib/floorGeometry/floor2.ts) imports this file and lib/floorIds and
// nothing else. That layering is what keeps the whole thing an acyclic graph
// — an ESM value cycle between a floor module and the transform throws a TDZ
// ReferenceError at load (tests/floors.test.mjs pins it).

export type Bounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type LinearTransform = {
  xScale: number;
  xOffset: number;
  yScale: number;
  yOffset: number;
};

export type CalibrationArea = {
  id: string;
  zones: string[];
  labelPrefixes: string[];
  savedBounds: Bounds;
  visualBounds: Bounds;
  transform: LinearTransform;
};

// A floor whose saved coordinates ARE its visual coordinates (slice B seeds
// floor 2 from measured chair centres) needs no calibration: identity.
export const IDENTITY_TRANSFORM: LinearTransform = { xScale: 1, xOffset: 0, yScale: 1, yOffset: 0 };

// Structurally identical to SeatZoneRect (lib/seatZones) and OfficeRoomRect
// (the retired lib/officeRoomWash (PR 3a)); declared here so the data module never has to import
// the modules that consume it.
export type FloorZoneRect = { zone: string } & Bounds;
export type FloorOfficeRoomRect = { key: string } & Bounds;

export type FloorGeometry = {
  calibrationAreas: CalibrationArea[];
  previewTransform: LinearTransform;
  zoneRects: FloorZoneRect[];
  officeRooms: FloorOfficeRoomRect[];
};

// The raster a floor renders. `src` carries a `?v=` cache-buster and
// `blurDataUrl` a tiny preview; regenerate BOTH whenever the pixels change
// (lib/mapLayoutTransform.ts documents the contract for floor 3).
export type FloorPlan = {
  src: string;
  width: number;
  height: number;
  blurDataUrl: string;
};
