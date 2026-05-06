import type { SeatStatus } from "@/lib/types";
import { SEAT_STATUSES } from "@/lib/types";
import { normalizePoint } from "@/lib/seatMath";

export function assertNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${fieldName} is required.`);
  return trimmed;
}

export function normalizeSeatStatus(
  status: string,
  hasEmployee: boolean
): SeatStatus {
  if (!SEAT_STATUSES.includes(status as SeatStatus)) {
    return hasEmployee ? "assigned" : "available";
  }

  const nextStatus = status as SeatStatus;
  if (hasEmployee) return "assigned";
  if (nextStatus === "assigned") return "available";
  return nextStatus;
}

export function validateSeatCoordinates(x: number, y: number) {
  return normalizePoint({ x, y });
}

export function buildInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
}
