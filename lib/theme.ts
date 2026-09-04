// The app-wide theme contract, in one place. Two runtimes must agree on these
// strings: app/layout.tsx's inline boot script (replays the stored choice
// before paint) and the in-page control (components/ui/ThemeToggle.tsx today;
// the Account panel's Theme radio from redesign-v2 PR 2). They previously
// duplicated the literals, where a rename in one place would silently split
// boot-time replay from the toggle — the theme would revert on every reload,
// or stop persisting, with no test or type error.
//
// Three states (PHASE3DS §1.2, owner ruling 2026-09-03):
//   stored "light" → html[data-theme="light"]  → data-carbon-theme="white"
//   stored "dark"  → html[data-theme="dark"]   → data-carbon-theme="g100"
//   nothing stored → no attribute (= system)   → no Carbon attribute; the
//                    asset's prefers-color-scheme guard renders system-dark.
// The boot script never seeds the OS preference into an explicit attribute:
// a seeded attribute would show "Dark" selected for a system user and stop
// following the OS mid-session. (The old seeding existed because the old CSS
// had no media query; that reason is gone.)
export const THEME_STORAGE_KEY = "sp-theme";
export const THEME_DARK = "dark";
export const THEME_LIGHT = "light";

// Carbon's theme attribute (tokens/carbon-tokens.css flips on it) and the two
// values the app derives from data-theme. Derived, never chosen directly.
export const CARBON_THEME_ATTR = "data-carbon-theme";
export const CARBON_THEME_LIGHT = "white";
export const CARBON_THEME_DARK = "g100";

export type ThemeChoice = typeof THEME_DARK | typeof THEME_LIGHT | null;

// data-theme value → data-carbon-theme value (null = attribute removed).
export function carbonThemeFor(theme: string | null | undefined): string | null {
  if (theme === THEME_DARK) return CARBON_THEME_DARK;
  if (theme === THEME_LIGHT) return CARBON_THEME_LIGHT;
  return null;
}

// Sets both attributes on <html> through one function so they can never
// disagree. `choice === null` is "system": both attributes removed.
export function applyThemeAttributes(root: HTMLElement, choice: ThemeChoice) {
  if (choice) root.setAttribute("data-theme", choice);
  else root.removeAttribute("data-theme");
  const carbon = carbonThemeFor(choice);
  if (carbon) root.setAttribute(CARBON_THEME_ATTR, carbon);
  else root.removeAttribute(CARBON_THEME_ATTR);
}

// In-page switch: applies the attributes and persists the choice (null clears
// the stored value so the next boot follows the OS).
export function applyTheme(choice: ThemeChoice) {
  applyThemeAttributes(document.documentElement, choice);
  try {
    if (choice) window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    else window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode) — the in-page switch still works.
  }
}

// The pre-paint replay, as a string for app/layout.tsx's inline <script>.
// Built from the constants above so the boot replay and applyTheme can never
// disagree. Reads the stored choice only; an empty store leaves both
// attributes absent (system).
export const THEME_BOOT_SCRIPT =
  `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}'),d=document.documentElement;` +
  `if(t==='${THEME_DARK}'||t==='${THEME_LIGHT}'){d.setAttribute('data-theme',t);` +
  `d.setAttribute('${CARBON_THEME_ATTR}',t==='${THEME_DARK}'?'${CARBON_THEME_DARK}':'${CARBON_THEME_LIGHT}')}}catch(e){}`;
