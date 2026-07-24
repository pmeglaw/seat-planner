import type { SeatStatus } from "@/lib/types";
import { MAP_IMAGE_HEIGHT, MAP_IMAGE_WIDTH } from "@/lib/mapLayoutTransform";

/**
 * Room-wash geometry + composition rules for the private offices (PR B of the
 * 2026-07-24 two-step; the nameplate marker was PR A).
 *
 * The rects are VISUAL-space room interiors ([0,1] of the displayed image),
 * measured 2026-07-24 against wall pixels on the 1911x867 master PNG. They
 * are deliberately NOT the SEAT_ZONE_RECTS band (saved space, one generous
 * rectangle across both rooms): detection wants slack around the walls, the
 * wash must hug them. Never derive one set from the other.
 */
export type OfficeRoomRect = { key: string; xMin: number; xMax: number; yMin: number; yMax: number };

// All eight private offices (extended from the two South rooms on 2026-07-24,
// owner ask "N13, N14, NE09, NE10, SE06, SE05 need the same"). Each rect was
// verified against prod: it contains exactly its own office seat and none of
// the other 60+ seats — re-run that containment audit when adding a room.
export const OFFICE_ROOM_VISUAL_RECTS: OfficeRoomRect[] = [
  { key: "north-office-1", xMin: 0.093, xMax: 0.189, yMin: 0.118, yMax: 0.248 },
  { key: "north-office-2", xMin: 0.21, xMax: 0.297, yMin: 0.118, yMax: 0.248 },
  { key: "northeast-office-1", xMin: 0.509, xMax: 0.603, yMin: 0.11, yMax: 0.248 },
  { key: "northeast-office-2", xMin: 0.623, xMax: 0.704, yMin: 0.11, yMax: 0.248 },
  { key: "southeast-office-6", xMin: 0.663, xMax: 0.748, yMin: 0.672, yMax: 0.829 },
  { key: "southeast-office-5", xMin: 0.802, xMax: 0.903, yMin: 0.756, yMax: 0.932 },
  { key: "south-office-1", xMin: 0.118, xMax: 0.223, yMin: 0.921, yMax: 0.99 },
  { key: "south-office-2", xMin: 0.227, xMax: 0.425, yMin: 0.921, yMax: 0.99 }
];

/**
 * The measured office room containing a VISUAL-space point, or null. Room
 * geometry (not zone) decides who renders as a nameplate — office seats can
 * carry pod zones (N13 is zone "North Pod"; zone inference has no room
 * concept) — and the rect also drives the plate's room-centered offset and
 * room-fitted width in SeatMap.
 */
export function findOfficeRoom(point: { x: number; y: number }): OfficeRoomRect | null {
  return (
    OFFICE_ROOM_VISUAL_RECTS.find(
      rect => point.x >= rect.xMin && point.x <= rect.xMax && point.y >= rect.yMin && point.y <= rect.yMax
    ) ?? null
  );
}

export function isInsideOfficeRoom(point: { x: number; y: number }): boolean {
  return findOfficeRoom(point) !== null;
}

export type OfficePlateLayout = { offsetXPx: number; offsetYPx: number; widthPx: number };

/**
 * Room-centered plate layout for an office seat: token offset (px) from the
 * seat anchor to its room's center, plus a room-fitted width (96px legibility
 * floor, 152px cap, 12px wall margin). ONE implementation for BOTH map
 * surfaces — SeatMap (admin) and ViewerSeatFinder (viewer) each feed their
 * own pixels-per-normalized-x scale; vertical scale derives from the map
 * aspect. Null when the point is outside every room or the map is unmeasured
 * (first paint), which renders the plate at its default anchor/size.
 */
export function getOfficePlateLayout(
  point: { x: number; y: number },
  pixelsPerNormalizedX: number
): OfficePlateLayout | null {
  const room = findOfficeRoom(point);
  if (!room || pixelsPerNormalizedX <= 0) return null;

  const pixelsPerNormalizedY = pixelsPerNormalizedX * (MAP_IMAGE_HEIGHT / MAP_IMAGE_WIDTH);
  return {
    offsetXPx: Math.round(((room.xMin + room.xMax) / 2 - point.x) * pixelsPerNormalizedX),
    offsetYPx: Math.round(((room.yMin + room.yMax) / 2 - point.y) * pixelsPerNormalizedY),
    widthPx: Math.max(96, Math.min(152, Math.round((room.xMax - room.xMin) * pixelsPerNormalizedX) - 12))
  };
}

export type OfficeWashSeat = { id: string; x: number; y: number; status: SeatStatus };

export type OfficeRoomWash = { key: string; rect: OfficeRoomRect; seatId: string };

/**
 * Composition rules (owner-approved before PR B): a room washes only while an
 * ASSIGNED seat sits inside it, and the wash yields to every stronger map
 * treatment — it dims out with its seat (filter/search dim), mutes while the
 * seat carries the orange search highlight, and disappears entirely in swap
 * mode and while its seat is being dragged. Seats pair with rooms in VISUAL
 * space — the same space the markers render in.
 */
export function buildOfficeRoomWashes(input: {
  rooms?: OfficeRoomRect[];
  seats: OfficeWashSeat[];
  dimmedSeatIds?: ReadonlySet<string>;
  searchActiveSeatIds?: ReadonlySet<string>;
  swapMode?: boolean;
  draggingSeatId?: string | null;
}): OfficeRoomWash[] {
  const {
    rooms = OFFICE_ROOM_VISUAL_RECTS,
    seats,
    dimmedSeatIds,
    searchActiveSeatIds,
    swapMode = false,
    draggingSeatId = null
  } = input;
  if (swapMode) return [];

  const washes: OfficeRoomWash[] = [];
  for (const room of rooms) {
    const occupant = seats.find(
      seat =>
        seat.status === "assigned" &&
        seat.x >= room.xMin &&
        seat.x <= room.xMax &&
        seat.y >= room.yMin &&
        seat.y <= room.yMax
    );
    if (!occupant) continue;
    if (occupant.id === draggingSeatId) continue;
    if (dimmedSeatIds?.has(occupant.id)) continue;
    if (searchActiveSeatIds?.has(occupant.id)) continue;
    washes.push({ key: room.key, rect: room, seatId: occupant.id });
  }
  return washes;
}
