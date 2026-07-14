"use client";

import { useCallback, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(", ");

// Shared focus handling for the app's aria-modal surfaces: pass the returned
// callback as `ref` on the dialog element (which needs tabIndex={-1}).
//
// - Open: the dialog itself takes focus and the previously focused element is
//   remembered. A dialog-scoped keydown listener then traps Tab/Shift+Tab so
//   the keyboard can't walk the inert page behind the dialog — which is what
//   aria-modal already promises assistive tech.
// - Close: focus is handed back to the opener. Any focus set later by the
//   closing flow (e.g. focusSeatMarker, the drawer's own restore) wins,
//   because it runs after this restore.
export function useDialogFocus<T extends HTMLElement = HTMLElement>() {
  const restoreTargetRef = useRef<HTMLElement | null>(null);
  const detachTrapRef = useRef<(() => void) | null>(null);

  return useCallback((node: T | null) => {
    if (node) {
      restoreTargetRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      node.focus();

      const trapTab = (event: KeyboardEvent) => {
        if (event.key !== "Tab") return;
        // Visible, enabled controls inside the dialog, in DOM order.
        const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
          .filter(element => element.getClientRects().length > 0);
        if (focusable.length === 0) {
          event.preventDefault();
          node.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        const outsideOrOnDialog = active === node || !(active instanceof HTMLElement) || !node.contains(active);
        if (event.shiftKey) {
          if (active === first || outsideOrOnDialog) {
            event.preventDefault();
            last.focus();
          }
          return;
        }
        if (active === last || outsideOrOnDialog) {
          event.preventDefault();
          first.focus();
        }
      };

      node.addEventListener("keydown", trapTab);
      detachTrapRef.current = () => node.removeEventListener("keydown", trapTab);
      return;
    }

    detachTrapRef.current?.();
    detachTrapRef.current = null;
    restoreTargetRef.current?.focus();
    restoreTargetRef.current = null;
  }, []);
}
