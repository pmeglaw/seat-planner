import type { SeatWithEmployee } from "@/lib/types";

export function normalizeSeat(seat: SeatWithEmployee): SeatWithEmployee {
  return {
    ...seat,
    x: Number(seat.x),
    y: Number(seat.y),
    zone: seat.zone ?? seat.department ?? null,
    is_custom: Boolean(seat.is_custom)
  };
}

export function normalizeSeats(seats: SeatWithEmployee[]) {
  return seats.map(normalizeSeat);
}
