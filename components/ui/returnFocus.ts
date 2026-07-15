import type { RefObject } from "react";

/**
 * Defer focus back to a popover's trigger after a close unmounts the focused
 * element (menu item, filter select). Restoring synchronously can be
 * clobbered when the unmount and the focus land in the same commit, so the
 * hand-off waits one macrotask — the same pattern the Ask Planner drawer
 * shipped with. Safe when the trigger itself unmounts (e.g. a menu item
 * navigates away): the ref nulls and the restore becomes a no-op.
 */
export function returnFocusAfterClose(trigger: RefObject<HTMLElement | null>) {
  window.setTimeout(() => trigger.current?.focus(), 0);
}
