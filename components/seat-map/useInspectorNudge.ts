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
  resolveSeatVisualX
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

  // Trigger: on selection at the panel tier, double-rAF so layout settles
  // (same discipline as the surfaces' queued centering helpers).
  useEffect(() => {
    if (!selectedSeatId || inspectorHidden) return;
    if (!window.matchMedia(`(min-width: ${panelBreakpointPx}px)`).matches) return;
    const first = requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        // Finding 1: a same-commit programmatic center armed this — neither
        // plan nor tween. Checked-and-cleared first, before any other work.
        if (skipNextRef.current) {
          skipNextRef.current = false;
          return;
        }
        // Finding 3: cancel any stale tween from a superseded selection
        // unconditionally, before (re)planning — otherwise a null plan below
        // leaves that stale tween running instead of leaving the map at rest.
        cancelNudge();
        const viewport = viewportRef.current;
        const frame = frameRef.current;
        if (!viewport || !frame) return;
        const seatVisualX = resolveRef.current(selectedSeatId);
        if (seatVisualX === null) return;
        const plan = planInspectorNudge({
          seatVisualX,
          map: frame,
          viewport,
          currentTranslatePx: frameTranslateRef.current
        });
        if (!plan) return;
        const startScroll = viewport.scrollLeft;
        const startTranslate = frameTranslateRef.current;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        nudgeCancelRef.current = animateValue({
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
    return () => cancelAnimationFrame(first);
  }, [selectedSeatId, inspectorHidden, panelBreakpointPx, viewportRef, frameRef, cancelNudge, setFrameTranslate]);

  // Restore: the frame translate unwinds when nothing is selected anymore (or
  // the inspector auto-yielded) — the map returns to its true scroll position.
  useEffect(() => {
    const shouldRest = !selectedSeatId || inspectorHidden;
    if (!shouldRest || frameTranslateRef.current === 0) return;
    cancelNudge();
    const startTranslate = frameTranslateRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nudgeCancelRef.current = animateValue({
      from: startTranslate,
      to: 0,
      durationMs: 200,
      reducedMotion,
      onUpdate: setFrameTranslate,
      onDone: () => {
        nudgeCancelRef.current = null;
      }
    });
  }, [selectedSeatId, inspectorHidden, cancelNudge, setFrameTranslate]);

  return { cancelNudge, skipNextNudge };
}
