"use client";

import type { PointerEvent } from "react";
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
  dragging: boolean;
  onSelect: (seatId: string) => void;
  onMovePointerDown: (event: PointerEvent<HTMLButtonElement>, seatId: string) => void;
};

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
  dragging,
  onSelect,
  onMovePointerDown
}: SeatMarkerProps) {
  const employeeName = seat.employee?.full_name ?? "";
  const hasEmployee = Boolean(seat.employee);
  const displayName = employeeName || "Open seat";
  const namesVisible = showNames && hasEmployee && !dimmed;
  const isMovable = canEdit && selected && moveSeatMode;
  const activeMarker = selected || dragging || swapSource || swapTarget;
  const searchProminent = searchResult && !dimmed;
  const plannerHighlighted = highlighted && !selected && !swapSource && !swapTarget;
  const prominentName = activeMarker || (searchProminent && hasEmployee) || plannerHighlighted;
  const nameTextVisible = Boolean(employeeName) && (namesVisible || activeMarker);
  const compactEmployeeName = getPassiveEmployeeLabel(employeeName);
  const labelMode = nameTextVisible
    ? prominentName
      ? "prominent"
      : compactNameLabel
        ? "compact"
        : "passive"
    : "hidden";
  const showChip = nameTextVisible || activeMarker;

  const statusAccentClass =
    seat.status === "assigned"
      ? "border-emerald-300/70"
      : seat.status === "reserved"
        ? "border-amber-300/80"
        : seat.status === "unavailable"
          ? "border-slate-300/90"
          : "border-slate-300/80";

  const statusDotClass =
    seat.status === "assigned"
      ? "bg-emerald-500 ring-emerald-100/90"
      : seat.status === "reserved"
        ? "bg-amber-500 ring-amber-100/90"
        : seat.status === "unavailable"
          ? "bg-slate-400 ring-slate-100/90"
          : "bg-white ring-slate-300";

  const markerSizeClass = showChip
    ? labelMode === "prominent"
      ? "min-h-[42px] w-[148px] max-w-[148px] rounded-xl px-3 py-1.5 text-left sm:w-[156px] sm:max-w-[156px]"
      : labelMode === "compact"
        ? "min-h-[32px] w-[88px] max-w-[88px] rounded-lg px-2 py-1.5 text-left hover:w-[124px] hover:max-w-[124px] focus-visible:w-[124px] focus-visible:max-w-[124px] lg:min-h-[34px] lg:hover:w-[128px] lg:hover:max-w-[128px] lg:focus-visible:w-[128px] lg:focus-visible:max-w-[128px]"
        : labelMode === "passive"
          ? "min-h-[34px] w-[96px] max-w-[96px] rounded-xl px-2.5 py-1.5 text-left hover:w-[136px] hover:max-w-[136px] focus-visible:w-[136px] focus-visible:max-w-[136px] lg:hover:w-[136px] lg:hover:max-w-[136px] lg:focus-visible:w-[136px] lg:focus-visible:max-w-[136px]"
          : "h-[30px] min-h-[30px] min-w-[38px] rounded-full px-2 py-0 text-center"
    : "h-[28px] min-h-[28px] min-w-[36px] rounded-full px-2 py-0 text-center text-[10px] hover:min-w-[102px] hover:rounded-xl hover:px-2.5 hover:text-left focus-visible:min-w-[102px] focus-visible:rounded-xl focus-visible:px-2.5 focus-visible:text-left";

  const passiveLabelClass =
    labelMode === "compact"
      ? "border-slate-200/75 bg-white/70 text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.92)]"
      : labelMode === "passive"
        ? "border-slate-200/80 bg-white/75 text-slate-800 shadow-[0_9px_20px_rgba(15,23,42,0.13),inset_0_1px_0_rgba(255,255,255,0.94)]"
        : "";

  const dotSizeClass = labelMode === "prominent" ? "h-2.5 w-2.5 ring-4" : "h-2 w-2 ring-2";
  const codeTextClass = labelMode === "prominent" ? "text-[10px]" : "text-[9px] lg:text-[10px]";
  const chipGapClass = labelMode === "prominent" ? "gap-2" : "gap-1.5";
  const nameTextClass =
    labelMode === "prominent"
      ? "max-w-[106px] text-[10px] sm:max-w-[114px] sm:text-[11px]"
      : labelMode === "compact"
        ? "max-w-[58px] text-[9px] group-hover:max-w-[94px] group-hover:text-[10px] group-focus-visible:max-w-[94px] group-focus-visible:text-[10px] lg:text-[10px] lg:group-hover:max-w-[96px] lg:group-focus-visible:max-w-[96px]"
        : "max-w-[62px] text-[10px] group-hover:max-w-[102px] group-focus-visible:max-w-[102px] lg:group-hover:max-w-[102px] lg:group-focus-visible:max-w-[102px]";
  const fullNameRevealClass =
    labelMode === "compact"
      ? "hidden max-w-[94px] truncate text-[10px] font-bold leading-tight opacity-95 group-hover:block group-focus-visible:block lg:max-w-[96px]"
      : "hidden max-w-[102px] truncate text-[10px] font-bold leading-tight opacity-95 group-hover:block group-focus-visible:block";

  return (
    <button
      type="button"
      onClick={() => onSelect(seat.id)}
      onPointerDown={event => {
        if (!isMovable) return;
        onMovePointerDown(event, seat.id);
      }}
      data-seat-id={seat.id}
      data-movable={isMovable}
      aria-pressed={selected}
      title={`${seat.label} · ${displayName} · ${seat.status}`}
      className={[
        "group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 touch-manipulation select-none items-center justify-center overflow-visible border",
        "bg-white/70 text-slate-900 backdrop-blur-md supports-[backdrop-filter]:bg-white/60",
        "font-black leading-none shadow-[0_10px_24px_rgba(15,23,42,0.18),0_2px_6px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.96),inset_0_-1px_0_rgba(255,255,255,0.35)]",
        "transition-[width,min-width,transform,box-shadow,border-color,background-color,opacity,filter] duration-150 ease-out hover:z-30 hover:scale-[1.04] hover:border-orange-200 hover:bg-white/80 hover:shadow-[0_16px_34px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.98)] motion-reduce:transition-none",
        "focus-visible:z-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300/70",
        statusAccentClass,
        markerSizeClass,
        passiveLabelClass,
        prominentName || searchProminent ? "z-30" : "",
        selected ? "border-orange-300 bg-white/90 text-orange-950 ring-4 ring-orange-200/70 shadow-[0_18px_38px_rgba(194,65,12,0.25),inset_0_1px_0_rgba(255,255,255,0.98)]" : "",
        searchProminent && !selected ? "border-orange-300 bg-orange-50/90 text-orange-950 ring-2 ring-orange-200/80 shadow-[0_14px_30px_rgba(194,65,12,0.18),inset_0_1px_0_rgba(255,255,255,0.98)]" : "",
        highlighted && selected ? "outline outline-2 outline-offset-2 outline-cyan-300/90" : "",
        swapSource ? "border-sky-300 bg-sky-50/85 text-sky-950 ring-4 ring-sky-200/70" : "",
        swapTarget ? "border-emerald-300 bg-emerald-50/85 text-emerald-950 ring-4 ring-emerald-200/70" : "",
        plannerHighlighted ? "border-cyan-400 bg-cyan-50/90 text-cyan-950 ring-2 ring-cyan-300/80 shadow-[0_12px_28px_rgba(8,145,178,0.24),inset_0_1px_0_rgba(255,255,255,0.98)]" : "",
        swapMode && !swapSource ? "hover:ring-4 hover:ring-sky-200/70" : "",
        dimmed ? "opacity-45 saturate-50" : "",
        isMovable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging ? "z-40 scale-[1.06] shadow-[0_22px_44px_rgba(31,35,39,0.28)]" : ""
      ].join(" ")}
      style={pointToStyle({ x: seat.x, y: seat.y })}
      aria-label={`${seat.label}: ${displayName}. ${seat.status} seat.${searchProminent ? " Search result." : ""}${highlighted ? " Highlighted by Ask Planner." : ""}${selected ? " Selected." : " Open details."}`}
    >
      {showChip ? (
        <span className={["pointer-events-none flex w-full min-w-0 items-center", chipGapClass].join(" ")}>
          <span className={[dotSizeClass, "flex-none rounded-full border border-white/80", statusDotClass].join(" ")} />
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className={["whitespace-nowrap font-black leading-tight", codeTextClass].join(" ")}>{seat.label}</span>
            {nameTextVisible && (
              prominentName ? (
                <span className={["truncate font-bold leading-tight opacity-95", nameTextClass].join(" ")}>
                  {employeeName}
                </span>
              ) : (
                <>
                  <span className={["truncate font-bold leading-tight opacity-95 group-hover:hidden group-focus-visible:hidden", nameTextClass].join(" ")}>
                    {compactEmployeeName}
                  </span>
                  <span className={fullNameRevealClass}>
                    {employeeName}
                  </span>
                </>
              )
            )}
          </span>
        </span>
      ) : (
        <span className="pointer-events-none flex w-full min-w-0 items-center justify-center gap-2 group-hover:justify-start group-focus-visible:justify-start">
          <span className={["absolute bottom-[-1px] right-[-1px] h-2.5 w-2.5 rounded-full border border-white/90 ring-2 group-hover:static group-focus-visible:static", statusDotClass].join(" ")} />
          <span className="whitespace-nowrap text-[10px] font-black">{seat.label}</span>
          {employeeName && (
            <span className="hidden max-w-[64px] truncate text-[9px] font-bold opacity-90 group-hover:block group-focus-visible:block">
              {employeeName}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
