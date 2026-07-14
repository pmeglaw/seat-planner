"use client";

import { useCallback, useRef } from "react";

// Shared focus handling for the app's aria-modal surfaces: pass the returned
// callback as `ref` on the dialog element (which needs tabIndex={-1}). On
// mount the dialog itself takes focus and the previously focused element is
// remembered; on unmount focus is handed back to it. Tab is intentionally not
// trapped here — a full focus-trap primitive is a separate follow-up, and any
// later focus set by the closing flow (e.g. focusSeatMarker) wins because it
// runs after this restore.
export function useDialogFocus<T extends HTMLElement = HTMLElement>() {
  const restoreTargetRef = useRef<HTMLElement | null>(null);

  return useCallback((node: T | null) => {
    if (node) {
      restoreTargetRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      node.focus();
      return;
    }
    restoreTargetRef.current?.focus();
    restoreTargetRef.current = null;
  }, []);
}
