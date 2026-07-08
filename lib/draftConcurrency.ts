// Optimistic-concurrency fencing for the shared draft layer.
//
// The draft seat map is one shared copy edited by every admin session. Undo/redo
// and JSON restore rewrite the WHOLE draft from a client-held snapshot, so a
// session working from stale data can silently revert another admin's edits
// (last-write-wins). The fence closes that hole: the client sends the draft
// state it believes is current — a fingerprint of (seat count, max updated_at)
// for whole-draft operations, or a single seat's updated_at for per-seat
// operations — and the RPC rejects with SQLSTATE 'MLS02' if the database has
// advanced past it. `updated_at` is maintained by the touch_seats_updated_at
// trigger, so any committed draft write moves the fingerprint.

import type { Seat } from "@/lib/types";

/** Custom SQLSTATE raised by draft RPCs when the fence detects a stale client. */
export const STALE_DRAFT_SQLSTATE = "MLS02";

export type DraftFingerprint = {
  seatCount: number;
  maxUpdatedAt: string | null;
};

type FingerprintSource = Pick<Seat, "updated_at">;

/**
 * Fingerprint the draft layer as the client currently holds it.
 *
 * `maxUpdatedAt` is selected by lexicographic comparison of the ISO strings
 * PostgREST returned. That is safe here because every value comes from the same
 * serializer (identical instants serialize identically), and ISO-8601 UTC
 * timestamps with a shared date prefix order correctly digit-by-digit even when
 * trailing fractional zeros are trimmed. Parsing via Date would silently drop
 * microsecond precision and could hand back a string the database has never
 * stored, tripping the fence on a false positive.
 */
export function computeDraftFingerprint(seats: readonly FingerprintSource[]): DraftFingerprint {
  let maxUpdatedAt: string | null = null;

  for (const seat of seats) {
    const updatedAt = seat.updated_at ?? null;
    if (!updatedAt) continue;
    if (maxUpdatedAt === null || updatedAt > maxUpdatedAt) {
      maxUpdatedAt = updatedAt;
    }
  }

  return { seatCount: seats.length, maxUpdatedAt };
}

/** True when a Supabase/Postgres error is the draft-concurrency fence firing. */
export function isStaleDraftErrorCode(code: string | null | undefined): boolean {
  return code === STALE_DRAFT_SQLSTATE;
}
