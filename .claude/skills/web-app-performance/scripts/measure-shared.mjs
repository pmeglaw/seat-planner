// Pure helpers shared by the measurement scripts, kept separate so they can be
// unit-tested without launching a browser (see tests/measure-shared.test.mjs).
//
// Frame maths is the reason this file exists. It is small, easy to get subtly
// wrong, and a wrong answer here is worse than no answer: the whole point of
// the interaction tier is to tell someone whether a stutter is real, and a
// metric that quietly under-reports jank will send them off optimising
// something else.

export const FRAME_BUDGET_MS = 1000 / 60;

/**
 * Frames the compositor never got to present, summed across rAF intervals.
 *
 * An interval spanning N vsync slots presented one frame and missed N-1, so
 * severity has to be weighted: a single 500 ms freeze is not "one dropped
 * frame" the way a 33 ms hiccup is. Counting intervals instead of frames
 * flattens those two into the same number and hides sustained jank.
 *
 * Slots are found by ROUNDING, not flooring. Real intervals never land exactly
 * on a multiple of the budget, and flooring scores the canonical single-drop
 * case (33.3 ms ≈ 1.998 budgets) as zero missed frames — an off-by-one that
 * silently reports genuine jank as smooth.
 */
export function missedFrames(intervals, budgetMs = FRAME_BUDGET_MS) {
  return intervals.reduce((sum, ms) => sum + Math.max(0, slotsFor(ms, budgetMs) - 1), 0);
}

/**
 * How many distinct hiccups occurred, regardless of how long each lasted.
 *
 * Reported alongside missedFrames because the two answer different questions:
 * 30 missed frames spread over 15 small stutters feels different from 30 lost
 * to one long freeze, and the fix is usually different too.
 */
export function stutterIntervals(intervals, budgetMs = FRAME_BUDGET_MS) {
  return intervals.filter(ms => slotsFor(ms, budgetMs) >= 2).length;
}

function slotsFor(ms, budgetMs) {
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.round(ms / budgetMs));
}

/**
 * Compare a requested route against where the browser actually landed.
 *
 * Trailing slashes are normalised away because `/admin` and `/admin/` are the
 * same page and a framework-level normalisation redirect between them is not a
 * measurement problem. Anything else is: reporting one page's numbers under
 * another page's name is a wrong answer that looks like a right one, which is
 * the failure this whole skill argues against.
 */
export function samePath(a, b) {
  const strip = value => (value.length > 1 ? value.replace(/\/+$/, "") : value);
  return strip(a) === strip(b);
}

/** Nearest-rank percentile. Returns 0 for an empty set rather than NaN. */
export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/**
 * Read a numeric CLI flag, refusing values that would produce a confident-looking
 * but meaningless measurement.
 *
 * `--runs 0` used to fall through to an empty sample array and crash on
 * `samples[0]`; `--steps abc` used to run zero gestures and report all zeros,
 * which reads exactly like "your interaction is perfectly smooth". Both are the
 * failure mode this skill exists to prevent, so they fail loudly at parse time.
 */
export function numericFlag(argv, name, { fallback, min = -Infinity, integer = false } = {}) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;

  const raw = argv[index + 1];
  if (raw === undefined || raw.startsWith("--")) {
    throw new Error(`${name} needs a value (got nothing). Example: ${name} ${fallback}`);
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got ${JSON.stringify(raw)}.`);
  if (integer && !Number.isInteger(value)) throw new Error(`${name} must be a whole number, got ${raw}.`);
  if (value < min) throw new Error(`${name} must be at least ${min}, got ${raw}.`);
  return value;
}
