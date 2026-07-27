// Stale-chunk recovery for the route error boundaries.
//
// A deploy replaces the build's hashed JS chunks and purges the old ones. A tab
// that still holds the previous build's HTML throws ChunkLoadError the moment it
// needs a lazy chunk, and the boundary's `reset()` only re-renders the same tree
// against the same dead URL — so "Try again" is unrecoverable by construction.
// A document reload is the only fix, because it fetches fresh HTML.
//
// The guard timestamp is what keeps that from becoming a reload loop: if the
// reload itself lands on another chunk error (CDN still serving stale HTML), the
// second one falls through to the manual UI. It is time-boxed rather than
// one-shot so a *later* deploy can self-heal the same tab again.

export const CHUNK_RELOAD_STORAGE_KEY = "seat-planner:chunk-reload-at";

/** Two reloads inside this window mean reloading is not helping — stop. */
export const CHUNK_RELOAD_GUARD_MS = 10_000;

export type ChunkErrorRecovery = "reload" | "manual";

/** Minimal slice of the Web Storage API this module needs. */
export type RecoveryStorage = Pick<Storage, "getItem" | "setItem">;

// Turbopack and webpack word this differently, and native ESM import failures
// carry no `name` at all, so match on both the name and the known messages.
const CHUNK_ERROR_MESSAGES = [
  /loading chunk \S+ failed/i,
  /failed to load chunk/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  if (typeof message !== "string") return false;

  return CHUNK_ERROR_MESSAGES.some((pattern) => pattern.test(message));
}

/**
 * Decide how the boundary should recover. Returns `"reload"` at most once per
 * `CHUNK_RELOAD_GUARD_MS`; anything else — including unreadable storage, where a
 * loop could not be detected — falls back to the manual retry UI.
 */
export function planChunkErrorRecovery(
  error: unknown,
  storage: RecoveryStorage | null | undefined,
  now: number
): ChunkErrorRecovery {
  if (!isChunkLoadError(error) || !storage) return "manual";

  try {
    const lastAttempt = Number.parseInt(storage.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? "", 10);
    if (Number.isFinite(lastAttempt) && now - lastAttempt < CHUNK_RELOAD_GUARD_MS) {
      return "manual";
    }

    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
    return "reload";
  } catch {
    return "manual";
  }
}
