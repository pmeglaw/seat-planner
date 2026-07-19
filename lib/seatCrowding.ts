// Render-layer crowding detection for seat pills. In dense pods the resting
// pills are wider than the seat pitch at fit zoom, so neighbours overlap and
// truncate each other's labels. Callers pass VISUAL (on-image) coordinates
// and use the result to de-collide pills without resizing them: code pills
// render at ONE fixed size everywhere, and colliding pairs are separated by
// alternating vertical token nudges (computeCodePillNudges) — stored seat
// coordinates are never touched.
//
// Two nudge systems coexist and are computed IN ORDER: name-label nudges
// first (computeNameLabelNudges — named seats render name/prominent tokens),
// then code-pill nudges (computeCodePillNudges), which treat the named seats
// at their already-assigned rows as obstacles to dodge. Compute names before
// codes and pass the result through, or the two graphs converge pills onto
// the same row.

export type CrowdingClearance = { x: number; y: number };

// Resting code-pill footprint in CSS px (~46px wide pill + breathing room,
// 24px tall + ring). Two markers closer than this on both axes will render
// overlapping pills at the given scale.
export const CODE_PILL_CLEARANCE_PX: CrowdingClearance = { x: 48, y: 26 };

// The fixed code-pill geometry and the token nudge amplitude, in CSS px.
// SeatMarker's Tailwind classes (w-[46px] h-[24px], ±14px translate) must
// embed these exact numbers — Tailwind's static extraction can't read them
// from here, so tests/pill-crowding-scale-source.test.mjs pins the two in
// sync. The overlap scoring below reasons in this geometry; if they drift
// apart the scorer models pills that don't exist on screen.
export const CODE_PILL_SIZE_PX = { w: 46, h: 24 } as const;
export const PILL_NUDGE_PX = 14;

// Conservative footprint for a resting name/prominent token (standard name
// pill 92–104px × min-h 34px; passive prominent up to 118px). Used only as
// an obstacle extent when code pills dodge named neighbours — oversizing it
// slightly just biases code pills further away.
export const NAME_PILL_OBSTACLE_PX = { w: 96, h: 34 } as const;

// Fallback for surfaces that don't track pixels-per-normalized-unit: the px
// clearance at the fit-zoom scale of a ~1100px-wide map render. Normalized y
// spans the frame HEIGHT (~499px at that width on the 1911×867 plan), so the
// y component divides by the y-axis scale — a width-divided y here would
// understate the vertical clearance ~2.2× and make pre-measure nudge scoring
// blind to real vertical proximity (SSR/first-paint converging-pill flash).
export const CODE_PILL_DEFAULT_CLEARANCE: CrowdingClearance = { x: 0.044, y: 0.052 };

// Normalized y spans the frame HEIGHT, so the y clearance must divide by the
// pixels-per-y-unit — callers pass it explicitly (frame height, or width ×
// image aspect).
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
  const converted = {
    x: CODE_PILL_CLEARANCE_PX.x / pixelsPerXUnit,
    y: CODE_PILL_CLEARANCE_PX.y / pixelsPerYUnit
  };
  // Denormal scales pass the input checks but overflow the quotient — a
  // non-finite clearance would poison the nudge scoring downstream (every
  // px-per-unit recovery becomes 0 × Infinity = NaN).
  if (!Number.isFinite(converted.x) || !Number.isFinite(converted.y)) {
    return CODE_PILL_DEFAULT_CLEARANCE;
  }
  return converted;
}

function isDegenerateClearance(clearance: CrowdingClearance): boolean {
  return (
    !Number.isFinite(clearance.x) || clearance.x <= 0 ||
    !Number.isFinite(clearance.y) || clearance.y <= 0
  );
}

// Deterministic visit/summation order shared by BOTH nudge systems: (y, x,
// id). The two graphs must agree on which seat is "upper" or results become
// order-dependent between them.
function compareSeatOrder<T extends { id: string; x: number; y: number }>(a: T, b: T): number {
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
}

function boxCollides<T extends { x: number; y: number }>(
  a: T,
  b: T,
  clearance: CrowdingClearance
): boolean {
  return Math.abs(a.x - b.x) < clearance.x && Math.abs(a.y - b.y) < clearance.y;
}

// O(n²) over ≤ a few hundred markers per floor — no spatial index needed.
export function computeCrowdedSeatIds<T extends { id: string; x: number; y: number }>(
  seats: ReadonlyArray<T>,
  clearance: CrowdingClearance = CODE_PILL_DEFAULT_CLEARANCE
): Set<string> {
  const crowded = new Set<string>();
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      if (boxCollides(seats[i], seats[j], clearance)) {
        crowded.add(seats[i].id);
        crowded.add(seats[j].id);
      }
    }
  }
  return crowded;
}

export type CodePillNudgeOptions = {
  // Name-label nudges already assigned by computeNameLabelNudges (same seats,
  // same clearance). Named seats render name/prominent tokens instead of
  // code pills, so they are excluded from the code graph and instead act as
  // obstacles at their nudged rows with the larger name footprint.
  nameNudges?: ReadonlyMap<string, -1 | 0 | 1>;
  namedSeatIds?: ReadonlySet<string>;
};

// Deterministic code-pill nudge assignment: seats whose fixed-size code
// pills would physically overlap at the current scale get alternating
// vertical token nudges (±PILL_NUDGE_PX via SeatMarker) instead of a smaller
// pill. Greedy graph-coloring in (y, x, id) order — a colliding pair must
// diverge (−1/+1), never share a row — refined by projected-overlap scoring:
// colliding pairs alone don't determine a good assignment, because two
// stacked pairs each resolve internally yet converge into each other when
// the upper pair nudges down and the lower pair nudges up (NE-pod 2×2 at fit
// zoom). Among the values legal w.r.t. colliding placed neighbours (falling
// back to the full palette when a clique exhausts it — a scored least-bad
// row beats a hardcoded anchor), each seat takes the value whose projected
// pill rect overlaps the least with every already-known token: placed
// participants at their assigned nudge, resting code pills on the anchor
// row, and named seats at their name-nudge rows. In a 3+-clique the three
// rows are only PILL_NUDGE_PX apart, so some residual overlap is geometric
// (the scorer minimizes it); cliques only form at sub-desktop frame widths.
// Never mutates the input seats — reads coordinates only.
export function computeCodePillNudges<T extends { id: string; x: number; y: number }>(
  seats: ReadonlyArray<T>,
  clearance: CrowdingClearance,
  options: CodePillNudgeOptions = {}
): Map<string, -1 | 0 | 1> {
  const nudges = new Map<string, -1 | 0 | 1>();
  const safeClearance = isDegenerateClearance(clearance) ? CODE_PILL_DEFAULT_CLEARANCE : clearance;
  const namedSeatIds = options.namedSeatIds ?? new Set<string>();
  const nameNudges = options.nameNudges ?? new Map<string, -1 | 0 | 1>();

  // Crowding is detected across ALL seats — a code pill whose only close
  // neighbour is a named seat still participates, so it can dodge the name
  // pill's row. Named seats never join the graph themselves (they render
  // name tokens, positioned by computeNameLabelNudges).
  const crowdedIds = computeCrowdedSeatIds(seats, safeClearance);
  if (crowdedIds.size === 0) {
    return nudges;
  }

  const sorted = seats
    .filter((seat) => crowdedIds.has(seat.id) && !namedSeatIds.has(seat.id))
    .sort(compareSeatOrder);

  // Recover CSS px from the clearance (both axes of CODE_PILL_CLEARANCE_PX
  // divide by the same live scale the caller used).
  const pxPerNormX = CODE_PILL_CLEARANCE_PX.x / safeClearance.x;
  const pxPerNormY = CODE_PILL_CLEARANCE_PX.y / safeClearance.y;

  // Obstacles that can never move: resting code pills on the anchor row and
  // named seats at their name-nudge rows. Prefiltered to the reachable
  // neighbourhood of some participant — a token can only overlap a nudged
  // pill within half the summed widths on x and half the summed heights plus
  // twice the nudge travel on y.
  type Obstacle = { x: number; y: number; nudge: -1 | 0 | 1; w: number; h: number };
  const reachX = (CODE_PILL_SIZE_PX.w + NAME_PILL_OBSTACLE_PX.w) / 2 / pxPerNormX;
  const reachY = ((CODE_PILL_SIZE_PX.h + NAME_PILL_OBSTACLE_PX.h) / 2 + 2 * PILL_NUDGE_PX) / pxPerNormY;
  const nearAParticipant = (seat: { x: number; y: number }): boolean =>
    sorted.some((p) => Math.abs(p.x - seat.x) < reachX && Math.abs(p.y - seat.y) < reachY);
  const obstacles: Obstacle[] = [];
  for (const seat of [...seats].sort(compareSeatOrder)) {
    if (namedSeatIds.has(seat.id)) {
      if (nearAParticipant(seat)) {
        obstacles.push({
          x: seat.x,
          y: seat.y,
          nudge: nameNudges.get(seat.id) ?? 0,
          w: NAME_PILL_OBSTACLE_PX.w,
          h: NAME_PILL_OBSTACLE_PX.h
        });
      }
    } else if (!crowdedIds.has(seat.id) && nearAParticipant(seat)) {
      obstacles.push({ x: seat.x, y: seat.y, nudge: 0, w: CODE_PILL_SIZE_PX.w, h: CODE_PILL_SIZE_PX.h });
    }
  }

  const palette: ReadonlyArray<-1 | 0 | 1> = [-1, 1, 0];

  const projectedOverlapArea = (seat: T, value: -1 | 0 | 1, placedUpTo: number): number => {
    let area = 0;
    const against = (other: { x: number; y: number }, otherNudge: -1 | 0 | 1, w: number, h: number) => {
      const dxPx = Math.abs(seat.x - other.x) * pxPerNormX;
      const dyPx = Math.abs((seat.y - other.y) * pxPerNormY + (value - otherNudge) * PILL_NUDGE_PX);
      const ox = (CODE_PILL_SIZE_PX.w + w) / 2 - dxPx;
      const oy = (CODE_PILL_SIZE_PX.h + h) / 2 - dyPx;
      if (ox > 0 && oy > 0) {
        area += ox * oy;
      }
    };
    // Fixed summation order (sorted participants, then sorted obstacles) so
    // near-tie argmins can't flip with the caller's input array order.
    for (let j = 0; j < placedUpTo; j += 1) {
      against(sorted[j], nudges.get(sorted[j].id) ?? 0, CODE_PILL_SIZE_PX.w, CODE_PILL_SIZE_PX.h);
    }
    for (const obstacle of obstacles) {
      against(obstacle, obstacle.nudge, obstacle.w, obstacle.h);
    }
    return area;
  };

  for (let i = 0; i < sorted.length; i += 1) {
    const seat = sorted[i];
    const used = new Set<-1 | 0 | 1>();
    for (let j = 0; j < i; j += 1) {
      const neighbor = sorted[j];
      if (!boxCollides(seat, neighbor, safeClearance)) {
        continue;
      }
      const neighborNudge = nudges.get(neighbor.id);
      if (neighborNudge !== undefined) {
        used.add(neighborNudge);
      }
    }
    // A clique can exhaust the palette (3 mutually-colliding, already-colored
    // neighbours). Falling back to the FULL palette and scoring beats any
    // hardcoded row — the scorer then picks the least-overlapping side.
    const candidates = used.size >= palette.length ? palette : palette.filter((value) => !used.has(value));
    let best = candidates[0];
    let bestArea = Number.POSITIVE_INFINITY;
    for (const value of candidates) {
      const area = projectedOverlapArea(seat, value, i);
      if (area < bestArea) {
        bestArea = area;
        best = value;
      }
    }
    nudges.set(seat.id, best);
  }

  return nudges;
}

// Deterministic name-label nudge assignment: only named seats participate in
// collision clustering and only named seats ever receive a nudge. Unnamed
// neighbours matter one way (2026-07-16 critique, minor 9): their CODE pills
// render on or near the anchor line (computeCodePillNudges runs AFTER this
// and dodges the rows assigned here), so a name pill that overlaps one must
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

  const sorted = [...named].sort(compareSeatOrder);

  const palette: ReadonlyArray<-1 | 0 | 1> = [0, -1, 1];
  const obstaclePalette: ReadonlyArray<-1 | 0 | 1> = [-1, 1, 0];

  for (let i = 0; i < sorted.length; i += 1) {
    const seat = sorted[i];
    const neighborUsage = new Map<-1 | 0 | 1, number>();
    for (let j = 0; j < i; j += 1) {
      const neighbor = sorted[j];
      if (!boxCollides(seat, neighbor, clearance)) {
        continue;
      }
      const neighborNudge = nudges.get(neighbor.id);
      if (neighborNudge !== undefined) {
        neighborUsage.set(neighborNudge, (neighborUsage.get(neighborNudge) ?? 0) + 1);
      }
    }

    // An overlapping unnamed code pill pins the anchor row: prefer ±1 first,
    // keeping 0 only as the last free value before the least-used fallback.
    const overlapsObstacle = unnamed.some((obstacle) => boxCollides(seat, obstacle, clearance));
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
