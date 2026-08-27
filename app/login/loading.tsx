// PR-5 (§8.1 nit): /login used to inherit the root segment's boundary and
// announce "Loading the seat map…" — the wrong sentence for the sign-in
// page. Same deliberately low-fidelity recipe as app/loading.tsx, own words.
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="login-theme flex min-h-screen flex-col bg-[var(--sp-background)]"
    >
      <span className="sr-only">Loading the sign-in page…</span>
      <div aria-hidden="true" className="flex flex-1 items-center justify-center animate-pulse motion-reduce:animate-none">
        <div className="h-[360px] w-[min(92vw,368px)] bg-[var(--sp-layer-01)]" />
      </div>
    </div>
  );
}
