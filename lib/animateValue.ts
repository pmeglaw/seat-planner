// Single-value rAF tween for view-transform animation (the v12 inspector
// nudge). A JS tween rather than a CSS transition is a hard requirement from
// the handoff: the nudge animates scrollLeft alongside a frame translate, and
// a CSS transform transition fights direct drag-panning. The clock (raf/now)
// is injectable so node:test can drive it deterministically.

type AnimateValueOptions = {
  from: number;
  to: number;
  durationMs?: number;
  /** prefers-reduced-motion: skip the animation, land immediately. */
  reducedMotion?: boolean;
  onUpdate: (value: number) => void;
  onDone?: () => void;
  raf?: (callback: (time: number) => void) => number;
  now?: () => number;
};

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Starts the tween; returns a cancel function (safe to call repeatedly). */
export function animateValue({
  from,
  to,
  durationMs = 250,
  reducedMotion = false,
  onUpdate,
  onDone,
  raf = callback => window.requestAnimationFrame(callback),
  now = () => performance.now()
}: AnimateValueOptions): () => void {
  if (reducedMotion || durationMs <= 0) {
    onUpdate(to);
    onDone?.();
    return () => undefined;
  }
  let cancelled = false;
  const start = now();
  const step = () => {
    if (cancelled) return;
    const t = Math.min(1, (now() - start) / durationMs);
    onUpdate(from + (to - from) * easeOutCubic(t));
    if (t >= 1) {
      onDone?.();
      return;
    }
    raf(step);
  };
  raf(step);
  return () => {
    cancelled = true;
  };
}
