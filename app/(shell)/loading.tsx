// Content-pane loading state for / (the viewer map). It streams INSIDE the
// persistent shell — the header and panels stay mounted while this shows
// (UX-01 / #276, reworked for the (shell) layout in redesign-v2 PR 2) — so it
// skeletons only the pane that swaps: a content wash below the real header.
// Sized by the shell's content pane (flex column), never by the viewport
// (tests/shell-viewport-height-source.test.mjs).
export default function ViewerMapLoading() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)]">
      <span className="sr-only">Loading the seat map…</span>
      <div aria-hidden="true" className="flex-1 animate-pulse motion-reduce:animate-none">
        <div className="mx-auto mt-6 h-8 w-full max-w-[520px] bg-[var(--sp-layer-01)]" />
        <div className="mx-auto mt-4 h-[60vh] w-[min(94vw,1200px)] bg-[var(--sp-layer-01)]" />
      </div>
    </div>
  );
}
