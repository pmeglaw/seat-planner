import type { SVGProps } from "react";

// The route cards' error glyph — the Phase 3 specimen's `#i-error20`
// (docs/redesign-v2/phase3/specimens/04-forms-and-tables.html), inlined
// rather than `<use>`d (PHASE3DS §7 item 6: CSS cannot reach a use's shadow
// tree). A filled circle in `currentColor` with the cross cut out of it in the
// card's own surface: the route card is layer-02 by the §1.22 tertiary rule,
// so the cut is `--sp-layer-02` (PHASE4BUILD §1 O-13; the specimen's symbol
// strokes layer-01). Sized and coloured by the sheet's
// `.sp-route-card .cds-empty h2 svg` rule (20px, `--sp-status-error-mark`).
// Decorative: the heading text beside it carries the meaning.
export function ErrorGlyph(props: Omit<SVGProps<SVGSVGElement>, "viewBox" | "aria-hidden">) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" {...props}>
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" fill="none" stroke="var(--sp-layer-02)" strokeWidth="1.5" />
    </svg>
  );
}
