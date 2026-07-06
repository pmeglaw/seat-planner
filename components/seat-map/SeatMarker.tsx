"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";
import type { SeatWithEmployee } from "@/lib/types";
import { pointToStyle } from "@/lib/seatMath";

type SeatMarkerProps = {
  seat: SeatWithEmployee;
  selected: boolean;
  dimmed: boolean;
  canEdit: boolean;
  showNames: boolean;
  searchResult: boolean;
  draftChanged?: boolean;
  compactNameLabel: boolean;
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
  if (!firstName) return name.trim().toUpperCase();

  const compactName = firstName.length <= 4 && lastInitial ? `${firstName} ${lastInitial}.` : firstName;
  return compactName.toUpperCase();
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
  onSelect,
  onMovePointerDown
}: SeatMarkerProps) {
  const adminMarker = variant === "admin";
  const employeeName = seat.employee?.full_name ?? "";
  const hasEmployee = Boolean(seat.employee);
  const displayName = employeeName || "Open seat";
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
  const inlineNameLabel = expandedNameBadge || (namesVisible && tokenDensity === "standard" && !compactNameLabel) ? employeeName : compactEmployeeName;
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
        ? "border-[#B7AB9E]/85 bg-[#FFFDF8]/95 text-[#14171A]"
        : seat.status === "reserved"
          ? "border-[#A26E23]/60 bg-[#F2E4C8]/95 text-[#67430F]"
          : seat.status === "unavailable"
            ? "border-[#C8BFB3]/90 bg-[#E8E2DA]/[0.92] text-[#655E56]"
            : "border-[#D4CABF]/90 bg-[#F9F5ED]/[0.86] text-[#575048]";
  // Search/planner emphasis keeps visual priority over the passive valid-target tint.
  const validTargetTone = swapCandidate && !searchProminent && !plannerHighlighted;
  const statusToneClass = (tokenMode === "selected" || tokenMode === "prominent" || moveOrigin || validTargetTone || invalidTarget) ? "" : baseStatusToneClass;

  const statusAccentClass =
    adminMarker
      ? invalidTarget
        ? "bg-[var(--admin-marker-target-invalid-accent)]"
        : draftChanged && !selected && !searchProminent
        ? "bg-[var(--admin-marker-draft-accent)]"
        : seat.status === "assigned"
        ? "bg-[var(--admin-marker-assigned-accent)]"
        : seat.status === "reserved"
          ? "bg-[var(--admin-marker-reserved-accent)]"
          : seat.status === "unavailable"
            ? "bg-[var(--admin-marker-unavailable-accent)]"
            : "bg-[var(--admin-marker-available-accent)]"
      : draftChanged && !selected && !searchProminent
        ? "bg-[#A26E23]"
        : seat.status === "assigned"
        ? "bg-[#3F6F59]/85"
        : seat.status === "reserved"
          ? "bg-[#9A6418]/80"
          : seat.status === "unavailable"
            ? "bg-[#8E8276]/70"
            : "bg-[#B8AEA2]/58";

  const tokenSizeClass =
    tokenMode === "selected"
      ? expandedNameBadge
        ? "min-h-[42px] w-[126px] max-w-[126px] rounded-[14px] px-3 py-1.5 pl-4 text-left"
        : "h-[32px] min-h-[32px] min-w-[48px] rounded-[11px] px-3 pl-3.5 text-center"
      : tokenMode === "prominent"
        ? expandedNameBadge
          ? "min-h-[39px] w-[118px] max-w-[118px] rounded-[13px] px-3 py-1.5 pl-4 text-left"
          : "h-[30px] min-h-[30px] min-w-[46px] rounded-[11px] px-3 pl-3.5 text-center"
        : tokenMode === "name"
          ? [
            "min-h-[34px] rounded-[12px] px-2.5 py-1.5 pl-3.5 text-left",
            tokenDensity === "standard" ? "w-[92px] max-w-[92px] sm:w-[104px] sm:max-w-[104px]" : "w-[78px] max-w-[78px] sm:w-[86px] sm:max-w-[86px]",
            "group-hover:w-[124px] group-hover:max-w-[124px] group-focus-visible:w-[124px] group-focus-visible:max-w-[124px]"
          ].filter(Boolean).join(" ")
          : [
            "h-[24px] min-h-[24px] min-w-[34px] rounded-[9px] px-2 py-0 pl-2.5 text-center",
            hasHoverDisclosure ? "group-hover:min-w-[96px] group-hover:rounded-[12px] group-hover:px-2.5 group-hover:pl-3.5 group-hover:text-left group-focus-visible:min-w-[96px] group-focus-visible:rounded-[12px] group-focus-visible:px-2.5 group-focus-visible:pl-3.5 group-focus-visible:text-left" : ""
          ].filter(Boolean).join(" ");

  const tokenStateClass = [
    tokenMode === "code" || tokenMode === "name"
      ? "shadow-[0_2px_5px_rgba(23,26,29,0.13),inset_0_1px_0_rgba(255,255,255,0.82)]"
      : "",
    draftChanged && !selected && !searchProminent
      ? adminMarker
        ? "border-[var(--admin-marker-draft-border)] bg-[var(--admin-marker-draft-surface)] text-[var(--admin-marker-draft-text)] ring-1 ring-[var(--admin-marker-draft-border)] shadow-[0_4px_12px_rgba(212,154,6,0.16),inset_0_1px_0_rgba(255,255,255,0.8)]"
        : "border-[#A26E23]/70 bg-[#F4E7CF]/95 text-[#613D0E] ring-1 ring-[#C49349]/55 shadow-[0_4px_12px_rgba(162,110,35,0.16),inset_0_1px_0_rgba(255,255,255,0.8)]"
      : "",
    searchSelected
      ? adminMarker
        ? "border-[var(--admin-marker-selected-border)] bg-[var(--admin-marker-selected-surface)] text-[var(--admin-marker-selected-text)] ring-2 ring-[var(--admin-marker-selected-border)] outline outline-2 outline-offset-2 outline-[var(--admin-marker-search-border)] shadow-[0_12px_28px_rgba(16,17,20,0.34),0_0_0_5px_var(--admin-marker-search-halo),inset_0_1px_0_rgba(255,255,255,0.14)]"
        : "border-[#D46A24] bg-[#15181B] text-white ring-2 ring-[#D46A24]/90 outline outline-2 outline-offset-2 outline-[#2F6668]/75 shadow-[0_12px_28px_rgba(23,26,29,0.34),0_0_0_5px_rgba(169,207,204,0.32),inset_0_1px_0_rgba(255,255,255,0.14)]"
      : "",
    tokenMode === "selected"
      ? searchSelected || moveOrigin
        ? ""
        : adminMarker
          ? "border-[var(--admin-marker-selected-border)] bg-[var(--admin-marker-selected-surface)] text-[var(--admin-marker-selected-text)] ring-2 ring-[var(--admin-marker-selected-border)] shadow-[var(--admin-marker-selected-shadow)]"
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
        : "border-[#3F6F59] bg-[#DDE9DF] text-[#284C3B]"
      : "",
    invalidTarget
      ? adminMarker
        ? "border-[var(--admin-marker-target-invalid-border)] bg-[var(--admin-marker-target-invalid-surface)] text-[var(--admin-marker-target-invalid-text)]"
        : "border-[#963D2F] bg-[#F3DAD2] text-[#7E2F24]"
      : "",
    searchProminent && !selected
      ? adminMarker
        ? "border-[var(--admin-marker-search-border)] bg-[var(--admin-marker-search-surface)] text-[var(--admin-marker-search-text)] ring-2 ring-[var(--admin-marker-search-ring)] shadow-[0_8px_18px_rgba(22,83,89,0.20),inset_0_1px_0_rgba(255,255,255,0.78)]"
        : "border-[#2F6668] bg-[#DCEDEA] text-[#1F4749] ring-2 ring-[#A9CFCC] shadow-[0_8px_18px_rgba(47,102,104,0.22),inset_0_1px_0_rgba(255,255,255,0.78)]"
      : "",
    highlighted && selected ? adminMarker ? "outline outline-2 outline-offset-2 outline-[var(--admin-marker-search-ring)]" : "outline outline-2 outline-offset-2 outline-[#A9CFCC]" : "",
    swapSource ? adminMarker ? "border-[var(--admin-marker-search-border)] bg-[var(--admin-marker-search-surface)] text-[var(--admin-marker-search-text)] ring-4 ring-[var(--admin-marker-search-ring)]" : "border-[#3E6F72] bg-[#DCEDEA] text-[#244E50] ring-4 ring-[#A9CFCC]/80" : "",
    swapTarget ? adminMarker ? "border-[var(--admin-marker-search-border)] bg-[var(--admin-marker-search-surface)] text-[var(--admin-marker-search-text)] ring-4 ring-[var(--admin-marker-search-ring)]" : "border-[#6E655A] bg-[#F1ECE4] text-[#353532] ring-4 ring-[#D8D0C5]/85" : "",
    plannerHighlighted ? adminMarker ? "border-[var(--admin-marker-available-border)] bg-[var(--admin-marker-available-surface)] text-[var(--admin-marker-available-text)] ring-2 ring-[var(--admin-border)] shadow-[0_6px_14px_rgba(140,102,69,0.18),inset_0_1px_0_rgba(255,255,255,0.72)]" : "border-[#6E655A] bg-[#EFE9DF] text-[#353532] ring-2 ring-[#D8D0C5] shadow-[0_6px_14px_rgba(110,101,90,0.23),inset_0_1px_0_rgba(255,255,255,0.72)]" : "",
    swapMode && !swapSource ? adminMarker ? "group-hover:ring-4 group-hover:ring-[var(--admin-marker-search-ring)]" : "group-hover:ring-4 group-hover:ring-[#A9CFCC]/80" : ""
  ].join(" ");
  const markerFocusClass = adminMarker
    ? "focus-visible:z-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--admin-marker-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-marker-focus-offset)]"
    : "focus-visible:z-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#D46A24]/75 focus-visible:ring-offset-2 focus-visible:ring-offset-white/70";
  // Teal hover is a transient cue: it must never repaint a committed (selected) seat's
  // orange ring, so the hover border applies only to unselected markers.
  const tokenInteractionClass = adminMarker
    ? `transition-[width,min-width,filter,box-shadow,border-color,background-color,opacity] duration-150 ease-out ${selected ? "" : "group-hover:border-[var(--admin-marker-hover-border)] "}group-hover:brightness-105 group-hover:shadow-[var(--admin-marker-hover-shadow)] group-active:shadow-[0_2px_6px_rgba(16,17,20,0.16),inset_0_2px_4px_rgba(16,17,20,0.08)] group-focus-visible:ring-4 group-focus-visible:ring-[var(--admin-marker-focus-ring)] motion-reduce:transition-none`
    : "transition-[width,min-width,filter,box-shadow,border-color,background-color,opacity] duration-150 ease-out group-hover:border-[#D46A24] group-hover:brightness-105 group-hover:shadow-[0_6px_14px_rgba(23,26,29,0.20),inset_0_1px_0_rgba(255,255,255,0.82)] group-active:shadow-[0_2px_6px_rgba(23,26,29,0.16),inset_0_2px_4px_rgba(23,26,29,0.08)] group-focus-visible:ring-4 group-focus-visible:ring-[#D46A24]/75 motion-reduce:transition-none";
  const draftBadgeClass = adminMarker
    ? "bg-[var(--admin-marker-draft-accent)] shadow-[0_2px_5px_rgba(16,17,20,0.24)]"
    : "bg-[#A26E23] shadow-[0_2px_5px_rgba(23,26,29,0.24)]";

  const hitTargetSizeClass = tokenMode === "selected" ? "h-10 w-10" : tokenMode === "prominent" ? "h-9 w-9" : "h-8 w-8";
  const codeTextClass = tokenMode === "selected" || tokenMode === "prominent" ? "text-[10px]" : "text-[9.5px]";
  const markerUsesTrueCoordinate = addSeatMode || moveSeatMode || swapMode;
  const tokenCanHugViewportEdge = showInlineName || prominentToken;
  const resolvedViewportEdge = markerUsesTrueCoordinate || !tokenCanHugViewportEdge ? "none" : viewportEdge;
  const resolvedViewportEdgeOffsetPx = markerUsesTrueCoordinate || !tokenCanHugViewportEdge ? 0 : Math.max(0, Math.round(viewportEdgeOffsetPx));
  const tokenPositionClass =
    resolvedViewportEdge === "left"
      ? "absolute top-1/2 translate-x-0 -translate-y-1/2"
      : resolvedViewportEdge === "right"
        ? "absolute top-1/2 translate-x-0 -translate-y-1/2"
        : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";
  const tokenPositionStyle: CSSProperties | undefined =
    resolvedViewportEdge === "left"
      ? { left: `calc(50% + ${resolvedViewportEdgeOffsetPx}px)` }
      : resolvedViewportEdge === "right"
        ? { right: `calc(50% + ${resolvedViewportEdgeOffsetPx}px)` }
        : undefined;
  const nameTextClass =
    tokenMode === "selected"
      ? "max-w-[94px] text-[10px]"
      : tokenMode === "prominent"
        ? "max-w-[86px] text-[10px]"
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
      data-seat-id={seat.id}
      data-marker-intent={markerIntent}
      data-draft-changed={draftChanged || undefined}
      data-movable={isMovable}
      aria-pressed={selected}
      title={`${seat.label} · ${displayName} · ${seat.status}`}
      className={[
        "group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 touch-manipulation select-none items-center justify-center overflow-visible rounded-full border-0 bg-transparent p-0 font-extrabold leading-none text-slate-900",
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
      aria-label={`${seat.label}: ${displayName}. ${seat.status} seat.${draftChanged ? " Draft changed." : ""}${searchProminent ? " Search result." : ""}${highlighted ? ` ${highlightedDescription}.` : ""}${moveOrigin ? " Move origin. Drag to reposition." : ""}${swapSource ? " Swap source." : ""}${swapTarget ? " Swap target." : ""}${swapCandidate ? " Valid swap target." : ""}${invalidTarget ? " Not a valid target." : ""}${selected ? " Selected." : " Open details."}`}
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
        <span className={["pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 w-0.5 rounded-full", statusAccentClass].join(" ")} aria-hidden="true" />
        {draftChanged && !selected && !searchProminent && (
          <span className={["pointer-events-none absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full border border-white/85 text-[8px] font-black leading-none text-white", draftBadgeClass].join(" ")} aria-hidden="true">
            D
          </span>
        )}
        {tokenMode === "code" ? (
          <span className="relative z-10 flex min-w-0 items-center justify-center gap-1 group-hover:justify-start group-focus-visible:justify-start">
            <span className="whitespace-nowrap text-[9.5px] font-extrabold leading-[1.05]">{seat.label}</span>
            {employeeName && (
              <span className="hidden max-w-[64px] truncate text-[9px] font-bold leading-[1.05] opacity-90 group-hover:block group-focus-visible:block">
                {compactEmployeeName}
              </span>
            )}
          </span>
        ) : (
          <span className="relative z-10 flex w-full min-w-0 flex-col items-start text-left">
            <span className={["whitespace-nowrap font-extrabold leading-[1.05]", codeTextClass].join(" ")}>{seat.label}</span>
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
