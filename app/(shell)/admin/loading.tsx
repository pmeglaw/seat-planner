// Content-pane loading state for /admin (the map). It streams INSIDE the
// persistent shell — the rail stays mounted while this shows (UX-01 / #276,
// reworked for the (shell) layout) — so it skeletons only the pane that
// swaps: SeatMap's own dark header strip plus the canvas wash. pl-12 clears
// the fixed rail, mirroring the page it stands in for. The management and
// settings sub-pages carry their own loading files (no header strip — the
// real AdminShellBar persists above them).
export default function AdminMapLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="admin-theme flex min-h-[100svh] flex-col bg-[var(--admin-bg)] pl-12 text-[var(--admin-text-primary)]"
    >
      <span className="sr-only">Loading the admin workspace…</span>
      <div aria-hidden="true" className="h-[var(--admin-chrome-h)] shrink-0 bg-[var(--admin-chrome-bg)]" />
      <div aria-hidden="true" className="flex-1 animate-pulse p-6 motion-reduce:animate-none">
        <div className="h-8 w-64 max-w-full bg-[var(--admin-surface)]" />
        <div className="mt-4 h-[70vh] w-full bg-[var(--admin-surface)]" />
      </div>
    </div>
  );
}
