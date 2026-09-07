"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ErrorGlyph } from "@/components/ui/ErrorGlyph";
import { planChunkErrorRecovery } from "@/lib/chunkLoadRecovery";

// Route error boundary for /reception, in Reception's own voice (DECISIONS
// D3-e; PHASE2UX §1R.6 "Error"; P2-5). Without it the segment fell through to
// the root boundary and said "The seat map could not load" — the wrong
// surface for a receptionist mid-call (PHASE1IA B2). The route card is the
// asset empty state (PHASE3DS §1.29 / sheet block 28) on the page frame; its
// tertiary sits on the white card (layer-02), never layer-01 — 4.14:1 there
// is the recorded not-gated pair (PHASE4BUILD §1.22), so the surface is set
// inline because the sheet paints `.sp-route-card` layer-01 and a utility
// class loses to that later rule.
//
// Mechanics are the admin boundary's, verbatim: a stale-chunk failure after
// a deploy reloads the document once (reset() re-renders against the same
// purged URL and can never clear it); everything else is manual. Only
// `digest` is surfaced — in production Next has already replaced the thrown
// message with it.
export default function ReceptionError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

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

  // The boundary replaces the page; focus must be moved explicitly or it is
  // left on a detached node and nothing is announced.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-[var(--sp-background)] text-[var(--sp-text-primary)]">
      <div className="sp-page mx-auto w-full">
        <section className="sp-route-card w-full" style={{ background: "var(--sp-layer-02)" }}>
          <div className="cds-empty">
            <h2 ref={headingRef} tabIndex={-1} className="outline-none">
              <ErrorGlyph />
              Reception couldn&apos;t load
            </h2>
            <p>
              The directory is unchanged — this is a display problem. Try again, or use the seat map&apos;s search
              meanwhile.
            </p>
            <div className="cds-empty-actions">
              <button type="button" className="cds-btn cds-btn--tertiary cds-btn--md" onClick={reset}>
                Try again
              </button>
              <Link href="/" className="cds-btn cds-btn--ghost cds-btn--md">
                Open the seat map
              </Link>
            </div>
            {error.digest ? <p className="sp-digest">Reference: {error.digest}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
