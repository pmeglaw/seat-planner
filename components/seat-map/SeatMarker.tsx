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
  compactNameLabel: boolean;
  moveSeatMode: boolean;
  swapMode: boolean;
  swapSource: boolean;
  swapTarget: boolean;
  highlighted: boolean;
  highlightedDescription?: string;
  dragging: boolean;
  addSeatMode: boolean;
  viewportEdge: "left" | "right" | "none";
  viewportEdgeOffsetPx: number;
  onSelect: (seatId: string) => void;
  onMovePointerDown: (event: PointerEvent<HTMLButtonElement>, seatId: string) => void;
};

type TokenDensity = "compact" | "standard";
type TokenMode = "code" | "name" | "prominent" | "selected";

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
  compactNameLabel,
  moveSeatMode,
  swapMode,
  swapSource,
  swapTarget,
  highlighted,
  highlightedDescription = "Highlighted by Ask Planner",
  dragging,
  addSeatMode,
  viewportEdge,
  viewportEdgeOffsetPx,
  onSelect,
  onMovePointerDown
}: SeatMarkerProps) {
  const employeeName = seat.employee?.full_name ?? "";
  const hasEmployee = Boolean(seat.employee);
  const displayName = employeeName || "Open seat";
  const namesVisible = showNames && hasEmployee && !dimmed && !compactNameLabel;
  const isMovable = canEdit && selected && moveSeatMode;
  const activeMarker = selected || dragging || swapSource || swapTarget;
  const searchProminent = searchResult && !dimmed;
  const plannerHighlighted = highlighted && !selected && !swapSource && !swapTarget;
  const tokenDensity = getSeatTokenDensity(seat, compactNameLabel);
  const compactEmployeeName = getPassiveEmployeeLabel(employeeName);
  const showInlineName = Boolean(employeeName) && (namesVisible || activeMarker || searchProminent || plannerHighlighted);
  const prominentToken = activeMarker || searchProminent || plannerHighlighted;
  const tokenMode: TokenMode = selected ? "selected" : prominentToken ? "prominent" : showInlineName ? "name" : "code";
  const hasHoverDisclosure = hasEmployee && !showInlineName;
  const expandedNameBadge = hasEmployee && (tokenMode === "selected" || tokenMode === "prominent");
  const inlineNameLabel = expandedNameBadge ? employeeName : compactEmployeeName;

  const baseStatusToneClass =
    seat.status === "assigned"
      ? "border-[#8E8276]/45 bg-[#FFFDF8]/95 text-[#070A0D]"
      : seat.status === "reserved"
        ? "border-[#9A6418]/45 bg-[#F1E2C4]/95 text-[#6D4712]"
        : seat.status === "unavailable"
          ? "border-[#C9C0B4] bg-[#E7E1D8]/90 text-[#696159]"
          : "border-[#BEB4A8]/70 bg-white/80 text-[#353532]";
  const statusToneClass = (tokenMode === "selected" || tokenMode === "prominent") ? "" : baseStatusToneClass;

  const statusAccentClass =
    seat.status === "assigned"
      ? "bg-[#3F6F59]/85"
      : seat.status === "reserved"
        ? "bg-[#9A6418]/80"
        : seat.status === "unavailable"
          ? "bg-[#8E8276]/70"
          : "bg-[#B8AEA2]/60";

  const tokenSizeClass =
    tokenMode === "selected"
      ? expandedNameBadge
        ? "min-h-[38px] w-[112px] max-w-[112px] rounded-[12px] px-2.5 py-1.5 pl-3.5 text-left"
        : "h-[29px] min-h-[29px] min-w-[44px] rounded-[10px] px-2.5 pl-3 text-center"
      : tokenMode === "prominent"
        ? expandedNameBadge
          ? "min-h-[36px] w-[104px] max-w-[104px] rounded-[12px] px-2.5 py-1.5 pl-3.5 text-left"
          : "h-[28px] min-h-[28px] min-w-[44px] rounded-[10px] px-2.5 pl-3 text-center"
        : tokenMode === "name"
          ? [
            "min-h-[34px] rounded-[11px] px-2 py-1.5 pl-3 text-left",
            tokenDensity === "standard" ? "w-[82px] max-w-[82px] sm:w-[94px] sm:max-w-[94px]" : "w-[72px] max-w-[72px] sm:w-[78px] sm:max-w-[78px]",
            "group-hover:w-[112px] group-hover:max-w-[112px] group-focus-visible:w-[112px] group-focus-visible:max-w-[112px]"
          ].filter(Boolean).join(" ")
          : [
            "h-[22px] min-h-[22px] min-w-[31px] rounded-[8px] px-1.5 py-0 pl-2.5 text-center",
            hasHoverDisclosure ? "group-hover:min-w-[92px] group-hover:rounded-[11px] group-hover:px-2 group-hover:pl-3 group-hover:text-left group-focus-visible:min-w-[92px] group-focus-visible:rounded-[11px] group-focus-visible:px-2 group-focus-visible:pl-3 group-focus-visible:text-left" : ""
          ].filter(Boolean).join(" ");

  const tokenStateClass = [
    tokenMode === "code" || tokenMode === "name"
      ? "shadow-[0_1px_3px_rgba(15,23,42,0.11),inset_0_1px_0_rgba(255,255,255,0.72)]"
      : "",
    tokenMode === "selected"
      ? "border-[#D46A24] bg-[#171A1D] text-white ring-2 ring-[#D46A24]/90 shadow-[0_8px_20px_rgba(31,35,39,0.28),inset_0_1px_0_rgba(255,255,255,0.16)]"
      : "",
    searchProminent && !selected
      ? "border-[#2F6668] bg-[#DCEDEA] text-[#1F4749] ring-2 ring-[#A9CFCC] shadow-[0_6px_16px_rgba(47,102,104,0.20),inset_0_1px_0_rgba(255,255,255,0.76)]"
      : "",
    highlighted && selected ? "outline outline-2 outline-offset-2 outline-[#A9CFCC]" : "",
    swapSource ? "border-[#3E6F72] bg-[#DCEDEA] text-[#244E50] ring-4 ring-[#A9CFCC]/80" : "",
    swapTarget ? "border-[#6E655A] bg-[#F1ECE4] text-[#353532] ring-4 ring-[#D8D0C5]/85" : "",
    plannerHighlighted ? "border-[#6E655A] bg-[#EFE9DF] text-[#353532] ring-2 ring-[#D8D0C5] shadow-[0_4px_12px_rgba(110,101,90,0.22),inset_0_1px_0_rgba(255,255,255,0.7)]" : "",
    swapMode && !swapSource ? "group-hover:ring-4 group-hover:ring-[#A9CFCC]/80" : ""
  ].join(" ");

  const hitTargetSizeClass = tokenMode === "selected" ? "h-9 w-9" : tokenMode === "prominent" ? "h-8 w-8" : "h-7 w-7";
  const codeTextClass = tokenMode === "selected" || tokenMode === "prominent" ? "text-[10px]" : "text-[9px]";
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
      ? "max-w-[84px] text-[10px]"
      : tokenMode === "prominent"
        ? "max-w-[76px] text-[10px]"
        : tokenDensity === "standard"
          ? "max-w-[66px] text-[9px] group-hover:max-w-[84px] group-hover:text-[10px] group-focus-visible:max-w-[84px] group-focus-visible:text-[10px]"
          : "max-w-[54px] text-[9px] group-hover:max-w-[84px] group-hover:text-[10px] group-focus-visible:max-w-[84px] group-focus-visible:text-[10px]";

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
      data-movable={isMovable}
      aria-pressed={selected}
      title={`${seat.label} · ${displayName} · ${seat.status}`}
      className={[
        "group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 touch-manipulation select-none items-center justify-center overflow-visible rounded-full border-0 bg-transparent p-0 font-black leading-none text-slate-900",
        "transition-[transform,opacity,filter] duration-150 ease-out hover:z-30 active:scale-[0.96] active:duration-75 motion-reduce:transition-none",
        "focus-visible:z-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#D46A24]/70",
        hitTargetSizeClass,
        selected ? "z-40 focus-visible:z-40" : "",
        prominentToken ? "z-30" : "",
        dimmed ? "opacity-45 saturate-50" : "",
        isMovable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging ? "z-40 scale-[1.06] shadow-[0_18px_36px_rgba(31,35,39,0.24)]" : ""
      ].join(" ")}
      style={pointToStyle({ x: seat.x, y: seat.y })}
      aria-label={`${seat.label}: ${displayName}. ${seat.status} seat.${searchProminent ? " Search result." : ""}${highlighted ? ` ${highlightedDescription}.` : ""}${selected ? " Selected." : " Open details."}`}
    >
      <SeatToken
        style={tokenPositionStyle}
        className={[
          "z-10 isolate flex items-center justify-center overflow-visible border ring-1 ring-white/35",
          "transition-[width,min-width,filter,box-shadow,border-color,background-color,opacity] duration-150 ease-out group-hover:border-[#D46A24] group-hover:brightness-105 group-hover:shadow-[0_4px_10px_rgba(23,26,29,0.18),inset_0_1px_0_rgba(255,255,255,0.8)] group-active:shadow-[0_2px_6px_rgba(23,26,29,0.16),inset_0_2px_4px_rgba(23,26,29,0.08)] group-focus-visible:ring-4 group-focus-visible:ring-[#D46A24]/75 motion-reduce:transition-none",
          tokenPositionClass,
          statusToneClass,
          tokenSizeClass,
          tokenStateClass
        ].join(" ")}
      >
        <span className={["pointer-events-none absolute bottom-1.5 left-1 top-1.5 w-0.5 rounded-full", statusAccentClass].join(" ")} aria-hidden="true" />
        {tokenMode === "code" ? (
          <span className="relative z-10 flex min-w-0 items-center justify-center gap-1 group-hover:justify-start group-focus-visible:justify-start">
            <span className="whitespace-nowrap text-[9px] font-black leading-[1.05]">{seat.label}</span>
            {employeeName && (
              <span className="hidden max-w-[64px] truncate text-[9px] font-bold leading-[1.05] opacity-90 group-hover:block group-focus-visible:block">
                {compactEmployeeName}
              </span>
            )}
          </span>
        ) : (
          <span className="relative z-10 flex w-full min-w-0 flex-col items-start text-left">
            <span className={["whitespace-nowrap font-black leading-[1.05]", codeTextClass].join(" ")}>{seat.label}</span>
            {showInlineName && (
              <span className={["truncate font-bold leading-[1.08] opacity-95", nameTextClass].join(" ")}>
                {inlineNameLabel}
              </span>
            )}
          </span>
        )}
      </SeatToken>
    </button>
  );
}
