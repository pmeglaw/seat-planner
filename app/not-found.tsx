import Link from "next/link";

// App-wide 404. Without this, a mistyped or stale URL renders Next's unstyled
// default screen with no way back into the app (UX-01 / #276). Static server
// component — no data, no client hooks — styled to match the route error
// boundaries in app/error.tsx.
export default function NotFound() {
  return (
    <main className="shell-theme flex min-h-screen flex-col items-center justify-center bg-[var(--admin-chrome-bg)] px-6 py-12">
      <section className="w-full max-w-[440px] bg-[var(--admin-surface)] p-6 sm:px-10 sm:pb-9 sm:pt-10">
        <h1 className="text-2xl font-semibold text-[var(--admin-text-primary)]">This page does not exist</h1>
        <p className="mt-4 text-[13px] leading-5 text-[var(--admin-text-secondary)]">
          The address may be mistyped, or it may point at something that has been removed. The seat map itself is
          unaffected.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="flex min-h-11 w-full items-center justify-center rounded-[var(--sp-radius-xl)] border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] text-sm font-semibold text-[var(--admin-text-primary)] transition-colors hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] focus-visible:ring-offset-2"
          >
            Back to the seat map
          </Link>
        </div>
      </section>
      <p className="mt-10 font-mono text-[11px] text-[var(--admin-chrome-muted)]">
        seats.megeredchianlaw.com · internal use only
      </p>
    </main>
  );
}
