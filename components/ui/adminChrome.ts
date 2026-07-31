/**
 * Shared class strings for the two admin chrome bars: the map header
 * (components/seat-map/SeatMap.tsx) and the sub-page bar
 * (components/ui/AdminShellBar.tsx).
 *
 * Both bars carried byte-identical private copies of these strings until v12,
 * and the copies had already drifted — the map's divider was retuned for a
 * taller bar and the sub-page bar's was not, and the map grew `disabled:` arms
 * the sub-page bar never needed. That drift is what made "normalize the two
 * headers" real work rather than a rename, so the strings live here now and the
 * bars compose them.
 *
 * Why not components/ui/design-system.tsx, which already hosts focusRingClass
 * and markerStateClassRecipes: that module is the CROSS-SURFACE primitive set
 * (buttons, badges, focus rings, marker recipes) used by viewer and admin
 * alike. This cluster is admin-shell-specific and is scheduled to grow — the
 * nav rail's item states and the header's square icon cells both land here —
 * so it stays its own module instead of swelling the shared one. Deliberate,
 * not an oversight.
 *
 * The `<header>` element's own class list is deliberately NOT here. It stays an
 * inline literal in each file because tests/accessibility-source.test.mjs:548-550
 * pins the exact `<header className="sticky top-0 ` prefix per file, and hoisting
 * it into a constant would delete the string that test greps for. Only the items
 * INSIDE the bar are shared.
 *
 * Height comes from --admin-chrome-h (app/globals.css) rather than a literal, so
 * every full-height item tracks the bar automatically. That coupling is
 * load-bearing, not tidiness: the active state is a 2px bottom border, and it
 * only lands on the bar's bottom edge while item height == bar height. The token
 * is 36px on every surface today — the top chrome keeps its original size — so
 * changing the bar's height is a one-value edit rather than a hunt through both
 * bars and the four panels that dock beneath them.
 */

// Structure + focus ring, shared by every flat tool. Only AdminShellBar (the
// sub-page bar) composes these three today — the map header's own row lost
// its last flat-tool users in v12 (Show names, Management, and the flat-tool
// Ask Planner all moved to the rail or the header kebab; see SeatMap.tsx's
// header block). The `inline-flex`-first-token contract that used to matter
// for SeatMap's now-retired chromeToolbarBtnCollapsible* string-replace
// derivations is retired with them — nothing derives a collapse variant from
// this string anymore.
const chromeToolBase =
  "inline-flex h-[var(--admin-chrome-h)] shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[12.5px] font-medium leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

/** Resting flat tool: muted label, transparent underline, hover to full contrast. */
export const adminChromeTool = `${chromeToolBase} border-transparent text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)]`;

/** Active flat tool: 2px brand underline on the bar's bottom edge (5.37:1 on #161616). */
export const adminChromeToolActive = `${chromeToolBase} border-[var(--admin-primary)] bg-[var(--admin-chrome-hover)] text-[var(--admin-chrome-text)]`;

/**
 * Disabled arm, appended by the map header only — the sub-page bar carries pure
 * navigation and has no disableable tool, so it does not ship dead `disabled:`
 * variants for links that can never be disabled.
 */
export const adminChromeToolDisabled =
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--admin-chrome-muted)]";

/** Two-line surface-switcher cell (icon over label), fixed 48px wide. */
export const adminChromeSurfaceShortcut =
  "flex h-[var(--admin-chrome-h)] w-12 shrink-0 flex-col items-center justify-center gap-0.5 border-b-2 text-[10px] font-medium tracking-[0.02em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

/**
 * Vertical divider between chrome clusters — the rule itself, WITHOUT a height.
 * The two bars genuinely disagree there: the map header runs 26px and the
 * sub-page bar 22px. Unifying them would resize one bar's chrome, which the
 * owner has ruled out, so height stays with the caller (as does visibility —
 * the map hides its divider below lg, the sub-page bar keeps it at every
 * width). Only the 1px rule and its color are shared, so a border-token change
 * still lands in one place.
 */
export const adminChromeDividerRule = "w-px shrink-0 bg-[var(--admin-chrome-border)]";
