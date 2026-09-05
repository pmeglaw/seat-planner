// Move / swap destination validity (Phase 4 PR 3b, owner ruling O4 2026-09-04).
//
// One pure predicate for the marker layer AND the click: SeatMap marks every
// invalid destination while a mode runs (`.sp-pill--invalid`, aria-disabled,
// "Not a valid target." in the accessible name) and refuses the click with the
// reason named in the canvas status region — never colour only. The server
// rules stay where they are (lib/seatSwap.ts and the RPCs still refuse); this
// is the client's honest preview of them plus the O4 rule.
//
//   swap  · the source itself is the source (clicking it collapses the
//           inspector, PHASE2UX §1M) · both seats empty = invalid (lib/seatSwap
//           "Swap requires at least one assigned seat") · an EMPTY reserved or
//           unavailable seat = invalid (O4: the person would land on a seat the
//           map says is not available)
//   move  · the source backs out of the mode (SeatMap) · an empty reserved or
//           unavailable seat = invalid (O4) · an assigned seat = valid (the
//           move offers a swap)
import type { SeatStatus } from "@/lib/types";

export type TargetMode = "swap" | "move";
export type TargetValidity = "source" | "valid" | "invalid";
export type SeatLike = { id: string; label: string; status: SeatStatus; employee_id: string | null };

function blockedEmptySeat(seat: SeatLike): boolean {
  return !seat.employee_id && (seat.status === "reserved" || seat.status === "unavailable");
}

export function targetValidity(mode: TargetMode, source: SeatLike, candidate: SeatLike): TargetValidity {
  if (candidate.id === source.id) return "source";
  if (mode === "swap" && !source.employee_id && !candidate.employee_id) return "invalid";
  if (blockedEmptySeat(candidate)) return "invalid";
  return "valid";
}

// The reason an invalid destination refuses, for the status region and the
// tooltip — names WHICH rule (owner ruling O4), ends in a next step. Null for
// a valid destination or the source.
export function invalidTargetReason(mode: TargetMode, source: SeatLike, candidate: SeatLike): string | null {
  if (targetValidity(mode, source, candidate) !== "invalid") return null;
  if (blockedEmptySeat(candidate)) {
    return `${candidate.label} is ${candidate.status} — choose another seat.`;
  }
  return "Swap needs at least one assigned seat — choose a seat with someone in it.";
}
