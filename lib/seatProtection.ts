import type { SeatWithEmployee } from "@/lib/types";

type SeatProtectionInput = Pick<SeatWithEmployee, "label" | "layer" | "is_custom" | "employee_id" | "status"> | null | undefined;

const ORIGINAL_SEAT_LABEL_MAX_BY_PREFIX: Record<string, number> = {
  C: 8,
  CW: 8,
  E: 8,
  N: 12,
  NE: 8,
  SE: 4,
  W: 12
};

export function isProtectedOriginalSeatLabel(label: string | null | undefined) {
  const match = label?.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return false;

  const maxOriginalSeatNumber = ORIGINAL_SEAT_LABEL_MAX_BY_PREFIX[match[1]];
  if (!maxOriginalSeatNumber) return false;

  const seatNumber = Number.parseInt(match[2], 10);
  return Number.isInteger(seatNumber) && seatNumber >= 1 && seatNumber <= maxOriginalSeatNumber;
}

export function isCustomSeat(seat: SeatProtectionInput) {
  return Boolean(seat?.is_custom);
}

export function canDeleteDraftSeat(seat: SeatProtectionInput) {
  return Boolean(
    seat &&
    seat.layer === "draft" &&
    isCustomSeat(seat) &&
    !seat.employee_id &&
    seat.status === "available" &&
    !isProtectedOriginalSeatLabel(seat.label)
  );
}

export function canDeleteSeat(seat: SeatProtectionInput) {
  return canDeleteDraftSeat(seat);
}

export function getSeatDeleteBlockReason(seat: SeatProtectionInput) {
  if (!seat) return "Select a custom seat first.";
  if (seat.layer !== "draft") return "Only draft seats can be deleted.";
  if (seat.employee_id || seat.status === "assigned") return "Assigned seats cannot be deleted. Vacate the seat before removing a custom draft seat.";
  if (!isCustomSeat(seat) || isProtectedOriginalSeatLabel(seat.label)) return "Original seats are protected. Only custom draft seats can be deleted.";
  if (seat.status !== "available") return "Only available custom draft seats can be deleted.";
  return null;
}
