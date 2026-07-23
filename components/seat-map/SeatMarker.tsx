"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";
import type { SeatWithEmployee } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { pointToStyle } from "@/lib/seatMath";
import { formatDisplayName } from "@/lib/formatName";

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
  moveSeatMode: boolean;
  swapMode: boolean;
  swapSource: boolean;
  swapTarget: boolean;
  invalidTarget?: boolean;
  highlighted: boolean;
  highlightedDescription?: string;
  dragging: boolean;
  addSeatMode: boolean;
  viewportEdge: "left" | "right" | "none";
  viewportEdgeOffsetPx: number;
  variant?: "admin" | "viewer";
  // Roving tabindex: the map exposes ONE seat as a tab stop (0) and the rest
  // as -1; arrow keys move between seats (handled by the marker layer).
  tabIndex?: number;
  onSelect: (seatId: string) => void;
  onMovePointerDown: (event: PointerEvent<HTMLButtonElement>, seatId: string) => void;
};

type TokenDensity = "compact" | "standard";
type TokenMode = "code" | "name" | "prominent" | "selected";
type MarkerIntent = "assigned" | "available" | "reserved" | "unavailable" | "draft-changed" | "search-result" | "search-selected" | "selected" | "move-origin" | "swap-source" | "swap-target" | "target-valid" | "target-invalid";

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

export function SeatMarker({
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
  moveSeatMode,
  swapMode,
  swapSource,
  swapTarget,
  invalidTarget = false,
  highlighted,
  highlightedDescription = "Highlighted by Ask Planner",
  dragging,
  addSeatMode,
  viewportEdge,
  viewportEdgeOffsetPx,
  variant = "viewer",
  tabIndex = 0,
  onSelect,
  onMovePointerDown
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
  const isMovable = canEdit && selected && moveSeatMode;
  const moveOrigin = isMovable && !dragging;
  const swapCandidate = canEdit && swapMode && !swapSource && !swapTarget && !invalidTarget;
  const activeMarker = selected || dragging || swapSource || swapTarget;
  const searchProminent = searchResult && !dimmed;
  const searchSelected = selected && searchProminent;
  const plannerHighlighted = highlighted && !selected && !swapSource && !swapTarget;
  const tokenDensity = getSeatTokenDensity(seat, compactNameLabel);
  const compactEmployeeName = getPassiveEmployeeLabel(employeeName);
  const showInlineName = Boolean(employeeName) && (namesVisible || activeMarker || searchProminent || plannerHighlighted);
  const prominentToken = activeMarker || searchProminent || plannerHighlighted;
  const tokenMode: TokenMode = selected ? "selected" : prominentToken ? "prominent" : showInlineName ? "name" : "code";
  const hasHoverDisclosure = hasEmployee && !showInlineName;
  const expandedNameBadge = hasEmployee && (tokenMode === "selected" || tokenMode === "prominent");
  const inlineNameLabel = expandedNameBadge || (namesVisible && tokenDensity === "standard" && !compactNameLabel) ? formatDisplayName(employeeName) : compactEmployeeName;
  // Accessible name must CONTAIN the pill's visible text verbatim (axe
  // label-content-name-mismatch): "W08: Patrick" failed because the colon
  // broke containment, and abbreviated visible names ("Alex S.") must appear
  // before the full name they abbreviate.
  const accessibleSeatName =
    !hasEmployee || inlineNameLabel === displayName ? displayName : `${inlineNameLabel} ${displayName}`;
  const markerIntent: MarkerIntent = swapSource
    ? "swap-source"
    : swapTarget
      ? "swap-target"
      : moveOrigin
        ? "move-origin"
        : invalidTarget
          ? "target-invalid"
          : swapCandidate
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
        ? "border-[var(--admin-marker-assigned-border)] bg-[var(--admin-marker-assigned-surface)] text-[var(--admin-marker-assigned-text)]"
        : seat.status === "reserved"
          ? "border-[var(--admin-marker-reserved-border)] bg-[var(--admin-marker-reserved-surface)] text-[var(--admin-marker-reserved-text)]"
          : seat.status === "unavailable"
            ? "border-[var(--admin-marker-unavailable-border)] bg-[var(--admin-marker-unavailable-surface)] text-[var(--admin-marker-unavailable-text)]"
            : "border-[var(--admin-marker-available-border)] bg-[var(--admin-marker-available-surface)] text-[var(--admin-marker-available-text)]"
      : seat.status === "assigned"
        ? "border-[#1D6E41]/55 bg-white/95 text-[#284C3B]"
        : seat.status === "reserved"
          ? "border-[#8A6116]/55 bg-[#FCF4D6]/95 text-[#6D4712]"
          : seat.status === "unavailable"
            ? "border-[#BEB4A8]/90 bg-[#E7E1D8]/[0.92] text-[#696159]"
            : "border-[#B8AEA2] bg-white/95 text-[#453D33]";
  // Search/planner emphasis keeps visual priority over the passive valid-target tint.
  const validTargetTone = swapCandidate && !searchProminent && !plannerHighlighted;
  const statusToneClass = (tokenMode === "selected" || tokenMode === "prominent" || moveOrigin || validTargetTone || invalidTarget) ? "" : baseStatusToneClass;

  // Capsule geometry (2026-07-23 owner reference hybrid): every token is a
  // full stadium (rounded-full on a fixed height), and with the left accent
  // bar gone the paddings are symmetric again.
  const tokenSizeClass =
    tokenMode === "selected"
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
        ? "border-[var(--admin-marker-draft-border)] bg-[var(--admin-marker-draft-surface)] text-[var(--admin-marker-draft-text)] ring-1 ring-[var(--admin-marker-draft-border)] shadow-[0_4px_12px_rgba(212,154,6,0.16),inset_0_1px_0_rgba(255,255,255,0.8)]"
        : "border-[#8A6116]/70 bg-[#FCF4D6]/95 text-[#6D4712] ring-1 ring-[#E0C46E]/55 shadow-[0_4px_12px_rgba(162,110,35,0.16),inset_0_1px_0_rgba(255,255,255,0.8)]"
      : "",
    searchSelected
      ? adminMarker
        ? "border-[var(--admin-marker-selected-border)] bg-[var(--admin-marker-selected-surface)] text-[var(--admin-marker-selected-text)] ring-2 ring-[var(--admin-marker-selected-border)] outline outline-2 outline-offset-2 outline-[var(--admin-marker-search-border)] shadow-[0_12px_28px_rgba(16,17,20,0.34),0_0_0_5px_var(--admin-marker-search-halo),inset_0_1px_0_rgba(255,255,255,0.14)]"
        : "border-[#D46A24] bg-[#15181B] text-white ring-2 ring-[#D46A24]/90 outline outline-2 outline-offset-2 outline-[#D46A24]/75 shadow-[0_12px_28px_rgba(23,26,29,0.34),0_0_0_5px_rgba(255,87,21,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]"
      : "",
    tokenMode === "selected"
      ? searchSelected || moveOrigin
        ? ""
        : adminMarker
          ? "border-[var(--admin-marker-selected-border)] bg-[var(--admin-marker-selected-surface)] text-[var(--admin-marker-selected-text)] ring-2 ring-[var(--admin-marker-selected-border)] shadow-marker-selected"
          : "border-[#D46A24] bg-[#171A1D] text-white ring-2 ring-[#D46A24]/90 shadow-[0_10px_24px_rgba(31,35,39,0.30),inset_0_1px_0_rgba(255,255,255,0.16)]"
      : "",
    moveOrigin
      ? adminMarker
        ? "border-[var(--admin-marker-move-origin-border)] bg-[var(--admin-marker-move-origin-surface)] text-[var(--admin-marker-move-origin-text)] ring-2 ring-[var(--admin-border-strong)] shadow-[0_10px_24px_rgba(31,34,37,0.18)]"
        : "border-[#6E655A] bg-[#EFE9DF] text-[#353532] ring-4 ring-[#D8D0C5]"
      : "",
    validTargetTone
      ? adminMarker
        ? "border-[var(--admin-marker-target-valid-border)] bg-[var(--admin-marker-target-valid-surface)] text-[var(--admin-marker-target-valid-text)]"
        : "border-[#1D6E41] bg-[#DEF3E4] text-[#284C3B]"
      : "",
    invalidTarget
      ? adminMarker
        ? "border-[var(--admin-marker-target-invalid-border)] bg-[var(--admin-marker-target-invalid-surface)] text-[var(--admin-marker-target-invalid-text)]"
        : "border-[#B3232C] bg-[#FBE9EA] text-[#7E2F24]"
      : "",
    searchProminent && !selected
      ? adminMarker
        ? "border-[var(--admin-marker-search-border)] bg-[var(--admin-marker-search-surface)] text-[var(--admin-marker-search-text)] ring-2 ring-[var(--admin-marker-search-ring)] shadow-[0_8px_18px_rgba(158,47,6,0.20),inset_0_1px_0_rgba(255,255,255,0.78)]"
        // Search/filter match = the brand accent (was teal until
        // 2026-07-21). Text #9E2F06 on the #FBEAE1 fill = 6.27:1; the #D23F0A
        // edge = 4.03:1 on that fill and 4.71:1 on white, so the pill reads
        // against both the cream floor plan and its own surface. The bright
        // #FF5715 stays in the outer glow only — at 2.71:1 on the fill it is
        // decoration, never the boundary that identifies the match.
        : "border-[#D23F0A] bg-[#FBEAE1] text-[#9E2F06] ring-2 ring-[#D23F0A]/55 shadow-[0_0_0_4px_rgba(255,87,21,0.20),0_10px_20px_-4px_rgba(210,63,10,0.35),inset_0_1px_0_rgba(255,255,255,0.78)]"
      : "",
    highlighted && selected ? adminMarker ? "outline outline-2 outline-offset-2 outline-[var(--admin-marker-search-ring)]" : "outline outline-2 outline-offset-2 outline-[#1D6E41]/70" : "",
    swapSource ? adminMarker ? "border-[var(--admin-marker-search-border)] bg-[var(--admin-marker-search-surface)] text-[var(--admin-marker-search-text)] ring-4 ring-[var(--admin-marker-search-ring)]" : "border-[#1D6E41] bg-[#DEF3E4] text-[#284C3B] ring-4 ring-[#A9D7B8]/80" : "",
    swapTarget ? adminMarker ? "border-[var(--admin-marker-search-border)] bg-[var(--admin-marker-search-surface)] text-[var(--admin-marker-search-text)] ring-4 ring-[var(--admin-marker-search-ring)]" : "border-[#6E655A] bg-[#F1ECE4] text-[#353532] ring-4 ring-[#D8D0C5]/85" : "",
    plannerHighlighted ? adminMarker ? "border-[var(--admin-marker-available-border)] bg-[var(--admin-marker-available-surface)] text-[var(--admin-marker-available-text)] ring-2 ring-[var(--admin-border)] shadow-[0_6px_14px_rgba(140,102,69,0.18),inset_0_1px_0_rgba(255,255,255,0.72)]" : "border-[#1D6E41] bg-[#DEF3E4] text-[#284C3B] ring-2 ring-[#1D6E41]/55 shadow-[0_0_0_4px_rgba(47,102,104,0.18),0_9px_18px_-4px_rgba(47,102,104,0.32),inset_0_1px_0_rgba(255,255,255,0.75)]" : "",
    swapMode && !swapSource ? adminMarker ? "group-hover:ring-4 group-hover:ring-[var(--admin-marker-search-ring)]" : "group-hover:ring-4 group-hover:ring-[#A9D7B8]/80" : ""
  ].join(" ");
  const markerFocusClass = adminMarker
    ? "focus-visible:z-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--admin-marker-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-marker-focus-offset)]"
    : "focus-visible:z-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#D46A24]/75 focus-visible:ring-offset-2 focus-visible:ring-offset-white/70";
  // Hover is a transient cue: it must never repaint a committed (selected) seat's
  // orange ring, so the hover border applies only to unselected markers.
  const tokenInteractionClass = adminMarker
    ? `transition-[width,min-width,filter,box-shadow,border-color,background-color,opacity] duration-150 ease-out ${selected ? "" : "group-hover:border-[var(--admin-marker-hover-border)] "}group-hover:brightness-105 group-hover:shadow-marker-hover group-active:shadow-[0_2px_6px_rgba(16,17,20,0.16),inset_0_2px_4px_rgba(16,17,20,0.08)] group-focus-visible:ring-4 group-focus-visible:ring-[var(--admin-marker-focus-ring)] motion-reduce:transition-none`
    : "transition-[width,min-width,filter,box-shadow,border-color,background-color,opacity] duration-150 ease-out group-hover:border-[#D46A24] group-hover:brightness-105 group-hover:shadow-[0_6px_14px_rgba(23,26,29,0.20),inset_0_1px_0_rgba(255,255,255,0.82)] group-active:shadow-[0_2px_6px_rgba(23,26,29,0.16),inset_0_2px_4px_rgba(23,26,29,0.08)] group-focus-visible:ring-4 group-focus-visible:ring-[#D46A24]/75 motion-reduce:transition-none";
  const draftBadgeClass = adminMarker
    ? "bg-[var(--admin-marker-draft-accent)] shadow-[0_2px_5px_rgba(16,17,20,0.24)]"
    : "bg-[#8A6116] shadow-[0_2px_5px_rgba(23,26,29,0.24)]";

  const hitTargetSizeClass = tokenMode === "selected" ? "h-10 w-10" : tokenMode === "prominent" ? "h-9 w-9" : "h-8 w-8";
  // Person-first hierarchy on the expanded name badge (2026-07-16 critique):
  // the seat code demotes to a small muted eyebrow so the occupant name below
  // it is the card's primary line. Code-only selected/prominent pills (open
  // seats) keep the larger code — it is the only content there.
  const codeTextClass = expandedNameBadge
    ? "text-[8.5px] tracking-[0.04em] opacity-70"
    : tokenMode === "selected" || tokenMode === "prominent"
      ? "text-[10px]"
      : "text-[9.5px]";
  const markerUsesTrueCoordinate = addSeatMode || moveSeatMode || swapMode;
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
  // (selected / dragging / swap) always stay exactly on their anchor.
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
  const tokenPositionClass =
    resolvedViewportEdge === "left"
      ? `absolute top-1/2 translate-x-0 ${tokenVerticalTranslateClass}`
      : resolvedViewportEdge === "right"
        ? `absolute top-1/2 translate-x-0 ${tokenVerticalTranslateClass}`
        : `absolute left-1/2 top-1/2 -translate-x-1/2 ${tokenVerticalTranslateClass}`;
  const tokenPositionStyle: CSSProperties | undefined =
    resolvedViewportEdge === "left"
      ? { left: `calc(50% + ${resolvedViewportEdgeOffsetPx}px)` }
      : resolvedViewportEdge === "right"
        ? { right: `calc(50% + ${resolvedViewportEdgeOffsetPx}px)` }
        : undefined;
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
      onPointerDown={event => {
        if (!isMovable) return;
        onMovePointerDown(event, seat.id);
      }}
      tabIndex={tabIndex}
      data-seat-id={seat.id}
      data-marker-intent={markerIntent}
      data-draft-changed={draftChanged || undefined}
      data-movable={isMovable}
      aria-pressed={selected}
      title={`${seat.label} · ${displayName} · ${STATUS_LABELS[seat.status]}`}
      className={[
        "group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 touch-manipulation select-none items-center justify-center overflow-visible rounded-full border-0 bg-transparent p-0 font-extrabold leading-none text-[#453D33]",
        "transition-[transform,opacity,filter] duration-150 ease-out hover:z-30 active:scale-[0.96] active:duration-75 motion-reduce:transition-none",
        markerFocusClass,
        hitTargetSizeClass,
        selected ? "z-40 focus-visible:z-40" : "",
        prominentToken ? "z-30" : "",
        dimmed ? "opacity-45 saturate-50" : "",
        isMovable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging ? "z-40 scale-[1.06] shadow-[0_18px_36px_rgba(31,35,39,0.24)]" : ""
      ].join(" ")}
      style={pointToStyle({ x: seat.x, y: seat.y })}
      aria-label={`${seat.label} ${accessibleSeatName}. ${STATUS_LABELS[seat.status]} seat.${draftChanged ? " Draft changed." : ""}${searchProminent ? " Search result." : ""}${highlighted ? ` ${highlightedDescription}.` : ""}${moveOrigin ? " Move origin. Drag to reposition." : ""}${swapSource ? " Swap source." : ""}${swapTarget ? " Swap target." : ""}${swapCandidate ? " Valid swap target." : ""}${invalidTarget ? " Not a valid target." : ""}${selected ? " Selected." : " Open details."}`}
    >
      <SeatToken
        style={tokenPositionStyle}
        className={[
          "z-10 isolate flex items-center justify-center overflow-visible border ring-1 ring-white/45 backdrop-blur-[1px]",
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
        {seat.status === "assigned" && !dragging && !invalidTarget && (
          <span
            className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[#1D6E41] ring-[1.5px] ring-white/90"
            aria-hidden="true"
          />
        )}
        {draftChanged && !selected && !searchProminent && (
          <span className={["pointer-events-none absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full border border-white/85 text-[8px] font-black leading-none text-white", draftBadgeClass].join(" ")} aria-hidden="true">
            D
          </span>
        )}
        {tokenMode === "code" ? (
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
