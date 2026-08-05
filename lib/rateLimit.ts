// Fixed-window rate limiting for server actions. The caller owns the window
// store (a module-level Map next to the action), so this stays a pure
// function over (store, key, now) and the window arithmetic is unit-testable
// without clocks or timers. In-memory per server instance by design: the
// limit resets on redeploy/scale-out, which is fine for a friendly throttle —
// it is NOT a security boundary (requireAdmin is the gate).

export type RateLimitWindow = {
  windowStart: number;
  count: number;
};

export type RateLimitConfig = {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

// Stale keys are swept once the store outgrows this, keeping the map bounded
// without a timer (a handful of admins never reaches it; it guards leaks).
const PRUNE_THRESHOLD = 1000;

/**
 * Count one request against `key`'s fixed window, mutating `store`.
 * Returns whether the request is allowed and, when it is not, how long until
 * the window resets.
 */
export function applyFixedWindow(
  store: Map<string, RateLimitWindow>,
  key: string,
  now: number,
  { limit, windowMs }: RateLimitConfig
): RateLimitDecision {
  if (store.size > PRUNE_THRESHOLD) {
    for (const [staleKey, window] of store) {
      if (now - window.windowStart >= windowMs) store.delete(staleKey);
    }
  }

  const current = store.get(key);
  if (!current || now - current.windowStart >= windowMs) {
    store.set(key, { windowStart: now, count: 1 });
    return { allowed: true };
  }

  if (current.count < limit) {
    current.count += 1;
    return { allowed: true };
  }

  return { allowed: false, retryAfterMs: current.windowStart + windowMs - now };
}
