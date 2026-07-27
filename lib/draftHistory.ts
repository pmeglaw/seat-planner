import type { Employee, SeatWithEmployee } from "@/lib/types";

export type DraftSnapshot = {
  seats: SeatWithEmployee[];
  employees: Employee[];
};

export type DraftHistoryEntry = {
  label: string;
  before: DraftSnapshot;
  after: DraftSnapshot;
};

export type DraftHistoryState = {
  undoStack: DraftHistoryEntry[];
  redoStack: DraftHistoryEntry[];
};

const DEFAULT_HISTORY_LIMIT = 20;

function cloneSnapshot(snapshot: DraftSnapshot): DraftSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as DraftSnapshot;
}

function snapshotsEqual(left: DraftSnapshot, right: DraftSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createDraftHistory(): DraftHistoryState {
  return {
    undoStack: [],
    redoStack: []
  };
}

export function createDraftSnapshot(seats: SeatWithEmployee[], employees: Employee[]): DraftSnapshot {
  return cloneSnapshot({ seats, employees });
}

export function pushDraftHistory(
  history: DraftHistoryState,
  entry: DraftHistoryEntry,
  limit = DEFAULT_HISTORY_LIMIT
): DraftHistoryState {
  if (snapshotsEqual(entry.before, entry.after)) return history;

  return {
    undoStack: [...history.undoStack, {
      label: entry.label,
      before: cloneSnapshot(entry.before),
      after: cloneSnapshot(entry.after)
    }].slice(-limit),
    redoStack: []
  };
}

export function undoDraftHistory(history: DraftHistoryState) {
  const entry = history.undoStack.at(-1);
  if (!entry) return null;

  return {
    entry,
    snapshot: cloneSnapshot(entry.before),
    history: {
      undoStack: history.undoStack.slice(0, -1),
      redoStack: [...history.redoStack, entry]
    }
  };
}

export function redoDraftHistory(history: DraftHistoryState) {
  const entry = history.redoStack.at(-1);
  if (!entry) return null;

  return {
    entry,
    snapshot: cloneSnapshot(entry.after),
    history: {
      undoStack: [...history.undoStack, entry],
      redoStack: history.redoStack.slice(0, -1)
    }
  };
}

export function clearDraftHistory(): DraftHistoryState {
  return createDraftHistory();
}

type VolatileKey = "created_at" | "updated_at";
const VOLATILE_KEYS: VolatileKey[] = ["created_at", "updated_at"];

function stripVolatile<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...record };
  for (const key of VOLATILE_KEYS) delete copy[key];
  return copy;
}

function comparableSeats(snapshot: DraftSnapshot) {
  return [...snapshot.seats]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(seat => ({
      ...stripVolatile(seat),
      employee: seat.employee ? stripVolatile(seat.employee) : null
    }));
}

function comparableEmployees(snapshot: DraftSnapshot) {
  return [...snapshot.employees]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(stripVolatile);
}

// Key-order-independent serialization so equal values always compare equal,
// regardless of which code path assembled the objects.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Value-equivalence of two draft states, ignoring volatile timestamps.
 *
 * Undo/redo restore the WHOLE draft from a history snapshot, so they are only
 * safe while the live draft still equals the state the history entry left it
 * in (`after` for undo, `before` for redo). A concurrent edit by another admin
 * session breaks that adjacency even when this client's view of the draft is
 * fully up to date — the server-side updated_at fence cannot see it, because
 * it only proves the VIEW is fresh, not that the SNAPSHOT still applies.
 * Timestamps are ignored because a successful restore rewrites every draft
 * row (bumping updated_at) without changing values.
 */
export function draftStatesEquivalent(left: DraftSnapshot, right: DraftSnapshot): boolean {
  return (
    canonicalJson(comparableSeats(left)) === canonicalJson(comparableSeats(right)) &&
    canonicalJson(comparableEmployees(left)) === canonicalJson(comparableEmployees(right))
  );
}

export function canUndoDraftHistory(history: DraftHistoryState) {
  return history.undoStack.length > 0;
}

export function canRedoDraftHistory(history: DraftHistoryState) {
  return history.redoStack.length > 0;
}

// --- Entry labels -----------------------------------------------------------
//
// A history entry's label is not just display text. Redo PARSES it back to
// learn which seat an "Add" entry created, so it can reselect that seat after
// restoring. Builder and parser used to sit ~500 lines apart in SeatMap.tsx
// with nothing tying them together: renaming the label would have silently
// stopped redo reselecting the seat, with no test failing. Keeping both here,
// round-tripped by one test, makes that drift impossible.

const ADDED_SEAT_LABEL_PATTERN = /^Add (.+)$/;

/** History label for creating a seat. Must stay parseable by parseAddedSeatLabel. */
export function addedSeatHistoryLabel(seatLabel: string): string {
  return `Add ${seatLabel}`;
}

/**
 * The seat label an "Add" entry created, or null for any other entry.
 *
 * Redo uses this to reselect the restored seat; returning null simply means
 * "nothing to reselect", which is the correct behaviour for every other label.
 */
export function parseAddedSeatLabel(historyLabel: string): string | null {
  return historyLabel.match(ADDED_SEAT_LABEL_PATTERN)?.[1] ?? null;
}

/**
 * Describe what an edit did to a seat, for the undo/redo notice.
 *
 * Order matters: the assignment transitions are checked before the generic
 * status change, because assigning or vacating also moves the status and would
 * otherwise be reported as the vaguer "Change status".
 */
export function describeSeatUpdate(before: DraftSnapshot, updated: SeatWithEmployee): string {
  const previous = before.seats.find(seat => seat.id === updated.id);
  if (!previous) return `Update ${updated.label}`;
  if (previous.employee_id && !updated.employee_id) return `Vacate ${updated.label}`;
  if (!previous.employee_id && updated.employee_id) return `Assign ${updated.label}`;
  if (previous.employee_id !== updated.employee_id) return `Reassign ${updated.label}`;
  if (previous.status !== updated.status) return `Change status ${updated.label}`;
  return `Update ${updated.label}`;
}

// --- Persistence (sessionStorage) -------------------------------------------
//
// The history stacks survive a page reload by round-tripping through
// sessionStorage (per-tab, so parallel admin tabs never share stacks). These
// helpers are pure — the component owns the actual storage reads/writes — so
// the serialization format and the adoption safety rule stay unit-testable.

export const DRAFT_HISTORY_STORAGE_KEY = "seat-planner:draft-history:v1";

const DRAFT_HISTORY_STORAGE_VERSION = 1;

export function serializeDraftHistory(history: DraftHistoryState): string {
  return JSON.stringify({ version: DRAFT_HISTORY_STORAGE_VERSION, history });
}

function isDraftSnapshotShape(value: unknown): value is DraftSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as DraftSnapshot;
  return Array.isArray(snapshot.seats) && Array.isArray(snapshot.employees);
}

function isDraftHistoryEntryShape(value: unknown): value is DraftHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as DraftHistoryEntry;
  return typeof entry.label === "string" && isDraftSnapshotShape(entry.before) && isDraftSnapshotShape(entry.after);
}

export function deserializeDraftHistory(raw: string | null): DraftHistoryState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: number; history?: DraftHistoryState } | null;
    if (parsed?.version !== DRAFT_HISTORY_STORAGE_VERSION || !parsed.history) return null;
    const { undoStack, redoStack } = parsed.history;
    if (!Array.isArray(undoStack) || !Array.isArray(redoStack)) return null;
    if (![...undoStack, ...redoStack].every(isDraftHistoryEntryShape)) return null;
    return { undoStack, redoStack };
  } catch {
    return null;
  }
}

/**
 * Whether a persisted history may be adopted against the live draft.
 *
 * Same adjacency invariant that guards every undo/redo click: the stacks are
 * only meaningful while the live draft equals the state they left it in — the
 * newest undo entry's `after` AND the newest redo entry's `before` (both, when
 * present). Anything else means the draft moved on while the history sat in
 * storage (another session, a publish, an import), and adopting it would arm
 * a restore that silently reverts those edits.
 */
export function canAdoptPersistedHistory(history: DraftHistoryState, current: DraftSnapshot): boolean {
  const newestUndo = history.undoStack.at(-1);
  const newestRedo = history.redoStack.at(-1);
  if (!newestUndo && !newestRedo) return false;
  if (newestUndo && !draftStatesEquivalent(newestUndo.after, current)) return false;
  if (newestRedo && !draftStatesEquivalent(newestRedo.before, current)) return false;
  return true;
}
