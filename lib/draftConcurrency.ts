// Optimistic-concurrency fencing for the shared draft layer.
//
// The draft seat map is one shared copy edited by every admin session. Undo/redo
// and JSON restore rewrite the WHOLE draft from a client-held snapshot, so a
// session working from stale data can silently revert another admin's edits
// (last-write-wins). The fence closes that hole: the client sends the draft
// state it believes is current — an exact (id, updated_at) expectation for
// every draft seat for whole-draft operations, or a single seat's updated_at
// for per-seat operations — and the RPC rejects with SQLSTATE 'MLS02' if the
// database has advanced past it. `updated_at` is maintained by the
// touch_seats_updated_at trigger, so any committed draft write moves the row
// the client's expectation is checked against.
//
// The whole-draft fence is deliberately an exact per-row map, NOT an aggregate
// like (count, max(updated_at)): an aggregate is blind to an older concurrent
// edit once the stale client makes a newer edit of its own (per-seat fences
// allow different-seat edits through, so the client's own edit becomes the
// max and the earlier foreign edit hides beneath it).

import type { Employee, Seat } from "@/lib/types";

/** Custom SQLSTATE raised by draft RPCs when the fence detects a stale client. */
export const STALE_DRAFT_SQLSTATE = "MLS02";

export type DraftSeatExpectation = {
  id: string;
  updated_at: string | null;
};

/** Same (id, updated_at) shape, checked against public.employees by publish. */
export type EmployeeExpectation = DraftSeatExpectation;

type ExpectationSource = Pick<Seat, "id" | "updated_at">;

type EmployeeExpectationSource = Pick<Employee, "id" | "updated_at" | "active">;

/**
 * List the (id, updated_at) pairs of the draft as the client currently holds
 * it. The timestamps are passed back verbatim — never re-parsed through Date,
 * which would silently drop microsecond precision and hand the database a
 * value it never stored, tripping the fence on a false positive.
 */
export function listDraftSeatExpectations(seats: readonly ExpectationSource[]): DraftSeatExpectation[] {
  return seats.map(seat => ({ id: seat.id, updated_at: seat.updated_at ?? null }));
}

/**
 * List the (id, updated_at) pairs of the ACTIVE employee directory as the
 * client currently holds it — the exact set publish ships into
 * published_employees. The active filter lives here, not at call sites, so
 * every caller fences the ship-set: an inactive row in the payload would trip
 * the server's active-only count check as a false positive. Timestamps are
 * passed back verbatim, same as listDraftSeatExpectations.
 */
export function listActiveEmployeeExpectations(
  employees: readonly EmployeeExpectationSource[]
): EmployeeExpectation[] {
  return employees
    .filter(employee => employee.active)
    .map(employee => ({ id: employee.id, updated_at: employee.updated_at ?? null }));
}

/** True when a Supabase/Postgres error is the draft-concurrency fence firing. */
export function isStaleDraftErrorCode(code: string | null | undefined): boolean {
  return code === STALE_DRAFT_SQLSTATE;
}
