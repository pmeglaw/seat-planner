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

## Addendum 2026-07-10 (commit d53a243) — round-2 QA polish

- **Fit view is the default and final resting state**: `mapViewMode` initializes to `"overview"`, which now always renders individual seat markers — the zone/cluster pills are RETIRED from the map UI (`lib/seatClusters` + its lib tests remain; `tests/seat-clusters.test.mjs` now asserts SeatMap does NOT wire clusters). Select/deselect never changes zoom or mode; the reserved column resizes the viewport and the overview ResizeObserver re-fits the frame. The rightSlotTier re-fit effects, the select-time nudge scroll, and the inspector entrance animation were all removed.
- **Filter + Search are one connected 26px control** in the chrome bar (both surfaces); the dropdown anchors inside the group (`-left-px top-full`) so it butts the button. FilterPanel lost its heading + `onClearAll` prop and gained internal Escape handling. The mobile filter button + measured-anchor positioning are gone (the group is visible at all widths; search input hides <lg).
- **Kebab** (`data-map-menu`, right end of the map-header row): Fit map to view · Zoom to 100% · Add seat. The Add seat item keeps the guard-pinned `aria-pressed={addSeatMode}` / `onClick={addSeatMode ? cancelAddSeatMode : startAddSeatMode}` / label patterns; `startAddSeatMode`/`cancelAddSeatMode` also close the menu.
- Toolbar: Undo/Redo have text labels again; order is Undo · Redo · Show names · Management · Ask Planner; only the brand divider remains.
- Live-verified 2026-07-10 (second pass): default fit = all 60 individual markers; select→reserve+re-fit; click-away returns to identical fit view (bug gone); zoomed 100% select/deselect preserves zoom exactly; kebab renders Fit/100%/Add seat; filter menu butts its button (measured gap 0px), no heading; viewer shares the same control; zero console errors. The pass caught + fixed a real bug: the fit view stuck small after deselect (missing lg:flex-1 on the content column — height fed back into the fit-width calc).

## Addendum 2026-07-10 — visual-pass playbook (how round 2 was verified)

What the re-run pass did, so the next session can repeat it without rediscovering the tooling.

### Coverage + evidence
Two kinds of evidence, deliberately mixed: **screenshots** for look/layout, **DOM measurements via `javascript_tool`** for facts a screenshot can't prove (or when the tab won't paint — see gotchas). Verified on `/admin` and `/`:

| Check | Evidence |
| --- | --- |
| Default = fit view, all 60 individual markers, no clusters | screenshot + "Fit" readout |
| Select → reserved column + re-fit, whole plan visible, no animation | screenshot |
| Click-away → identical full-width fit view (the round-2 bug) | screenshot before/after |
| Zoomed select/deselect preserves zoom | frame width 1911px + label "100%" measured before/during/after |
| Kebab = Fit map to view · Zoom to 100% · Add seat | DOM item list + screenshot |
| Filter menu butts its button, no heading, 3 selects | measured `gap: 0px` + screenshot; same on viewer |
| Console | zero errors on both surfaces |

### Bug found by the pass (fixed in `1e015e8`)
Select→deselect left the fit view stuck at the reserved (smaller) width. The content column div above `<main>` lacked `lg:flex-1`, so the viewport height hugged the shrunken frame and `updateOverviewMapWidth` (min of available-width / available-height×aspect) fed back on itself. **Diagnostic signature:** after deselect, the frame width equals the reserved-period width and the viewport hugs the frame instead of filling. **Rule:** every ancestor between the `lg:h-screen` root and the map viewport needs `lg:flex-1 lg:min-h-0` (or `h-full`) — the fit calculation must never see a content-derived height.

### Browser-tooling gotchas (Claude-in-Chrome on this machine)
- **CDP screenshots time out ⇢ check `document.visibilityState` first.** Chrome won't paint hidden tabs; "renderer frozen" almost always means the tab/window is backgrounded, not a hang. `javascript_tool`, `find`, and `read_console_messages` keep working — fall back to DOM assertions, or `tabs_create_mcp` a fresh tab (it opens focused/paintable) and re-navigate there.
- **The extension drops and reconnects** when Chrome closes/reopens; stale tab IDs die with it — re-run `tabs_context_mcp` and expect a new tab-group window that PowerShell sees with no usable `MainWindowTitle`.
- **Foregrounding Chrome from the shell:** `(New-Object -ComObject wscript.shell).AppActivate(<pid or title>)`; also the fix for the stuck 500% per-origin zoom (`SendKeys('^0')` after activating).
- **Native `<select>` options don't take synthetic coordinate clicks.** Set the value with the prototype setter + `dispatchEvent(new Event("change", {bubbles:true}))` so React sees it.
- **After zooming, coordinate clicks miss** (map panned) — click markers via DOM instead: `[...document.querySelectorAll('[data-seat-id]')].find(b => b.textContent.includes('W08')).click()`.
- **A blank beige map on first load is dev-compile lag** for the 1911×867 raster, not a regression — wait ~2-3s and confirm via the `img` element's `complete`/`naturalWidth`.
- Dev server: `npm run dev` detaches to a daemon (wrapper "fails" with exit 1 while the server keeps running) — trust `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login`, and kill by the PID it prints.

## Addendum 2026-07-10 — round-3: inspector structure to spec §6

- **Sections/order/defaults now exactly spec §6**: 1 Occupant (open) · 2 Seat · 3 Actions (open, admin-only) · 4 Notes (admin-only) · 5 Activity (admin-only). Viewer still renders Occupant + Seat only.
- **Status has ONE home — the Seat section.** The "Status & notes" combo section is gone (it duplicated the Seat tag). In Seat, admins get the editable dropdown (Available/Reserved/Unavailable) when the seat has no occupant; occupied seats show the derived read-only tag ("Assigned" comes from the occupant — a data invariant, not a style choice). Viewers always get the tag. `accessibility-source` now pins this: exactly one `ref={statusRef}`, no `Status &amp; notes`, no `sticky bottom-0`.
- **Actions is a collapsible section again (open by default)** holding everything the sticky footer used to: Move/Swap/Vacate row, move-mode microcopy, Assign employee (primary-first for open seats) / Change assignment (secondary for occupied), the progressive assignment editor, Delete seat + visible help line, Discard edits, draft-impact pill, Cancel/Save. The sticky footer is deleted.
- **Deliberate deviation from the literal enumeration — OWNER-CONFIRMED 2026-07-10**: Move/Swap stay visible for open seats too. This app's "Move" repositions the seat *marker* (not the occupant) and the inspector button is the only entry to move mode — hiding it for open seats would strand newly added custom seats where they were first clicked. Do not "fix" this to match spec §6's occupied/open split.
- Kept (**owner-confirmed 2026-07-10**): header status chip (at-a-glance pill, present through rounds 1–2 QA), all guard-pinned aria-labels/handlers (Move/Swap/Vacate/Delete/Assign, statusRef wiring, delete help `<p id="seat-inspector-delete-help">`), STALE_DRAFT fences. The sr-only save-state live region moved to the top of the form — inside a closed `<details>` it would be display:none and never announced.
- **Live-verified 2026-07-10 (round-3 visual pass, localhost /admin + /)**: assigned seat (W08) → Occupant(open)/Seat/Actions(open)/Notes/Activity in order, Seat shows Code/Zone/Seat type + green Assigned TAG, Actions shows Move/Swap/Vacate + Change assignment + disabled Delete with reason; open seat (C01) → Assign employee (orange primary, first) + Move/Swap, Status DROPDOWN in Seat (Available/Reserved/Unavailable — exactly one select in the panel); dirty flow (status→Reserved) surfaces Discard/Cancel/Save inside Actions + amber pill + header chip flips, Discard resets; Change assignment opens the editor INSIDE Actions with the combobox focused, Cancel exits editor without closing the inspector; click-away deselects back to fit (frame re-fit 1258px on a 1524px viewport = height-constrained, correct); viewer / shows Occupant+Seat only, zero selects, no action buttons; zero console errors across loads + interactions on both routes. Tooling notes: a frame "stuck" at the reserved-period width right after deselect is NOT the height-chain bug if the tab is hidden — ResizeObserver delivery pauses on hidden tabs and catches up on first paint (measure viewportRect vs frameRect: viewport NOT hugging the frame = throttling, not the bug). The <900px bottom sheet was verified structurally only (same aside/sections; Back-to-map hidden at desktop) — the window refused programmatic resize (extension resize_window AND Win32 MoveWindow both no-oped at innerWidth 1920); re-check the sheet visually when a resizable window is available.
