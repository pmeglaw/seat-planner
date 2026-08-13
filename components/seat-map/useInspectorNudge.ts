"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { planInspectorNudge } from "@/lib/mapViewport";
import { animateValue } from "@/lib/animateValue";

/**
 * v12 slice 4 nudge (interaction contract #1), shared by both map surfaces.
 * One rAF tween drives BOTH channels — scrollLeft while there is scroll room,
 * then a leftward frame translate for the remainder (fit view has no scroll
 * room; the frame translate is the scroll-engine equivalent of the
 * prototype's free-pan overscroll). The translate is a view transform on the
 * frame element only: seat coordinates, marker styles, and the calibration
 * transform are untouched. This hook is the translate's sole owner — nothing
 * else may write `frameRef.current.style.translate`.
 */
export function useInspectorNudge({
  viewportRef,
  frameRef,
  selectedSeatId,
  inspectorHidden,
  panelBreakpointPx,
  resolveSeatVisualX,
  // Injectable for tests only — animateValue's own raf/now injection can't
  // be reached through the hook otherwise. Production callers omit it.
  animate = animateValue
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  selectedSeatId: string | null;
  /** True while the inspector is not on screen (auto-yielded). */
  inspectorHidden: boolean;
  /** The `panel` tier minimum width — the float exists only there. */
  panelBreakpointPx: number;
  /** Selected seat's normalized VISUAL x (calibrated), or null if unknown. */
  resolveSeatVisualX: (seatId: string) => number | null;
  animate?: typeof animateValue;
}): { cancelNudge: () => void; skipNextNudge: () => void } {
  const nudgeCancelRef = useRef<(() => void) | null>(null);
  const frameTranslateRef = useRef(0);
  // Finding 1 (v12 slice 4 final review): set by a caller that is ALSO
  // queueing a programmatic center in the same commit as this selection
  // change (e.g. admin queueCenterSeatInMap, viewer selectSeat/openResult).
  // Consumed (checked-and-cleared) at the top of the trigger effect's inner
  // rAF below — a centered seat always lands left of the panel threshold, so
  // skipping the nudge for it is correct, not a workaround. Callers must call
  // skipNextNudge() synchronously, before any rAF of their own, so the flag
  // is armed no matter which side's rAF chain resolves first.
  const skipNextRef = useRef(false);
  // Resolver identity churns with parent renders; the effects below re-run on
  // selection change only, reading the latest resolver through this ref. The
  // mirror runs in its own no-deps effect (not synchronously during render)
  // per react-hooks/refs — it still lands before the trigger/restore effects
  // below on every commit, since effects fire in declaration order.
  const resolveRef = useRef(resolveSeatVisualX);
  useEffect(() => {
    resolveRef.current = resolveSeatVisualX;
  });
  // Same discipline as resolveRef above: the injected animate is a test-only
  // override whose identity can churn with parent renders, mirrored through a
  // ref so the effects below stay selection-driven rather than re-running on
  // every render.
  const animateRef = useRef(animate);
  useEffect(() => {
    animateRef.current = animate;
  });

  const cancelNudge = useCallback(() => {
    nudgeCancelRef.current?.();
    nudgeCancelRef.current = null;
  }, []);

  const skipNextNudge = useCallback(() => {
    skipNextRef.current = true;
  }, []);

  const setFrameTranslate = useCallback((px: number) => {
    frameTranslateRef.current = px;
    const frame = frameRef.current;
    if (frame) frame.style.translate = px > 0 ? `${-px}px 0px` : "";
  }, [frameRef]);

  // Plan 022: the single unwind path. Tweens any residual frame translate back
  // to 0 and settles it there. Used both by the restore effect (selection
  // cleared) and by the trigger effect's no-nudge early returns (Step 3) — a
  // fast reselect that interrupts an in-flight unwind can otherwise freeze the
  // frame at a nonzero translate forever, since the new selection's own plan
  // may be null and never touch the translate again.
  const startUnwind = useCallback(() => {
    if (frameTranslateRef.current === 0) return;
    cancelNudge();
    const startTranslate = frameTranslateRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nudgeCancelRef.current = animateRef.current({
      from: startTranslate,
      to: 0,
      durationMs: 200,
      reducedMotion,
      onUpdate: setFrameTranslate,
      onDone: () => {
        nudgeCancelRef.current = null;
      }
    });
  }, [cancelNudge, setFrameTranslate]);

  // Trigger: on selection at the panel tier, double-rAF so layout settles
  // (same discipline as the surfaces' queued centering helpers).
  useEffect(() => {
    if (!selectedSeatId || inspectorHidden) return;
    if (!window.matchMedia(`(min-width: ${panelBreakpointPx}px)`).matches) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        const frame = frameRef.current;
        if (!viewport || !frame) return;
        // Finding 1: a same-commit programmatic center armed this — but the
        // skip is honored ONLY while the viewport has horizontal scroll room.
        // With room, the center's smooth scrollTo really moves the seat to
        // mid-viewport (clear of the panel) and a tween would race it. At fit
        // view there is no scroll room: the center is a no-op, there is
        // nothing to race, and the translate channel below is the only way an
        // under-panel seat can clear (contract #1) — skipping there left
        // viewer fit-view selections covered (v1.25.0 live QA).
        if (skipNextRef.current) {
          skipNextRef.current = false;
          // Plan 022: a stale translate can still be sitting here from an
          // interrupted unwind (fast reselect during the 200ms restore tween)
          // even though THIS selection is skipping its own nudge — repair it
          // rather than stranding the frame shifted for the rest of the
          // selection.
          if (viewport.scrollWidth - viewport.clientWidth > 1) {
            if (frameTranslateRef.current !== 0) startUnwind();
            return;
          }
        }
        // Finding 3: cancel any stale tween from a superseded selection
        // unconditionally, before (re)planning — otherwise a null plan below
        // leaves that stale tween running instead of leaving the map at rest.
        cancelNudge();
        const seatVisualX = resolveRef.current(selectedSeatId);
        if (seatVisualX === null) {
          // Plan 022: same repair as above — the resolver may not (yet) know
          // this seat, but a leftover translate from a prior selection must
          // not be left behind.
          if (frameTranslateRef.current !== 0) startUnwind();
          return;
        }
        const plan = planInspectorNudge({
          seatVisualX,
          map: frame,
          viewport,
          currentTranslatePx: frameTranslateRef.current
        });
        if (!plan) {
          // Plan 022 (the strand bug): a fast reselect during the restore
          // effect's 200ms unwind cancels that tween mid-flight without
          // settling it. If the NEW selection needs no nudge — as here,
          // where `plan` is null because the seat already clears the panel
          // — nothing else in this effect ever touches the translate again,
          // so without this repair the frame stays shifted for the rest of
          // the selection. `startUnwind` does not reintroduce a nudge for a
          // seat that does not need one — it only ever unwinds toward 0.
          if (frameTranslateRef.current !== 0) startUnwind();
          return;
        }
        const startScroll = viewport.scrollLeft;
        const startTranslate = frameTranslateRef.current;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        nudgeCancelRef.current = animateRef.current({
          from: 0,
          to: 1,
          durationMs: 250,
          reducedMotion,
          onUpdate: t => {
            viewport.scrollLeft = startScroll + plan.scrollDelta * t;
            if (plan.translateDelta !== 0) setFrameTranslate(startTranslate + plan.translateDelta * t);
          },
          onDone: () => {
            nudgeCancelRef.current = null;
          }
        });
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) window.cancelAnimationFrame(second);
      cancelNudge();
    };
  }, [selectedSeatId, inspectorHidden, panelBreakpointPx, viewportRef, frameRef, cancelNudge, setFrameTranslate, startUnwind]);

  // Restore: the frame translate unwinds when nothing is selected anymore (or
  // the inspector auto-yielded) — the map returns to its true scroll position.
  useEffect(() => {
    const shouldRest = !selectedSeatId || inspectorHidden;
    if (!shouldRest) return;
    startUnwind();
    return () => cancelNudge();
  }, [selectedSeatId, inspectorHidden, cancelNudge, startUnwind]);

  return { cancelNudge, skipNextNudge };
}
