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
  dragging,
  onSelect,
  onMovePointerDown
}: SeatMarkerProps) {
  const employeeName = seat.employee?.full_name ?? "";
  const hasEmployee = Boolean(seat.employee);
  const displayName = employeeName || "Open seat";
  const namesVisible = showNames && hasEmployee && !dimmed;
  const isMovable = canEdit && selected && moveSeatMode;
  const expanded = selected || dragging;
  const showChip = namesVisible || expanded;

  const statusClass =
    seat.status === "assigned"
      ? "border-emerald-300 bg-white text-emerald-950"
      : seat.status === "reserved"
        ? "border-amber-300 bg-white text-amber-950"
        : seat.status === "unavailable"
          ? "border-slate-300 bg-slate-100 text-slate-500"
          : "border-slate-300 bg-white text-slate-800";

  const statusDotClass =
    seat.status === "assigned"
      ? "bg-emerald-500 ring-emerald-100"
      : seat.status === "reserved"
        ? "bg-amber-500 ring-amber-100"
        : seat.status === "unavailable"
          ? "bg-slate-400 ring-slate-100"
          : "bg-slate-300 ring-slate-100";

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
        "font-black leading-none shadow-[0_5px_14px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.98)]",
        "transition-[min-width,transform,box-shadow,border-color,background-color,opacity,filter] duration-150 ease-out hover:z-20 hover:scale-[1.03] hover:border-orange-300 hover:bg-orange-50 hover:shadow-[0_12px_24px_rgba(15,23,42,0.2)] motion-reduce:transition-none",
        "focus-visible:z-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-orange-500",
        statusClass,
        showChip
          ? "min-h-[34px] min-w-[100px] max-w-[132px] rounded-lg px-2.5 py-1.5 text-left"
          : "h-[28px] min-h-[28px] min-w-[34px] rounded-full px-2 py-0 text-center text-[10px] hover:min-w-[98px] hover:rounded-lg hover:px-2.5 hover:text-left focus-visible:min-w-[98px] focus-visible:rounded-lg focus-visible:px-2.5 focus-visible:text-left",
        expanded ? "z-30 min-h-[40px] min-w-[118px] max-w-[148px] rounded-lg px-3 py-1.5 text-left sm:min-w-[126px]" : "",
        selected ? "border-brand bg-orange-50 text-orange-950 ring-4 ring-orange-200/70 shadow-[0_16px_30px_rgba(194,65,12,0.24)]" : "",
        dimmed ? "opacity-30 grayscale" : "",
        isMovable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging ? "z-40 scale-[1.06] shadow-[0_20px_38px_rgba(31,35,39,0.24)]" : ""
      ].join(" ")}
      style={pointToStyle({ x: seat.x, y: seat.y })}
      aria-label={`${seat.label}: ${displayName}. ${seat.status} seat.${selected ? " Selected." : " Open details."}`}
    >
      {showChip ? (
        <span className="pointer-events-none flex w-full min-w-0 items-center gap-2">
          <span className={["h-2.5 w-2.5 flex-none rounded-full ring-4", statusDotClass].join(" ")} />
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className="whitespace-nowrap text-[10px] font-black leading-tight">{seat.label}</span>
            <span className="max-w-[82px] truncate text-[9px] font-bold leading-tight opacity-95 sm:max-w-[94px]">
              {employeeName || "Open"}
            </span>
          </span>
        </span>
      ) : (
        <span className="pointer-events-none flex w-full min-w-0 items-center justify-center gap-2 group-hover:justify-start group-focus-visible:justify-start">
          <span className={["absolute bottom-[-1px] right-[-1px] h-2.5 w-2.5 rounded-full border border-white ring-2 group-hover:static group-focus-visible:static", statusDotClass].join(" ")} />
          <span className="whitespace-nowrap text-[10px] font-black">{seat.label}</span>
          <span className="hidden max-w-[64px] truncate text-[9px] font-bold opacity-90 group-hover:block group-focus-visible:block">
            {employeeName || "Open"}
          </span>
        </span>
      )}
    </button>
  );
}
