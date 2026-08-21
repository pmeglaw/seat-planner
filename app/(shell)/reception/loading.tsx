// Content-pane loading state for /reception. The persistent shell keeps the
// rail and AppTopBar mounted; this skeletons only the reception column
// (search field + directory list) on the reception surface's own background
// token, offset for the fixed rail.
export default function ReceptionLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="reception-theme min-h-[calc(100svh-var(--sp-chrome-height))] bg-[var(--r-bg)] pl-12"
    >
      <span className="sr-only">Loading reception…</span>
      <div aria-hidden="true" className="mx-auto w-full max-w-[720px] animate-pulse px-6 pt-10 motion-reduce:animate-none">
        <div className="h-10 w-full bg-[var(--r-card)]" />
        <div className="mt-4 h-16 w-full bg-[var(--r-card)]" />
        <div className="mt-2 h-16 w-full bg-[var(--r-card)]" />
        <div className="mt-2 h-16 w-full bg-[var(--r-card)]" />
      </div>
    </div>
  );
}
