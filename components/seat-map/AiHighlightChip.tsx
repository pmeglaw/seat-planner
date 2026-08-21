"use client";

/**
 * Floating "AI · N seats highlighted · Clear" chip (v12 slice 7, handoff
 * contract #9).
 *
 * It lives in its own file for a reason that outlives the styling: the AI
 * token family is confined per-file by `tests/accessibility-source.test.mjs`,
 * which requires every `--sp-ai-*` occurrence in SeatMap.tsx to sit inside
 * the Ask Planner toolbar button. Keeping the chip here satisfies that
 * confinement structurally instead of widening the guardrail.
 *
 * The chip is not decoration. While AI highlights are live the map hides
 * information — every unhighlighted seat dims and the floor plan desaturates —
 * so this is both the standing statement of that state and the way out of it.
 */
export function AiHighlightChip({
  seatCount,
  onClear
}: {
  seatCount: number;
  onClear: () => void;
}) {
  if (seatCount <= 0) return null;

  return (
    <div
      data-ai-highlight-chip
      // Polite, not assertive: the count changes as a side effect of an answer
      // the user just asked for, so it should never interrupt them.
      aria-live="polite"
      className="pointer-events-auto flex items-center gap-2 border border-[var(--sp-ai-border)] bg-[var(--sp-layer-01)] bg-[image:var(--sp-ai-aura)] bg-no-repeat px-2.5 py-1.5 text-[12px] font-semibold text-[var(--sp-ai-text)] shadow-[0_6px_16px_rgba(69,137,255,0.20)]"
    >
      <span aria-hidden="true" className="border border-[var(--sp-ai-border)] px-[3px] text-[9px] font-bold leading-[1.5] tracking-[0.04em]">
        AI
      </span>
      <span>
        {seatCount} {seatCount === 1 ? "seat" : "seats"} highlighted
      </span>
      <button
        type="button"
        onClick={onClear}
        // The visible label is the bare word; the accessible name says what it
        // clears, because "Clear" alone is meaningless out of context.
        aria-label="Clear Ask Planner seat highlights"
        className="font-medium text-[var(--sp-text-secondary)] transition hover:text-[var(--sp-ai-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]"
      >
        · Clear
      </button>
    </div>
  );
}
