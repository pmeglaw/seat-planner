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
//
// Phase 4 PR 6 (owner ruling on the 5b R-5 finding): the host owns the
// busy ⇄ idle focus seam for every consumer. `busy` flips TRUE → Chrome drops
// focus from a primary that disables under the pointer, leaving
// document.activeElement on <body> outside the Tab trap; the section takes
// it (the trap's anchor, as on a busy mount). `busy` flips FALSE → a dialog
// that mounted busy (the inspector's move-conflict) or went busy with focus on
// the section is left on an invisibly-focused container; the first visible
// enabled control takes it — but only if focus still sits on the section,
// <body>, or outside the dialog, so a consumer that lands focus on its error
// alert (an effect on the settle, or a rAF queued when the error was set)
// always wins, and never on a section that has left the document (a dialog
// unmounting on success flips busy false as it leaves, while useDialogFocus is
// restoring the opener — tests/dialog-initial-focus.test.mjs pins all three).

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { focusFirstControl, useDialogFocus } from "@/components/ui/useDialogFocus";

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
  const focusHookRef = useDialogFocus<HTMLElement>();
  const sectionRef = useRef<HTMLElement | null>(null);
  // The section's ref: useDialogFocus's callback (open focus, trap, restore)
  // composed with a plain ref the busy effect below reads.
  const dialogFocusRef = useCallback(
    (node: HTMLElement | null) => {
      sectionRef.current = node;
      focusHookRef(node);
    },
    [focusHookRef]
  );
  const wasBusyRef = useRef(busy);
  useEffect(() => {
    const node = sectionRef.current;
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;
    if (!node || wasBusy === busy) return;
    const active = document.activeElement;
    const activeInside = active instanceof HTMLElement && active !== node && node.contains(active);
    if (busy) {
      // Focus already dropped (body / outside), or sits on a control that has
      // just disabled and is about to drop: anchor the trap on the section.
      const onDisabledControl = activeInside && (active as HTMLButtonElement).disabled === true;
      if (!activeInside || onDisabledControl) node.focus();
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (!node.isConnected) return;
      const now = document.activeElement;
      if (now instanceof HTMLElement && now !== node && node.contains(now)) return;
      focusFirstControl(node);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy]);
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
