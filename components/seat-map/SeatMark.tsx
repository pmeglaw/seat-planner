// The seat status marks (PHASE3DS §1.4, §5 item 5 — Phase 4 PR 3a): four
// symbols, grays only, each INLINED so `.sp-seat-mark [data-stroke]` /
// `[data-fill]` / `[data-hatch]` can reach them — CSS cannot style inside a
// <use>'s shadow tree (§7 item 6). Paths are the specimen's verbatim
// (docs/redesign-v2/phase3/specimens/02-map.html), 16px in a 16 viewBox,
// every stroke 2px (the token), the hatch included.
//
//   assigned      a 28×16 miniature of the name pill (● never appears on the
//                 plan) — `assigned-dot` is the ● the legend shows while names
//                 are OFF (the legend follows the toggle, P3-13)
//   open          ○ hollow ring
//   reserved      lock — hollow shackle, filled body
//   unavailable   hatched square with a 2px edge
//   draft-badge   the 8px hollow ◇ (`.sp-pill-badge`, stroke 1.5 — the one
//                 stroke under 2: a 2px stroke closes an 8px diamond) that
//                 marks "changed in draft" on a pill and in the legend
//
// Consumers: the band legend, empty-seat footprints and the ◇ on pills
// (SeatMarker, PR 3b), the inspector header (3b), Management (PR 4),
// Reception (PR 5). Always aria-hidden — the label beside it carries the name.

import type { SeatStatus } from "@/lib/types";

export type SeatMarkKind = "assigned" | "assigned-dot" | "open" | "reserved" | "unavailable" | "draft-badge";

export function seatMarkKindFor(status: SeatStatus): SeatMarkKind {
  switch (status) {
    case "assigned": return "assigned";
    case "available": return "open";
    case "reserved": return "reserved";
    case "unavailable": return "unavailable";
  }
}

export function SeatMark({ kind, className }: { kind: SeatMarkKind; className?: string }) {
  const cls = className ? `sp-seat-mark ${className}` : "sp-seat-mark";
  switch (kind) {
    case "assigned":
      return <span className={`${cls} sp-seat-mark--pill`} aria-hidden="true" />;
    case "assigned-dot":
      return (
        <svg className={cls} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle data-fill cx="8" cy="8" r="5" />
        </svg>
      );
    case "open":
      return (
        <svg className={cls} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle data-stroke cx="8" cy="8" r="6" />
        </svg>
      );
    case "reserved":
      return (
        <svg className={cls} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path data-stroke d="M5 7.5V5a3 3 0 0 1 6 0v2.5" />
          <rect data-fill x="3" y="7" width="10" height="8" />
        </svg>
      );
    case "unavailable":
      return (
        <svg className={cls} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect data-stroke x="2" y="2" width="12" height="12" />
          <path data-hatch d="M2.5 9.5 9.5 2.5M6.5 13.5 13.5 6.5" />
        </svg>
      );
    case "draft-badge":
      // Styled by fill / stroke on the svg itself (`.sp-pill-badge` sets
      // fill: the pill fill, stroke: --sp-pill-badge, stroke-width 1.5).
      return (
        <svg className={className ? `sp-pill-badge ${className}` : "sp-pill-badge"} viewBox="0 0 8 8" aria-hidden="true" focusable="false">
          <path d="M4 .75L7.25 4 4 7.25.75 4z" />
        </svg>
      );
  }
}
