# Shell Redesign — Mockup Handoff for Claude Design

Date: 2026-08-28 · Owner: Patrick (pmeglaw) · Status: rulings final, visual execution open
Branch: `docs/redesign` (design artifacts, never merges)

## What this is

Brief for a Claude Design mockup canvas of the seat-planner shell redesign. Every item under
**Ruled decisions** was decided by the owner in the 2026-08-28 brainstorm — the mockup explores
*visual execution* of those decisions, it does not revisit them. Items under **Open for the
mockup** are where design judgment is wanted.

`shell-reference.html` (same directory) is a **directional prototype only** — useful for the
Carbon shell mechanics (header anatomy, panel slide behavior, token values), NOT a source of
truth. Its abstract seat-grid canvas is explicitly rejected: the real product renders seats on a
raster photo-plan of the actual office, and spatial fidelity ("the desk by the window") IS the
product.

## Product context

Private seat-planning app for Megeredchian Law (single office, one floor, ~30 staff, non-technical
users). Next.js + Supabase, currently a Carbon-v12-flavored custom design. Surfaces:

- `/` **viewer** — read-only published map, any signed-in staff. Seat-finder search.
- `/admin` **map editor** — admins edit a draft layer; **Publish** copies draft to what viewers see.
  Core flow; must never feel at risk.
- `/admin/management` — employee/department data tables.
- `/admin/settings` — data utilities (CSV import, snapshot restore, publish history).
- `/reception` — front-desk call-routing directory, read-only.

Being replaced: 48px icon rail (left edge) + 40px top bar + inspector overlay on the map.

## Ruled decisions (do not re-open)

1. **Carbon global header, 48px, all signed-in surfaces.** IBM Carbon global-header pattern
   (carbondesignsystem.com/patterns/global-header). Fixed, full width, square corners, IBM Plex.
2. **Header name**: "Megeredchian Law" (400 weight, secondary color) + "Seat Planner" (600,
   primary) — org prefix pattern.
3. **Product links in the header at desktop**: Seating · Management · Settings · Reception
   (role-filtered — viewers see fewer). Current page = 3px blue-60 bottom border. Below ~1056px
   links collapse into the hamburger panel.
4. **No persistent left rail — gone entirely.** Hamburger (leftmost, 48×48) opens a 256px left
   nav panel as an **overlay at all widths**: scrim over content, closes on navigate / Escape /
   outside click. Map never reflows.
5. **Utilities, flush right, no gaps, 48×48 each, in this order**: Search · Notifications ·
   Account. No Help. No app switcher (standalone product).
   - **Search** opens the existing seat/person palette (admin) or seat-finder (viewer).
   - **Notifications** opens a right panel. Admin variant: history of draft-action feedback
     (assigned, moved, swapped toasts accumulate). Viewer variant: publish-derived people
     changes ("Alex R. moved to L-14", "New: J. Okafor at C-03"). Unread badge dot.
   - **Account**: existing menu (email, theme, sign out).
6. **Sense of place lives in the header, persistently**: a Draft-mode tag on admin surfaces
   (viewers get NO tag) and a non-production environment warning tag when applicable.
7. **Map furniture** (admin map page, top to bottom): header → **40px toolbar strip** (dept/zone
   filters, zoom, clear selection; horizontal scroll at narrow) → **stats strip** (clickable
   seat-count tiles — assigned / available / etc. — that double as state filters; big
   Plex-Light numbers) → canvas.
8. **Inspector = docked right aside, ~288px**, beside the canvas: selection details, actions,
   legend; designed empty state when nothing selected; never covers the map. At narrow widths it
   drops below the canvas or becomes a sheet.
9. **Floor plan stays raster** — the real office photo-plan. Sanctioned additions: **SVG overlays
   on top** (zone boundaries, zone labels, seat highlights) and **re-treatment of the raster
   itself** (recolor, desaturate, line-weight, dark-mode variant) at the same framing.
10. **Execution will be staged PRs** (chrome first, then furniture) — the mockup should read as
    one coherent end state; staging is an engineering concern.

## Fixed constraints (Carbon + app invariants)

- Zero border radius everywhere except tags (16px) and badge dots.
- IBM Plex Sans/Mono, flush left, sentence case. Blue 60 `#0f62fe` is the only primary action
  color. Grays dominate — if a screen reads colorful, it's wrong.
- Light AND dark themes, both real designs (dark ≠ inverted light). The raster plan may show a
  dark re-treatment in dark theme.
- Status = two signals minimum (color + shape/glyph), never color alone. Existing marker
  vocabulary: fill = availability, glyph = reason.
- Focus: 2px `#0f62fe` inset outline, never removed. Touch targets ≥44px.
- Text ≥4.5:1 contrast (≥3:1 large/graphical); check marks against hover surfaces (#e8e8e8
  light), not white.
- Type: fixed product set — 12/16 labels, 14/18–20 body, 20/28 section heads, 28/36 page heads;
  large numbers go *lighter* (300), not bolder.
- Motion: Carbon productive tokens (70/110/150/240ms), one axis at a time.
- Key geometry: header 48px · nav panel 256px · toolbar 40px · inspector ~288px · spacing scale
  2/4/8/12/16/24/32/40/48px.

## Artboards wanted

1. **Admin map, desktop ~1440, light** — the hero: header (links, draft tag, utilities), toolbar,
   stats strip, raster canvas with seat pills + zone overlays, docked inspector with a seat
   selected (occupant, actions: move / swap / vacate, legend).
2. **Same, inspector empty state** — nothing selected.
3. **Hamburger nav panel open** — overlay + scrim over artboard 1.
4. **Notifications panel open, admin variant** — right panel over artboard 1, unread badge.
5. **Viewer, desktop, light** — header without draft tag / edit affordances, seat-finder
   presence, published map.
6. **Admin map, 390px** — collapsed header, strips at narrow, inspector as sheet/below-canvas.
7. **Admin map, desktop, dark** — artboard 1 in dark theme incl. raster re-treatment direction.

Use a faithful stand-in for the floor plan (muted architectural plan texture is fine); seat
markers are small pills/squares anchored to desks, ~30 seats across a handful of named zones
(Litigation, Corporate, Paralegals, Hoteling, Reception).

## Open for the mockup to explore

- Toolbar composition and grouping; where zoom lives.
- Stats strip: tile design, which counts, selected-state treatment.
- Inspector internal layout and action hierarchy; where Publish lives and how prominent.
- Zone overlay styling on the raster (boundary weight, label placement, highlight treatment).
- Raster re-treatment direction (light + dark).
- Search presentation: expanding header field vs. palette dialog.
- Draft tag + env tag visual form (24px tags in the 48px bar).
- Notification item anatomy.

## Explicitly rejected — do not show

- Abstract schematic seat grid replacing the floor plan (shell-reference.html's canvas).
- App switcher, Help utility, multi-floor navigation (one floor exists).
- Persistent/pinned left nav, icon rail.
- Rounded cards, glass/luxury treatments (a prior glass redesign was rejected wholesale).
