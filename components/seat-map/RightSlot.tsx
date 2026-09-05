"use client";

import type { ReactNode } from "react";

// The 400px right slot (PHASE3DS §1.17, DECISIONS D2-a; Phase 4 PR 3b, C9).
// ONE per surface, mounted over the canvas column: `.sp-slot-host` slides in
// from the right edge and the canvas is PUSHED (the column gains
// `pr-[var(--sp-slot-w)]` while the slot is open) — the control row above and
// the status band below never reflow, and the slot never covers the band.
//
// One owner at a time (INV-4): the surface decides — a running mode owns the
// slot until it ends, otherwise the last opened wins (inspector / Ask
// Planner), and a displaced inspector collapses to its re-entry (the selection
// stays). The children ARE the `.sp-slot` aside (inspector, mode card, Ask
// Planner drawer) so each keeps its own landmark role and id; this host only
// owns presence (data-open is a PRESENCE key, never data-open="false") and the
// transition.
export type RightSlotOwner = "inspector" | "mode" | "ask" | null;

export function RightSlot({ open, children }: { open: boolean; children?: ReactNode }) {
  return (
    <div className="sp-slot-host" data-open={open ? "" : undefined} data-slot-host="">
      {open ? children : null}
    </div>
  );
}
