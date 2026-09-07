import Link from "next/link";

// App-wide 404. Without this, a mistyped or stale URL renders Next's unstyled
// default screen with no way back into the app (UX-01 / #276). Static server
// component — no data, no client hooks. The card is the asset empty state on
// the route card (PHASE3DS §1.29 / sheet block 28, Phase 4 PR 5 — owner ruling
// Q-2), copy as shipped; no error glyph — a wrong address is not a failure.
// Its one action is the tertiary (the card's primary verb), which sits on the
// WHITE card (layer-02), never layer-01 (PHASE4BUILD §1.22) — the surface is
// set inline because the sheet paints `.sp-route-card` layer-01 and a utility
// class loses to that later rule. Renders OUTSIDE the (shell) layout, so it
// owns its own full-height centring.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--sp-background)] px-6 py-12 text-[var(--sp-text-primary)]">
      <section className="sp-route-card w-full" style={{ background: "var(--sp-layer-02)" }}>
        <div className="cds-empty">
          <h2>This page does not exist</h2>
          <p>
            The address may be mistyped, or it may point at something that has been removed. The seat map itself is
            unaffected.
          </p>
          <div className="cds-empty-actions">
            <Link href="/" className="cds-btn cds-btn--tertiary cds-btn--md">
              Back to the seat map
            </Link>
          </div>
        </div>
      </section>
      <p className="sp-digest">seats.megeredchianlaw.com · internal use only</p>
    </main>
  );
}
