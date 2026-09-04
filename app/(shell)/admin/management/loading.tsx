// Content-pane loading state for /admin/management. The persistent shell
// keeps the header and panels mounted while this streams, so the skeleton
// renders no chrome of its own — just the section's content shapes (summary
// cards + directory table wash), sized by the shell's flex content pane.
export default function AdminManagementLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)]"
    >
      <span className="sr-only">Loading management…</span>
      <div aria-hidden="true" className="flex-1 animate-pulse p-6 motion-reduce:animate-none">
        <div className="h-8 w-64 max-w-full bg-[var(--sp-layer-01)]" />
        <div className="mt-4 flex gap-3">
          <div className="h-20 w-48 bg-[var(--sp-layer-01)]" />
          <div className="h-20 w-48 bg-[var(--sp-layer-01)]" />
          <div className="h-20 w-48 bg-[var(--sp-layer-01)]" />
        </div>
        <div className="mt-4 h-[55vh] w-full bg-[var(--sp-layer-01)]" />
      </div>
    </div>
  );
}
