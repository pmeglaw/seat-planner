# 017 — Viewer Find palette, slice 1 (palette shell + browse mode)

**Status:** IN PROGRESS — feed landed, swap not started.
**Branch:** `claude/viewer-palette-slice-1` (draft PR).
**Spec:** `docs/design_handoff_login_v12/Viewer v12 Handoff.md` (contracts #1–#14)
plus the settled decisions in `docs/design_handoff_login_v12/README.md`
("Viewer palette — owner answers"). Read both before starting.

This plan is a **handoff**, not an audit finding. It exists because the recon
below is expensive to re-derive and cheap to write down, and because the
remaining work is the risky half of the slice.

---

## The number that governs the design

Production today is **placeholder data**: 16 people on 68 seats, 22% filled.
The real directory has not been uploaded. **At launch the map is ≥90% filled** —
~61 occupied, ~7 open. Never size a decision here from a live prod query. The
practical consequences:

- The A→Z list is 61+ rows, so the **virtualized-directory windowing stops being
  dormant**. Keep the windowing hook; exercise it against a seeded local
  directory, not against prod.
- "Find a free desk" becomes a needle hunt (~7 of 68), which is why status
  earns a pinned chip in slice 3.

## What is already done on this branch

| Commit | What |
|---|---|
| `1ed079e` | The four owner answers, written into the handoff README |
| `d27db28` | `lib/viewerFindPalette.ts` + `tests/viewer-find-palette.test.mjs` (9 tests) — the browse-mode feed: zone chips with counts, A→Z people, `"N people · M seated"` |

Gate at `d27db28`: lint 0 errors, typecheck clean, **1054** node tests, 0 fail.

The feed was landed **before** any deletion on purpose: slice 1 removes four
docked surfaces from a 1587-line component, and doing demolition and
replacement in one pass leaves nothing verifiable until both are finished.

---

## Recon (line numbers as of `d27db28`, `components/seat-map/ViewerSeatFinder.tsx`)

### The four surfaces the palette replaces

| Line | Surface | Notes |
|---|---|---|
| ~1383 | `resultsPanelOpen && <aside>` — search results | Header `#viewer-results-title` + live count; `role="list"` with `tabIndex={0}` and `handleResultsKeyDown`; rows are `<div role="listitem">` wrapping a `<button>`; empty state has its own `role="status"` + "Clear search" |
| ~1453 | People directory `<aside>` | The A→Z list the palette's browse mode takes over |
| ~1541 | Collapse rail `<aside className="hidden panel:block …">` | Desktop-only rail |
| ~1554 | Mobile PEOPLE pill | The only route to the directory below the `panel:` breakpoint |

Also touched: the zoom stack at ~1337 carries a comment explaining it clears the
PEOPLE pill's 35px + 12px inset at widths below 900. **When the pill goes, that
offset should go back to a flat `bottom-3` and the comment must be corrected** —
it will otherwise read as describing a control that no longer exists.

### State to collapse

`directoryOpen` / `directoryCollapsed` / `mobileDirectoryOpen` /
`resultsPanelOpen` → one `paletteOpen`. Also present and staying:
`directoryHoverSeatId` (rename to `hoverSeatId` per the handoff's state map),
`activeResultId`, `rovingSeatId`, `search`, `hoverZone`, `zone`.

### Traps found the hard way

1. **`buildViewerDirectory` does NOT sort.** Its doc says "in the given
   (alphabetical) order" — that describes what the old panel happened to pass,
   not a guarantee. `buildViewerPaletteBrowse` sorts; do not "simplify" that
   away. A test asserting A→Z is what caught it.
2. **`getSeatZone` was component-local** (`ViewerSeatFinder.tsx:114`), not a lib
   export. It now lives in `lib/viewerFindPalette.ts` and is tested. The
   component still has its own copy — **delete the local one during the swap**
   and import the lib version, or the fallback chain drifts in two places.
3. **`uniqueVisibleOptions`** (~line 129) is the existing case-insensitive,
   first-spelling-wins de-duplication. The feed's zone chips already match its
   semantics; keep them aligned if either moves.
4. Zone chips seed from **active zone options first**, then seats. That is the
   one live-table read the viewer is permitted (option *names* only) and the
   reason a newly created zone renders at 0 instead of looking broken.

### Tests that pin the retired surfaces

- `tests/viewer-directory-source.test.mjs` — includes the assertion at line 32
  pinning `VIEWER_DIRECTORY_COLLAPSED_STORAGE_KEY`
- `tests/viewer-directory.test.mjs`
- `tests/viewer-keyboard-parity-source.test.mjs`
- `tests/viewer-seat-finder.test.mjs`
- `tests/accessibility-source.test.mjs` — pins the viewer's `role="listitem"`
  wrapper convention, the `<MapStatusLegend … ariaLabel="Seat status summary">`
  binding, and `translate="no"` on the brand

**These are guardrails, not snapshots.** CLAUDE.md's rule applies literally: if
a change trips one, you have crossed an a11y/safety/data line — fix the crossing,
do not loosen the assertion. Rewriting an assertion is correct only when the
*mechanism* moved (panel → palette) and the guarantee is re-expressed against
the new surface. If you cannot state the guarantee in one sentence, you are
loosening it.

---

## Sequence

1. **`components/seat-map/ViewerFindPalette.tsx`** — presentational shell +
   browse mode, fed by `buildViewerPaletteBrowse`. Anchored under the search
   field (left edges aligned, w 560, max-h `viewport − 60`), 150ms rise-in,
   outside click closes, floats so the map never reflows (contract #2). Browse
   content: zone chip row (name + mono count), then 40px people rows (26px
   avatar initials, name, `SEAT · position` sub, mono seat pill), footer kbd
   legend + the feed's `summary` (contract #3). Unseated rows render disabled
   and are never openable (contract #9).
2. **Component tests** for the palette in the jsdom tier (see the `test-tiers`
   skill before writing — `SeatMap` cannot be unit-rendered there, but a
   standalone palette can).
3. **Swap + delete, as ONE commit.** Wire the palette into `ViewerSeatFinder`,
   collapse the four state flags into `paletteOpen`, delete the three `<aside>`s
   and the pill, drop the local `getSeatZone`, fix the zoom-stack offset and its
   comment, and remove the dead
   `seat-planner:viewer-directory-collapsed` key (owner answer 4: removed
   outright, no migration, no cleanup sweep) along with its test assertion.
   Rework the five test files in the same commit — the tree must never sit in a
   state where the panels are gone and nothing replaces them.
4. **Behaviour parity pass** before calling it done, in a real browser
   (`run-seat-planner`), not from tests: ⌘K/Ctrl-K opens and focuses; Esc
   layering (floor menu → palette → query → selection → pinned zone, one layer
   per press, contract #7); arrow roving into rows; focus restore to the marker
   on close; INV-1 (an active query owns the transient surface) still holds even
   though palette and seat card no longer overlap.

Slices 2–5 (query mode, zone chips + wash, seat card, chrome theme) are out of
scope here and are listed in the handoff's own suggested order.

## STOP conditions

- **STOP if the swap cannot keep the five test files green without weakening an
  assertion.** Report which guarantee you could not re-express, and stop. Do not
  delete an assertion to get to green.
- **STOP if `paletteOpen` cannot express a state the four old flags could.**
  That means the design has a gap the handoff did not anticipate — surface it
  rather than inventing a fifth flag.
- **STOP before touching anything under `lib/mapLayoutTransform.ts`,
  `SeatMarker` anchoring, or calibration constants.** The palette is a discovery
  surface; it has no business moving a seat.
- **Viewer isolation is absolute**: published layer + `published_employees`
  snapshot only, zero AI references, no live `employees` read. The one permitted
  live read stays option *names* for the chips.

## Verification

`npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`,
then the behaviour pass in step 4 at 1440×900 and 375w. Screenshot against
`Viewer v12 Redesign.dc.html` options `1a–1f`.

Local-env notes: `npm install`, not `npm ci` (EPERM on the maintainer's Windows
box); `PW_CHROMIUM_PATH` must point at the installed Chromium for the e2e tiers;
`test:e2e:auth` fails two specs on that box that pass in CI — check CI before
concluding anything from them.
