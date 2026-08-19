// The app-wide theme contract, in one place. Two runtimes must agree on these
// strings: app/layout.tsx's inline boot script (replays the stored choice
// before paint) and components/ui/ThemeToggle.tsx (flips it in-page).
// They previously duplicated the literals, where a rename in one place would
// silently split boot-time replay from the toggle — the theme would revert on
// every reload, or stop persisting, with no test or type error.
//
// The value written to html[data-theme] and localStorage. Only Reception's
// --r-* tokens react to it today; other surfaces render identically until
// they grow dark tokens (see app/globals.css).
export const THEME_STORAGE_KEY = "sp-theme";
export const THEME_DARK = "dark";
export const THEME_LIGHT = "light";

// The OS fallback consulted ONLY when localStorage holds no choice — a stored
// "light" is an explicit pick and beats a dark OS. Interpolated into the boot
// script like the key/values above, for the same drift reason.
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
