"use client";

import { memo } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { SeatWithEmployee } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { pointToStyle } from "@/lib/seatMath";
import { formatDisplayName } from "@/lib/formatName";
import { isInsideOfficeRoom } from "@/lib/officeRoomWash";

type SeatMarkerProps = {
  seat: SeatWithEmployee;
  selected: boolean;
  dimmed: boolean;
  canEdit: boolean;
  showNames: boolean;
  searchResult: boolean;
  draftChanged?: boolean;
  compactNameLabel: boolean;
  // Render-layer collision nudge for CODE pills (lib/seatCrowding
  // computeCodePillNudges): every code pill renders at ONE fixed size, so a
  // pair whose pitch is tighter than that footprint separates by translating
  // the TOKEN vertically (±14px) instead of shrinking. The marker anchor
  // (seat position) never moves. Hover/selected treatments are unchanged.
  codeNudge?: -1 | 0 | 1;
  // Render-layer collision nudge for name-mode labels (lib/seatCrowding
  // computeNameLabelNudges): translates the TOKEN vertically so two
  // colliding name pills don't render on top of each other. The marker
  // anchor (seat position) never moves.
  nameNudge?: -1 | 0 | 1;
  swapMode: boolean;
  // Office-plate layout, derived by SeatMap from the seat's room rect:
  // token offset (px) from the seat anchor to the room center, and a width
  // capped to the room. All display-only; absent/zero for non-office seats.
  officePlateOffsetXPx?: number;
  officePlateOffsetYPx?: number;
  officePlateWidthPx?: number;
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
  variant?: "admin" | "viewer";
  // Roving tabindex: the map exposes ONE seat as a tab stop (0) and the rest
  // as -1; arrow keys move between seats (handled by the marker layer).
  tabIndex?: number;
  onSelect: (seatId: string) => void;
};

type TokenDensity = "compact" | "standard";
type TokenMode = "code" | "name" | "prominent" | "selected";
type MarkerIntent = "assigned" | "available" | "reserved" | "unavailable" | "draft-changed" | "search-result" | "search-selected" | "selected" | "swap-source" | "swap-target" | "target-valid" | "target-invalid";

function SeatToken({ className, style, children }: { className: string; style?: CSSProperties; children: ReactNode }) {
  return <span className={className} style={style}>{children}</span>;
}

function getSeatLabelPrefix(label: string) {
  return label.trim().toUpperCase().match(/^[A-Z]+/)?.[0] ?? "";
}

export function getSeatTokenDensity(seat: Pick<SeatWithEmployee, "label" | "zone" | "department">, compactNameLabel = false): TokenDensity {
  const prefix = getSeatLabelPrefix(seat.label);
  const zone = (seat.zone ?? seat.department ?? "").trim().toLowerCase();
  const denseZone =
    compactNameLabel ||
    prefix === "N" ||
    prefix === "NE" ||
    prefix === "W" ||
    prefix === "CW" ||
    prefix === "C" ||
    prefix === "E" ||
    prefix === "SE" ||
    zone === "north pod" ||
    zone === "northeast pod" ||
    zone === "west pod" ||
    zone === "center west" ||
    zone === "center desks" ||
    zone === "east pod" ||
    zone === "southeast office";

  return denseZone ? "compact" : "standard";
}

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

function getPassiveEmployeeLabel(name: string) {
  const { firstName, lastInitial } = getEmployeeNameParts(name);
  if (!firstName) return formatDisplayName(name);

  const compactName = firstName.length <= 4 && lastInitial ? `${firstName} ${lastInitial}.` : firstName;
  return formatDisplayName(compactName);
}

// Private-office door-plate (owner pick 2026-07-24, specimen option 2):
// office seats render as a rectangular nameplate — always-visible short name
// plus a title line — instead of the stadium pill; pods keep pills. The gate
// is ROOM GEOMETRY (the seat's VISUAL point inside a measured office rect in
// lib/officeRoomWash): office seats can carry pod zones (N13 is zone "North
// Pod" — zone inference has no room concept). The South zone / exact-"S"
// prefix checks stay as a belt for those rows even if their rect ever moves.
function isOfficePlateSeat(seat: Pick<SeatWithEmployee, "label" | "zone" | "department" | "x" | "y">) {
  const zone = (seat.zone ?? seat.department ?? "").trim().toLowerCase();
  if (zone === "south offices") return true;
  if (!zone && getSeatLabelPrefix(seat.label) === "S") return true;
  return isInsideOfficeRoom({ x: seat.x, y: seat.y });
}

// Selected/prominent and names-on pills show "First L." — the full name lives
// in the inspector header and the aria-label (owner call 2026-07-24). Dense
// passive pills keep getPassiveEmployeeLabel's tighter width cap above.
function getShortEmployeeLabel(name: string) {
  const { firstName, lastInitial } = getEmployeeNameParts(name);
  if (!firstName) return formatDisplayName(name);

  return formatDisplayName(lastInitial ? `${firstName} ${lastInitial}.` : firstName);
}

function SeatMarkerComponent({
  seat,
  selected,
  dimmed,
  canEdit,
  showNames,
  searchResult,
  draftChanged = false,
  compactNameLabel,
  codeNudge = 0,
  nameNudge = 0,
  swapMode,
  officePlateOffsetXPx = 0,
  officePlateOffsetYPx = 0,
  officePlateWidthPx,
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
  variant = "viewer",
  tabIndex = 0,
  onSelect
}: SeatMarkerProps) {
  // NOTE: no caller passes variant="admin" — both the admin map (SeatMap.tsx,
  // variant="viewer" by owner preference) and the viewer render the "viewer"
  // branch. Every `adminMarker ? … : …` below therefore takes the ELSE arm in
  // the live app; the admin-token arms (incl. shadow-marker-selected/-hover)
  // are correct-but-dormant, kept for a future admin variant. Don't assume a
  // change to an `adminMarker` arm is visible without first flipping a caller.
  const adminMarker = variant === "admin";
  const employeeName = seat.employee?.full_name ?? "";
  const hasEmployee = Boolean(seat.employee);
  // Display-formatted for the title tooltip + aria-label below — assistive
  // strings must match the visible casing, never the raw stored value.
  // "Unassigned", not "Open seat": the aria-label already appends the status
  // ("Open seat."), so an "Open seat" fallback read as "Open seat. Open seat."
  const displayName = formatDisplayName(employeeName) || "Unassigned";
  const namesVisible = showNames && hasEmployee && !dimmed;
  const swapCandidate = canEdit && swapMode && !swapSource && !swapTarget && !invalidTarget;
  const moveCandidate = canEdit && moveEmployeeMode && !moveEmployeeSource && !invalidTarget;
  const activeMarker = selected || swapSource || swapTarget || moveEmployeeSource;
  const searchProminent = searchResult && !dimmed;
  const searchSelected = selected && searchProminent;
  const plannerHighlighted = highlighted && !selected && !swapSource && !swapTarget && !moveEmployeeSource;
  const tokenDensity = getSeatTokenDensity(seat, compactNameLabel);
  const compactEmployeeName = getPassiveEmployeeLabel(employeeName);
  const showInlineName = Boolean(employeeName) && (namesVisible || activeMarker || searchProminent || plannerHighlighted);
  const prominentToken = activeMarker || searchProminent || plannerHighlighted;
  const tokenMode: TokenMode = selected ? "selected" : prominentToken ? "prominent" : showInlineName ? "name" : "code";
  const hasHoverDisclosure = hasEmployee && !showInlineName;
  const expandedNameBadge = hasEmployee && (tokenMode === "selected" || tokenMode === "prominent");
  const officePlate = isOfficePlateSeat(seat);
  const officeTitleLabel = officePlate && hasEmployee ? (seat.employee?.position ?? "").trim() : "";
  const inlineNameLabel = officePlate
    ? getShortEmployeeLabel(employeeName)
    : expandedNameBadge || (namesVisible && tokenDensity === "standard" && !compactNameLabel) ? getShortEmployeeLabel(employeeName) : compactEmployeeName;
  // Accessible name must CONTAIN the pill's visible text verbatim (axe
  // label-content-name-mismatch): "W08: Patrick" failed because the colon
  // broke containment, and abbreviated visible names ("Alex S.") must appear
  // before the full name they abbreviate. Office plates add their visible
  // title line (and the "Open office" copy) under the same containment rule.
  const accessibleSeatName = officePlate
    ? !hasEmployee
      ? "Open office"
      : [inlineNameLabel, officeTitleLabel, inlineNameLabel === displayName ? "" : displayName].filter(Boolean).join(" ")
    : !hasEmployee || inlineNameLabel === displayName ? displayName : `${inlineNameLabel} ${displayName}`;
  const markerIntent: MarkerIntent = swapSource || moveEmployeeSource
    ? "swap-source"
    : swapTarget
      ? "swap-target"
      : invalidTarget
        ? "target-invalid"
        : swapCandidate || moveCandidate
            ? "target-valid"
            : searchSelected
              ? "search-selected"
              : selected
                ? "selected"
                : searchProminent || plannerHighlighted
                  ? "search-result"
                  : draftChanged
                    ? "draft-changed"
                    : seat.status;

  const baseStatusToneClass =
    adminMarker
      ? seat.status === "assigned"
        ? "border-[var(--sp-legend-assigned-border)] bg-[var(--sp-legend-assigned-surface)] text-[var(--sp-legend-assigned-text)]"
        : seat.status === "reserved"
          ? "border-[var(--sp-legend-reserved-border)] bg-[var(--sp-legend-reserved-surface)] text-[var(--sp-legend-reserved-text)]"
          : seat.status === "unavailable"
            ? "border-[var(--sp-legend-unavailable-border)] bg-[var(--sp-legend-unavailable-surface)] text-[var(--sp-legend-unavailable-text)]"
            : "border-[var(--sp-legend-available-border)] bg-[var(--sp-legend-available-surface)] text-[var(--sp-legend-available-text)]"
      : seat.status === "assigned"
        ? "border-[var(--sp-marker-assigned-border)] bg-[var(--sp-marker-assigned-surface)] text-[var(--sp-marker-assigned-text)]"
        : seat.status === "reserved"
          ? "border-[var(--sp-marker-reserved-border)] bg-[var(--sp-marker-reserved-surface)] text-[var(--sp-marker-reserved-text)]"
          : seat.status === "unavailable"
            ? "border-[var(--sp-marker-unavailable-border)] bg-[var(--sp-marker-unavailable-surface)] text-[var(--sp-marker-unavailable-text)]"
            : "border-[var(--sp-marker-available-border)] bg-[var(--sp-marker-available-surface)] text-[var(--sp-marker-ink)]";
  // Search/planner emphasis keeps visual priority over the passive valid-target tint.
  const validTargetTone = (swapCandidate || moveCandidate) && !searchProminent && !plannerHighlighted;
  const statusToneClass = (tokenMode === "selected" || tokenMode === "prominent" || validTargetTone || invalidTarget) ? "" : baseStatusToneClass;

  // Capsule geometry (2026-07-23 owner reference hybrid): every token is a
  // full stadium (rounded-full on a fixed height), and with the left accent
  // bar gone the paddings are symmetric again.
  const tokenSizeClass = officePlate
    // One plate geometry for every mode — selection/search emphasis comes from
    // the state classes (ring/surface), never a size jump inside the room.
    ? "min-h-[46px] w-[152px] max-w-[152px] rounded-lg px-3.5 py-1.5 text-left"
    : tokenMode === "selected"
      ? expandedNameBadge
        ? "min-h-[42px] w-[126px] max-w-[126px] rounded-full px-4 py-1.5 text-left"
        : "h-[32px] min-h-[32px] min-w-[48px] rounded-full px-3 text-center"
      : tokenMode === "prominent"
        ? expandedNameBadge
          ? "min-h-[39px] w-[118px] max-w-[118px] rounded-full px-4 py-1.5 text-left"
          : "h-[30px] min-h-[30px] min-w-[46px] rounded-full px-3 text-center"
        : tokenMode === "name"
          ? [
            "min-h-[34px] rounded-full px-3 py-1.5 text-left",
            tokenDensity === "standard" ? "w-[92px] max-w-[92px] sm:w-[104px] sm:max-w-[104px]" : "w-[78px] max-w-[78px] sm:w-[86px] sm:max-w-[86px]",
            "group-hover:w-[124px] group-hover:max-w-[124px] group-focus-visible:w-[124px] group-focus-visible:max-w-[124px]"
          ].filter(Boolean).join(" ")
          : [
            // ONE fixed code-pill geometry for every seat — width included, so
            // label length never changes the resting footprint. Tight pods
            // separate via codeNudge, never by a smaller pill. The 46px/24px
            // numbers must match lib/seatCrowding's CODE_PILL_SIZE_PX (the
            // nudge scorer reasons in that geometry; a source test pins the
            // pair). EVERY code pill grows to content on hover/focus
            // (w-auto + a min-width floor), so an over-long label that
            // truncates at rest is always recoverable — including on open
            // seats, which have no name to disclose.
            // px-1.5 (symmetric): the centered label's content box is
            // 46 − 2 borders − 12 padding = 32px, which fits the widest
            // 4-char code ("CW05" ≈ 27px in Plex extrabold at 9.5px). The
            // old px-2/pl-2.5 left 26px and ellipsized every CW label.
            "h-[24px] min-h-[24px] w-[46px] rounded-full px-1.5 py-0 text-center",
            "group-hover:w-auto group-focus-visible:w-auto",
            hasHoverDisclosure
              ? "group-hover:min-w-[96px] group-hover:px-3 group-hover:text-left group-focus-visible:min-w-[96px] group-focus-visible:px-3 group-focus-visible:text-left"
              : "group-hover:min-w-[46px] group-focus-visible:min-w-[46px]"
          ].filter(Boolean).join(" ");

  const tokenStateClass = [
    tokenMode === "code" || tokenMode === "name"
      // Softer, slightly lifted diffusion than the old 2px/5px — the capsule
      // reads as the reference's soft token without changing the palette.
      ? "shadow-[0_3px_9px_rgba(23,26,29,0.16),inset_0_1px_0_rgba(255,255,255,0.85)]"
      : "",
    draftChanged && !selected && !searchProminent
      ? adminMarker
        ? "border-[var(--sp-legend-draft-border)] bg-[var(--sp-legend-draft-surface)] text-[var(--sp-legend-draft-text)] ring-1 ring-[var(--sp-legend-draft-border)] shadow-[0_4px_12px_rgba(0,157,154,0.16),inset_0_1px_0_rgba(255,255,255,0.8)]"
        : "border-[var(--sp-marker-draft-border)] bg-[var(--sp-marker-draft-surface)] text-[var(--sp-marker-draft-text)] ring-1 ring-[var(--sp-marker-draft-ring)] shadow-[0_4px_12px_rgba(162,110,35,0.16),inset_0_1px_0_rgba(255,255,255,0.8)]"
      : "",
    // Same source-state exclusion as the selected entry below — this is the
    // other dark-pill state that would collide with the green source tint.
    searchSelected && !swapSource && !moveEmployeeSource
      ? adminMarker
        ? "border-[var(--sp-legend-selected-border)] bg-[var(--sp-legend-selected-surface)] text-[var(--sp-legend-selected-text)] ring-2 ring-[var(--sp-legend-selected-border)] outline outline-2 outline-offset-2 outline-[var(--sp-legend-search-border)] shadow-[0_12px_28px_rgba(16,17,20,0.34),0_0_0_5px_var(--sp-legend-search-halo),inset_0_1px_0_rgba(255,255,255,0.14)]"
        : "border-[var(--sp-marker-active-edge)] bg-[var(--sp-marker-search-selected-surface)] text-white ring-2 ring-[var(--sp-marker-active-edge-strong)] outline outline-2 outline-offset-2 outline-[var(--sp-marker-active-edge-soft)] shadow-[0_12px_28px_rgba(23,26,29,0.34),0_0_0_5px_rgba(255,87,21,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]"
      : "",
    // Arming swap/move keeps the seat SELECTED (applyStartSwapSeatAction never
    // clears selection), so without the source-state exclusion this dark pill
    // and the green source tint below land on the same token and CSS order —
    // not JSX order — picks per property: the positive-surface bg (mint) beats
    // the dark selected surface but text-white beats the positive text,
    // rendering white-on-mint (~1.1:1).
    tokenMode === "selected" && !swapSource && !moveEmployeeSource
      ? searchSelected
        ? ""
        : adminMarker
          ? "border-[var(--sp-legend-selected-border)] bg-[var(--sp-legend-selected-surface)] text-[var(--sp-legend-selected-text)] ring-2 ring-[var(--sp-legend-selected-border)] shadow-marker-selected"
          : "border-[var(--sp-marker-active-edge)] bg-[var(--sp-marker-selected-surface)] text-white ring-2 ring-[var(--sp-marker-active-edge-strong)] shadow-[0_10px_24px_rgba(31,35,39,0.30),inset_0_1px_0_rgba(255,255,255,0.16)]"
      : "",
    validTargetTone
      ? adminMarker
        ? "border-[var(--sp-legend-target-valid-border)] bg-[var(--sp-legend-target-valid-surface)] text-[var(--sp-legend-target-valid-text)]"
        : "border-[var(--sp-marker-positive-border)] bg-[var(--sp-marker-positive-surface)] text-[var(--sp-marker-positive-text)]"
      : "",
    invalidTarget
      ? adminMarker
        ? "border-[var(--sp-legend-target-invalid-border)] bg-[var(--sp-legend-target-invalid-surface)] text-[var(--sp-legend-target-invalid-text)]"
        : "border-[var(--sp-marker-invalid-border)] bg-[var(--sp-marker-invalid-surface)] text-[var(--sp-marker-invalid-text)]"
      : "",
    searchProminent && !selected
      ? adminMarker
        ? "border-[var(--sp-legend-search-border)] bg-[var(--sp-legend-search-surface)] text-[var(--sp-legend-search-text)] ring-2 ring-[var(--sp-legend-search-ring)] shadow-[0_8px_18px_rgba(158,47,6,0.20),inset_0_1px_0_rgba(255,255,255,0.78)]"
        // Search/filter match = the brand accent (was teal until
        // 2026-07-21). Text #9E2F06 on the #FBEAE1 fill = 6.27:1; the #D23F0A
        // edge = 4.03:1 on that fill and 4.71:1 on white, so the pill reads
        // against both the cream floor plan and its own surface. The bright
        // #FF5715 stays in the outer glow only — at 2.71:1 on the fill it is
        // decoration, never the boundary that identifies the match.
        : "border-[var(--sp-marker-search-border)] bg-[var(--sp-marker-search-surface)] text-[var(--sp-marker-search-text)] ring-2 ring-[var(--sp-marker-search-ring)] shadow-[0_0_0_4px_rgba(255,87,21,0.20),0_10px_20px_-4px_rgba(210,63,10,0.35),inset_0_1px_0_rgba(255,255,255,0.78)]"
      : "",
    highlighted && selected ? adminMarker ? "outline outline-2 outline-offset-2 outline-[var(--sp-legend-search-ring)]" : "outline outline-2 outline-offset-2 outline-[var(--sp-marker-positive-outline)]" : "",
    swapSource || moveEmployeeSource ? adminMarker ? "border-[var(--sp-legend-search-border)] bg-[var(--sp-legend-search-surface)] text-[var(--sp-legend-search-text)] ring-4 ring-[var(--sp-legend-search-ring)]" : "border-[var(--sp-marker-positive-border)] bg-[var(--sp-marker-positive-surface)] text-[var(--sp-marker-positive-text)] ring-4 ring-[var(--sp-marker-positive-ring)]" : "",
    swapTarget ? adminMarker ? "border-[var(--sp-legend-search-border)] bg-[var(--sp-legend-search-surface)] text-[var(--sp-legend-search-text)] ring-4 ring-[var(--sp-legend-search-ring)]" : "border-[var(--sp-marker-neutral-border)] bg-[var(--sp-marker-neutral-surface)] text-[var(--sp-marker-neutral-text)] ring-4 ring-[var(--sp-marker-neutral-ring)]" : "",
    // v12 slice 7: on ADMIN this state means "Ask Planner chose this seat", so
    // it wears the AI aura — the only place AI blue touches a pill. The viewer
    // branch keeps its green: there `highlighted` means a search hit or a
    // people-list hover, which is not AI presence and must never look like it.
    plannerHighlighted ? adminMarker ? "border-[var(--sp-ai-border)] bg-[var(--sp-ai-marker-surface)] bg-[image:var(--sp-ai-marker-aura)] bg-no-repeat text-[var(--sp-ai-text)] shadow-marker-ai" : "border-[var(--sp-marker-positive-border)] bg-[var(--sp-marker-positive-surface)] text-[var(--sp-marker-positive-text)] ring-2 ring-[var(--sp-marker-planner-ring)] shadow-[0_0_0_4px_rgba(47,102,104,0.18),0_9px_18px_-4px_rgba(47,102,104,0.32),inset_0_1px_0_rgba(255,255,255,0.75)]" : "",
    (swapMode && !swapSource) || (moveEmployeeMode && !moveEmployeeSource) ? adminMarker ? "group-hover:ring-4 group-hover:ring-[var(--sp-legend-search-ring)]" : "group-hover:ring-4 group-hover:ring-[var(--sp-marker-positive-ring)]" : ""
  ].join(" ");
  const markerFocusClass = adminMarker
    ? "focus-visible:z-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--sp-focus-marker-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sp-focus-marker-offset)]"
    : "focus-visible:z-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--sp-marker-active-edge-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-white/70";
  // Hover is a transient cue: it must never repaint a committed (selected) seat's
  // orange ring, so the hover border applies only to unselected markers.
  const tokenInteractionClass = adminMarker
    ? `transition-[width,min-width,filter,box-shadow,border-color,background-color,opacity] duration-150 ease-out ${selected ? "" : "group-hover:border-[var(--sp-legend-hover-border)] "}group-hover:brightness-105 group-hover:shadow-marker-hover group-active:shadow-[0_2px_6px_rgba(16,17,20,0.16),inset_0_2px_4px_rgba(16,17,20,0.08)] group-focus-visible:ring-4 group-focus-visible:ring-[var(--sp-focus-marker-ring)] motion-reduce:transition-none`
    : "transition-[width,min-width,filter,box-shadow,border-color,background-color,opacity] duration-150 ease-out group-hover:border-[var(--sp-marker-active-edge)] group-hover:brightness-105 group-hover:shadow-[0_6px_14px_rgba(23,26,29,0.20),inset_0_1px_0_rgba(255,255,255,0.82)] group-active:shadow-[0_2px_6px_rgba(23,26,29,0.16),inset_0_2px_4px_rgba(23,26,29,0.08)] group-focus-visible:ring-4 group-focus-visible:ring-[var(--sp-marker-active-edge-soft)] motion-reduce:transition-none";
  const draftBadgeClass = adminMarker
    ? "bg-[var(--sp-legend-draft-accent)] shadow-[0_2px_5px_rgba(16,17,20,0.24)]"
    : "bg-[var(--sp-marker-draft-badge)] shadow-[0_2px_5px_rgba(23,26,29,0.24)]";

  const hitTargetSizeClass = tokenMode === "selected" ? "h-10 w-10" : tokenMode === "prominent" ? "h-9 w-9" : "h-8 w-8";
  // Person-first hierarchy on the expanded name badge (2026-07-16 critique):
  // the seat code demotes to a small muted eyebrow so the occupant name below
  // it is the card's primary line. Code-only selected/prominent pills (open
  // seats) keep the larger code — it is the only content there.
  // The muted-eyebrow opacity is surface-dependent: 70% white on the dark
  // selected pill holds 9.0:1, but 70% of the ink on the LIGHT prominent
  // surfaces dips under AA (#284C3B@70 on the #DEF3E4 source/highlight tint =
  // 3.84:1, #9E2F06@70 on the #FBEAE1 search tint = 3.51:1); 90% keeps the
  // demoted look while measuring 6.35:1 / 5.22:1 there.
  const lightProminentSurface = swapSource || moveEmployeeSource || plannerHighlighted || (searchProminent && !selected);
  const codeTextClass = expandedNameBadge
    ? `text-[8.5px] tracking-[0.04em] ${lightProminentSurface ? "opacity-90" : "opacity-70"}`
    : tokenMode === "selected" || tokenMode === "prominent"
      ? "text-[10px]"
      : "text-[9.5px]";
  const markerUsesTrueCoordinate = addSeatMode || swapMode || moveEmployeeMode;
  const tokenCanHugViewportEdge = showInlineName || prominentToken;
  const resolvedViewportEdge = markerUsesTrueCoordinate || !tokenCanHugViewportEdge ? "none" : viewportEdge;
  const resolvedViewportEdgeOffsetPx = markerUsesTrueCoordinate || !tokenCanHugViewportEdge ? 0 : Math.max(0, Math.round(viewportEdgeOffsetPx));
  // Render-layer name-label collision nudge (lib/seatCrowding
  // computeNameLabelNudges): only ever a vertical offset added on top of the
  // existing centering translate on the TOKEN — the marker anchor (button,
  // positioned via pointToStyle at seat.x/seat.y) never moves. It applies to
  // resting name-bearing tokens: "name" mode (admin Show-names) and passive
  // "prominent" pills (viewer search results show names via prominent mode,
  // not name mode, because viewers have no Show-names). Active markers
  // (selected / swap) always stay exactly on their anchor.
  const nameNudgeApplicable = tokenMode === "name" || (tokenMode === "prominent" && !activeMarker);
  const nameNudgeActive = nameNudgeApplicable && nameNudge !== 0;
  // Code pills use the same token-only vertical translate to de-collide tight
  // pods at their uniform size. Resting code tokens only — selection/search
  // promote the token to selected/prominent, which always sits on the anchor.
  const codeNudgeActive = tokenMode === "code" && codeNudge !== 0;
  const activeTokenNudge = nameNudgeActive ? nameNudge : codeNudgeActive ? codeNudge : 0;
  const tokenVerticalTranslateClass = activeTokenNudge === 0
    ? "-translate-y-1/2"
    : activeTokenNudge === -1
      ? "-translate-y-[calc(50%+14px)]"
      : "-translate-y-[calc(50%-14px)]";
  // Room-centered plate offset (display-only, same contract as the nudge and
  // viewport-edge offsets above: the anchor button NEVER moves). SeatMap
  // derives the offset from the seat's office-room rect; add/swap/move
  // modes snap the token back to the true coordinate so targeting stays
  // honest.
  const officePlateOffsetActive =
    officePlate && !markerUsesTrueCoordinate && (officePlateOffsetXPx !== 0 || officePlateOffsetYPx !== 0);
  const tokenPositionClass = officePlateOffsetActive
    ? "absolute -translate-x-1/2 -translate-y-1/2"
    : resolvedViewportEdge === "left"
      ? `absolute top-1/2 translate-x-0 ${tokenVerticalTranslateClass}`
      : resolvedViewportEdge === "right"
        ? `absolute top-1/2 translate-x-0 ${tokenVerticalTranslateClass}`
        : `absolute left-1/2 top-1/2 -translate-x-1/2 ${tokenVerticalTranslateClass}`;
  // The room-fitted width applies in EVERY mode (a 152px plate must not
  // overflow a ~123px NE room); only the centering offset is mode-dependent.
  const officePlateSizeStyle: CSSProperties | undefined =
    officePlate && officePlateWidthPx
      ? { width: `${officePlateWidthPx}px`, maxWidth: `${officePlateWidthPx}px` }
      : undefined;
  const tokenPositionStyle: CSSProperties | undefined = officePlateOffsetActive
    ? {
        left: `calc(50% + ${officePlateOffsetXPx}px)`,
        top: `calc(50% + ${officePlateOffsetYPx}px)`,
        ...officePlateSizeStyle
      }
    : resolvedViewportEdge === "left"
      ? { left: `calc(50% + ${resolvedViewportEdgeOffsetPx}px)`, ...officePlateSizeStyle }
      : resolvedViewportEdge === "right"
        ? { right: `calc(50% + ${resolvedViewportEdgeOffsetPx}px)`, ...officePlateSizeStyle }
        : officePlateSizeStyle;
  const nameTextClass =
    tokenMode === "selected"
      ? "max-w-[98px] text-[13px]"
      : tokenMode === "prominent"
        ? "max-w-[88px] text-[12.5px]"
        : tokenDensity === "standard"
          ? "max-w-[74px] text-[9.5px] group-hover:max-w-[96px] group-hover:text-[10px] group-focus-visible:max-w-[96px] group-focus-visible:text-[10px]"
          : "max-w-[58px] text-[9px] group-hover:max-w-[94px] group-hover:text-[10px] group-focus-visible:max-w-[94px] group-focus-visible:text-[10px]";

  return (
    <button
      type="button"
      onClick={event => {
        if (addSeatMode) {
          event.preventDefault();
          return;
        }
        onSelect(seat.id);
      }}
      tabIndex={tabIndex}
      data-seat-id={seat.id}
      data-marker-intent={markerIntent}
      data-token-mode={tokenMode}
      data-draft-changed={draftChanged || undefined}
      aria-pressed={selected}
      title={`${seat.label} · ${displayName} · ${STATUS_LABELS[seat.status]}`}
      className={[
        "group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 touch-manipulation select-none items-center justify-center overflow-visible rounded-full border-0 bg-transparent p-0 font-extrabold leading-none text-[var(--sp-marker-ink)]",
        "transition-[transform,opacity,filter] duration-150 ease-out hover:z-30 active:scale-[0.96] active:duration-75 motion-reduce:transition-none",
        markerFocusClass,
        hitTargetSizeClass,
        selected ? "z-40 focus-visible:z-40" : "",
        prominentToken ? "z-30" : "",
        dimmed ? "opacity-45 saturate-50" : "",
        "cursor-pointer"
      ].join(" ")}
      style={pointToStyle({ x: seat.x, y: seat.y })}
      aria-label={`${seat.label} ${accessibleSeatName}. ${STATUS_LABELS[seat.status]} seat.${draftChanged ? " Draft changed." : ""}${searchProminent ? " Search result." : ""}${highlighted ? ` ${highlightedDescription}.` : ""}${swapSource ? " Swap source." : ""}${swapTarget ? " Swap target." : ""}${swapCandidate ? " Valid swap target." : ""}${moveEmployeeSource ? " Move source." : ""}${moveCandidate ? " Valid destination seat." : ""}${invalidTarget ? " Not a valid target." : ""}${selected ? " Selected." : " Open details."}`}
    >
      <SeatToken
        style={tokenPositionStyle}
        className={[
          "z-10 isolate flex items-center justify-center overflow-visible border ring-1 ring-[var(--sp-marker-pill-ring)] backdrop-blur-[1px]",
          tokenInteractionClass,
          tokenPositionClass,
          statusToneClass,
          tokenSizeClass,
          tokenStateClass
        ].join(" ")}
      >
        {/* 2026-07-23 capsule hybrid (owner reference): the key-look accent
            bar + top-left status shape are replaced by ONE non-color cue — a
            green dot on the pill's bottom-right edge for occupied seats. Dot
            PRESENCE (not hue) is what separates assigned from open, so the A3
            colorblind-legibility intent survives the redesign. */}
        {seat.status === "assigned" && !invalidTarget && (
          <span
            className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--sp-marker-positive-border)] ring-[1.5px] ring-white/90"
            aria-hidden="true"
          />
        )}
        {draftChanged && !selected && !searchProminent && (
          <span className={["pointer-events-none absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full border border-white/85 text-[8px] font-black leading-none text-white", draftBadgeClass].join(" ")} aria-hidden="true">
            D
          </span>
        )}
        {/* AI provenance on the seat itself: the aura says "something picked
            this", the chip says WHAT picked it. aria-hidden because the
            marker's accessible name already carries the highlight reason
            (highlightedDescription) — the chip would only repeat it. */}
        {plannerHighlighted && adminMarker && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-2 -top-[7px] rounded-[2px] border border-[var(--sp-ai-border)] bg-[var(--sp-ai-marker-surface)] px-[3px] text-[7.5px] font-bold leading-[1.4] tracking-[0.04em] text-[var(--sp-ai-text)]"
          >
            AI
          </span>
        )}
        {officePlate ? (
          <span className="relative z-10 flex w-full min-w-0 flex-col items-start gap-0.5 text-left">
            {/* Same surface-conditional opacity as codeTextClass above: an
                office seat armed as swap/move source wears the light green
                tint too, where a 70% eyebrow dips under AA. */}
            <span translate="no" className={`whitespace-nowrap text-[8.5px] font-extrabold tracking-[0.09em] ${lightProminentSurface ? "opacity-90" : "opacity-70"}`}>{seat.label}</span>
            {/* Literal space text nodes between the plate's lines — same axe
                4.10 subtree-serialization contract as the pill branches. */}
            {hasEmployee ? (
              <>
                {" "}
                <span className="block w-full min-w-0 truncate text-[13px] font-bold leading-[1.15]">{inlineNameLabel}</span>
                {officeTitleLabel && " "}
                {officeTitleLabel && (
                  <span className="block w-full min-w-0 truncate text-[9.5px] font-semibold leading-[1.2] opacity-75">{officeTitleLabel}</span>
                )}
              </>
            ) : (
              <>
                {" "}
                <span className="block text-[12px] font-semibold leading-[1.15] opacity-80">Open office</span>
              </>
            )}
          </span>
        ) : tokenMode === "code" ? (
          <span className="relative z-10 flex w-full min-w-0 items-center justify-center gap-1 group-hover:justify-start group-focus-visible:justify-start">
            {/* truncate (not plain nowrap): an over-long label must clip
                inside the fixed pill rather than spill over neighbouring
                markers — hover/focus grows the token, revealing it fully. */}
            <span translate="no" className="max-w-full truncate text-[9.5px] font-extrabold leading-[1.05]">{seat.label}</span>
            {/* The literal space text node keeps the code and name as separate
                words when a checker serializes the subtree (axe 4.10's
                label-content-name-mismatch joins spans without one); flex
                containers never render whitespace-only nodes, so it is
                visually inert. */}
            {employeeName && " "}
            {employeeName && (
              <span className="hidden max-w-[64px] truncate text-[10px] font-bold leading-[1.05] opacity-90 group-hover:block group-focus-visible:block">
                {compactEmployeeName}
              </span>
            )}
          </span>
        ) : (
          <span className="relative z-10 flex w-full min-w-0 flex-col items-start text-left">
            <span translate="no" className={["whitespace-nowrap font-extrabold leading-[1.05]", codeTextClass].join(" ")}>{seat.label}</span>
            {/* Word separator for subtree-text serializers — see the twin
                comment in the hover-disclosure branch above. */}
            {showInlineName && " "}
            {showInlineName && (
              <span className={["block min-w-0 truncate font-bold leading-[1.08] opacity-95", nameTextClass].join(" ")}>
                {inlineNameLabel}
              </span>
            )}
          </span>
        )}
      </SeatToken>
    </button>
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
const RENDERED_SEAT_FIELDS = ["id", "label", "x", "y", "status", "zone", "department"] as const;

function seatRenderEqual(previous: SeatWithEmployee, next: SeatWithEmployee) {
  for (const field of RENDERED_SEAT_FIELDS) {
    if (!Object.is(previous[field], next[field])) return false;
  }
  // Occupant is read through two fields only; comparing the employee object by
  // reference would defeat the memo, because the map rebuilds those objects
  // whenever it re-stitches seats to employees.
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
