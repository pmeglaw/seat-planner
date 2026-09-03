/**
 * ## Chrome doctrine (unification pass 2026-08-20)
 *
 * The dark chrome (AppTopBar + AppRail + their popovers) follows one spec.
 * Deviating from any line below is a design regression unless a documented
 * owner ruling says otherwise.
 *
 * **Grid** — a 48×40 cell system: rail cells are 48px wide × 40px tall
 * (h-10, matching --sp-chrome-height), the bar's corner cell is the same
 * 48×40, full-height bar tenants are 40px (h-full), field controls are 28px
 * (h-7: ThemeToggle, undo/redo, FloorSelector chrome trigger), the avatar
 * is 26px.
 *
 * **Active states** — vertical chrome (rail items) mark active with a 3px
 * left inset edge in --sp-interactive; horizontal chrome (bar tenants) with a
 * 2px bottom border; transient menu-open state (kebab, account, floor) with
 * fill only. All three share the same fill (--sp-background-hover),
 * foreground (--sp-text-primary), and weight (font-semibold where a label
 * exists).
 *
 * **Hover** — fill --sp-background-hover + foreground --sp-text-primary
 * (never text-white). Exception (owner ruling 2026-08-14): the corner rail
 * toggle brightens its glyph only, no fill.
 *
 * **Focus** — ring-2 ring-inset ring-[var(--sp-interactive)] everywhere, with
 * two documented exceptions: Publish (white ring on the filled CTA — orange
 * on orange would vanish) and the avatar (offset ring on a 26px circle —
 * inset would eat the monogram).
 *
 * **Type** — one chrome text size, 12.5px. Badges: status/label badges
 * (the "AI" chip) are square at 9px; numeric count badges are rounded-full
 * at 11px.
 *
 * **Icons** — 20-unit viewBox, 17px render, stroke 1.5, SVG only. Exception:
 * the hamburger keeps stroke 1.6 (deliberate, see AppRail's icon note).
 *
 * **Dividers** — exactly two spacing tiers: zone boundaries get 16px air
 * (mx-4), group boundaries inside a zone get 12px (mx-3). No third tier.
 *
 * ---
 *
 * Module history: as of the v12 rail shell (2026-07-31, Tasks 2+3),
 * navigation and the flat-tool row moved to AppRail, collapsing this module
 * to one export. It stays its own module because the chrome cluster may grow
 * again. The `<header>` class list is deliberately NOT here:
 * tests/accessibility-source.test.mjs pins the exact
 * `<header className="sticky top-0 ` prefix per file, and hoisting it into a
 * constant would delete the string that test greps for.
 */

/**
 * Vertical divider between chrome clusters — the rule itself, WITHOUT a
 * height. Consumers: the map's bar tenants (SeatMap.tsx — brand|commands at
 * mx-4, undo-redo|kebab and Ask Planner|publish at mx-3) and AppTopBar's
 * actions|account divider (mx-3, peer-empty-gated). Height and spacing stay
 * with the caller by design (two-tier rhythm above). Only the 1px rule and
 * its color are shared here, so a border-token change still lands in one
 * place.
 */
export const adminChromeDividerRule = "w-px shrink-0 bg-[var(--sp-border-subtle)]";
