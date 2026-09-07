"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ErrorGlyph } from "@/components/ui/ErrorGlyph";
import { planChunkErrorRecovery } from "@/lib/chunkLoadRecovery";

// Route error boundary for every non-admin segment (viewer map, login, auth
// callbacks). Without one, a failed Supabase query in the viewer page renders
// Next's unstyled default error screen with no way back into the app.
//
// The card is the asset empty state on the route card (PHASE3DS §1.29 / sheet
// block 28, Phase 4 PR 5 — owner ruling Q-2); copy as shipped. The tertiary
// sits on the WHITE card (layer-02), never layer-01 (PHASE4BUILD §1.22), so the
// surface is set inline — the sheet paints `.sp-route-card` layer-01 and a
// utility class loses to that later rule. This boundary renders OUTSIDE the
// (shell) layout, so it owns its own full-height centring.
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--sp-background)] px-6 py-12 text-[var(--sp-text-primary)]">
      <section className="sp-route-card w-full" style={{ background: "var(--sp-layer-02)" }}>
        <div className="cds-empty">
          <h2 ref={headingRef} tabIndex={-1} className="outline-none">
            <ErrorGlyph />
            The seat map could not load
          </h2>
          <p>
            Something went wrong while loading this page. The seating map itself is unchanged — this is a display
            problem, not a data one.
          </p>
          <div className="cds-empty-actions">
            <button type="button" className="cds-btn cds-btn--tertiary cds-btn--md" onClick={reset}>
              Try again
            </button>
            <Link href="/" className="cds-btn cds-btn--ghost cds-btn--md">
              Back to the seat map
            </Link>
          </div>
          {error.digest ? <p className="sp-digest">Reference: {error.digest}</p> : null}
        </div>
      </section>
      <p className="sp-digest">seats.megeredchianlaw.com · internal use only</p>
    </main>
  );
}
