import type { NormalizedPoint } from "@/lib/seatMath";
import type { SeatWithEmployee } from "@/lib/types";

export type SeatZoneRect = {
  zone: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

type SeatZoneSource = Pick<SeatWithEmployee, "x" | "y"> & Partial<Pick<SeatWithEmployee, "zone" | "department">>;

const NEARBY_SEAT_ZONE_RADIUS = 0.085;
const AMBIGUOUS_ZONE_DISTANCE_DELTA = 0.0001;

export type SeatZoneDetectionResult =
  | { status: "detected"; zone: string }
  | { status: "ambiguous"; zone: null }
  | { status: "none"; zone: null };

export const SEAT_ZONE_RECTS: SeatZoneRect[] = [
  { zone: "North Pod", xMin: 0.07, xMax: 0.3, yMin: 0.08, yMax: 0.27 },
  { zone: "North Pod", xMin: 0.3, xMax: 0.51, yMin: 0.04, yMax: 0.26 },
  { zone: "Northeast Pod", xMin: 0.5, xMax: 0.6, yMin: 0.1, yMax: 0.25 },
  { zone: "Northeast Pod", xMin: 0.6, xMax: 0.69, yMin: 0.1, yMax: 0.25 },
  { zone: "Northeast Pod", xMin: 0.7, xMax: 0.91, yMin: 0.04, yMax: 0.2 },
  { zone: "West Pod", xMin: 0.08, xMax: 0.28, yMin: 0.36, yMax: 0.64 },
  { zone: "West Pod", xMin: 0.08, xMax: 0.28, yMin: 0.7, yMax: 0.83 },
  { zone: "Center West", xMin: 0.3, xMax: 0.4, yMin: 0.36, yMax: 0.5 },
  { zone: "Center West", xMin: 0.31, xMax: 0.4, yMin: 0.54, yMax: 0.83 },
  { zone: "Center Desks", xMin: 0.42, xMax: 0.61, yMin: 0.54, yMax: 0.63 },
  { zone: "Center Desks", xMin: 0.42, xMax: 0.61, yMin: 0.7, yMax: 0.79 },
  { zone: "East Pod", xMin: 0.57, xMax: 0.76, yMin: 0.39, yMax: 0.52 },
  { zone: "Southeast Office", xMin: 0.65, xMax: 0.76, yMin: 0.63, yMax: 0.84 },
  { zone: "Southeast Office", xMin: 0.66, xMax: 0.76, yMin: 0.84, yMax: 0.92 },
  { zone: "Southeast Office", xMin: 0.79, xMax: 0.91, yMin: 0.27, yMax: 0.53 },
  { zone: "Southeast Office", xMin: 0.79, xMax: 0.91, yMin: 0.56, yMax: 0.7 },
  { zone: "Southeast Office", xMin: 0.79, xMax: 0.91, yMin: 0.7, yMax: 0.9 },
  // Bottom-band offices (owner request 2026-07-23; frame corrected 2026-07-24):
  // one rectangle over the two rooms along the map's lower edge. Bounds are
  // VISUAL coordinates (like every other rect here) — detectSeatZoneForPoint is
  // fed a visual point (see app/actions.ts). Derived from the two south rooms in
  // OFFICE_ROOM_VISUAL_RECTS (lib/officeRoomWash.ts) with wall slack so clicks
  // anywhere inside either room, including the bottom wall, resolve here.
  { zone: "South Offices", xMin: 0.085, xMax: 0.455, yMin: 0.9, yMax: 1 }
];

export function pointIsInsideSeatZone(point: NormalizedPoint, rect: SeatZoneRect) {
  return (
    point.x >= rect.xMin &&
    point.x <= rect.xMax &&
    point.y >= rect.yMin &&
    point.y <= rect.yMax
  );
}

export function inferSeatZoneFromPoint(point: NormalizedPoint) {
  const result = inferSeatZoneFromPointResult(point);
  return result.status === "detected" ? result.zone : null;
}

export function inferSeatZoneFromPointResult(point: NormalizedPoint): SeatZoneDetectionResult {
  const matches = SEAT_ZONE_RECTS.filter(rect => pointIsInsideSeatZone(point, rect));
  const zones = new Set(matches.map(rect => rect.zone));
  if (zones.size === 1) return { status: "detected", zone: matches[0].zone };
  if (zones.size > 1) return { status: "ambiguous", zone: null };
  return { status: "none", zone: null };
}

function getSeatZone(seat: SeatZoneSource) {
  return seat.zone ?? seat.department ?? null;
}

function squaredDistance(left: NormalizedPoint, right: NormalizedPoint) {
  return ((left.x - right.x) ** 2) + ((left.y - right.y) ** 2);
}

export function detectSeatZoneForPoint(point: NormalizedPoint, seats: SeatZoneSource[]) {
  const result = detectSeatZoneForPointResult(point, seats);
  return result.status === "detected" ? result.zone : null;
}

export function detectSeatZoneForPointResult(point: NormalizedPoint, seats: SeatZoneSource[]): SeatZoneDetectionResult {
  const rectResult = inferSeatZoneFromPointResult(point);
  if (rectResult.status !== "none") return rectResult;

  const closestByZone = new Map<string, number>();

  for (const seat of seats) {
    const zone = getSeatZone(seat)?.trim();
    if (!zone) continue;

    const seatPoint = { x: Number(seat.x), y: Number(seat.y) };
    if (!Number.isFinite(seatPoint.x) || !Number.isFinite(seatPoint.y)) continue;

    const distance = squaredDistance(point, seatPoint);
    const current = closestByZone.get(zone);
    if (current === undefined || distance < current) {
      closestByZone.set(zone, distance);
    }
  }

  const nearbyZones = Array.from(closestByZone.entries())
    .filter(([, distance]) => distance <= NEARBY_SEAT_ZONE_RADIUS ** 2)
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));

  if (nearbyZones.length === 0) return { status: "none", zone: null };
  if (nearbyZones.length > 1 && Math.abs(nearbyZones[0][1] - nearbyZones[1][1]) < AMBIGUOUS_ZONE_DISTANCE_DELTA) {
    return { status: "ambiguous", zone: null };
  }

  return { status: "detected", zone: nearbyZones[0][0] };
}

export function getSeatZoneDetectionFailureMessage(result: SeatZoneDetectionResult) {
  if (result.status === "ambiguous") {
    return "This location is between zones. Try again closer to the intended seating area.";
  }

  if (result.status === "none") {
    return "Could not detect a zone for this location. Try clicking closer to an existing seating area.";
  }

  return null;
}
