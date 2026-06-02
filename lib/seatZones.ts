import type { NormalizedPoint } from "@/lib/seatMath";

export type SeatZoneRect = {
  zone: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export const SEAT_ZONE_RECTS: SeatZoneRect[] = [
  { zone: "North Pod", xMin: 0.02, xMax: 0.25, yMin: 0.03, yMax: 0.1 },
  { zone: "North Pod", xMin: 0.02, xMax: 0.12, yMin: 0.11, yMax: 0.24 },
  { zone: "North Pod", xMin: 0.13, xMax: 0.25, yMin: 0.11, yMax: 0.24 },
  { zone: "North Pod", xMin: 0.25, xMax: 0.5, yMin: 0.04, yMax: 0.25 },
  { zone: "Northeast Pod", xMin: 0.5, xMax: 0.61, yMin: 0.11, yMax: 0.24 },
  { zone: "Northeast Pod", xMin: 0.62, xMax: 0.735, yMin: 0.11, yMax: 0.24 },
  { zone: "Northeast Pod", xMin: 0.74, xMax: 0.96, yMin: 0.04, yMax: 0.18 },
  { zone: "West Pod", xMin: 0.04, xMax: 0.22, yMin: 0.34, yMax: 0.76 },
  { zone: "West Pod", xMin: 0.02, xMax: 0.07, yMin: 0.5, yMax: 0.93 },
  { zone: "West Pod", xMin: 0.1, xMax: 0.25, yMin: 0.86, yMax: 0.94 },
  { zone: "Center West", xMin: 0.27, xMax: 0.37, yMin: 0.34, yMax: 0.75 },
  { zone: "Center West", xMin: 0.26, xMax: 0.4, yMin: 0.86, yMax: 0.94 },
  { zone: "Center Desks", xMin: 0.4, xMax: 0.61, yMin: 0.5, yMax: 0.72 },
  { zone: "Center Desks", xMin: 0.45, xMax: 0.62, yMin: 0.73, yMax: 0.88 },
  { zone: "East Pod", xMin: 0.56, xMax: 0.8, yMin: 0.34, yMax: 0.49 },
  { zone: "Southeast Office", xMin: 0.68, xMax: 0.78, yMin: 0.6, yMax: 0.77 },
  { zone: "Southeast Office", xMin: 0.68, xMax: 0.78, yMin: 0.79, yMax: 0.88 },
  { zone: "Southeast Office", xMin: 0.84, xMax: 0.98, yMin: 0.27, yMax: 0.49 },
  { zone: "Southeast Office", xMin: 0.86, xMax: 0.96, yMin: 0.51, yMax: 0.66 },
  { zone: "Southeast Office", xMin: 0.84, xMax: 0.98, yMin: 0.68, yMax: 0.88 }
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
  const matches = SEAT_ZONE_RECTS.filter(rect => pointIsInsideSeatZone(point, rect));
  const zones = new Set(matches.map(rect => rect.zone));
  return zones.size === 1 ? matches[0].zone : null;
}
