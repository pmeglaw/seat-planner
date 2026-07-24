import type { SeatStatus } from "@/lib/types";

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

export const SOUTH_OFFICE_ROOM_VISUAL_RECTS: OfficeRoomRect[] = [
  { key: "south-office-1", xMin: 0.118, xMax: 0.223, yMin: 0.921, yMax: 0.99 },
  { key: "south-office-2", xMin: 0.227, xMax: 0.425, yMin: 0.921, yMax: 0.99 }
];

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
    rooms = SOUTH_OFFICE_ROOM_VISUAL_RECTS,
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
