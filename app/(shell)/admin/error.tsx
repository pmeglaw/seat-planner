"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ErrorGlyph } from "@/components/ui/ErrorGlyph";
import { planChunkErrorRecovery } from "@/lib/chunkLoadRecovery";

// Route error boundary for the /admin subtree. All three admin pages throw on a
// failed query; without this the admin sees Next's default error screen and
// cannot tell whether the draft map survived.
//
// Separate from app/error.tsx because the nearest boundary wins: this one says
// what an editor needs to hear about in-flight edits. The card is the asset
// empty state on the route card (PHASE3DS §1.29 / sheet block 28, Phase 4
// PR 5); its tertiary sits on the WHITE card (layer-02), never layer-01 —
// 4.14:1 there is the recorded not-gated pair (PHASE4BUILD §1.22), so the
// surface is set inline because the sheet paints `.sp-route-card` layer-01 and
// a utility class loses to that later rule. As with the viewer boundary, only
// `digest` is surfaced — in production Next has already replaced the thrown
// message with it.
export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // An admin tab left open across a deploy throws ChunkLoadError on its next
  // lazy import; `reset()` re-renders against the same purged URL and can never
  // clear it. Reloading is safe here because the draft layer is server state —
  // only the (already lost) unsaved edit in this render is at stake.
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
    <main className="flex min-h-0 flex-1 items-start justify-center bg-[var(--sp-background)] p-8 text-[var(--sp-text-primary)]">
      <section className="sp-route-card w-full" style={{ background: "var(--sp-layer-02)" }}>
        <div className="cds-empty">
          <h2 ref={headingRef} tabIndex={-1} className="outline-none">
            <ErrorGlyph />
            This admin page could not load
          </h2>
          <p>
            The page failed before it finished loading. Nothing was published, and the draft map is exactly as the
            last successful save left it — but any edit you had open and unsaved is gone.
          </p>
          <div className="cds-empty-actions">
            <button type="button" className="cds-btn cds-btn--tertiary cds-btn--md" onClick={reset}>
              Try again
            </button>
            <Link href="/" className="cds-btn cds-btn--ghost cds-btn--md">
              Back to the published map
            </Link>
          </div>
          {error.digest ? <p className="sp-digest">Reference: {error.digest}</p> : null}
        </div>
      </section>
    </main>
  );
}
