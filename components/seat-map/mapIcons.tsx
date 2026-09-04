// The map's 16px line icons, inlined from the Phase 3 specimen's <symbol>s
// (docs/redesign-v2/phase3/specimens/02-map.html). Inlined, never <use>d —
// PHASE3DS §7 item 6: CSS cannot reach a use's shadow tree, and the asset's
// .cds-btn--icon svg / .sp-search > svg rules size and colour these by
// selector. Every icon is aria-hidden; the button carries the name.

import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "aria-hidden">;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const;

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="7" cy="7" r="4.5" {...stroke} /><path d="M10.5 10.5L14 14" {...stroke} /></Icon>
);
export const ChevronIcon = (p: IconProps) => <Icon {...p}><path d="M4 6l4 4 4-4" {...stroke} /></Icon>;
export const PinIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 14s4-4.2 4-7.5a4 4 0 0 0-8 0C4 9.8 8 14 8 14z" {...stroke} /><circle cx="8" cy="6.5" r="1.5" fill="currentColor" /></Icon>
);
export const CloseIcon = (p: IconProps) => <Icon {...p}><path d="M3 3l10 10M13 3L3 13" {...stroke} /></Icon>;
export const UndoIcon = (p: IconProps) => <Icon {...p}><path d="M6 4L2.5 7.5 6 11M3 7.5h6.5a3 3 0 0 1 0 6H8" {...stroke} /></Icon>;
export const RedoIcon = (p: IconProps) => <Icon {...p}><path d="M10 4l3.5 3.5L10 11M13 7.5H6.5a3 3 0 0 0 0 6H8" {...stroke} /></Icon>;
export const PlusIcon = (p: IconProps) => <Icon {...p}><path d="M8 3v10M3 8h10" {...stroke} /></Icon>;
export const MoreIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="3" cy="8" r="1.5" fill="currentColor" /><circle cx="8" cy="8" r="1.5" fill="currentColor" /><circle cx="13" cy="8" r="1.5" fill="currentColor" /></Icon>
);
export const MinusIcon = (p: IconProps) => <Icon {...p}><path d="M3 8h10" {...stroke} /></Icon>;
export const FitIcon = (p: IconProps) => <Icon {...p}><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" {...stroke} /></Icon>;
export const CopyIcon = (p: IconProps) => (
  <Icon {...p}><rect x="5" y="5" width="8" height="8" {...stroke} /><path d="M3 11V3h8" {...stroke} /></Icon>
);
export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="M3 8.5l3 3L13 4.5" {...stroke} /></Icon>;
