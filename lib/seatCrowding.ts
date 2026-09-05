// Render-layer crowding detection for seat pills. In dense pods the resting
// pills are wider than the seat pitch at fit zoom, so neighbours overlap and
// truncate each other's labels. Callers pass VISUAL (on-image) coordinates
// and use the result to de-collide pills without resizing them: every pill is
// the constant 28px footprint tall and fit-width (Phase 3, PHASE3DS §1.16),
// and colliding pairs are separated by alternating vertical token nudges
// (computeNameLabelNudges) — stored seat coordinates are never touched.
//
// Phase 4 PR 3b: ONE pill layer. The two-tier system (fixed 46×24 code pills
// nudged by computeCodePillNudges, name tokens on top, the 12px "text tier"
// and the pitch-gated 44px hit floor) retired with the Phase 3 pill — every
// marker is a name pill or a 28px footprint, every marker carries the asset's
// 44px `.cds-touch-target` region (deviation 7), and the seat code lives in
// the tier-C tooltip.

export type CrowdingClearance = { x: number; y: number };

// The pill's constant height and the token nudge amplitude, in CSS px.
// PILL_HEIGHT_PX = 2 × PILL_NUDGE_PX is load-bearing (DECISIONS D1): two
// nudged rows sit exactly one pill height apart, so a colliding pair nudged
// −1 / +1 touches without overlapping. At 29px the pod-row collisions return.
// The height is `--sp-pill-h` = `--sp-seat-footprint` = 28 in sp-tokens.css
// (tests/pill-crowding-scale-source.test.mjs pins the three in sync); the
// nudge is applied by SeatMarker as an inline transform.
export const PILL_HEIGHT_PX = 28;
export const PILL_NUDGE_PX = 14;

// Fit-width estimate for a name pill: `--sp-pill-pad` (8px) each side plus
// label-01 (12px IBM Plex Sans) at an average advance of ~6.6px per character
// — measured over the seed's "First L." labels (55–71px rendered; the
// estimate lands within ±4px). An estimate, not a canvas measure: it has to
// run on the server and before paint, and a few px either way only moves a
// borderline pair between "touching" and "one nudge apart". An empty seat is
// the 28px square footprint.
export const PILL_PAD_PX = 8;
export const PILL_CHAR_PX = 6.6;
export function estimatePillWidthPx(label: string): number {
  const trimmed = label.trim();
  if (!trimmed) return PILL_HEIGHT_PX;
  return Math.max(PILL_HEIGHT_PX, Math.round(2 * PILL_PAD_PX + trimmed.length * PILL_CHAR_PX));
}

// Fallback collision box for a resting pill when the caller cannot supply
// per-seat widths: a median "First L." (~56px) plus the pads, and the height
// plus 2px of breathing room. Two markers closer than this on BOTH axes
// render overlapping pills at the given scale.
export const PILL_CLEARANCE_PX: CrowdingClearance = { x: 72, y: PILL_HEIGHT_PX + 2 };

// Fallback for surfaces that don't track pixels-per-normalized-unit: the px
// clearance at the fit-zoom scale of a ~1100px-wide map render. Normalized y
// spans the frame HEIGHT (~499px at that width on the 1911×867 plan), so the
// y component divides by the y-axis scale — a width-divided y here would
// understate the vertical clearance ~2.2× and make pre-measure nudge scoring
// blind to real vertical proximity (SSR/first-paint converging-pill flash).
export const PILL_DEFAULT_CLEARANCE: CrowdingClearance = { x: 0.044, y: 0.052 };

// Normalized y spans the frame HEIGHT, so the y clearance must divide by the
// pixels-per-y-unit — callers pass it explicitly (frame height, or width ×
// image aspect).
export function clearanceFromScale(
  pixelsPerXUnit: number,
  pixelsPerYUnit: number = pixelsPerXUnit,
  clearancePx: CrowdingClearance = PILL_CLEARANCE_PX
): CrowdingClearance {
  if (
    !Number.isFinite(pixelsPerXUnit) || pixelsPerXUnit <= 0 ||
    !Number.isFinite(pixelsPerYUnit) || pixelsPerYUnit <= 0
  ) {
    return PILL_DEFAULT_CLEARANCE;
  }
  const converted = {
    x: clearancePx.x / pixelsPerXUnit,
    y: clearancePx.y / pixelsPerYUnit
  };
  // Denormal scales pass the input checks but overflow the quotient — a
  // non-finite clearance would poison the nudge scoring downstream (every
  // px-per-unit recovery becomes 0 × Infinity = NaN).
  if (!Number.isFinite(converted.x) || !Number.isFinite(converted.y)) {
    return PILL_DEFAULT_CLEARANCE;
  }
  return converted;
}

// Deterministic visit order: (y, x, id). Tied coordinates fall back to id so
// input order never changes a result.
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
  clearance: CrowdingClearance = PILL_DEFAULT_CLEARANCE
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

export type NameLabelNudgeOptions<T> = {
  // Fit-width pills: the rendered width of each seat's marker in CSS px
  // (estimatePillWidthPx of the pill label, or the 28px footprint for an
  // empty seat). With `pixelsPerXUnit` this replaces the uniform x clearance
  // by the pair's own half-widths, so a wide "Christopher W." and its
  // neighbour are seen to collide while two short labels at the same pitch
  // are not. Without both, the uniform clearance box applies.
  widthPx?: (seat: T) => number;
  pixelsPerXUnit?: number;
};

// Deterministic name-label nudge assignment: only named seats participate in
// collision clustering and only named seats ever receive a nudge. Unnamed
// neighbours matter one way (2026-07-16 critique, minor 9): their footprints
// sit on the anchor line, so a name pill that overlaps one must prefer a
// vertical offset — for such seats the anchor row (nudge 0) drops to last
// preference. Unnamed seats still never consume a palette slot (the 4-clique
// phantom-member fix stands). This is a greedy graph-coloring over the actual
// pairwise collision edges among named seats, NOT a positional pattern — a
// positional "every 3rd seat by sort order" scheme can assign the same nudge
// to two seats that actually collide whenever a cluster isn't a simple chain
// (e.g. a seat colliding with two different same-valued neighbors that don't
// collide with each other). Seats are visited in a fully deterministic order
// (y, then x, then id as a final tiebreaker so tied coordinates don't fall
// back to input order) and each seat takes the first nudge value not already
// used by any previously-visited seat it actually collides with. If a seat
// has 3+ already-colored colliding neighbors covering all of [0, -1, 1]
// (typically triggered by 4+ mutually-colliding named seats; greedy order can
// rarely exhaust the palette without a literal 4-clique), there is no
// fully-distinct value left — as a best effort we fall back to whichever
// value is least represented among those colliding neighbors, breaking ties
// by palette order for determinism.
// Never mutates the input seats — reads coordinates only.
export function computeNameLabelNudges<T extends { id: string; x: number; y: number }>(
  seats: ReadonlyArray<T>,
  namedSeatIds: ReadonlySet<string>,
  clearance: CrowdingClearance,
  options: NameLabelNudgeOptions<T> = {}
): Map<string, -1 | 0 | 1> {
  const nudges = new Map<string, -1 | 0 | 1>();
  const named = seats.filter((seat) => namedSeatIds.has(seat.id));
  if (named.length === 0) {
    return nudges;
  }
  const unnamed = seats.filter((seat) => !namedSeatIds.has(seat.id));

  // Width-aware collision: |dx| < (wA + wB) / 2 in px, converted to
  // normalized x through the live scale; y keeps the uniform clearance
  // (every pill is the same height). Falls back to the box when the caller
  // gave no widths or no usable scale.
  const { widthPx, pixelsPerXUnit } = options;
  const widthAware = Boolean(widthPx) && Number.isFinite(pixelsPerXUnit) && (pixelsPerXUnit as number) > 0;
  const collides = (a: T, b: T): boolean => {
    if (!widthAware) return boxCollides(a, b, clearance);
    const halfSum = (widthPx!(a) + widthPx!(b)) / 2 / (pixelsPerXUnit as number);
    const xClear = Number.isFinite(halfSum) && halfSum > 0 ? halfSum : clearance.x;
    return Math.abs(a.x - b.x) < xClear && Math.abs(a.y - b.y) < clearance.y;
  };

  const sorted = [...named].sort(compareSeatOrder);

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

    // An overlapping unnamed footprint pins the anchor row: prefer ±1 first,
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
