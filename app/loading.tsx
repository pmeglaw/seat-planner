// Route-level loading state for the segments OUTSIDE the persistent shell —
// /login, /my-seat and the auth pages (the viewer map moved under
// app/(shell)/ in redesign-v2 PR 2 and streams its own pane skeleton there).
// Every page here is force-dynamic and blocks on Supabase round-trips, so
// without this boundary a navigation shows nothing at all until the last
// query resolves (UX-01 / #276).
//
// The skeleton stays deliberately low-fidelity — a content wash, not a fake
// page — so it never promises layout the page might not deliver.
// role="status" announces the wait to assistive technology; the visible
// pulse is decorative and honors reduced motion.
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-screen flex-col bg-[var(--sp-background)]">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex-1 animate-pulse motion-reduce:animate-none">
        <div className="mx-auto mt-6 h-8 w-full max-w-[520px] bg-[var(--sp-layer-01)]" />
        <div className="mx-auto mt-4 h-[60vh] w-[min(94vw,1200px)] bg-[var(--sp-layer-01)]" />
      </div>
    </div>
  );
}
