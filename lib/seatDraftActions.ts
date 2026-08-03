import type { SeatStatus, SeatWithEmployee } from "@/lib/types";

/**
 * The pure core of the seat-draft actions, extracted from SeatInspector so its
 * form and its icon-row Vacate (the canvas action bar this once lived on was
 * retired in v12 slice 4) settle through ONE path instead of two.
 *
 * Only the parts worth testing live here: the exact payload a vacate writes, and
 * how a server-action result is classified. The React wrapper
 * (components/seat-map/useSeatDraftActions.ts) holds the transition and the
 * callbacks. That split is deliberate — coverage:check enforces 90/95/80 across
 * lib/**, and the plain `node --test` tier cannot render a hook, so putting one
 * here would sink the floors while testing nothing.
 */

/** The `updateSeatAction` input, mirrored so this module needs no server import. */
export type SeatUpdateInput = {
  seatId: string;
  label: string;
  status: SeatStatus;
  employeeId?: string | null;
  employeeName?: string | null;
  employeePosition?: string | null;
  phoneExtension?: string | null;
  department?: string | null;
  zone?: string | null;
  notes?: string | null;
  forceMove?: boolean;
  /** Concurrency fence: the seat's updated_at as the client rendered it. */
  expectedUpdatedAt?: string | null;
};

/** Structural mirror of UpdateSeatResult — matched by shape, not imported. */
export type SeatUpdateResultLike =
  | { ok: true; seat: SeatWithEmployee }
  | { ok: false; code: string; message: string; currentSeatLabel?: string };

export type SeatDraftOutcome =
  | { kind: "saved"; seat: SeatWithEmployee }
  /** The draft-concurrency fence fired; the caller must reload and reset history. */
  | { kind: "stale"; message: string }
  /** Double-booking: the person already sits elsewhere. Offer to move them. */
  | { kind: "conflict"; message: string; currentSeatLabel: string }
  | { kind: "failed"; message: string };

/**
 * Whether a seat can be vacated at all. A seat with nobody in it has nothing to
 * clear, which is why the inspector's icon row hides Vacate rather than
 * showing it greyed out.
 */
export function canVacateSeat(seat: Pick<SeatWithEmployee, "employee_id"> | null | undefined): boolean {
  return Boolean(seat?.employee_id);
}

/**
 * The exact payload a vacate writes. Every field here is load-bearing:
 *
 * - `zone` falls back through `department` before null. Sending a bare null
 *   would UNZONE the seat as a side effect of clearing its occupant, and the
 *   zone is what the map's crowding and zone-detection logic reads.
 * - `notes` is preserved, trimmed. A note describes the SEAT ("monitor arm
 *   broken"), not the person, so vacating must not erase it.
 * - `expectedUpdatedAt` carries the row's `updated_at` through VERBATIM. Never
 *   re-parse it through `Date` — lib/draftConcurrency.ts's header explains why
 *   round-tripping a timestamp breaks the fence.
 *
 * `phoneExtension` is deliberately ABSENT while `employeePosition` is explicitly
 * null. That asymmetry is not a tidy-up target: updateSeatAction distinguishes
 * the two with `"employeePosition" in input` / `"phoneExtension" in input`
 * (app/actions.ts:333-334), so an omitted key means "leave unchanged" and an
 * explicit null means "clear". Adding phoneExtension here would start writing to
 * a field vacate has never touched. Pinned by tests/seat-draft-actions.test.mjs.
 */
export function buildVacateSeatInput(seat: SeatWithEmployee): SeatUpdateInput {
  return {
    seatId: seat.id,
    label: seat.label,
    status: "available",
    employeeId: null,
    employeeName: null,
    employeePosition: null,
    department: null,
    zone: seat.zone ?? seat.department ?? null,
    notes: seat.notes?.trim() || null,
    expectedUpdatedAt: seat.updated_at
  };
}

/**
 * Turn a server-action result into something a surface can branch on.
 *
 * The STALE_DRAFT arm matters most: it is not an error to show the user but a
 * signal that this client's view predates another admin's edit, and the caller
 * has to reload the draft and clear undo history rather than surface a message.
 * Collapsing it into the generic failure arm would leave a stale client happily
 * re-arming the same rejected write.
 */
export function classifySeatUpdateResult(result: SeatUpdateResultLike): SeatDraftOutcome {
  if (result.ok) return { kind: "saved", seat: result.seat };
  if (result.code === "STALE_DRAFT") return { kind: "stale", message: result.message };
  if (result.code === "EMPLOYEE_ALREADY_ASSIGNED") {
    return {
      kind: "conflict",
      message: result.message,
      currentSeatLabel: result.currentSeatLabel ?? "another seat"
    };
  }
  return { kind: "failed", message: result.message };
}

/**
 * Whether vacating should stop for a confirmation first.
 *
 * Vacate is a draft-only edit with a toast and Undo behind it, so it runs
 * straight through — EXCEPT when the inspector holds unsaved edits, which Undo
 * cannot restore because they were never committed.
 *
 * `fromTransientSurface` names the inspector's icon-row Vacate (formerly the
 * canvas action bar, retired in v12 slice 4), and the answer there is SETTLED
 * (owner call, 2026-07-30): it confirms EVERY time, dirty or not. A small
 * target that appears and disappears with the selection earns less trust than
 * a 44px cell inside a panel the user deliberately opened — so the icon row
 * passes `fromTransientSurface: true` and the rest of the inspector does not.
 *
 * The asymmetry is the point: do not "simplify" this to a single rule. Making
 * the inspector confirm every time adds a dialog to a flow that already has
 * Undo behind it; dropping the icon row's confirm puts an unguarded
 * destructive action on a transient surface.
 */
export function vacateNeedsConfirmation({
  hasUnsavedEdits,
  fromTransientSurface = false
}: {
  hasUnsavedEdits: boolean;
  fromTransientSurface?: boolean;
}): boolean {
  return hasUnsavedEdits || fromTransientSurface;
}
