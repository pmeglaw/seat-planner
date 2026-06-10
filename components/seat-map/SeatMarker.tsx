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
  addSeatMode: boolean;
  onSelect: (seatId: string) => void;
  onMovePointerDown: (event: PointerEvent<HTMLButtonElement>, seatId: string) => void;
};

type LabelPlacement = "above" | "aboveCompact" | "right" | "aboveRight" | "left" | "aboveLeft";

const LABEL_PLACEMENT_CLASSES: Record<LabelPlacement, { chip: string; connector: string }> = {
  above: {
    chip: "bottom-[14px] left-1/2 -translate-x-1/2",
    connector: "bottom-[7px] left-0 h-[7px] w-px -translate-x-1/2"
  },
  aboveCompact: {
    chip: "bottom-[12px] left-1/2 -translate-x-1/2",
    connector: "bottom-[6px] left-0 h-[6px] w-px -translate-x-1/2"
  },
  right: {
    chip: "left-[14px] top-1/2 -translate-y-1/2",
    connector: "left-[7px] top-0 h-px w-[7px] -translate-y-1/2"
  },
  aboveRight: {
    chip: "bottom-[10px] left-[10px]",
    connector: "bottom-[5px] left-[5px] h-[6px] w-px -rotate-45"
  },
  left: {
    chip: "right-[14px] top-1/2 -translate-y-1/2",
    connector: "right-[7px] top-0 h-px w-[7px] -translate-y-1/2"
  },
  aboveLeft: {
    chip: "bottom-[10px] right-[10px]",
    connector: "bottom-[5px] right-[5px] h-[6px] w-px rotate-45"
  }
};

function getSeatLabelPrefix(label: string) {
  return label.trim().toUpperCase().match(/^[A-Z]+/)?.[0] ?? "";
}

export function getSeatLabelPlacement(seat: Pick<SeatWithEmployee, "label" | "x" | "y" | "zone" | "department">, compactNameLabel = false): LabelPlacement {
  const prefix = getSeatLabelPrefix(seat.label);
  const zone = (seat.zone ?? seat.department ?? "").trim().toLowerCase();
  const westPod = prefix === "W" || zone === "west pod";
  const southeastOffice = prefix === "SE" || zone === "southeast office";
  const denseAboveDot = compactNameLabel || prefix === "N" || prefix === "NE" || prefix === "CW" || prefix === "C";

  if (westPod) return seat.y >= 0.56 || seat.x <= 0.11 ? "aboveRight" : "right";
  if (southeastOffice) {
    if (seat.label.trim().toUpperCase() === "SE01") return "left";
    return seat.y >= 0.6 || seat.x >= 0.85 ? "aboveLeft" : "left";
  }
  if (denseAboveDot) return "aboveCompact";

  return "above";
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
  dragging,
  addSeatMode,
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
  const labelPlacement = getSeatLabelPlacement(seat, compactNameLabel);
  const compactCallout = compactNameLabel || labelPlacement === "aboveCompact";
  const placementClasses = LABEL_PLACEMENT_CLASSES[labelPlacement];
  const nameTextVisible = Boolean(employeeName) && (namesVisible || activeMarker);
  const compactEmployeeName = getPassiveEmployeeLabel(employeeName);
  const labelMode = nameTextVisible
    ? prominentName
      ? "prominent"
      : compactCallout
        ? "compact"
        : "passive"
    : "hidden";
  const expandedChip = nameTextVisible || activeMarker;

  const statusAccentClass =
    seat.status === "assigned"
      ? "border-emerald-300/55"
      : seat.status === "reserved"
        ? "border-amber-300/65"
        : seat.status === "unavailable"
          ? "border-slate-300/70"
          : "border-slate-300/60";

  const statusDotClass =
    seat.status === "assigned"
      ? "bg-emerald-500 ring-emerald-100/90"
      : seat.status === "reserved"
        ? "bg-amber-500 ring-amber-100/90"
        : seat.status === "unavailable"
          ? "bg-slate-400 ring-slate-100/90"
          : "bg-white ring-slate-300";

  const chipSizeClass = expandedChip
    ? selected
      ? "min-h-[46px] w-[140px] max-w-[140px] rounded-2xl px-2.5 py-1.5 text-left"
      : labelMode === "prominent"
      ? "min-h-[38px] w-[142px] max-w-[142px] rounded-xl px-2.5 py-1.5 text-left"
      : labelMode === "compact"
        ? "min-h-[28px] w-[64px] max-w-[64px] rounded-md px-2 py-1 text-left group-hover:w-[126px] group-hover:max-w-[126px] group-focus-visible:w-[126px] group-focus-visible:max-w-[126px]"
        : labelMode === "passive"
          ? "min-h-[28px] w-[86px] max-w-[86px] rounded-lg px-2 py-1 text-left group-hover:w-[124px] group-hover:max-w-[124px] group-focus-visible:w-[124px] group-focus-visible:max-w-[124px]"
          : "h-[24px] min-h-[24px] min-w-[32px] rounded-md px-1.5 py-0 text-center"
    : "h-[22px] min-h-[22px] min-w-[30px] rounded-md px-1.5 py-0 text-center text-[9px] group-hover:min-w-[86px] group-hover:rounded-lg group-hover:px-2 group-hover:text-left group-focus-visible:min-w-[86px] group-focus-visible:rounded-lg group-focus-visible:px-2 group-focus-visible:text-left";

  const passiveLabelClass =
    labelMode === "compact"
      ? "border-slate-200/55 bg-white/55 text-slate-700 shadow-[0_3px_8px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.78)]"
      : labelMode === "passive"
        ? "border-slate-200/60 bg-white/60 text-slate-800 shadow-[0_4px_10px_rgba(15,23,42,0.09),inset_0_1px_0_rgba(255,255,255,0.82)]"
        : "";

  const stateChipClass = [
    selected ? "border-orange-500 bg-orange-50/95 text-orange-950 outline outline-4 outline-orange-300/25 shadow-[0_22px_44px_rgba(31,35,39,0.22),inset_0_1px_0_rgba(255,255,255,0.98)]" : "",
    searchProminent && !selected ? "border-orange-300 bg-orange-50/90 text-orange-950 ring-2 ring-orange-200/80 shadow-[0_14px_30px_rgba(194,65,12,0.18),inset_0_1px_0_rgba(255,255,255,0.98)]" : "",
    highlighted && selected ? "outline outline-2 outline-offset-2 outline-cyan-300/90" : "",
    swapSource ? "border-sky-300 bg-sky-50/85 text-sky-950 ring-4 ring-sky-200/70" : "",
    swapTarget ? "border-emerald-300 bg-emerald-50/85 text-emerald-950 ring-4 ring-emerald-200/70" : "",
    plannerHighlighted ? "border-cyan-400 bg-cyan-50/90 text-cyan-950 ring-2 ring-cyan-300/80 shadow-[0_12px_28px_rgba(8,145,178,0.24),inset_0_1px_0_rgba(255,255,255,0.98)]" : "",
    swapMode && !swapSource ? "group-hover:ring-4 group-hover:ring-sky-200/70" : ""
  ].join(" ");
  const stateDotClass = [
    selected ? "border-orange-400 bg-orange-50 ring-4 ring-orange-300/45 shadow-[0_0_0_7px_rgba(251,146,60,0.14)]" : "",
    searchProminent && !selected ? "border-orange-300 bg-orange-50 ring-4 ring-orange-200/70" : "",
    swapSource ? "border-sky-300 bg-sky-50 ring-4 ring-sky-200/70" : "",
    swapTarget ? "border-emerald-300 bg-emerald-50 ring-4 ring-emerald-200/70" : "",
    plannerHighlighted ? "border-cyan-300 bg-cyan-50 ring-4 ring-cyan-200/80" : ""
  ].join(" ");
  const hoverScaleClass = selected ? "hover:scale-100" : "hover:scale-[1.04]";
  const dotSizeClass = selected ? "h-3 w-3 ring-4" : labelMode === "prominent" ? "h-2.5 w-2.5 ring-4" : "h-2.5 w-2.5 ring-2";
  const dotTargetSizeClass = selected ? "h-7 w-7" : labelMode === "hidden" ? "h-5 w-5" : "h-6 w-6";
  const codeTextClass = selected ? "text-[10px]" : labelMode === "prominent" ? "text-[10px]" : "text-[9px]";
  const nameTextClass =
    selected
      ? "max-w-[98px] text-[10px]"
      : labelMode === "prominent"
      ? "max-w-[106px] text-[10px]"
      : labelMode === "compact"
        ? "max-w-[48px] text-[9px] group-hover:max-w-[94px] group-hover:text-[10px] group-focus-visible:max-w-[94px] group-focus-visible:text-[10px]"
        : "max-w-[62px] text-[9px] group-hover:max-w-[96px] group-hover:text-[10px] group-focus-visible:max-w-[96px] group-focus-visible:text-[10px]";
  const fullNameRevealClass =
    labelMode === "compact"
      ? "hidden max-w-[94px] truncate text-[10px] font-bold leading-tight opacity-95 group-hover:block group-focus-visible:block"
      : "hidden max-w-[96px] truncate text-[10px] font-bold leading-tight opacity-95 group-hover:block group-focus-visible:block";

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
        "focus-visible:z-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300/70",
        dotTargetSizeClass,
        hoverScaleClass,
        prominentName || searchProminent ? "z-30" : "",
        selected ? "z-40 focus-visible:z-40" : "",
        dimmed ? "opacity-45 saturate-50" : "",
        isMovable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging ? "z-40 scale-[1.06] shadow-[0_22px_44px_rgba(31,35,39,0.28)]" : ""
      ].join(" ")}
      style={pointToStyle({ x: seat.x, y: seat.y })}
      aria-label={`${seat.label}: ${displayName}. ${seat.status} seat.${searchProminent ? " Search result." : ""}${highlighted ? " Highlighted by Ask Planner." : ""}${selected ? " Selected." : " Open details."}`}
    >
      <span className="absolute left-1/2 top-1/2 h-0 w-0 overflow-visible">
        <span
          className={[
            "absolute left-0 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-white/70 shadow-[0_4px_10px_rgba(15,23,42,0.16)] backdrop-blur-sm transition-[height,width,box-shadow,border-color,background-color] duration-150 group-hover:shadow-[0_8px_18px_rgba(15,23,42,0.22)] group-focus-visible:ring-4 group-focus-visible:ring-orange-300/70",
            dotTargetSizeClass,
            stateDotClass
          ].join(" ")}
          aria-hidden="true"
        >
          <span className={[dotSizeClass, "rounded-full border border-white/80", statusDotClass].join(" ")} />
        </span>

        <span
          className={[
            "pointer-events-none absolute z-10 bg-slate-300/65",
            placementClasses.connector,
            selected || searchProminent || swapSource || swapTarget || plannerHighlighted ? "opacity-85" : "opacity-35"
          ].join(" ")}
          aria-hidden="true"
        />

        <span
          className={[
            "absolute z-10 flex min-w-0 items-center overflow-hidden border bg-white/55 text-slate-900 shadow-[0_4px_10px_rgba(15,23,42,0.09),0_1px_3px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-sm supports-[backdrop-filter]:bg-white/45",
            "transition-[width,min-width,transform,box-shadow,border-color,background-color,opacity,filter] duration-150 ease-out group-hover:border-orange-200 group-hover:bg-white/80 group-hover:shadow-[0_8px_18px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.92)] group-active:shadow-[0_4px_10px_rgba(15,23,42,0.18),inset_0_2px_4px_rgba(15,23,42,0.10)] group-focus-visible:ring-4 group-focus-visible:ring-orange-300/70 motion-reduce:transition-none",
            placementClasses.chip,
            statusAccentClass,
            chipSizeClass,
            passiveLabelClass,
            stateChipClass
          ].join(" ")}
        >
          {expandedChip ? (
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
          ) : (
            <span className="flex min-w-0 items-center justify-center gap-2 group-hover:justify-start group-focus-visible:justify-start">
              <span className="whitespace-nowrap text-[9px] font-black">{seat.label}</span>
              {employeeName && (
                <span className="hidden max-w-[54px] truncate text-[9px] font-bold opacity-90 group-hover:block group-focus-visible:block">
                  {employeeName}
                </span>
              )}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
