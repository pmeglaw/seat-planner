/**
 * Shared class strings for the admin chrome bars. As of the v12 rail shell
 * (2026-07-31, Tasks 2+3), navigation and the flat-tool row that used to live
 * on both the map header and the sub-page bar moved to AppRail
 * (components/ui/AppRail.tsx) — Show names, Management, Settings, the
 * surface-shortcut cells, and the flat-tool Ask Planner button are all gone
 * from this module's callers, and the retired AdminShellBar (sub-page bar, now AppTopBar) was
 * identity-only (skip link + brand) and imports nothing from here.
 *
 * That collapsed this module down to one surviving export:
 * `adminChromeDividerRule`, the vertical divider rule used twice by the map
 * header (components/seat-map/SeatMap.tsx). It stays its own module rather
 * than folding into components/ui/design-system.tsx (the CROSS-SURFACE
 * primitive set used by viewer and admin alike) because this cluster is
 * admin-shell-specific and may grow again — a token file for one string would
 * be a strange remnant to inline instead.
 *
 * The `<header>` element's own class list is deliberately NOT here. It stays an
 * inline literal in each file because tests/accessibility-source.test.mjs
 * pins the exact `<header className="sticky top-0 ` prefix per file, and hoisting
 * it into a constant would delete the string that test greps for.
 */

/**
 * Vertical divider between chrome clusters — the rule itself, WITHOUT a
 * height. The map header (SeatMap.tsx) is the only consumer today, at 26px,
 * hidden below lg. Height and visibility stay with the caller by design
 * (not because a second consumer disagrees with them) — the retired sub-page bar
 * dropped its own divider entirely in v12 (identity-only bar, no clusters to
 * separate). Only the 1px rule and its color are shared here, so a
 * border-token change still lands in one place if another surface adopts one.
 */
export const adminChromeDividerRule = "w-px shrink-0 bg-[var(--admin-chrome-border)]";
