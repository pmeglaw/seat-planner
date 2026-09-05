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

import type { ReactNode } from "react";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

export function CarbonModal({
  titleId,
  title,
  eyebrow,
  role = "dialog",
  busy = false,
  onEscape,
  maxWidth = 480,
  children,
  footer
}: {
  titleId: string;
  title: string;
  eyebrow?: string;
  role?: "dialog" | "alertdialog";
  busy?: boolean;
  onEscape: () => void;
  maxWidth?: number;
  children: ReactNode;
  /** The two footer buttons, secondary first (50/50 bleed). */
  footer: ReactNode;
}) {
  const dialogFocusRef = useDialogFocus<HTMLElement>();
  return (
    <div data-modal="">
      <div className="cds-modal-overlay">
        <section
          ref={dialogFocusRef}
          tabIndex={-1}
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
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
          <div className="cds-modal-footer">{footer}</div>
        </section>
      </div>
    </div>
  );
}
