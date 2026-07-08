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
