"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/design-system";
import { planChunkErrorRecovery } from "@/lib/chunkLoadRecovery";

// Route error boundary for the /admin subtree. All three admin pages throw on a
// failed query (app/admin/page.tsx:80, management/page.tsx:63,
// settings/page.tsx:44); without this the admin sees Next's default error
// screen and cannot tell whether the draft map survived.
//
// Separate from app/error.tsx because the nearest boundary wins: this one wears
// `.admin-theme` and says what an editor needs to hear about in-flight edits.
// As with the viewer boundary, only `digest` is surfaced — in production Next
// has already replaced the thrown message with it.
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
    <main className="admin-theme flex min-h-[calc(100svh-var(--sp-chrome-height))] items-center justify-center bg-[var(--sp-background)] p-6 text-[var(--sp-text-primary)]">
      <section className="w-full max-w-md border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-6 shadow-elevation-2">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-[var(--sp-text-primary)] outline-none"
        >
          This admin page could not load
        </h1>
        <p className="mt-2 text-sm leading-5 text-[var(--sp-text-secondary)]">
          The page failed before it finished loading. Nothing was published, and the draft map is exactly as the last
          successful save left it — but any edit you had open and unsaved is gone.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Button variant="primary" onClick={reset} className="w-full">
            Try again
          </Button>
          <Link
            href="/"
            className="flex min-h-11 w-full items-center justify-center rounded-[var(--sp-radius-xl)] border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] text-sm font-semibold text-[var(--sp-text-primary)] transition-colors hover:bg-[var(--sp-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)] focus-visible:ring-offset-2"
          >
            Back to the published map
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 font-mono text-xs leading-4 text-[var(--sp-text-helper)]">
            Reference: {error.digest}
          </p>
        ) : null}
      </section>
    </main>
  );
}
