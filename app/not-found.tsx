import Link from "next/link";

// App-wide 404. Without this, a mistyped or stale URL renders Next's unstyled
// default screen with no way back into the app (UX-01 / #276). Static server
// component — no data, no client hooks — styled to match the route error
// boundaries in app/error.tsx.
export default function NotFound() {
  return (
    <main className="shell-theme sp-zone-chrome flex min-h-screen flex-col items-center justify-center bg-[var(--sp-background)] px-6 py-12">
      <section className="sp-zone-base w-full max-w-[440px] bg-[var(--sp-layer-01)] p-6 sm:px-10 sm:pb-9 sm:pt-10">
        <h1 className="text-2xl font-semibold text-[var(--sp-text-primary)]">This page does not exist</h1>
        <p className="mt-4 text-[13px] leading-5 text-[var(--sp-text-secondary)]">
          The address may be mistyped, or it may point at something that has been removed. The seat map itself is
          unaffected.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="flex min-h-11 w-full items-center justify-center rounded-[var(--sp-radius-xl)] border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] text-sm font-semibold text-[var(--sp-text-primary)] transition-colors hover:bg-[var(--sp-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)] focus-visible:ring-offset-2"
          >
            Back to the seat map
          </Link>
        </div>
      </section>
      <p className="mt-10 font-mono text-[11px] text-[var(--sp-text-helper)]">
        seats.megeredchianlaw.com · internal use only
      </p>
    </main>
  );
}
