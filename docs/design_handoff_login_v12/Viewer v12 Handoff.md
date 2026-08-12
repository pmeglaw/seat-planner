# Handoff: Seat Planner — Viewer on Carbon v12 (Find palette + chrome option)

**For:** Claude Code, implementing in `pmeglaw/seat-planner` (main)
**From:** Viewer-only design pass, August 11 2026 · Owner: Patrick
**Supersedes:** viewer portions of `docs/design_handoff_carbon_v12/` (admin screens there remain current)

## Overview

Three moves, all shown in `Viewer v12 Redesign.dc.html` (options 1a–1f) and working in `Viewer v12 Prototype.dc.html`:

1. **Retire the docked People directory** (right panel, collapse rail, and mobile PEOPLE pill/sheet). One **Find surface** replaces search + directory + zone browsing: a palette anchored under the search field. Browse mode (empty query) = zone chips + the A→Z directory; query mode = grouped results while matched seats light up on the map behind it. Rides predicted-v12 mechanics: dynamic floating styles, Menu anatomy, structured-list visible icons, presence.
2. **Floating read-only seat card** with viewer-shaped verbs only: **Copy email** and **Copy map link** (existing `?seat=` deep link, #196). No tabs, no admin actions.
3. **Chrome theme option — dark or light top bar.** Same anatomy, one token swap (redesign 1a vs 1e; prototype `chrome` tweak).

Facts and evidence: `Carbon v12 Brief (Aug 2026).dc.html`. The `.dc.html` files are design references, not production code — recreate in the existing stack (Next.js + Tailwind + bespoke components). **Do not install `@carbon/react`.**

## Repo map — where each change lands

| Design piece | Implement in |
| --- | --- |
| Find palette (anchored, browse + query modes) | `components/seat-map/ViewerSeatFinder.tsx` — replaces the results `<aside>`, the People directory `<aside>`, the collapse rail, and the mobile PEOPLE pill/sheet |
| Palette data (one model: people A→Z, zones w/ counts, grouped query results, unseated rows) | `lib/viewerSeatSearch.ts` (`buildViewerDirectory` + `buildViewerSeatSearch` already compute both halves — merge into one palette feed) |
| Zone chips + hover wash preview / click-to-pin | chips move from `FilterPanel.tsx` into the palette; wash unchanged via `MapWashLayer.tsx` + `lib/zoneWash.ts` |
| Read-only seat card | `components/seat-map/SeatInspector.tsx` viewer branch (or a slim `ViewerSeatCard`) — keep the `useInspectorNudge` wiring in `ViewerSeatFinder` |
| Copy map link | `lib/deepLink.ts` (`withSeatParam`) + clipboard + existing toast pattern |
| Chrome theme option | `app/globals.css` (light-chrome token set) + toggle surfaced in `components/ui/AccountMenu.tsx` |
| Active zone-filter chip (floating, top-left) | existing `ActiveFilterChips` in `FilterPanel.tsx`, reused |

## ⚠ Do-not-touch (repo guardrails, pinned by tests)

1. **Viewer isolation**: `ViewerSeatFinder.tsx` keeps zero AI references; published layer + `published_employees` snapshot only (`accessibility-source`, `published-employee-snapshot` tests). The palette must not read live `employees`.
2. **SeatMarker anchor + calibration frozen**; pill look owner-locked. Only the existing prominent/dim/selected states are used — no new marker states.
3. **INV-1 stays**: an active query owns the transient surface; the seat card yields (in this design the palette and card never overlap, but the search-hands-over rule and its test semantics stay intact).
4. **Keyboard/focus parity**: ⌘K focus, Esc layering, arrow-roving into rows, focus restore to the marker on close — all behaviors `accessibility-source` guards must survive the panel → palette move. Wash stays `aria-hidden` + pointer-inert.
5. Pan/zoom + nudge remain view transforms only.

## Design tokens

Everything reuses existing `--sp-*` / `--admin-*` values. New: a **light-chrome set** for the bar only —
bar bg `#FFFFFF`, border `#E7E1D8`, text `#161616`, muted `#6E655A`, field bg `#F7F6F2`, field border `#D8D0C5`, kbd bg `#fff`. Dark set is today's chrome (`#161616` / `rgba(255,255,255,.10)` / muted `#B8AEA2`). Focus ring on the open field: inset 2px `#FF5715` (both themes). Avatar `#FC672A` unchanged. **No AI family tokens on the viewer.**

## Interaction contracts (acceptance criteria)

1. **At rest nothing docks.** Map is full-bleed; only floor pill, crumb, "Updated ‹date›" pill, legend, zoom float (all layer-01 white cards). The old directory slot, rail, and PEOPLE pill are gone at every width.
2. **Palette open**: field click, focus, or ⌘K/Ctrl-K opens it anchored under the field (left edge aligned, w 560, max-h viewport−60); 150ms rise-in (presence). Outside click closes. It floats — the map never reflows.
3. **Browse mode** (empty query): ZONES chip row (name + mono count) then PEOPLE A→Z (26px avatar initials, name, `SEAT · position` sub, mono seat pill; 40px rows), scrollable; footer kbd legend + "N people · M seated".
4. **Zone chips**: hover previews the wash (`rgba(255,87,21,.09)` fill, `rgba(210,63,10,.55)` border, `#D23F0A` flag "Zone · N seats"); click pins the zone filter and closes the palette; pinned chip renders in the floating top-left cluster with ✕. Hover always wins over pinned for the wash.
5. **Row hover lights its seat** (existing highlighted-marker treatment); Enter/click selects the seat, closes the palette, centers + nudges.
6. **Query mode**: grouped results (people first, then open/other seats), max ~8 rows; heading "RESULTS · N"; matched seats get the orange search treatment, non-matches dim to 35%; "N of M match" in the bar and legend summary. Enter opens the top result.
7. **Esc layering**: floor menu → palette → query → selection → pinned zone, one layer per press.
8. **No results**: message + "TRY INSTEAD" chips (last name / seat code / zone) + Clear search + the publish-cadence note ("new hires appear after the next publish").
9. **Unseated people** stay listed, disabled, "No seat" — never openable.
10. **Seat card**: floats top-right (300px), read-only — identity, status/seat/zone chips, CONTACT (assigned seats), SEAT facts, neighbors; footer verbs Copy email (assigned only) + Copy map link; caption "Published map · read-only…". Open seats explain assignment cadence instead of contact rows.
11. **Copy verbs** write to clipboard + fire the standard toast (`#161616`, 3px `#FF5715` left border, ~2.6s). Map link = current origin + `?seat=<label>`.
12. **Legend follows filters** (counts recompute under a pinned zone; query adds "N of M match ‹query›").
13. **Floor selector** unchanged (Floor 2 SOON → placeholder; selection clears the seat card).
14. **Chrome option**: `dark` (default, today's bar) and `light` (token set above). Surface it as a per-user toggle in the AccountMenu, persisted per browser like the old directory-collapse pref (`localStorage` + same-tab event pattern already in `ViewerSeatFinder.tsx`). Map workspace, floating cards, palette, and seat card are identical in both themes — only bar tokens swap.

## State (maps to existing)

`search` · `paletteOpen` (new; replaces `directoryOpen/Collapsed/mobileDirectoryOpen/resultsPanelOpen`) · `hoverZone` · `pinnedZone` (replaces the filter panel's `zone`) · `hoverSeatId` (was `directoryHoverSeatId`) · `selectedSeatId` + nudge · `floor` · `zoomFactor/pan` · `chromeTheme` (new pref). Department/position/status facets: the old Filter popover is retired in this design — see open question 2.

## Suggested order (branch per slice, tests green between)

1. Palette shell + browse mode; delete directory panel/rail/pill (update `viewer-seat-finder` component tests)
2. Query mode + map highlight wiring (reuse existing predicates)
3. Zone chips + wash + pinned chip
4. Seat card (viewer branch) + copy verbs + toast
5. Chrome theme tokens + AccountMenu toggle
6. A11y pass: focus order, Esc layers, roving, axe clean at 1440×900 and 375w

## Verification loop

Screenshot against `Viewer v12 Redesign.dc.html` screens 1a–1f at 1440×900 (light theme against 1e). Behavior QA per contract above; prototype (`Viewer v12 Prototype.dc.html`, `chrome` tweak for light) is the reference for feel. Full gate: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`.

## Login (added Aug 11, later session) — Carbon login pattern

Screens: redesign canvas options 2a–2d. Reference: carbondesignsystem.com/patterns/login-pattern. Lands in `app/login/page.tsx` + `components/auth/LoginForm.tsx` (fluid-field precedent: `app/concepts/login-v12/LoginV12Preview.tsx`).

1. **Title becomes “Log in”** — the pattern prescribes it over “Sign in”; update page copy and the e2e sign-in helpers that match on button text (`tests/e2e-auth/auth-helpers.ts`).
2. **Progressive auth**: step 1 = Work email + **Continue** (+ optional “Remember my work email on this device” — localStorage, email only, never the password); step 2 = password with the entered email as an editable summary row (the way back), “Forgot password?” with the field, primary **Log in**. Spatial rhythm identical across steps — nothing jumps.
3. **Magic link stays the alternative**, below the primary behind an “or” divider — never between field and primary (pattern hierarchy rule). It short-circuits step 2.
4. **Fluid fields** (56px, label inside, bottom rule 1px `#8d8d8d` resting / 2px `#FF5715` focused / 2px `#B3232C` error, fill `#F4F4F4`) — the login-only exception to the app's boxed fields, as `login-v12` concept documented.
5. **Errors verbatim from the pattern tables**: inline on blur/submit (“Email is required”, “Password is required”, “Enter a valid email address”); server-side = inline notification “Incorrect email or password. Try again.” + password cleared + focus to email. Never confirm a valid email (no error until Log in on step 2). Keep `friendlyAuthMessage*` as the mapping layer. **After a failed password attempt, the server-error notification carries an action: “Email me a sign-in link instead”** (Carbon inline-notification action slot) — it calls the existing `sendMagicLink()` with the entered email, offering recovery where the failure happened.
6. **Layout**: split-screen dark brand column (2a–2b) is the default; centered light (2d) is the alternative if the chrome default flips light. Keep the pre-hydration submit guard, name-less inputs, and the already-signed-in card from the shipped page.

## Open questions for the owner (ask, don't guess)

1. Chrome default: keep **dark** as shipped default, or flip to **light** now that both exist?
2. The old Filter popover carried department/position/status facets; the palette carries zones only. Drop those facets from the viewer, or add a "More filters" row inside browse mode?
3. Mobile (<900px): palette becomes a full-width sheet under the bar — same content, or trimmed (people only)?
4. Directory-collapse localStorage pref becomes dead — migrate/remove the key?
5. Login: adopt two-step progressive auth as designed, or keep today's single-step form with the pattern's fluid fields and “Log in” copy only?
