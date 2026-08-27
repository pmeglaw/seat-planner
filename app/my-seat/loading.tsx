// PR-5 (§8.1 nit): /my-seat used to inherit the root segment's boundary and
// announce "Loading the seat map…" — the wrong sentence for this page. Same
// deliberately low-fidelity recipe as app/loading.tsx, own words.
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="shell-theme flex min-h-screen flex-col bg-[var(--sp-background)]"
    >
      <span className="sr-only">Loading your seat…</span>
      <div aria-hidden="true" className="sp-zone-chrome h-11 shrink-0 bg-[var(--sp-background)]" />
      <div aria-hidden="true" className="flex-1 animate-pulse motion-reduce:animate-none">
        <div className="mx-auto mt-6 h-8 w-full max-w-[420px] bg-[var(--sp-layer-01)]" />
        <div className="mx-auto mt-4 h-[50vh] w-[min(94vw,560px)] bg-[var(--sp-layer-01)]" />
      </div>
    </div>
  );
}
