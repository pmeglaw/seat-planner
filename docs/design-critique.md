# Office Seat Planner — Smoke Test & Design Critique

**Date:** 2026-07-07 · **Build:** `design/vacate-toast-undo` @ `7771bba`, `npm run dev` (Next 15.5.19)
**Method:** Live app driven in a real, visible browser. Unauthenticated surface (login, redirects) exercised with headed Playwright (Chromium 149, `slowMo: 250`); authenticated viewer + admin flows exercised in a logged-in Chrome session via browser automation (no credentials were available, and the seat data was never mutated — modes were entered and exited without committing changes). Screenshots: `docs/design-review/before/` (desktop ≈1600×1000, mobile ≈500×950; login mobile at 390×844 via Playwright).

**Caveat:** authenticated "mobile" testing ran at 500 px window width (Chrome's minimum), not 390 px. Both are below the `panel:` 900 px breakpoint, so sheet/stacked layouts were exercised, but sub-500 px overflow was not verified for viewer/admin.

---

## 1. Smoke test results

### What works

| Area | Result |
|---|---|
| Auth gating | `/` → `/login?next=/`, `/admin` → `/login?next=/admin` when signed out. Both layers enforced server-side. |
| Login | Renders desktop + mobile. Submit disabled until both fields filled. Wrong credentials → friendly inline alert ("Email or password is incorrect… magic-link fallback"), `role="alert"`. Magic-link fallback mode present. Visible focus ring on inputs. |
| Viewer map | 60 published markers render, **0 out of the floor-plan image bounds** (verified programmatically). Hover shows orange ring; click selects (dark pill) and fills the "Selected detail" panel with seat/zone/department/availability. |
| Viewer search | "north" → 22 results · 20 mapped; matching seats tinted teal, non-matches dimmed; result-row click selects the seat on the map and populates detail; Reset/Clear work. |
| Admin map | 60 draft markers; charcoal top bar with draft-status chip, command search (Ctrl K), Filters, Hide names, Undo/Redo (correctly disabled with clean history), Management link, Ask Planner, zoom, avatar. |
| Seat inspector | Click seat → floating panel (desktop) / bottom sheet (mobile). Status badge, details, notes, Move / Swap / Vacate, Change assignment; Delete correctly disabled on assigned protected seats with an explanatory caption; "No unsaved changes" state chip. |
| Move Seat mode | Inspector "Move" → button becomes "Exit move", helper text "Drag the seat marker to its new spot. Esc exits move.", marker gets move-origin styling. Esc exits cleanly. |
| Add Seat mode | Toolbar "Add seat" → instruction card ("Click inside a seating zone…"), Exit button + "Esc exits" chip. Esc exits cleanly. |
| Filters | Overlay panel with Department / Zone / Status selects; Collapse works. |
| Ask Planner | "Which seats are open?" → correct broad answer (54 open, per-zone counts), *Answered / high confidence* chips, and an explicit warning that broad answers don't highlight. "Which seats are open in Center Desks?" → correct 7 seats, **7 highlighted on map**, count badge appears on the top-bar pill, highlight chips with Select → opens that seat's inspector (read-only, per spec). Clear highlights works. |
| Settings (`/admin/settings`) | CSV template/export/import rows and Advanced recovery (JSON backup/restore) render, gated behind review flows. |
| Console / network | **Clean.** Only React DevTools info + Fast Refresh logs. No failed requests, no 4xx/5xx during normal use (the two Supabase `400`s recorded were the intentional wrong-credential submissions). |

### Broken / rough edges found

1. **Login accepts malformed email client-side** — submit enables for `not-an-email` + any password; validation is left entirely to the Supabase round-trip. Cheap fix: `type="email"` + a format check before enabling (`components/auth/LoginForm.tsx`).
2. **Ask Planner / search highlights are nearly invisible on the map at default zoom.** The 7 highlighted Center Desks seats carry `data-marker-intent="search-result"` styling, but at overview zoom they read as plain white pills — the answer says "7 on map" and the eye finds nothing. (See critique, High.)
3. **Narrow widths silently drop top-bar tools.** At 500 px the admin bar shows Filters / Hide names / Undo / avatar; **Ask Planner, Management, Redo and zoom disappear with no overflow menu**. The row is horizontally scrollable (`overflow-x-auto`, SeatMap.tsx:1808) but nothing hints at it — scrollbars are hidden.
4. **Mobile bottom sheet covers the selected seat.** Tapping W08 opens the sheet, but the map strip above it still shows the top-left of the floor plan; the selected marker stays hidden under the sheet (no recenter into the remaining viewport).
5. **Add Seat mode has no pointer affordance** — cursor stays a default arrow over the map; no crosshair, no ghost pill preview at the pointer.
6. **Esc out of Move mode toasts "Draft map mode canceled."** — accurate but reads like something was discarded; "Move mode exited — no changes" would be calmer.
7. **Viewer requires login.** `app/page.tsx:18` redirects signed-out users. If the intent is "any signed-in employee can view," this is fine; if `/` was meant to be a lobby-kiosk style read-only page, it isn't one today. Worth a deliberate decision.
8. Marker hit targets are **32×32 px** — fine for WCAG 2.2 (≥24 px) and mouse, but under the 44 px comfortable-touch guideline on mobile.

---

## 2. Design critique

Ranked. Contrast figures computed from the token values in `app/globals.css`.

### Critical

Nothing is broken to the point of blocking use, and the token work already done (AA-checked text ladder, focus rings, protected-seat explanations, aria-labels on every marker) is genuinely strong. The items below are where the experience loses the most value.

### High

1. **Map highlight states don't survive zoom-out** (`SeatMarker.tsx`, `--admin-marker-search-*` tokens). The teal search/planner treatment lives in a 1-px border (`rgba(22,83,89,0.78)`) and a soft ring (`--admin-marker-search-ring` at 0.44 alpha) on a 96 %-opacity white pill — at overview scale that's sub-pixel. This is the payoff moment of both search and Ask Planner and it currently fails silently.
   *Fix:* raise `--admin-marker-search-halo` to ≥0.5 alpha and widen the halo ring (e.g. `0 0 0 5px`), tint the pill surface itself with `--admin-info-soft` (`#DCEDEA`, solid, not 0.96 white), and dim non-matches harder (viewer already does `opacity-45 saturate-50`; admin planner highlights don't dim the rest). A single `motion-safe` scale-pulse on apply (150 ms, `motion-reduce:animate-none`) would direct the eye without living animation.
2. **Narrow-width admin loses tools invisibly** (SeatMap.tsx:1808). Hidden-scrollbar `overflow-x-auto` with no affordance = features that appear to not exist. *Fix:* a `⋯` overflow menu below `lg:`, or at minimum a right-edge fade mask (`[mask-image:linear-gradient(to_left,transparent,black_24px)]`) so truncation is visible. A11y: the menu button needs `aria-haspopup="menu"` + visible focus.
3. **Mobile sheet hides the thing you selected.** When the inspector sheet opens ≤899 px, pan the selected marker into the visible map strip (the map already auto-pans on desktop selection — reuse that logic with a vertical offset of the sheet height).

### Medium

4. **Filters panel is a full-height near-empty slab with native `<select>`s** (`FilterPanel.tsx:121`). Three unstyled dropdowns in the top 20 % of an otherwise blank white column; native selects don't match the design system anywhere else. *Fix:* size the panel to content (`h-fit`, it already has `self-start` — drop the tall min-height look), and either style selects (`rounded-sp-md border-sp-strong bg-sp-surface px-sp-3`) or move to the pill-toggle pattern the app already uses for chips. Also add active-filter chips inside the panel so state is visible when it reopens.
5. **`/admin/settings` drops the app chrome entirely.** No top bar, no breadcrumb — just a floating "Back to planning canvas" button on bare canvas. It reads like a 404-adjacent utility page, not part of the product. *Fix:* reuse the admin top bar (or a slim variant: logo + "Settings" + back), keep the canvas background `--admin-bg`.
6. **Add Seat mode affordance** — `cursor-crosshair` on the viewport while active (one class on the viewport div in `SeatMap.tsx`), ideally plus a pointer-following ghost pill (`pointer-events-none`, 50 % opacity). The instruction card is good; the pointer should agree with it.
7. **Touch targets** — bump marker hit area to ≥40 px on coarse pointers: `[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11` on the hit-target class in `SeatMarker.tsx` (visual pill can stay 32 px; the button is already bigger than the token).
8. **Viewer stat tiles are dead weight** (`ViewerSeatFinder.tsx` header). ASSIGNED / OPEN / RESERVED read as three identical gray outline boxes; they carry status semantics the tokens already encode. *Fix:* left accent bar per tile (`border-l-4 border-[var(--sp-color-state-success)]` / `-draft` / `-warning`) or a small status dot, and make them filter shortcuts (click OPEN → status filter) so they earn their place.
9. **"Show on map" disabled state** looks like a permanently flat gray pill sitting on the primary action position; with `--sp-color-state-disabled` (#DDDFE2) on white it's almost invisible as a *button*. Give the disabled state a visible border (`border-[var(--sp-color-border-strong)]`) so the affordance persists.

### Nice-to-have

10. Login: email format validation client-side; also consider `autocomplete="email" / "current-password"` if not present.
11. Toast copy: "Draft map mode canceled." → "Exited move mode — nothing changed."
12. The dev-only Next.js badge (bottom-left "N") overlaps the legend row at narrow widths — dev-only, but worth knowing it's not the app.
13. Search-result dimming on the **admin** map when planner highlights are active (viewer dims non-matches; admin doesn't) — consistency.

---

## 3. Adding life to the chrome (why it feels flat, and what to do)

### Diagnosis

The design system *has* an elevation ladder (0–5, `globals.css:317-330`) — but the app barely spends it:

- **Shell shadows are explicitly off:** `--admin-shadow-shell/command/map: none` ("flat refined chrome"). The top bar, command row and map all sit on one visual plane.
- **The surface ladder is compressed:** canvas `#EAEBEC` → surface `#FCFCFD` → raised `#FFFFFF` spans ~1.09:1 luminance. With `--admin-elevation-2-shadow` at `0 1px 2px / 6%` and elevation-3 at `4px 12px / 10%`, panels are separated only by a 1.43:1 hairline border. Everything white-ish merges.
- **Zero mounted motion:** `AskPlannerDrawer.tsx:188` is `if (!open) return null` — drawers, the inspector and the filter panel pop in and out in a single frame. Only seat markers have transitions (`SeatMarker.tsx:330`). The chrome never *responds*, so it feels inert.
- **Toolbar buttons have no resting shape:** `chromeToolbarBtn` (SeatMap.tsx:1734) is bare text that gains `bg-white/[0.08]` on hover. Until you hover, the top bar is a label strip, not a tool row.
- **The map has no "well":** the floor plan floats edge-to-edge inside a hairline; nothing says "this is the work surface and that is the chrome around it."

The fixes below stay quiet — depth from *layering and light*, not color or ornament. Every shadow change is decorative (no contrast impact); every motion change must ship with a `motion-reduce` guard.

### Quick wins — high impact, ~1 line each

| # | Change | Where | Accessibility |
|---|---|---|---|
| 1 | **Deepen the elevation tokens** (two-layer shadows read as light, not smudge): `--admin-elevation-2-shadow: 0 1px 2px rgba(15,18,20,.05), 0 2px 8px -2px rgba(15,18,20,.06)`; `--admin-elevation-3-shadow: 0 1px 2px rgba(15,18,20,.05), 0 10px 28px -6px rgba(15,18,20,.16)`. Every panel/drawer already references these — one edit lights up the whole app. | `app/globals.css:321-323` | None (decorative). |
| 2 | **Give the top bar a floor:** on the header container add `shadow-[0_1px_0_rgba(0,0,0,0.35),0_6px_16px_-8px_rgba(15,18,20,0.35)]` (replaces `--admin-shadow-shell: none`) and a `bg-gradient-to-b from-[#25282B] to-[#1F2225]` using the already-defined-but-unused `--admin-chrome-elevated`. The bar becomes a physical object above the canvas. | top-bar `<header>` in `components/seat-map/SeatMap.tsx`; token in `globals.css:327` | Text stays on ≥#1F2225 equivalents — existing ratios hold (muted `#9AA0A6` ≈ 6.1:1). |
| 3 | **Resting affordance for toolbar buttons:** in `chromeToolbarBtn`, add `border border-transparent hover:border-[var(--admin-chrome-border)] transition-colors duration-sp-fast`; in `chromeToolbarBtnActive`, add `shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]` and keep the underline. Buttons read as buttons before hover. | `components/seat-map/SeatMap.tsx:1734-1735` | Focus rings unchanged. |
| 4 | **Sink the map into a well:** set `--admin-shadow-map: inset 0 1px 4px rgba(15,18,20,0.07)` (currently `none`) and darken `--admin-surface-muted`-backed map workspace one step (`--admin-bg` stays; map floor `#E6E8EA`). Pills instantly gain figure-ground. | `globals.css:329, 158` + map viewport class in `SeatMap.tsx` | Marker text tokens were AA-checked against the *beige* floor at ≥3:1; a 2 % darker cool floor slightly *improves* those ratios. |
| 5 | **One step more canvas separation:** `--admin-bg: #EAEBEC → #E7E9EB`. White panels (#FCFCFD) pop without any new borders. | `globals.css:158` | Verify `--admin-text-muted` #5E646A on new canvas: ≈4.9:1 — still AA. Don't go darker than `#E4E6E8` without rechecking. |

### Second pass — micro-interactions (medium effort)

| # | Change | Where | Accessibility |
|---|---|---|---|
| 6 | **Drawer/panel enter animation.** Define once in `globals.css`: `@keyframes sp-panel-in { from { opacity:0; transform:translateY(10px) scale(.98) } }` and apply `motion-safe:animate-[sp-panel-in_200ms_cubic-bezier(0.2,0,0,1)]` to the Ask Planner aside (`AskPlannerDrawer.tsx:207`), inspector aside (`SeatInspector.tsx:790`), filter panel (`FilterPanel.tsx:121`) and the mode cards. Mobile sheet variant: `translateY(24px)`, 240 ms (`--sp-duration-deliberate` is 280 ms — stay under it). | `globals.css` + 4 class edits | `motion-safe:` prefix makes it reduced-motion-clean by construction; 200 ms with no loop is WCAG 2.3.3-safe. |
| 7 | **Hover lift on floating panels' interactive rows** (suggested-prompt chips, highlight chips, settings rows): `transition hover:-translate-y-px hover:shadow-sp-raised motion-reduce:transform-none`. Cheap "alive" signal that compounds with #1. | `AskPlannerDrawer.tsx` chips, `DataUtilitiesPanel.tsx` rows | Transform-only; guard included. |
| 8 | **Draft-status chip breathing room:** when `publishSummary.hasChanges` flips true, one `motion-safe` 300 ms scale-in on the chip (SeatMap.tsx:1753) so the state change is noticed without a toast. | `SeatMap.tsx:1758` | One-shot, guarded. |
| 9 | **Stronger planner/search halos** (also High #1 above — it's both a bug and the single best "life" injection on the map): solid tinted pill surface + wider halo + one-shot pulse. | `globals.css:281-285`, `SeatMarker.tsx` | Teal border `#2F6668` on floor ≥3:1 holds; pulse is motion-safe one-shot. |

### Bigger swings (do after the above lands)

- **Ghost seat pill following the cursor in Add Seat mode** (`SeatMap.tsx` viewport pointermove; `pointer-events-none`, 50 % opacity, snaps to zones). Highest-effort item here but turns the flattest mode into the most tactile one.
- **Overflow menu for the top bar below `lg:`** (fixes High #2 properly and adds a place for future tools).
- **Dark-canvas focus mode toggle** — the tokens already define `--sp-color-workspace` (#1F2225): an optional dark surround for the map (chrome stays) would give the product a genuinely dimensional "editor" feel, and it's nearly free because every marker token was contrast-checked against its own pill surface, not the floor.

### Sequencing note

Items 1–5 are one-session token/class edits with no behavioral risk and no test impact (`*-source.test.mjs` design tests assert token usage patterns — re-run `npm test` after; none assert `shadow: none`). Item 6 should land with the `motion-reduce` guard in the same commit — the repo currently has `motion-reduce` only in `SeatMarker.tsx`, so this establishes the pattern for chrome.

---

## Appendix — screenshot index (`docs/design-review/before/`)

| File | State |
|---|---|
| `viewer-desktop.png` | Viewer, initial load, 60 markers |
| `viewer-desktop-seat-selected.png` | N01 selected + detail panel |
| `viewer-desktop-search.png` | "north" search: 22 results, dimmed non-matches |
| `viewer-mobile.png` / `viewer-mobile-map.png` | ~500 px stacked layout / scrolled map |
| `login-desktop.png` / `-focus` / `-error` / `-wrong-creds` / `-magic-link` | Login states (Playwright, headed) |
| `login-mobile.png` | Login at 390×844 |
| `admin-desktop.png` | Admin default |
| `admin-desktop-inspector.png` | W08 inspector |
| `admin-desktop-move-mode.png` | Move mode + helper text |
| `admin-desktop-addseat-mode.png` | Add Seat mode card |
| `admin-desktop-filters.png` | Filters overlay |
| `admin-desktop-askplanner-highlights.png` | Ask Planner: 7 highlighted Center Desks seats |
| `admin-settings.png` | Settings / Advanced recovery |
| `admin-mobile.png` / `admin-mobile-sheet.png` | ~500 px admin / bottom-sheet inspector |
