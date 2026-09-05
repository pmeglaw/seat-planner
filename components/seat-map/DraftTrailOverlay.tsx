"use client";

import { useMemo } from "react";
import { MAP_ASPECT_RATIO } from "@/lib/mapLayoutTransform";

/**
 * Animated draft trail (design_handoff_swap_trail, 2026-08-15): the flowing
 * dashed route the admin map shows between the two seats of a PENDING swap or
 * move. Pure render of SeatMap's existing swap/move state — this component
 * holds no state and mounts exactly while a confirm pair exists, unmounting
 * with it on confirm/cancel (no exit animation by design).
 *
 * Coordinates arrive as the seats' VISUAL (calibration-transformed) x/y in
 * [0,1] — the same points the markers anchor to — mapped into a fixed
 * `0 0 1000 H` viewBox where H = 1000 / plan aspect. Because the svg shares
 * the map frame's box and everything is viewBox-relative, zoom and resize
 * tracking is the same width transform the markers ride; no pixel math, no
 * resize observer, so geometry memoizes on the seat pair alone.
 *
 * Layer contract (bottom → top, pinned by the handoff): route underlay →
 * flow line → arrowhead(s) → origin ring (move only) → the app's markers
 * above the whole svg. Decorative reinforcement only — the swap/move status
 * line already announces the operation — hence aria-hidden and pointer-inert,
 * same contract as MapWashLayer. Motion rides `motion-safe:` exclusively:
 * under prefers-reduced-motion the trail renders static but never disappears.
 */

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = Math.round((VIEWBOX_WIDTH / MAP_ASPECT_RATIO) * 100) / 100;
// Pullback from each seat center so the line never touches the marker circles.
const ENDPOINT_TRIM = 10;
// Control-point offset perpendicular to the segment, as a fraction of its
// length. The handoff README says ~18% and its own MOVE arc measures ~0.21 —
// but its SWAP arcs measure ~0.76: the reference draws the exchange as a wide
// near-circle, which is what makes it read as circular exchange at all (at
// 18% a short pair collapses into a thin lens). Reconciliation, measured
// against the demo's own path data: moves keep 18%; swap loops take the
// demo's 0.76 but capped at 18% + 46 units so a cross-map swap bows like a
// route, not a balloon. The cap equals the demo's value exactly at its own
// pair length, so the reference pair reproduces 1:1.
const BOW_RATIO = 0.18;
const SWAP_LOOP_RATIO = 0.76;
const SWAP_LOOP_CAP = 46;
const ARROW_LENGTH = 11;
const ARROW_HALF_WIDTH = 4;
const ORIGIN_RING_RADIUS = 3;

type TrailSeat = { id: string; x: number; y: number };

type DraftTrailOverlayProps = {
  kind: "swap" | "move";
  sourceSeat: TrailSeat;
  targetSeat: TrailSeat;
};

type TrailPath = {
  d: string;
  arrowPoints: string;
  start: { x: number; y: number };
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function buildTrailPath(from: TrailSeat, to: TrailSeat, bowSign: 1 | -1, loop: boolean): TrailPath | null {
  const fromX = from.x * VIEWBOX_WIDTH;
  const fromY = from.y * VIEWBOX_HEIGHT;
  const toX = to.x * VIEWBOX_WIDTH;
  const toY = to.y * VIEWBOX_HEIGHT;
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  const length = Math.hypot(deltaX, deltaY);
  // Seats that visually coincide have no route to draw.
  if (length < 1) return null;
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  // Control point first, from the seat CENTERS: segment midpoint bowed
  // perpendicular; the sign picks the side, which is what mirrors a swap's
  // two arcs (same sign, reversed segment = opposite world side).
  const bowMagnitude = loop
    ? Math.min(length * SWAP_LOOP_RATIO, length * BOW_RATIO + SWAP_LOOP_CAP)
    : length * BOW_RATIO;
  const bow = bowMagnitude * bowSign;
  const controlX = (fromX + toX) / 2 - unitY * bow;
  const controlY = (fromY + toY) / 2 + unitX * bow;
  // Endpoints pull back from the centers ALONG THE PATH DIRECTION — the arc's
  // tangent (toward the control), not the straight chord. That is how the
  // reference constructs it, and it's what makes a swap's two arcs part ways
  // at the markers instead of sharing endpoints in a closed lens. Shrink the
  // pullback on very short hops so the trimmed path can't invert.
  const trim = Math.min(ENDPOINT_TRIM, length / 3);
  const startTangentLength = Math.hypot(controlX - fromX, controlY - fromY) || 1;
  const startX = fromX + ((controlX - fromX) / startTangentLength) * trim;
  const startY = fromY + ((controlY - fromY) / startTangentLength) * trim;
  const endTangentLength = Math.hypot(toX - controlX, toY - controlY) || 1;
  const endX = toX - ((toX - controlX) / endTangentLength) * trim;
  const endY = toY - ((toY - controlY) / endTangentLength) * trim;
  // For `M s Q c e` the end tangent direction is e − c.
  const tangentX = endX - controlX;
  const tangentY = endY - controlY;
  const tangentLength = Math.hypot(tangentX, tangentY) || 1;
  const tangentUnitX = tangentX / tangentLength;
  const tangentUnitY = tangentY / tangentLength;
  // Tip AT the path end: the trim already parks the end against the marker's
  // rim, so any further lead buries the triangle under the marker (the demo
  // reads the same — tip kissing the rim, body clear of it).
  const tipX = endX;
  const tipY = endY;
  const baseX = tipX - tangentUnitX * ARROW_LENGTH;
  const baseY = tipY - tangentUnitY * ARROW_LENGTH;
  const arrowPoints = [
    `${round(tipX)},${round(tipY)}`,
    `${round(baseX - tangentUnitY * ARROW_HALF_WIDTH)},${round(baseY + tangentUnitX * ARROW_HALF_WIDTH)}`,
    `${round(baseX + tangentUnitY * ARROW_HALF_WIDTH)},${round(baseY - tangentUnitX * ARROW_HALF_WIDTH)}`
  ].join(" ");
  return {
    d: `M ${round(startX)} ${round(startY)} Q ${round(controlX)} ${round(controlY)} ${round(endX)} ${round(endY)}`,
    arrowPoints,
    start: { x: round(startX), y: round(startY) }
  };
}

export function DraftTrailOverlay({ kind, sourceSeat, targetSeat }: DraftTrailOverlayProps) {
  const trail = useMemo(() => {
    if (kind === "swap") {
      // Two mirrored arcs, each with its own arrowhead — reads as circular
      // exchange.
      const outbound = buildTrailPath(sourceSeat, targetSeat, 1, true);
      const inbound = buildTrailPath(targetSeat, sourceSeat, 1, true);
      return outbound && inbound ? { paths: [outbound, inbound], originRing: null } : null;
    }
    const route = buildTrailPath(sourceSeat, targetSeat, 1, false);
    return route ? { paths: [route], originRing: route.start } : null;
  }, [kind, sourceSeat, targetSeat]);

  if (!trail) return null;

  return (
    <svg
      aria-hidden="true"
      data-draft-trail={kind}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      // z-[6]: above the washes (z-[5]), below the markers (z-10).
      className="pointer-events-none absolute inset-0 z-[6] h-full w-full overflow-visible motion-safe:animate-[map-trail-in_240ms_cubic-bezier(0,0,0.38,0.9)_both]"
    >
      {trail.paths.map(path => (
        <path
          key={`underlay ${path.d}`}
          data-trail-part="underlay"
          d={path.d}
          fill="none"
          stroke="var(--sp-pill-origin-edge)"
          strokeWidth={6}
          opacity={0.16}
          strokeLinecap="round"
        />
      ))}
      {trail.paths.map(path => (
        <path
          key={`flow ${path.d}`}
          data-trail-part="flow"
          d={path.d}
          fill="none"
          stroke="var(--sp-pill-origin-edge)"
          strokeWidth={1.8}
          strokeDasharray="6 4"
          className="motion-safe:animate-[map-trail-dash_1.2s_linear_infinite]"
        />
      ))}
      {trail.paths.map(path => (
        <polygon key={`arrow ${path.arrowPoints}`} data-trail-part="arrow" points={path.arrowPoints} fill="var(--sp-pill-origin-edge)" />
      ))}
      {trail.originRing && (
        <circle
          data-trail-part="origin"
          cx={trail.originRing.x}
          cy={trail.originRing.y}
          r={ORIGIN_RING_RADIUS}
          fill="none"
          stroke="var(--sp-pill-origin-edge)"
          strokeWidth={1.5}
          strokeDasharray="2 2"
        />
      )}
    </svg>
  );
}
