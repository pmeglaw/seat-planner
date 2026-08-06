// Content-pane loading state for /admin/management. The persistent shell
// keeps the rail and the AdminShellBar mounted while this streams, so the
// skeleton renders no chrome of its own — just the section's content shapes
// (summary cards + directory table wash), offset for the fixed rail (pl-12)
// and for the bar already above it (the svh calc).
export default function AdminManagementLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="admin-theme flex min-h-[calc(100svh-var(--admin-chrome-h))] flex-col bg-[var(--admin-bg)] pl-12 text-[var(--admin-text-primary)]"
    >
      <span className="sr-only">Loading management…</span>
      <div aria-hidden="true" className="flex-1 animate-pulse p-6 motion-reduce:animate-none">
        <div className="h-8 w-64 max-w-full bg-[var(--admin-surface)]" />
        <div className="mt-4 flex gap-3">
          <div className="h-20 w-48 bg-[var(--admin-surface)]" />
          <div className="h-20 w-48 bg-[var(--admin-surface)]" />
          <div className="h-20 w-48 bg-[var(--admin-surface)]" />
        </div>
        <div className="mt-4 h-[55vh] w-full bg-[var(--admin-surface)]" />
      </div>
    </div>
  );
}
