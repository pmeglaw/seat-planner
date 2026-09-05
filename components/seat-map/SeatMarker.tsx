"use client";

import { memo } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { SeatWithEmployee } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { pointToStyle } from "@/lib/seatMath";
import { formatDisplayName } from "@/lib/formatName";
import { PILL_NUDGE_PX } from "@/lib/seatCrowding";
import { SeatMark, seatMarkKindFor } from "@/components/seat-map/SeatMark";

// The Phase 3 seat marker (PHASE3DS §1.16, specimen 02-map.html#pill; Phase 4
// PR 3b). ONE vocabulary on both surfaces:
//
//   assigned seat   <button class="sp-pill cds-touch-target">First L.</button>
//                   28px tall, fit-width, label-01, 1px edge; the seat CODE is
//                   the tier-C tooltip on hover / focus (P3-11) and the
//                   inspector eyebrow on selection — never a second line.
//   empty seat      <button class="sp-seat-footprint cds-touch-target"> with
//                   the status mark (○ open · lock reserved · hatch
//                   unavailable) inlined by SeatMark.
//   in a move/swap  every seat is a pill — empty seats show their code — so
//                   the origin (dashed), the valid targets (solid success
//                   edge + tint) and the invalid targets (dashed error edge +
//                   tint, aria-disabled) read as one set.
//
// States are CSS modifiers, one silhouette each (the grayscale strip in the
// specimen): --search (search / filter hit, Ask Planner highlight), --quiet
// (filtered out — replaces the opacity dim PR 1 ledgered), --origin,
// --target, --invalid, --names-off (the filled 28 footprint). Selection is
// data-state="selected" (2px inverse edge); the ◇ badge (SeatMark
// "draft-badge") marks changed-in-draft. Position: the calibration transform
// stays (left/top % from pointToStyle) and the collision nudge is an inline
// transform on the wrapper — the anchor never moves.

type SeatMarkerProps = {
  seat: SeatWithEmployee;
  selected: boolean;
  dimmed: boolean;
  canEdit: boolean;
  showNames: boolean;
  searchResult: boolean;
  draftChanged?: boolean;
  // Render-layer collision nudge (lib/seatCrowding computeNameLabelNudges):
  // translates the pill vertically by ±PILL_NUDGE_PX so two colliding pills
  // don't render on top of each other. The marker anchor never moves.
  nameNudge?: -1 | 0 | 1;
  swapMode: boolean;
  swapSource: boolean;
  swapTarget: boolean;
  moveEmployeeMode: boolean;
  moveEmployeeSource: boolean;
  invalidTarget?: boolean;
  highlighted: boolean;
  highlightedDescription?: string;
  addSeatMode: boolean;
  viewportEdge: "left" | "right" | "none";
  viewportEdgeOffsetPx: number;
  // Roving tabindex: the map exposes ONE seat as a tab stop (0) and the rest
  // as -1; arrow keys move between seats (handled by the marker layer).
  tabIndex?: number;
  onSelect: (seatId: string) => void;
};

type MarkerIntent = "assigned" | "available" | "reserved" | "unavailable" | "draft-changed" | "search-result" | "search-selected" | "selected" | "swap-source" | "swap-target" | "target-valid" | "target-invalid";

function getEmployeeNameParts(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastInitial = parts
    .slice(1)
    .reverse()
    .map(part => part.match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() ?? "")
    .find(Boolean) ?? "";

  return { firstName, lastInitial };
}

// Pills show "First L." — the full name lives in the inspector header and the
// aria-label (owner call 2026-07-24).
function getShortEmployeeLabel(name: string) {
  const { firstName, lastInitial } = getEmployeeNameParts(name);
  if (!firstName) return formatDisplayName(name);

  return formatDisplayName(lastInitial ? `${firstName} ${lastInitial}.` : firstName);
}

// The label the pill renders for a seat — the surfaces feed it to the nudge
// scorer's width estimate so the collision graph models the pills on screen.
export function seatPillLabel(seat: Pick<SeatWithEmployee, "label" | "employee">): string {
  return seat.employee ? getShortEmployeeLabel(seat.employee.full_name ?? "") : seat.label;
}

function SeatMarkerComponent({
  seat,
  selected,
  dimmed,
  canEdit,
  showNames,
  searchResult,
  draftChanged = false,
  nameNudge = 0,
  swapMode,
  swapSource,
  swapTarget,
  moveEmployeeMode,
  moveEmployeeSource,
  invalidTarget = false,
  highlighted,
  highlightedDescription = "Highlighted by Ask Planner",
  addSeatMode,
  viewportEdge,
  viewportEdgeOffsetPx,
  tabIndex = 0,
  onSelect
}: SeatMarkerProps) {
  const employeeName = seat.employee?.full_name ?? "";
  const hasEmployee = Boolean(seat.employee);
  // Display-formatted for the aria-label below — assistive strings must match
  // the visible casing, never the raw stored value. "Unassigned", not "Open
  // seat": the aria-label already appends the status ("Open seat."), so an
  // "Open seat" fallback read as "Open seat. Open seat."
  const displayName = formatDisplayName(employeeName) || "Unassigned";
  const shortName = hasEmployee ? getShortEmployeeLabel(employeeName) : "";
  const modeRunning = swapMode || moveEmployeeMode;
  const origin = swapSource || moveEmployeeSource;
  const swapCandidate = canEdit && swapMode && !swapSource && !swapTarget && !invalidTarget;
  const moveCandidate = canEdit && moveEmployeeMode && !moveEmployeeSource && !invalidTarget;
  const target = swapTarget || swapCandidate || moveCandidate;
  const activeMarker = selected || origin || swapTarget;
  const searchProminent = searchResult && !dimmed;
  // "Highlighted by Ask Planner" on /admin; a search hit or a people-list
  // hover on the viewer (highlightedDescription names which). One surface
  // state for all three: the search-hit pill (§1.16) — no AI token touches
  // the map, the drawer's label carries the provenance.
  const plannerHighlighted = highlighted && !activeMarker;
  const hit = (searchProminent || plannerHighlighted) && !origin && !target && !invalidTarget;
  const quiet = dimmed && !origin && !target && !invalidTarget && !hit;
  // Names off = the filled 28 footprint; in a move/swap every seat shows its
  // label so the origin and the destinations can be told apart.
  const namesOff = !showNames && hasEmployee && !modeRunning;
  const asPill = hasEmployee || modeRunning;
  const visibleLabel = !asPill || namesOff ? "" : hasEmployee ? shortName : seat.label;
  // Accessible name must CONTAIN the pill's visible text verbatim (axe
  // label-content-name-mismatch): the abbreviated visible name ("Alex S.")
  // appears before the full name it abbreviates. With names off the pill
  // renders no text, so the full name alone is announced — no stutter (F4,
  // read-path assessment 2026-08-25).
  const accessibleSeatName = !hasEmployee || shortName === displayName || namesOff ? displayName : `${shortName} ${displayName}`;
  const markerIntent: MarkerIntent = origin
    ? "swap-source"
    : swapTarget
      ? "swap-target"
      : invalidTarget
        ? "target-invalid"
        : swapCandidate || moveCandidate
          ? "target-valid"
          : selected && searchProminent
            ? "search-selected"
            : selected
              ? "selected"
              : hit
                ? "search-result"
                : draftChanged
                  ? "draft-changed"
                  : seat.status;

  // Add / swap / move modes snap the marker to its true coordinate so
  // targeting stays honest: no viewport-edge hugging, and active markers
  // (selected, origin, target) never take a nudge.
  const markerUsesTrueCoordinate = addSeatMode || swapMode || moveEmployeeMode;
  const resolvedViewportEdge = markerUsesTrueCoordinate ? "none" : viewportEdge;
  const resolvedViewportEdgeOffsetPx = markerUsesTrueCoordinate ? 0 : Math.max(0, Math.round(viewportEdgeOffsetPx));
  const nudge = activeMarker ? 0 : nameNudge;
  const translateX = resolvedViewportEdge === "left"
    ? `${resolvedViewportEdgeOffsetPx}px`
    : resolvedViewportEdge === "right"
      ? `calc(-100% - ${resolvedViewportEdgeOffsetPx}px)`
      : "-50%";
  const wrapperStyle: CSSProperties = {
    ...pointToStyle({ x: seat.x, y: seat.y }),
    transform: `translate(${translateX}, calc(-50% + ${nudge * PILL_NUDGE_PX}px))`
  };
  // Stacking: hovered / focused markers rise above their neighbours, active
  // and prominent ones stay above resting pills.
  const wrapperClassName = [
    "sp-has-tooltip sp-marker",
    "z-10 hover:z-30 focus-within:z-30",
    selected ? "z-40" : origin || target || hit ? "z-30" : ""
  ].filter(Boolean).join(" ");

  // One modifier per silhouette; precedence = the mode the marker is in.
  const pillModifier = origin ? "sp-pill--origin" : invalidTarget ? "sp-pill--invalid" : target ? "sp-pill--target" : hit ? "sp-pill--search" : quiet ? "sp-pill--quiet" : "";
  const buttonClassName = asPill
    ? ["sp-pill cds-touch-target", pillModifier, namesOff ? "sp-pill--names-off" : ""].filter(Boolean).join(" ")
    : ["sp-seat-footprint cds-touch-target cursor-pointer", quiet ? "sp-seat-footprint--quiet" : ""].filter(Boolean).join(" ");

  return (
    <span className={wrapperClassName} style={wrapperStyle}>
      <button
        type="button"
        tabIndex={tabIndex}
        data-seat-id={seat.id}
        data-marker-intent={markerIntent}
        data-draft-changed={draftChanged || undefined}
        data-state={selected ? "selected" : undefined}
        aria-pressed={selected}
        // The invalid target stays focusable (the reason is in its name) but
        // reports itself as not operable; the surface refuses the click too.
        aria-disabled={invalidTarget || undefined}
        // No title attribute — ruled off with F3 (read-path assessment,
        // 2026-08-25); the seat code is the tier-C tooltip below, the
        // aria-label carries everything for AT.
        aria-label={`${seat.label} ${accessibleSeatName}. ${STATUS_LABELS[seat.status]} seat.${draftChanged ? " Draft changed." : ""}${searchProminent ? " Search result." : ""}${highlighted ? ` ${highlightedDescription}.` : ""}${swapSource ? " Swap source." : ""}${swapTarget ? " Swap target." : ""}${swapCandidate ? " Valid swap target." : ""}${moveEmployeeSource ? " Move source." : ""}${moveCandidate ? " Valid destination seat." : ""}${invalidTarget ? " Not a valid target." : ""}${selected ? " Selected." : " Open details."}`}
        className={buttonClassName}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          if (addSeatMode) {
            event.preventDefault();
            return;
          }
          onSelect(seat.id);
        }}
      >
        {asPill ? (
          <>
            {hasEmployee ? visibleLabel : <span translate="no">{visibleLabel}</span>}
            {draftChanged ? <SeatMark kind="draft-badge" /> : null}
          </>
        ) : (
          <SeatMark kind={seatMarkKindFor(seat.status)} />
        )}
      </button>
      {/* Tier-C tooltip: the seat code on hover / focus only (P3-11) — the
          landed rule is `.sp-has-tooltip:is(:hover, :focus-within) .sp-tooltip`. */}
      <span className="sp-tooltip" role="tooltip" translate="no">{seat.label}</span>
    </span>
  );
}

// The ONLY seat fields this component renders. Kept as an explicit list rather
// than a deep compare because a deep compare of every seat on every pointermove
// is the cost we are trying to remove.
//
// ⚠ If you start reading a new `seat.<field>` above, ADD IT HERE. Forgetting
// leaves the marker rendering stale data with no error — the field changes, the
// comparator says "equal", React skips the update. tests/seat-marker-memo.test.mjs
// greps this file and fails if the two lists drift apart, so the mistake is
// caught in CI rather than in someone's face on the map.
const RENDERED_SEAT_FIELDS = ["id", "label", "x", "y", "status"] as const;

function seatRenderEqual(previous: SeatWithEmployee, next: SeatWithEmployee) {
  for (const field of RENDERED_SEAT_FIELDS) {
    if (!Object.is(previous[field], next[field])) return false;
  }
  // Occupant is read through the name only; comparing the employee object by
  // reference would defeat the memo, because the map rebuilds those objects
  // whenever it re-stitches seats to employees. `position` is compared too so
  // an inspector-driven title edit re-renders the marker's employee identity
  // alongside the rest of the layer.
  return (
    (previous.employee?.full_name ?? null) === (next.employee?.full_name ?? null) &&
    (previous.employee?.position ?? null) === (next.employee?.position ?? null)
  );
}

function seatMarkerPropsEqual(previous: SeatMarkerProps, next: SeatMarkerProps) {
  const nextKeys = Object.keys(next) as (keyof SeatMarkerProps)[];
  if (nextKeys.length !== Object.keys(previous).length) return false;

  for (const key of nextKeys) {
    // `seat` is compared field-wise below; every OTHER prop is a primitive or a
    // stable callback, so identity comparison is both correct and cheap. New
    // props are covered automatically by this loop.
    if (key === "seat") continue;
    if (!Object.is(previous[key], next[key])) return false;
  }

  return seatRenderEqual(previous.seat, next.seat);
}

// Memoized because both maps re-render the whole marker layer wholesale on
// selection, search, and notice-state changes: `setLocalSeats` (and the
// equivalent viewer state) replaces the array, so every seat object is a new
// identity even though only one of them actually changed. Without this, one
// seat's update re-rendered every marker on the map.
//
// This only pays off while the callback props keep a stable identity — SeatMap
// routes onSelect through a latest-value ref for exactly that reason. Passing
// an inline arrow from a caller silently disables the memo.
export const SeatMarker = memo(SeatMarkerComponent, seatMarkerPropsEqual);
