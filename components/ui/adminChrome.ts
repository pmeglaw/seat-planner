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
 * height. Consumers: the map's bar tenants (SeatMap.tsx — brand|commands at
 * mx-4, Ask Planner|publish at mx-3) and AppTopBar's actions|account divider
 * (peer-empty-gated). Height and spacing stay with the caller by design:
 * zone-level boundaries get 16px air (mx-4), group boundaries inside a zone
 * get 12px (mx-3) — the de-cram pass 2026-08-18 set that rhythm. Only the
 * 1px rule and its color are shared here, so a border-token change still
 * lands in one place.
 */
export const adminChromeDividerRule = "w-px shrink-0 bg-[var(--admin-chrome-border)]";
