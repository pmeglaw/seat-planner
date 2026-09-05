// Content-pane loading state for / (the viewer map). It streams INSIDE the
// persistent shell — the header and panels stay mounted while this shows
// (UX-01 / #276, reworked for the (shell) layout in redesign-v2 PR 2) — so it
// skeletons only the pane that swaps: the control row's shape, then the
// skeleton plan (PHASE2UX §2 "skeleton plan + row controls real"; PHASE3DS
// §1.21 .sp-canvas--skeleton) and the band's rule. Sized by the shell's
// content pane (flex column), never by the viewport
// (tests/shell-viewport-height-source.test.mjs).
export default function ViewerMapLoading() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)]">
      <span className="sr-only">Loading the seat map…</span>
      <div aria-hidden="true" className="sp-control-row">
        <span className="sp-skeleton" style={{ width: 224 }} />
        <span className="sp-skeleton" style={{ width: 320 }} />
        <span className="sp-skeleton" style={{ width: 96 }} />
      </div>
      <div aria-hidden="true" className="sp-canvas sp-canvas--skeleton flex-1">
        <div className="sp-canvas-plan" />
      </div>
      <div aria-hidden="true" className="sp-band" />
    </div>
  );
}
