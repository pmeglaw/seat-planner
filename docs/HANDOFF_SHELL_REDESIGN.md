# Hand-off — Shell redesign implementation (`redesign/carbon-shell`)

**Date:** 2026-07-10 · **Author:** Claude session with the owner (Patrick)
**Spec:** `docs/DESIGN_DIRECTION.md` + prototype `docs/ui/seat-planner-shell.html` — the *locked* "Shell" direction (Carbon visual language, **no** Carbon packages). It supersedes all earlier directions (Claude Design, Counsel Ink, Ember Studio).

## State

- Branch `redesign/carbon-shell`, **4 commits, NOT pushed, no PR** (spec §10: don't open a PR unless asked).
  - `3e0aa76` design(shell): the full redesign
  - `c67d27e` fix(inspector): stable no-op defaults (render-loop fix, see Gotchas)
  - `b65feff` feat(data): `employees.email` (owner-approved flagged item)
  - (branch base: `80600b1` on `main`)
- **All checks green** at head: 198/198 unit tests, lint (0 errors; 17 warnings = baseline 16 + 1 pre-existing pattern), typecheck, `npm run build`, Playwright e2e smoke.
- Live-verified on `localhost:3000` in the owner's authenticated browser: desktop + functional QA (seat select → dark inspector, assign Edith→W07 → save → **Undo** → clean revert; search/dim/results; filter panel; pan; zoom ±/fit; floor selector + Floor 2 placeholder; publish-review dialog open/close; viewer surface; login; Management/Settings).
- The stray uncommitted `@carbon/colors`/`@carbon/themes` additions to `package.json` that predated this work were **reverted** (the instruction was "do NOT install Carbon").

## What changed (file map)

| Area | Files | Notes |
| --- | --- | --- |
| Tokens | `app/globals.css` | `--admin-*`/`--sp-*` values retargeted in place: chrome `#161616`, workspace `#f4f4f4`, panels `#fff`, hairlines `#e0e0e0`, accent `#F15A24`, status `#24a148/#f1c21b/#da1e28`. New `.shell-theme` selector shares the token block with `.admin-theme` (viewer uses it). New: `--admin-primary-ink`, `--admin-status-ok/warn/bad`, `--admin-chrome-field`. |
| Shape + type | `tailwind.config.ts`, `app/layout.tsx` | Named radius scale zeroed globally (`rounded`/`rounded-xl`/… → 0; `rounded-full` + arbitrary `rounded-[Npx]` untouched — that's what keeps seat pills round). IBM Plex Sans/Mono via `next/font/google` → `--font-sans`/`--font-mono`, wired to Tailwind `fontFamily`. |
| Top bar + map | `components/seat-map/SeatMap.tsx` | 40px bar (brand, Filter-left-of-Search, tools, Viewer/Admin shortcuts, Publish, avatar). New: drag-to-pan, zoom state (0.6–2.0, width-scaling view transform), floor state, map-header row (floor selector · crumb · `ActiveFilterChips`). Canvas deselect moved from pointerdown to pan pointer-end (click-vs-drag threshold 4px) in detail mode. Overview/Detail segmented control removed — zoom "fit" = overview (cluster pills). |
| New components | `components/seat-map/FloorSelector.tsx`, `MapZoomControl.tsx` | Shared by admin + viewer. Keyboard-operable menu / zoom group. Floor 2 is **UI scaffolding only** (§9.3). |
| Inspector | `components/seat-map/SeatInspector.tsx` | Dark `#161616`, docked `panel:right-0 top-10 bottom-0` w-320, 44px rail when collapsed, bottom sheet <900px. Sections via native `<details>`: Occupant (open), Seat, Notes ("Status & notes" when unassigned), Activity (session-local undo-history labels for the seat, passed from SeatMap as `activityEntries`). Actions live in the sticky footer. Viewer (canEdit=false) renders Occupant + Seat only. Edit callbacks now optional with **module-level** no-op defaults. |
| Viewer | `components/seat-map/ViewerSeatFinder.tsx` | Rewritten onto the same shell: dark bar (Filter popover + search, Viewer active, **no admin tools / no Ask Planner**), floor selector, pan/zoom (fit default), floating results panel, shared `SeatInspector` read-only, bottom status bar with counts. |
| Panels | `FilterPanel.tsx`, `ResultsPanel.tsx`, `AskPlannerDrawer.tsx` | Squared, re-anchored below the 40px bar (`top-[44px]/[48px]`), token-inherited colors. |
| Login | `components/auth/LoginForm.tsx`, `app/login/page.tsx` | Shell card with dark brand header strip, underline tabs, token fields. E2E-pinned bits kept ("Sign in" heading/button, email+password inputs). |
| Management | `components/admin-management/AdminManagementPanel.tsx` | Token/radius/Plex inheritance only + new **Email** field in the employee form. **No structural re-skin** (owner's earlier "don't re-skin Management" still gates that). |
| Email (data) | `supabase/migrations/20260710120000_employee_email.sql`, `lib/types.ts`, `app/actions.ts`, `lib/publishSummary.ts` | Nullable `email` on `employees` + `published_employees`; `publish_seat_map()` recreated to copy it into the snapshot; snapshot synced. `Employee.email` in types; create/update employee actions accept it (update writes it **only when the field is provided**); publish review diffs it in People details. **Applies to prod only when the branch merges to `main`** (Supabase GitHub integration — never apply manually). |

## Decisions + measured contrast (keep these)

- **Publish button / avatar:** `#F15A24` fill + `#161616` ink = **5.37:1** (white on `#F15A24` is 3.37 — fails AA; spec §2 sanctioned ink text).
- **White-label CTAs** (`--admin-primary-cta`, count badges, Save/Assign): deepened `#C94A12` = **4.70:1** with white.
- Chrome text `#f4f4f4` = 16.45:1, muted `#9a9a9a` = 6.43:1 on `#161616`; light-surface muted `#6f6f6f` = 4.57:1 on `#f4f4f4`. Dark-panel state colors: `#f1c21b` ≈10.4:1, `#ff8389` ≈7.9:1, `#42be65` ≈7.3:1.
- **Status tags** (inspector Seat section): colored fill + AA text partner (ink on green/yellow, white on red).

## Owner decisions on the flagged items (§9)

1. **`employees.email` — APPROVED, built** (`b65feff`). See file map.
2. **Notes — no migration needed:** `seats.notes` already existed; the Notes section uses it.
3. **Ask Planner stays admin-only** (owner's explicit choice): spec §7 prose listed it for viewers, but the viewer-isolation guard test forbids it in `ViewerSeatFinder` and `askPlannerAction` requires admin. Do not add it to the viewer without revisiting both.
4. **Search-match ring stays teal, not the spec §4 orange:** the ring is part of protected `SeatMarker` (§5 "pixel-identical" wins). Open item if the owner wants orange — it means deliberately amending `SeatMarker` + the hex-pinning tests.

## Guard-test landscape (read before touching SeatMap/SeatInspector)

`tests/accessibility-source.test.mjs`, `seat-creation-ui-source`, `desktop-seat-marker-system-source`, `bulk-destructive-action-safety-source` pin **many exact source strings** (aria-labels, publish-review copy, `resultsPanelOpen` expression, the canvas section's `className={[filterCollapsed ? "order-1" : "order-2", "min-w-0 overflow-hidden` prefix, the delete button's `whitespace-normal rounded-[10px] leading-tight` run, `z-[80]…panel:z-40` ordering, `Megeredchian Law Seats` — kept as an sr-only `<h1>`). Redesign = surgery around these, never rewrite. All currently green.

## Gotchas discovered

- **Optional-callback defaults must be module-level constants** in `SeatInspector` — inline `= () => {}` defaults mint a new identity per render; with the viewer omitting the props this cascaded into `Maximum update depth exceeded` on `/` (fixed `c67d27e`). Applies to any future optional function props there.
- **Owner's Chrome had a stuck 500% per-origin zoom on `localhost:3000`**; extension-injected key events can't reset it. A real OS-level `Ctrl+0` works: PowerShell `(New-Object -ComObject wscript.shell).SendKeys('^0')` after `AppActivate 'Office Seat Planner'`.
- Zoom implementation is width-scaling on the map frame (`--map-detail-base` CSS var × factor) + native scroll — **not** CSS `transform: scale`, so `eventToPoint`, marker edge-hugging, and the calibration transform are untouched (§9.4).

## Remaining / follow-ups

- **Push + PR when the owner asks.** Merging to `main` auto-applies the email migration and deploys (Vercel + Supabase integrations).
- CI does **not** cover authenticated flows (publish, seat edits) — after deploy, manually re-verify publish round-trip on prod, per standing practice.
- Optional polish backlog: orange search ring (see decision 4), Management structural re-skin (needs owner OK), an email column in the Management directory table (form-only today; the virtualized-table guard test pins "look unchanged" so the table was left alone).
- Dev-only artifacts seen during QA (Next.js dev-tools badge bottom-left) are not app UI.

## Verify locally

```
npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
npm run dev   # viewer /, admin /admin — both authenticated
```

## Addendum 2026-07-10 (commit 35cb4a3) — prototype-match fixes

- **Right slot reserves layout** at the panel tier (expanded inspector / results panel / mode card → `panel:pr-[332px]`, collapsed rail → `panel:pr-[56px]` on the content wrapper); a `rightSlotTier` change effect re-fits the map (overview + scroll reset) so the floor plan is never hidden behind a panel. Bottom sheets <900px unchanged.
- **One filter, prototype presentation**: `FilterPanel` is now the compact dark dropdown anchored under the chrome Filter button (admin anchors via measured `--filter-anchor` left; viewer wraps it absolutely). Its old `collapsed/onToggle` props are gone (`onClose`/`panelId` instead). `data-filter-ui` marks the button+panel for the outside-click dismiss handler.
- **Chrome icons**: funnel+caret (Filter), columns (Management), sparkle (Ask Planner) as inline SVGs — no icon package.
- Guard note: `accessibility-source` still pins `ActiveFilterChips`, `aria-label="Active filters"`, chip `removeLabel`, and "Clear all" — all preserved.
