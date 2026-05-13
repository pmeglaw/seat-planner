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

export function canUndoDraftHistory(history: DraftHistoryState) {
  return history.undoStack.length > 0;
}

export function canRedoDraftHistory(history: DraftHistoryState) {
  return history.redoStack.length > 0;
}
