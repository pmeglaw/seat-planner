"use client";

import { useEffect, useState } from "react";
// Shared with app/layout.tsx's boot script — the two halves of the theme
// switch must agree on these strings (see lib/theme.ts).
import { THEME_DARK, THEME_LIGHT, applyTheme } from "@/lib/theme";

// App-wide light/dark switch: applies the theme through lib/theme.ts (both
// attributes + the stored choice); the boot script replays the stored value before
// paint on the next load. Retires into the Account panel's Theme radio in
// redesign-v2 PR 2. Shared chrome across the viewer bar, both shell top
// bars, and Reception — each mounts this one component, passing its own
// className seam for surfaces whose tokens aren't chrome-default.

export function ThemeToggle({ className }: { className?: string }) {
  // Server renders the light-mode label; the effect syncs to the real
  // attribute after hydration (the boot script may have set dark already).
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === THEME_DARK);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    // Sets data-theme AND the derived data-carbon-theme, and persists — one
    // function shared with the boot replay (lib/theme.ts). The toggle knows
    // two states; the Account panel's radio (redesign-v2 PR 2) adds System.
    applyTheme(next ? THEME_DARK : THEME_LIGHT);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      className={
        className ??
        "relative flex h-7 items-center gap-1.5 border border-[var(--sp-border-strong)] bg-transparent px-2.5 text-xs font-medium text-[var(--sp-text-secondary)] transition-colors after:absolute after:-inset-y-2 after:inset-x-0 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-interactive)]"
      }
    >
      {dark ? (
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="10" cy="10" r="3.4" />
          <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" />
        </svg>
      ) : (
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z" />
        </svg>
      )}
      {/* sr-only below md, not `hidden`: the button carries no aria-label, so
          display:none here would leave it nameless. Icon-only under 768px
          because the label is ~66px of a bar that measured 472px of content in
          a 320px viewport (2026-09-01) — and sr-only is position:absolute, so
          the flex gap collapses with it and the control becomes square. */}
      <span className="sr-only md:not-sr-only">{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
