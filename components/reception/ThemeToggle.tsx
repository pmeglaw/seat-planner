"use client";

import { useEffect, useState } from "react";
// Shared with app/layout.tsx's boot script — the two halves of the theme
// switch must agree on these strings (see lib/theme.ts).
import { THEME_DARK, THEME_LIGHT, THEME_STORAGE_KEY } from "@/lib/theme";

// App-wide light/dark switch (reception handoff): flips html[data-theme] and
// persists to localStorage; app/layout.tsx's boot script replays the stored
// value before paint on the next load. Shell chrome stays dark in both themes
// — today only Reception's --r-* tokens respond.

export function ThemeToggle() {
  // Server renders the light-mode label; the effect syncs to the real
  // attribute after hydration (the boot script may have set dark already).
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === THEME_DARK);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.theme = THEME_DARK;
    else delete document.documentElement.dataset.theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next ? THEME_DARK : THEME_LIGHT);
    } catch {
      // Storage unavailable (private mode) — the in-page toggle still works.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      className="flex h-7 items-center gap-1.5 border border-[var(--r-card-border)] bg-[var(--r-card)] px-2.5 text-[11.5px] font-medium text-[var(--r-secondary)] transition-colors hover:bg-[var(--r-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--r-accent)]"
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
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
