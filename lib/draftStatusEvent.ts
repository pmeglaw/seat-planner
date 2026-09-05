// The shell's mode indicator fetches the draft status once per admin
// sub-page route (AppShell; owner ruling 2026-09-04, PHASE4BUILD §1.9). A
// people edit on Management or a restore on Settings changes that status
// without a navigation, so the surfaces announce it and the shell refetches.
// Phase 4 PR 4 smoke finding (step 9): the indicator stayed "Draft — no
// changes" after a save until a reload.
export const DRAFT_STATUS_CHANGED_EVENT = "seat-planner:draft-status-changed";

export function notifyDraftStatusChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DRAFT_STATUS_CHANGED_EVENT));
}
