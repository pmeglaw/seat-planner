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

// Normalized y spans the frame HEIGHT, so the y clearance must divide by the
// pixels-per-y-unit — callers pass it explicitly (frame height, or width ×
// image aspect). Omitting it keeps the old width-divided fallback, which
// understates the y clearance by the map aspect (~2.2× on the 1911×867 plan)
// and lets vertically-overlapping diagonal pairs escape crowding.
export function clearanceFromScale(
  pixelsPerXUnit: number,
  pixelsPerYUnit: number = pixelsPerXUnit
): CrowdingClearance {
  if (
    !Number.isFinite(pixelsPerXUnit) || pixelsPerXUnit <= 0 ||
    !Number.isFinite(pixelsPerYUnit) || pixelsPerYUnit <= 0
  ) {
    return CODE_PILL_DEFAULT_CLEARANCE;
  }
  return {
    x: CODE_PILL_CLEARANCE_PX.x / pixelsPerXUnit,
    y: CODE_PILL_CLEARANCE_PX.y / pixelsPerYUnit
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

// Density tiers layered on top of crowding: `crowded` is exactly what
// computeCrowdedSeatIds flags today; `dense` is the tighter subset where even
// the crowded pill treatment cannot fit the pitch. The crowded code pill
// renders ~40px wide for the widest four-character codes (vs the 48px
// clearance), so the dense cutoff is 40/48 of the clearance — below it the
// crowded treatment itself would still overlap, and only the micro pill fits.
// A 0.6 factor here leaves a pitch band (0.6–0.83 of clearance) where the
// picked treatment is guaranteed to collide; don't lower it without also
// shrinking the crowded pill.
export type SeatDensityTiers = { crowded: Set<string>; dense: Set<string> };

const DENSE_CLEARANCE_FACTOR = 40 / 48;

export function computeSeatDensityTiers<T extends { id: string; x: number; y: number }>(
  seats: ReadonlyArray<T>,
  clearance: CrowdingClearance = CODE_PILL_DEFAULT_CLEARANCE
): SeatDensityTiers {
  const crowded = computeCrowdedSeatIds(seats, clearance);
  const denseClearance: CrowdingClearance = {
    x: clearance.x * DENSE_CLEARANCE_FACTOR,
    y: clearance.y * DENSE_CLEARANCE_FACTOR
  };
  const dense = new Set<string>();
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      if (
        Math.abs(seats[i].x - seats[j].x) < denseClearance.x &&
        Math.abs(seats[i].y - seats[j].y) < denseClearance.y
      ) {
        dense.add(seats[i].id);
        dense.add(seats[j].id);
      }
    }
  }
  return { crowded, dense };
}

// Deterministic name-label nudge assignment: only named seats participate in
// collision clustering and only named seats ever receive a nudge. Unnamed
// neighbours matter one way (2026-07-16 critique, minor 9): their CODE pills
// render pinned at the anchor line, so a name pill that overlaps one must
// prefer a vertical offset — for such seats the anchor row (nudge 0) drops to
// last preference. Unnamed seats still never consume a palette slot (the
// 4-clique phantom-member fix stands). This is a greedy graph-coloring
// over the actual pairwise collision edges among named seats, NOT a
// positional pattern — a positional "every 3rd seat by sort order" scheme can
// assign the same nudge to two seats that actually collide whenever a
// cluster isn't a simple chain (e.g. a seat colliding with two different
// same-valued neighbors that don't collide with each other). Seats are
// visited in a fully deterministic order (y, then x, then id as a final
// tiebreaker so tied coordinates don't fall back to input order) and each
// seat takes the first nudge value not already used by any
// previously-visited seat it actually collides with. If a seat has 3+
// already-colored colliding neighbors covering all of [0, -1, 1] (typically
// triggered by 4+ mutually-colliding named seats; greedy order can rarely
// exhaust the palette without a literal 4-clique), there is no fully-distinct
// value left — as a best effort we fall back to whichever value is least
// represented among those colliding neighbors, breaking ties by palette
// order for determinism.
// Never mutates the input seats — reads coordinates only.
export function computeNameLabelNudges<T extends { id: string; x: number; y: number }>(
  seats: ReadonlyArray<T>,
  namedSeatIds: ReadonlySet<string>,
  clearance: CrowdingClearance
): Map<string, -1 | 0 | 1> {
  const nudges = new Map<string, -1 | 0 | 1>();
  const named = seats.filter((seat) => namedSeatIds.has(seat.id));
  if (named.length === 0) {
    return nudges;
  }
  const unnamed = seats.filter((seat) => !namedSeatIds.has(seat.id));

  const sorted = [...named].sort((a, b) => {
    if (a.y !== b.y) {
      return a.y - b.y;
    }
    if (a.x !== b.x) {
      return a.x - b.x;
    }
    if (a.id < b.id) {
      return -1;
    }
    if (a.id > b.id) {
      return 1;
    }
    return 0;
  });

  const collides = (a: T, b: T): boolean =>
    Math.abs(a.x - b.x) < clearance.x && Math.abs(a.y - b.y) < clearance.y;

  const palette: ReadonlyArray<-1 | 0 | 1> = [0, -1, 1];
  const obstaclePalette: ReadonlyArray<-1 | 0 | 1> = [-1, 1, 0];

  for (let i = 0; i < sorted.length; i += 1) {
    const seat = sorted[i];
    const neighborUsage = new Map<-1 | 0 | 1, number>();
    for (let j = 0; j < i; j += 1) {
      const neighbor = sorted[j];
      if (!collides(seat, neighbor)) {
        continue;
      }
      const neighborNudge = nudges.get(neighbor.id);
      if (neighborNudge !== undefined) {
        neighborUsage.set(neighborNudge, (neighborUsage.get(neighborNudge) ?? 0) + 1);
      }
    }

    // An overlapping unnamed code pill pins the anchor row: prefer ±1 first,
    // keeping 0 only as the last free value before the least-used fallback.
    const overlapsObstacle = unnamed.some((obstacle) => collides(seat, obstacle));
    const preference = overlapsObstacle ? obstaclePalette : palette;
    const free = preference.find((value) => !neighborUsage.has(value));
    if (free !== undefined) {
      nudges.set(seat.id, free);
      continue;
    }

    // All three values are already used by colliding, previously-assigned
    // neighbors — pick the least-used one among them (best effort; see
    // comment above the function).
    let fallback: -1 | 0 | 1 = palette[0];
    let fallbackCount = Number.POSITIVE_INFINITY;
    for (const value of palette) {
      const count = neighborUsage.get(value) ?? 0;
      if (count < fallbackCount) {
        fallbackCount = count;
        fallback = value;
      }
    }
    nudges.set(seat.id, fallback);
  }

  return nudges;
}
