// Geometry for arrow-key seat traversal (roving tabindex on the map).
//
// Points are expected in a space where one unit of x and one unit of y look
// the same on screen (callers pass visual coordinates scaled by the floor-plan
// image's pixel dimensions), so "the seat to the right" matches what the user
// sees rather than the normalized coordinate grid.

export type SeatNavPoint = { id: string; x: number; y: number };
export type SeatNavDirection = "up" | "down" | "left" | "right";

// Sideways drift costs more than forward distance, so from a pod row the
// arrow keys walk the row before jumping diagonally to a nearer other row.
const LATERAL_PENALTY = 2.5;
const FORWARD_EPSILON = 1e-6;

export function findNearestSeatInDirection(
  seats: SeatNavPoint[],
  fromId: string,
  direction: SeatNavDirection
): string | null {
  const from = seats.find(seat => seat.id === fromId);
  if (!from) return null;

  let best: { id: string; score: number } | null = null;
  for (const seat of seats) {
    if (seat.id === fromId) continue;
    const dx = seat.x - from.x;
    const dy = seat.y - from.y;
    const forward =
      direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
    if (forward <= FORWARD_EPSILON) continue;
    const lateral = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = forward + lateral * LATERAL_PENALTY;
    if (!best || score < best.score) best = { id: seat.id, score };
  }
  return best?.id ?? null;
}

// The map's single tab stop: the previously visited seat when it still
// exists, otherwise the top-left-most seat (natural reading start).
export function resolveRovingSeatId(seats: SeatNavPoint[], preferredId: string | null): string | null {
  if (preferredId && seats.some(seat => seat.id === preferredId)) return preferredId;
  let best: SeatNavPoint | null = null;
  for (const seat of seats) {
    if (!best || seat.y < best.y - FORWARD_EPSILON || (Math.abs(seat.y - best.y) <= FORWARD_EPSILON && seat.x < best.x)) {
      best = seat;
    }
  }
  return best?.id ?? null;
}

// Home / End (PHASE2UX §1M.11, Phase 4 PR 3b): the first / last seat in
// reading order — top row first, left to right, the same order
// resolveRovingSeatId starts from.
export type SeatNavEdge = "first" | "last";

export function seatAtReadingEdge(seats: SeatNavPoint[], edge: SeatNavEdge): string | null {
  let best: SeatNavPoint | null = null;
  for (const seat of seats) {
    if (!best) {
      best = seat;
      continue;
    }
    const rowDelta = seat.y - best.y;
    const before =
      rowDelta < -FORWARD_EPSILON || (Math.abs(rowDelta) <= FORWARD_EPSILON && seat.x < best.x);
    const after =
      rowDelta > FORWARD_EPSILON || (Math.abs(rowDelta) <= FORWARD_EPSILON && seat.x > best.x);
    if (edge === "first" ? before : after) best = seat;
  }
  return best?.id ?? null;
}

export function edgeKeyToPosition(key: string): SeatNavEdge | null {
  return key === "Home" ? "first" : key === "End" ? "last" : null;
}

export function arrowKeyToDirection(key: string): SeatNavDirection | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}
