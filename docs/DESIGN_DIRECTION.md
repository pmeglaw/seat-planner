# Seat Planner — UI Redesign Spec ("Shell")

**Status:** Design locked with the owner via an interactive prototype. This document supersedes all earlier design directions (Counsel Ink, Ember Studio, etc.) — ignore those. The build implements *this* spec.

**Visual source of truth:** the interactive prototype `docs/ui/seat-planner-shell.html` (commit it into the repo). Where prose here and the prototype disagree, ask; don't guess.

---

## 1. Approach — read this first

* **Borrow the Carbon look; do NOT adopt `@carbon/react`.** We are matching IBM Carbon's *visual language* (IBM Plex font, dark UI-shell, flat/square components, status colors) on the **existing stack** — Next.js App Router + Tailwind + the current bespoke components. **Do not install `@carbon/react`, `@carbon/styles`, or Carbon SCSS.** This is a restyle + re-layout of the app that already runs, not a component-library migration.
* **This is a presentation-layer change.** No business logic, data semantics, security, or coordinate math changes except the few items explicitly flagged in §9.
* **Preserve the seat markers exactly.** See §5 — `SeatMarker` is protected.
* Ship it **incrementally, on a branch, with tests green** — see §10.

---

## 2. Foundations (tokens)

Add/adjust these as `--sp-*` design tokens in `app/globals.css` (surface through `tailwind.config.ts`). Values from the prototype:

| Role | Token intent | Value |
| --- | --- | --- |
| App shell / inspector (dark) | chrome bg | `#161616` |
| Chrome dividers | on dark | `rgba(255,255,255,.10)` |
| Chrome text / muted | on dark | `#f4f4f4` / `#9a9a9a` |
| Workspace background | light | `#f4f4f4` |
| Panels / cards | light surface | `#ffffff` |
| Borders (light) | line | `#e0e0e0` |
| Text primary / secondary (light) | | `#161616` / `#525252` |
| **Brand accent** | orange | **`#FF5715`** |
| Status — assigned / reserved / danger | | `#24a148` / `#f1c21b` / `#da1e28` |
| Font (UI) | | **IBM Plex Sans** |
| Font (codes / numeric) | mono | IBM Plex Mono |

* **Orange is restrained.** Use `#FF5715` only for: the active tool underline, the selected seat, the search/filter highlight ring, and focus. It is not a background or a hierarchy device. (Publish moved to the CTA ladder — `#D23F0A` + white — v12 decision 2a, 2026-07-31.) (SeatActionBar's Assign retains accent + ink for now — owner call deferred to the slice-4 action-bar redesign.)
* **Shape:** flat, square corners for chrome/controls (Carbon feel). Exception: the seat pills keep their rounded shape (they're unchanged — §5).
* **Accessibility on the accent:** white text on `#FF5715` measures ≈3.2:1 (fails AA for text). Text-bearing orange fills use **dark ink text** (ink `#161616` on `#FF5715` = 5.7:1) or the deepened **`#D23F0A`** (4.71:1 on white); hover **`#B83708`**, pressed **`#9E2F06`**. Measured 2026-07-21.
* **Info is neutral gray, not a hue** (`#525252` text · `#F4F4F4` surface · `#C6C6C6` border). Three status hues carry meaning; a fourth coloured family for "here is some context" competed with them while signalling nothing.

> **Teal is a deliberate, bounded exception — owner-decided 2026-07-22.**
> The palette is otherwise neutrals + one orange + three status hues, and the
> `info` and search/filter-highlight teals are both retired. Teal survives in
> **exactly two `SeatMarker` states — planner-highlight and swap-source** — and
> is **reserved for transient INTERACTION MODES. It is never a status colour.**
>
> This is not an oversight. Both alternatives were measured and rejected:
> neutral gray collides with the **default** seat pill (`#F2F2F3` bg /
> `#AEB4BA` border — a planner highlight in gray stops reading as a highlight),
> and orange is already the search/filter match, which planner-highlight must
> stay distinguishable from. The sanctioned palette has no free colour for
> "the assistant suggested this", so the honest answer is a documented
> exception rather than a collision.
>
> Do not "finish" this by re-hueing those two states without re-deciding the
> above — and if it is ever re-decided, `SeatMarker` is protected (§5) and
> `desktop-seat-marker-system-source` must be re-run.

---

## 3. Top bar (app shell)

A dark (`#161616`) bar, full width, `z` above everything. **Now 36px** — #216
slimmed the original 48px bar to 40px (map) / 36px (sub-pages), and #221 then
matched the map bar to the sub-pages' 36px so the whole app shares one chrome
height. Every full-height item in the bar tracks this number: the tool buttons,
the Viewer/Admin shortcuts, and Publish, or the active underline stops landing
on the bar's bottom edge. (This spec originally called for 48px, reasoning that
a 40px Search/Filter field needed 4px of clearance on each side; the owner
later chose the tighter 36px instead — see #216/#221.) Left → right:

1. **Brand:** menu glyph + "Megeredchian Law · Seat Planner".
2. Divider, then the **Filter dropdown immediately to the LEFT of the Search field** (this pairing is deliberate). Filter opens a menu (Department / Zone / Status); Search is a live text field.
3. Divider, then tools: **Undo · Redo · Management · Ask Planner** (Management sits *before* Ask Planner). All four are **admin-only** — including Ask Planner, despite the read-only nature of the assistant. See the correction in §7.
4. Spacer.
5. **Two surface shortcuts on the right: Viewer · Admin.** Admin uses the **user-with-checkmark icon** (see prototype SVG / the owner's reference image), Viewer uses an eye/target glyph. The active surface shows the orange underline.
6. **Publish** button (orange, **admin-only**), then avatar.

---

## 4. Workspace (the map)

* The floor map is **centered** and fills the main area (light background around it). Comfortable margins — do not crowd it.
* **Pan:** click-and-drag to pan the map. **Zoom:** a control bottom-right (`+` / `−` / **fit**) with a live % readout. **Pan and zoom are a view transform only** — they must not alter stored seat coordinates or the calibration transform (§9).
* **Floor selector** in the map header (a dropdown):
  * **Floor 3 · Pre-Litigation** — the current, mapped floor (default).
  * **Floor 2 · Litigation** — present in the selector but **not yet mapped**; selecting it shows a "not yet mapped — reserved for a future rollout" placeholder. This is **UI scaffolding only** for a future multi-floor rollout (§9). The garage (Floor 1) is intentionally omitted.
* **Search & Filter highlight matching seats:** matches get an orange highlight ring; non-matches dim (~30% opacity). Search matches on name / seat code / zone; Filter matches on the chosen facet. Active filters show as removable chips.

---

## 5. Seat markers — the frozen contract is anchor + calibration, not the look

> **Marker fills are contrast-checked against the CREAM FLOOR PLAN, not against
> white.** The floor-plan raster is warm beige, and warm/ivory marker fills were
> measured at **1.02–1.10:1 against the floor** — they camouflage into the
> carpet and effectively vanish. This is why marker surfaces are cool/neutral or
> clearly tinted rather than warm. Measured 2026-07-02; the numbers are not
> recomputable from anything else in the repo, so they are recorded here.

**Correction: the pills were not shipped pixel-identical, and that's fine.**
This spec originally froze the seat pills' appearance. Since then `SeatMarker`
has been deliberately restyled several times, owner-directed — capsule/stadium
pills (#227), a door-plate nameplate treatment (#240), inline names shortened
to first name + last initial (#238), and private-office nameplate sizing
(#243/#244), among others. The pills' look is not frozen; what
**is** frozen is the **anchor + calibration**: `pointToStyle({x: seat.x, y:
seat.y})` and the calibration constants in `lib/mapLayoutTransform.ts` must
keep placing every marker at its true saved coordinate, guarded by
`tests/desktop-seat-marker-system-source.test.mjs`. Restyle the pills freely;
never change how a seat's `x`/`y` maps to its on-screen position. (The
separate tokenization of the marker hex remains tracked in the `RISKS.md`
backlog.)

`app/concepts/map-redesign` is the gated, prototype-only implementation of the
"Counsel Ink" direction this document's header already names as superseded —
it is not part of the shipped viewer/admin flows (see CLAUDE.md).

---

## 6. The inspector (right panel)

* **Dark** (`#161616`), **seamless with the top bar** — the dark reads as one continuous surface wrapping from the header down the right edge. Width ~**320px**; collapses to a thin **44px rail** when closed.
* **Opens when a seat is selected (click), and stays open** until dismissed. Clicking another seat switches its contents in place. A **✕** in the panel header closes it. (Not hover-triggered.)
* **Header:** avatar + name + role, and the close ✕.
* **Sections** (collapsible), in this order:
  1. **Contact** — *open by default.* Email, Extension. (Name + role + department live in the header; the section was renamed from "Occupant" and Department deduped out on 2026-07-23.)
  2. **Seat** — Code, Zone, Status (colored tag).
  3. **Actions** — *open by default; admin-only.* Occupied seat → Move / Swap / Vacate. Open seat → Assign occupant.
  4. **Notes** — *admin-only.* Free-text note. (Placed directly under Actions.)
  5. **Activity** — *admin-only.* Recent history log.
* Open seats show an "Open seat / Unassigned" state with the Assign action; reserved seats show the reserved status.

> **Deliberate deviation from the §6.3 enumeration — OWNER-CONFIRMED 2026-07-10.**
> **Move and Swap stay visible for OPEN seats too**, not just occupied ones. In
> this app "Move" repositions the seat **marker**, not the occupant, and the
> inspector button is the only entry into move mode — hiding it for open seats
> would strand a newly added custom seat wherever it was first clicked. This
> reads like a bug against the occupied/open split above. **Do not "fix" it.**

---

## 7. Roles — Viewer vs Admin

Same shell and same inspector for both; the **viewer is read-only**:

* **Admin** sees everything: all tools, Publish, and the full inspector (Contact, Seat, Actions, Notes, Activity).
* **Viewer** sees only **Contact + Seat** in the inspector — **no Actions, Notes, or Activity** — and the edit-only chrome is hidden (**no Publish, Undo, Redo, or Management**). Search, Filter, floor selector, pan/zoom, and seat selection remain.

> **CORRECTION 2026-07-22 — Ask Planner is admin-only.** This section and §3
> originally listed Ask Planner as staying for viewers. That is wrong and was
> never built: the owner chose admin-only on 2026-07-10,
> `components/seat-map/ViewerSeatFinder.tsx` contains zero references to it, and
> `tests/accessibility-source.test.mjs` actively **forbids** the string there
> (the viewer-isolation guard). `askPlannerAction` also requires admin. If a
> future change adds it to the viewer, that guard test will fail — the failure
> is **correct**; do not loosen it. Revisit both the guard and the server action
> if the decision is ever genuinely reversed.

Implement viewer/admin as one component set with the admin-only pieces conditionally hidden (a `viewer` mode flag), not two separate designs.

---

## 8. Accessibility (the frozen guardrail)

* Every text pair **≥ 4.5:1**, meaningful graphics **≥ 3:1** — measured, especially dark-inspector text on `#161616` and any text on the orange (§2).
* Preserve visible focus rings on every interactive element (bar tools, filter/floor menus, seats, inspector controls, zoom), full keyboard operability, and correct dialog/menu semantics.
* Keep the existing `accessibility-source` and `desktop-seat-marker-system-source` guarantees green. If a `*-source.test.mjs` guard trips, fix the crossing — don't loosen the test.

---

## 9. Hard line & flagged changes

**Unchanged (do not touch):** the draft → published two-layer model and publish semantics; the three-layer admin security boundary; normalized seat coordinates and the calibration transform; Ask Planner staying read-only; migrations applied only by merge to `main`.

**Flagged items that touch data/behavior — confirm before building each:**
1. **`employees.email`** — the Contact section shows Email; confirm the column exists (it was previously flagged as a gap). If absent, add nullable `employees.email` + `published_employees.email` via a migration and surface it; until then render "—".
2. **Notes field** — the Notes section needs a stored note. Confirm whether a notes column exists; if not, this is a new nullable column (admin-editable) via migration. Flag as a behavior/data addition.
3. **Multi-floor is future scope.** The floor selector is **UI only** now. Real Floor 2 support (seats on a second floor, a second floor-plan image, and its own calibration) is a **separate future project** — do not build it here.
4. **Pan/zoom is view-only** — presentation transform on the map container; must not persist to or recompute seat coordinates.

---

## 10. How to build it

* Work on a **branch**; this touches shipped surfaces, so keep changes small and reviewable, one area at a time (shell/top bar → inspector → map pan/zoom/floor/highlight → viewer/admin mode → per-screen: viewer `/`, admin `/admin`; then Management, Settings, Publish review, Login restyled to match).
* **Reuse the prototype** `docs/ui/seat-planner-shell.html` as the visual reference for layout, spacing, and interaction.
* Restyle **token-first**: define the `--sp-*` tokens (§2), then the shared primitives, then per-screen layout. Prefer token/primitive changes over scattered edits.
* **Verify before "done":** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` all green; plus a visual pass against the prototype and a keyboard/contrast a11y pass. Behavior QA: publish, seat edit/create/move, CSV/restore, and Ask Planner read-only all unchanged.
* Do not open a PR unless asked.

---

## 11. Definition of done

The shipped app matches this spec and the prototype: dark slim shell (Filter-left-of-Search, Viewer/Admin shortcuts, admin-only edit tools), centered map with pan/zoom + floor selector + search/filter highlighting, the seamless dark click-to-open inspector with the specified sections and defaults, viewer vs admin behavior, brand orange `#FF5715`, IBM Plex — **with the seat markers/pills unchanged**, all invariants intact, accessibility green, and the flagged data items (§9) resolved or explicitly deferred.
