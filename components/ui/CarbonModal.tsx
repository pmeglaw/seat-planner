"use client";

// The asset modal (`.cds-modal`, carbon-components.css §13) as a React host:
// overlay z 8500, eyebrow · heading-03 question · body · footer 50/50 bleed.
// Small, user-initiated, never nested (SKILL.md) — it opens ON TOP of a side
// panel (z 7001; PHASE3DS §1.24 "a modal over a side panel is allowed") and
// never from inside a tearsheet (P3-17). Phase 4 PR 4 consumers: the
// one-field create modal (departments / zones, D5-c) and the dirty-close ask
// of the employee panel (specimen 03-panels-and-sheets.html line 201).
//
// Focus: `useDialogFocus` lands on the first control, traps Tab, restores the
// opener on close. Esc = the secondary action, never while `busy`.
//
// Phase 4 PR 5b: the map's seven confirm dialogs (SeatMapDialogs.tsx, the
// inspector's move-conflict) are the third consumer family. `describedBy`
// names the description <p> the body renders (aria-describedby on the
// section); `footerColumns={3}` is Carbon's own three-button modal footer
// (25 / 25 / 50 — sheet amendment F, PHASE3DS §1.24) and exists for the one
// modal that carries two secondaries: the inspector's unsaved-edits guard.
// No ×, no danger variant on the host — the danger lives on the primary.

import type { ReactNode } from "react";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

export function CarbonModal({
  titleId,
  title,
  eyebrow,
  role = "dialog",
  describedBy,
  busy = false,
  onEscape,
  maxWidth = 480,
  footerColumns = 2,
  children,
  footer
}: {
  titleId: string;
  /** The heading-03 question; a node so a cross-floor `.cds-tag` can ride inside it (D2′). */
  title: ReactNode;
  eyebrow?: string;
  role?: "dialog" | "alertdialog";
  /** id of the description paragraph the body renders (aria-describedby). */
  describedBy?: string;
  busy?: boolean;
  onEscape: () => void;
  maxWidth?: number;
  /** 2 = the asset's 50/50 bleed (default); 3 = Carbon's 25/25/50 three-button footer. */
  footerColumns?: 2 | 3;
  children: ReactNode;
  /** The footer buttons, secondary first (50/50 bleed; 25/25/50 with `footerColumns={3}`). */
  footer: ReactNode;
}) {
  const dialogFocusRef = useDialogFocus<HTMLElement>();
  return (
    <div data-modal="">
      {/* The overlay is inert; mousedown is cancelled so a pointer on it never
          pulls focus out of the trap (PR 4 smoke, step 10). */}
      <div className="cds-modal-overlay" onMouseDown={event => event.preventDefault()}>
        <section
          ref={dialogFocusRef}
          tabIndex={-1}
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={describedBy}
          onKeyDown={event => {
            if (event.key === "Escape" && !busy) {
              event.stopPropagation();
              onEscape();
            }
          }}
          className="cds-modal focus-visible:outline-none"
          style={{ maxWidth }}
        >
          <div className="cds-modal-header">
            {eyebrow && <div className="cds-modal-eyebrow">{eyebrow}</div>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="cds-modal-body">{children}</div>
          <div className={footerColumns === 3 ? "cds-modal-footer sp-modal-footer--3" : "cds-modal-footer"}>{footer}</div>
        </section>
      </div>
    </div>
  );
}
