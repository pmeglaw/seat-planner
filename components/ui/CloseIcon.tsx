// The one close glyph (2026-07-16 critique, action 4): every dialog/panel
// close renders this drawn X — never the literal text character "x", which
// sits off-baseline and reads as a typo beside the drawn icon family.
export function CloseIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <path d="m5.5 5.5 9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
