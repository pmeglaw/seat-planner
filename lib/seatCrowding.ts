// Render-layer crowding detection for seat code pills. In dense pods the
// resting pills are wider than the seat pitch at fit zoom, so neighbours
// overlap and truncate each other's labels. Callers pass VISUAL (on-image)
// coordinates and use the result only to pick a tighter pill treatment —
// stored seat coordinates are never touched.

export type CrowdingClearance = { x: number; y: number };

// Resting code-pill footprint in CSS px (~46px wide pill + breathing room,
// 24px tall + ring). Two markers closer than this on both axes will render
// overlapping pills at the given scale.
export const CODE_PILL_CLEARANCE_PX: CrowdingClearance = { x: 48, y: 26 };

// Fallback for surfaces that don't track pixels-per-normalized-unit: the
// px clearance at the fit-zoom scale of a ~1100px-wide map render.
export const CODE_PILL_DEFAULT_CLEARANCE: CrowdingClearance = { x: 0.044, y: 0.024 };

export function clearanceFromScale(pixelsPerNormalizedUnit: number): CrowdingClearance {
  if (!Number.isFinite(pixelsPerNormalizedUnit) || pixelsPerNormalizedUnit <= 0) {
    return CODE_PILL_DEFAULT_CLEARANCE;
  }
  return {
    x: CODE_PILL_CLEARANCE_PX.x / pixelsPerNormalizedUnit,
    y: CODE_PILL_CLEARANCE_PX.y / pixelsPerNormalizedUnit
  };
}

// O(n²) over ≤ a few hundred markers per floor — no spatial index needed.
export function computeCrowdedSeatIds<T extends { id: string; x: number; y: number }>(
  seats: ReadonlyArray<T>,
  clearance: CrowdingClearance = CODE_PILL_DEFAULT_CLEARANCE
): Set<string> {
  const crowded = new Set<string>();
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      if (
        Math.abs(seats[i].x - seats[j].x) < clearance.x &&
        Math.abs(seats[i].y - seats[j].y) < clearance.y
      ) {
        crowded.add(seats[i].id);
        crowded.add(seats[j].id);
      }
    }
  }
  return crowded;
}
