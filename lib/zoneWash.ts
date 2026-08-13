/**
 * Zone hover-wash geometry (v12 slice 6, handoff contract #8): hovering a
 * zone chip in the filter panel previews that zone on the map; clicking pins
 * the filter and the wash persists.
 *
 * The wash is ONE bounding box over the zone's seats — computed from VISUAL
 * coordinates (post-calibration, the space the markers render in), padded so
 * the box reads as an area rather than a tight seat outline, then clamped to
 * the map frame. It is deliberately NOT built from SEAT_ZONE_RECTS
 * (lib/seatZones.ts): those are click-detection rects with slack around the
 * walls, and the wash must hug the seats it lights (same split as
 * lib/officeRoomWash.ts documents for rooms).
 */
import { NO_ZONE_LABEL, zoneKey } from "@/lib/seatFilters";

export type ZoneWashSeat = {
  x: number;
  y: number;
  zone?: string | null;
  department?: string | null;
};

export type ZoneWashRect = {
  zone: string;
  seatCount: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

// Prototype padding (~2.2% x / ~4.2% y of the map frame) — y is larger
// because seat pills are wider than tall, so equal padding would look thin
// above and below the rows.
export const ZONE_WASH_PAD_X = 0.022;
export const ZONE_WASH_PAD_Y = 0.042;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Bounding box for a zone's seats, or null when the zone is empty/unknown.
 * Zone membership mirrors the VIEWER filter's own grouping — seat.zone ??
 * seat.department ?? NO_ZONE_LABEL — so hover-preview lights exactly the
 * seats a pinned zone filter would keep, including a pinned "No zone" chip
 * (the viewer palette's display fallback for seats with neither column set).
 * Admin is unaffected: that surface groups no-zone seats under "" and never
 * produces a "No zone" pin, and buildZoneWash("", ...) still returns null
 * via the !washZone guard below.
 */
export function buildZoneWash(zone: string | null | undefined, seats: ZoneWashSeat[]): ZoneWashRect | null {
  const washZone = zone?.trim();
  if (!washZone) return null;
  // Matched on the filter's own comparison key, not on the display spelling:
  // the pinned zone carries whatever casing the option list or the first seat
  // used, so an exact compare could wash NOTHING while the filter kept seats.
  const washKey = zoneKey(washZone);

  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let seatCount = 0;

  for (const seat of seats) {
    if (zoneKey(seat.zone ?? seat.department ?? NO_ZONE_LABEL) !== washKey) continue;
    const x = Number(seat.x);
    const y = Number(seat.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    seatCount += 1;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }

  if (seatCount === 0) return null;

  return {
    zone: washZone,
    seatCount,
    xMin: clamp01(xMin - ZONE_WASH_PAD_X),
    xMax: clamp01(xMax + ZONE_WASH_PAD_X),
    yMin: clamp01(yMin - ZONE_WASH_PAD_Y),
    yMax: clamp01(yMax + ZONE_WASH_PAD_Y)
  };
}
