"use client";

import type { RefObject } from "react";
import { canVacateSeat } from "@/lib/seatDraftActions";
import type { SeatWithEmployee } from "@/lib/types";

/**
 * The contextual seat action bar: the verbs ride with the SELECTION on the
 * canvas rather than living in the chrome or the inspector.
 *
 * Why not in the inspector (owner call, 2026-07-30): the panel keeps a collapse
 * rail, so with the verbs inside it the one state where you most want to act
 * quickly — panel collapsed, map wide — is the state with no actions in reach.
 * On the canvas they survive every panel state, including closed.
 *
 * VERBS ARE CONTEXTUAL AND HIDE RATHER THAN DISABLE. Occupied seats get
 * Swap · Vacate; open seats get Assign… · Swap. A fixed row of equal cells had
 * to disable inapplicable verbs, because a vanishing cell resized its
 * neighbours; a content-sized floating bar has no such constraint, so nobody
 * has to look at a greyed-out Vacate on every empty seat.
 *
 * Assign… carries an ellipsis because it DISCLOSES rather than acts: assignment
 * needs a person, which needs a searchable combobox, which cannot live here. It
 * opens the inspector's editor. Note is absent for the same reason WITHOUT the
 * exemption — it is not the primary intent on any seat, so it stays beside the
 * field it targets.
 *
 * MOVE IS ABSENT: seats never move, people do.
 *
 * THE ENTRANCE ANIMATES THE `translate` LONGHAND, NEVER `transform`. The bar is
 * centred with translate:-50%, so a transform keyframe would overwrite that
 * centring mid-flight and it would slide in from the left instead of rising.
 * The v12 handoff flags this exact trap for the Publish button ("a filled
 * transform keyframe silently overwrites any centring transform on the same
 * element — this bit us in the prototype").
 *
 * It stays MOUNTED while nothing is selected, hidden and inert, so the entrance
 * has something to transition from. Positioning is absolute against the map
 * stage — the caller's `relative` box — which is what makes it re-centre on the
 * NARROWED map when the inspector reserves its 288px, rather than drifting
 * underneath it.
 */

type SeatActionBarProps = {
  /** The selected seat, or null when nothing is selected. */
  seat: SeatWithEmployee | null;
  /** Mirrors the map's in-flight mutation state; blocks double-firing. */
  busy?: boolean;
  onAssign: () => void;
  onSwap: () => void;
  /** Opens the confirm. The bar NEVER vacates directly — the parent owns the dialog. */
  onVacate: () => void;
  /**
   * Focus target for keyboard selection. Enter on a marker lands here, so a
   * keyboard user arrives on something actionable rather than inside a
   * read-only panel.
   */
  firstActionRef?: RefObject<HTMLButtonElement | null>;
};

const ACTION_BASE =
  "flex h-8 shrink-0 items-center px-2.5 text-[12.5px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:cursor-not-allowed disabled:opacity-40";

const TONE = {
  default: "text-[var(--admin-chrome-muted)] hover:bg-white/10 hover:text-white",
  danger: "text-[var(--admin-chrome-danger-text)] hover:bg-white/10",
  // The hero pairing the app already uses for Publish: brand fill with ink text
  // (#161616 on #FF5715 = 5.71:1). Never white-on-orange, which fails AA.
  primary: "bg-[var(--admin-primary)] font-semibold text-[var(--admin-primary-ink)] hover:brightness-105"
} as const;

export function SeatActionBar({ seat, busy = false, onAssign, onSwap, onVacate, firstActionRef }: SeatActionBarProps) {
  const visible = Boolean(seat);
  const occupied = canVacateSeat(seat);
  const occupantName = seat?.employee?.full_name ?? null;

  const actions = occupied
    ? [
        { key: "swap", label: "Swap", verb: "Swap", onClick: onSwap, tone: "default" as const },
        // Opens a confirm every time — see onVacate's contract.
        { key: "vacate", label: "Vacate", verb: "Vacate", onClick: onVacate, tone: "danger" as const }
      ]
    : [
        { key: "assign", label: "Assign…", verb: "Assign an employee to", onClick: onAssign, tone: "primary" as const },
        // Legitimate on an empty seat: a swap needs only ONE side occupied.
        { key: "swap", label: "Swap", verb: "Swap", onClick: onSwap, tone: "default" as const }
      ];

  return (
    <div
      role="group"
      aria-label={seat ? `Actions for seat ${seat.label}` : undefined}
      aria-hidden={!visible}
      data-seat-action-bar
      className={[
        "absolute bottom-3 left-1/2 z-30 flex h-10 items-center gap-2 bg-[var(--admin-chrome-bg)] pl-3 pr-1 text-[var(--admin-chrome-text)]",
        "shadow-[0_4px_14px_rgba(0,0,0,.28),0_0_0_1px_rgba(255,255,255,.12)]",
        "transition-[translate,opacity] duration-[240ms] ease-[cubic-bezier(0,0,.38,.9)] motion-reduce:transition-none",
        visible ? "[translate:-50%_0px] opacity-100" : "pointer-events-none [translate:-50%_8px] opacity-0"
      ].join(" ")}
    >
      <span aria-hidden="true" className="h-[14px] w-[3px] shrink-0 bg-[var(--admin-primary)]" />
      <span className="whitespace-nowrap text-[12.5px] font-semibold leading-none">{seat?.label ?? ""}</span>
      {occupantName && (
        <span className="max-w-[160px] truncate text-[12.5px] font-normal leading-none text-[var(--admin-chrome-muted)]">
          · {occupantName}
        </span>
      )}
      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/15" />
      {actions.map((action, index) => (
        <button
          key={action.key}
          ref={index === 0 ? firstActionRef : undefined}
          type="button"
          onClick={action.onClick}
          disabled={busy || !visible}
          // Names the seat, matching the inspector's existing label patterns.
          aria-label={seat ? `${action.verb} ${seat.label}` : undefined}
          tabIndex={visible ? 0 : -1}
          className={`${ACTION_BASE} ${TONE[action.tone]}`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
