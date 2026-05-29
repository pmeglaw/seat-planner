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
  moveSeatMode: boolean;
  swapMode: boolean;
  swapSource: boolean;
  swapTarget: boolean;
  highlighted: boolean;
  dragging: boolean;
  onSelect: (seatId: string) => void;
  onMovePointerDown: (event: PointerEvent<HTMLButtonElement>, seatId: string) => void;
};

export function SeatMarker({
  seat,
  selected,
  dimmed,
  canEdit,
  showNames,
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
  const expanded = selected || dragging || swapSource || swapTarget || highlighted;
  const showChip = namesVisible || expanded;

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
        "transition-[min-width,transform,box-shadow,border-color,background-color,opacity,filter] duration-150 ease-out hover:z-20 hover:scale-[1.04] hover:border-orange-200 hover:bg-white/80 hover:shadow-[0_16px_34px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.98)] motion-reduce:transition-none",
        "focus-visible:z-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-300/70",
        statusAccentClass,
        showChip
          ? "min-h-[34px] min-w-[102px] max-w-[142px] rounded-xl px-2.5 py-1.5 text-left"
          : "h-[28px] min-h-[28px] min-w-[36px] rounded-full px-2 py-0 text-center text-[10px] hover:min-w-[102px] hover:rounded-xl hover:px-2.5 hover:text-left focus-visible:min-w-[102px] focus-visible:rounded-xl focus-visible:px-2.5 focus-visible:text-left",
        expanded ? "z-30 min-h-[40px] min-w-[122px] max-w-[158px] rounded-xl bg-white/90 px-3 py-1.5 text-left sm:min-w-[132px]" : "",
        selected ? "border-orange-300 bg-white/90 text-orange-950 ring-4 ring-orange-200/70 shadow-[0_18px_38px_rgba(194,65,12,0.25),inset_0_1px_0_rgba(255,255,255,0.98)]" : "",
        swapSource ? "border-sky-300 bg-sky-50/85 text-sky-950 ring-4 ring-sky-200/70" : "",
        swapTarget ? "border-emerald-300 bg-emerald-50/85 text-emerald-950 ring-4 ring-emerald-200/70" : "",
        highlighted && !selected && !swapSource && !swapTarget ? "border-cyan-300 bg-cyan-50/90 text-cyan-950 ring-4 ring-cyan-200/75 shadow-[0_18px_38px_rgba(8,145,178,0.18),inset_0_1px_0_rgba(255,255,255,0.98)]" : "",
        swapMode && !swapSource ? "hover:ring-4 hover:ring-sky-200/70" : "",
        dimmed ? "opacity-45 saturate-50" : "",
        isMovable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging ? "z-40 scale-[1.06] shadow-[0_22px_44px_rgba(31,35,39,0.28)]" : ""
      ].join(" ")}
      style={pointToStyle({ x: seat.x, y: seat.y })}
      aria-label={`${seat.label}: ${displayName}. ${seat.status} seat.${highlighted ? " Highlighted by Ask Planner." : ""}${selected ? " Selected." : " Open details."}`}
    >
      {showChip ? (
        <span className="pointer-events-none flex w-full min-w-0 items-center gap-2">
          <span className={["h-2.5 w-2.5 flex-none rounded-full border border-white/80 ring-4", statusDotClass].join(" ")} />
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className="whitespace-nowrap text-[10px] font-black leading-tight">{seat.label}</span>
            <span className="max-w-[82px] truncate text-[9px] font-bold leading-tight opacity-95 sm:max-w-[94px]">
              {employeeName || "Open"}
            </span>
          </span>
        </span>
      ) : (
        <span className="pointer-events-none flex w-full min-w-0 items-center justify-center gap-2 group-hover:justify-start group-focus-visible:justify-start">
          <span className={["absolute bottom-[-1px] right-[-1px] h-2.5 w-2.5 rounded-full border border-white/90 ring-2 group-hover:static group-focus-visible:static", statusDotClass].join(" ")} />
          <span className="whitespace-nowrap text-[10px] font-black">{seat.label}</span>
          <span className="hidden max-w-[64px] truncate text-[9px] font-bold opacity-90 group-hover:block group-focus-visible:block">
            {employeeName || "Open"}
          </span>
        </span>
      )}
    </button>
  );
}
