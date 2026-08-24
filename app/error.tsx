"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/design-system";
import { planChunkErrorRecovery } from "@/lib/chunkLoadRecovery";

// Route error boundary for every non-admin segment (viewer map, login, auth
// callbacks). Without one, a failed Supabase query in app/page.tsx renders
// Next's unstyled default error screen with no way back into the app.
//
// `digest` is deliberately the only failure detail shown: in production Next
// already replaces a thrown server message with an opaque digest, so the digest
// is the sole stable handle for matching a user report to a Vercel runtime log.
// The raw message is never rendered — on the client it would leak internals for
// no user benefit.
export default function ViewerError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A tab left open across a deploy throws ChunkLoadError on its next lazy
  // import, and `reset()` cannot fix that — it re-renders against the same
  // purged URL. Reload once to pick up the new HTML; the guard inside
  // planChunkErrorRecovery keeps a still-broken deploy from looping.
  useEffect(() => {
    const recovery = planChunkErrorRecovery(
      error,
      typeof window === "undefined" ? null : window.sessionStorage,
      Date.now()
    );
    if (recovery === "reload") {
      window.location.reload();
    }
  }, [error]);

  // The boundary swaps the whole page out from under the user. Without an
  // explicit handoff, focus stays on a node that no longer exists and screen
  // readers announce nothing at all.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="shell-theme sp-zone-chrome flex min-h-screen flex-col items-center justify-center bg-[var(--sp-background)] px-6 py-12">
      <section className="sp-zone-base w-full max-w-[440px] bg-[var(--sp-layer-01)] p-6 sm:px-10 sm:pb-9 sm:pt-10">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold text-[var(--sp-text-primary)] outline-none"
        >
          The seat map could not load
        </h1>
        <p className="mt-4 text-[13px] leading-5 text-[var(--sp-text-secondary)]">
          Something went wrong while loading this page. The seating map itself is unchanged — this is a display
          problem, not a data one.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Button variant="primary" onClick={reset} className="w-full">
            Try again
          </Button>
          <Link
            href="/"
            className="flex min-h-11 w-full items-center justify-center rounded-[var(--sp-radius-xl)] border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] text-sm font-semibold text-[var(--sp-text-primary)] transition-colors hover:bg-[var(--sp-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)] focus-visible:ring-offset-2"
          >
            Back to the seat map
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 font-mono text-xs leading-4 text-[var(--sp-text-helper)]">
            Reference: {error.digest}
          </p>
        ) : null}
      </section>

      <p className="mt-10 font-mono text-xs text-[var(--sp-text-helper)]">
        seats.megeredchianlaw.com · internal use only
      </p>
    </main>
  );
}
