// Route-level loading state for the whole /admin subtree (editor, management,
// settings). These pages are force-dynamic and gate on auth + role before
// their data queries, so navigations block with no feedback without this
// boundary (UX-01 / #276). Nearest boundary wins, so one file covers all
// three admin routes; it wears `.admin-theme` like the pages it stands in for.
export default function AdminLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="admin-theme flex min-h-screen flex-col bg-[var(--admin-bg)] text-[var(--admin-text-primary)]"
    >
      <span className="sr-only">Loading the admin workspace…</span>
      <div aria-hidden="true" className="h-11 shrink-0 bg-[var(--admin-chrome-bg)]" />
      <div aria-hidden="true" className="flex-1 animate-pulse p-6 motion-reduce:animate-none">
        <div className="h-8 w-64 max-w-full bg-[var(--admin-surface)]" />
        <div className="mt-4 h-[70vh] w-full bg-[var(--admin-surface)]" />
      </div>
    </div>
  );
}
