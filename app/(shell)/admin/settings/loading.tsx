// Content-pane loading state for /admin/settings. Chrome-free like the
// management skeleton — the persistent shell already shows the rail and the
// AppTopBar — and shaped like the page it stands in for: a centered
// 760px column of utility tiles.
export default function AdminSettingsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="admin-theme min-h-[calc(100svh-var(--admin-chrome-h))] bg-[var(--admin-bg)] pl-12 text-[var(--admin-text-primary)]"
    >
      <span className="sr-only">Loading settings…</span>
      <div aria-hidden="true" className="mx-auto w-full max-w-[760px] animate-pulse px-6 pb-12 pt-6 motion-reduce:animate-none">
        <div className="h-8 w-40 bg-[var(--admin-surface)]" />
        <div className="mt-2 h-4 w-72 max-w-full bg-[var(--admin-surface)]" />
        <div className="mt-6 h-28 w-full bg-[var(--admin-surface)]" />
        <div className="mt-3 h-28 w-full bg-[var(--admin-surface)]" />
        <div className="mt-3 h-28 w-full bg-[var(--admin-surface)]" />
      </div>
    </div>
  );
}
