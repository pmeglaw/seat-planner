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
  const namesVisible = showNames && hasEmployee;
  const isMovable = canEdit && selected && moveSeatMode;
  const expanded = selected || dragging;

  const statusClass =
    seat.status === "assigned"
      ? "border-emerald-200 bg-emerald-50/98 text-emerald-900"
      : seat.status === "reserved"
        ? "border-amber-200 bg-amber-50/98 text-amber-900"
        : seat.status === "unavailable"
          ? "border-slate-300 bg-slate-100/98 text-slate-500"
          : "border-slate-300 bg-white/99 text-slate-800";

  const statusDotClass =
    seat.status === "assigned"
      ? "bg-emerald-500"
      : seat.status === "reserved"
        ? "bg-amber-500"
        : seat.status === "unavailable"
          ? "bg-slate-400"
          : "bg-slate-300";

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
      className={[
        "group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-visible border",
        "font-black leading-none tracking-[0.01em] shadow-[0_8px_18px_rgba(31,35,39,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur",
        "transition-all duration-150 ease-out hover:z-20 hover:scale-[1.02] hover:border-orange-200 hover:bg-orange-50/80",
        "focus-visible:z-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-orange-500",
        statusClass,
        namesVisible
          ? "min-h-[40px] min-w-[108px] rounded-2xl px-3 py-1.5 text-left"
          : "h-[30px] min-h-[30px] min-w-[36px] rounded-full px-2 py-0 text-center text-[10px]",
        expanded ? "z-30 min-h-[44px] min-w-[122px] rounded-2xl px-3 py-1.5 text-left" : "",
        selected ? "border-brand bg-orange-50/99 text-orange-900 ring-4 ring-orange-200/60" : "",
        dimmed ? "opacity-45 saturate-75" : "",
        isMovable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging ? "z-40 scale-[1.06] shadow-[0_20px_38px_rgba(31,35,39,0.24)]" : ""
      ].join(" ")}
      style={pointToStyle({ x: seat.x, y: seat.y })}
      aria-label={`${seat.label}${employeeName ? ` ${employeeName}` : " Open"}`}
    >
      {namesVisible || expanded ? (
        <span className="pointer-events-none flex w-full min-w-0 items-center gap-2">
          <span className={["h-2.5 w-2.5 flex-none rounded-full", statusDotClass].join(" ")} />
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className="whitespace-nowrap text-[10px] font-black leading-tight">{seat.label}</span>
            <span className="max-w-[94px] truncate text-[9px] font-bold leading-tight opacity-95">
              {employeeName || "Open"}
            </span>
          </span>
        </span>
      ) : (
        <span className="pointer-events-none flex w-full items-center justify-center">
          <span className={["absolute bottom-[-1px] right-[-1px] h-2.5 w-2.5 rounded-full border border-white", statusDotClass].join(" ")} />
          <span className="whitespace-nowrap text-[10px] font-black">{seat.label}</span>
        </span>
      )}
    </button>
  );
}
