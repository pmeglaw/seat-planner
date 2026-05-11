import type { SeatWithEmployee } from "@/lib/types";

type SeatProtectionInput = Pick<SeatWithEmployee, "label" | "layer" | "is_custom"> | null | undefined;

export function isCustomSeat(seat: SeatProtectionInput) {
  return Boolean(seat?.is_custom);
}

export function canDeleteSeat(seat: SeatProtectionInput) {
  return Boolean(seat && seat.layer === "draft" && isCustomSeat(seat));
}

export function getSeatDeleteBlockReason(seat: SeatProtectionInput) {
  if (!seat) return "Select a custom seat first.";
  if (seat.layer !== "draft") return "Only draft seats can be deleted.";
  if (!isCustomSeat(seat)) return `${seat.label} is an original seat and cannot be deleted.`;
  return null;
}
