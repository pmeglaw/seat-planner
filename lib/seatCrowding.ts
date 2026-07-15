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

// Density tiers layered on top of crowding: `crowded` is exactly what
// computeCrowdedSeatIds flags today; `dense` is the tighter subset (0.6x the
// clearance on both axes) where pills overlap so much a smaller/compact
// treatment is warranted, not just a nudge.
export type SeatDensityTiers = { crowded: Set<string>; dense: Set<string> };

const DENSE_CLEARANCE_FACTOR = 0.6;

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
// collision clustering (an unnamed neighbour's position is irrelevant to
// whether two visible name labels overlap). Within each colliding cluster,
// members are sorted by (y, then x) and assigned a repeating 0, -1, +1
// pattern so no two adjacent-in-order cluster members share a nudge value.
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

  // Union-find over named seats only, connecting pairs within clearance.
  const parent = named.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root];
    }
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootA] = rootB;
    }
  };

  for (let i = 0; i < named.length; i += 1) {
    for (let j = i + 1; j < named.length; j += 1) {
      if (
        Math.abs(named[i].x - named[j].x) < clearance.x &&
        Math.abs(named[i].y - named[j].y) < clearance.y
      ) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < named.length; i += 1) {
    const root = find(i);
    const cluster = clusters.get(root);
    if (cluster) {
      cluster.push(i);
    } else {
      clusters.set(root, [i]);
    }
  }

  const nudgePattern: ReadonlyArray<-1 | 0 | 1> = [0, -1, 1];
  for (const cluster of clusters.values()) {
    const sorted = [...cluster].sort((a, b) => {
      const seatA = named[a];
      const seatB = named[b];
      if (seatA.y !== seatB.y) {
        return seatA.y - seatB.y;
      }
      return seatA.x - seatB.x;
    });
    sorted.forEach((seatIndex, position) => {
      nudges.set(named[seatIndex].id, nudgePattern[position % nudgePattern.length]);
    });
  }

  return nudges;
}
