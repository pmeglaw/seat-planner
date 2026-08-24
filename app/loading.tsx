// Route-level loading state for the non-admin segment (viewer map, login,
// auth pages). Every page here is force-dynamic and blocks on Supabase
// round-trips, so without this boundary a navigation shows nothing at all
// until the last query resolves (UX-01 / #276).
//
// The skeleton stays deliberately low-fidelity — a chrome strip plus a
// content wash, not a fake seat map — so it never promises layout the page
// might not deliver. role="status" announces the wait to assistive
// technology; the visible pulse is decorative and honors reduced motion.
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="shell-theme flex min-h-screen flex-col bg-[var(--sp-background)]"
    >
      <span className="sr-only">Loading the seat map…</span>
      <div aria-hidden="true" className="sp-zone-chrome h-11 shrink-0 bg-[var(--sp-background)]" />
      <div aria-hidden="true" className="flex-1 animate-pulse motion-reduce:animate-none">
        <div className="mx-auto mt-6 h-8 w-full max-w-[520px] bg-[var(--sp-layer-01)]" />
        <div className="mx-auto mt-4 h-[60vh] w-[min(94vw,1200px)] bg-[var(--sp-layer-01)]" />
      </div>
    </div>
  );
}
