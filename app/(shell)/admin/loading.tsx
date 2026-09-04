// Content-pane loading state for /admin (the map). It streams INSIDE the
// persistent shell — the AppTopBar and rail stay mounted while this shows
// (UX-01 / #276, reworked for the (shell) layout, then the top-bar-first
// chrome) — so it skeletons only the pane that swaps: the canvas wash below
// the real header. Sized by the shell's content pane (flex column),
// mirroring the page it stands in for.
export default function AdminMapLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)]"
    >
      <span className="sr-only">Loading the admin workspace…</span>
      <div aria-hidden="true" className="flex-1 animate-pulse p-6 motion-reduce:animate-none">
        <div className="h-8 w-64 max-w-full bg-[var(--sp-layer-01)]" />
        <div className="mt-4 h-[70vh] w-full bg-[var(--sp-layer-01)]" />
      </div>
    </div>
  );
}
