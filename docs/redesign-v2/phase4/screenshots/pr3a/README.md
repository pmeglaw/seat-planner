# Phase 4 · PR 3a captures — the map frame (2026-09-04)

**What these show.** The map's own control row on both surfaces, 48px under the shell header, in place of the
provisional tenant row (PHASE2UX §1M.3; the PR 2 seam closed): floor menu button · one search field with the
platform shortcut hint and the D1-d scope switch · Filters split control (`/admin`, `Filters · N` + clear) · the live
result count · Find me · the draft cluster (Undo / Redo with their shortcut tooltips, Add seat, Ask Planner, ONE
primary Publish with its disabled reason beside it, "More actions" → Discard) · the Names toggle. Below the canvas
the status band with the Phase 3 `SeatMark` legend that follows the Names toggle (P3-13). The Find palette on
`/admin` too (results header with both scope counts, zero state with Widen). The canvas status region (inline
notifications, never a toast). The roster floor with Copy link. No washes, no clusters, no nameplate card (D1-h /
D1-i / O1). The narrow frames: 1024 (the row wraps, O6) and 1000 (below `lg` the editor cluster is Hidden and the
band says why — D2 / deviation 4).

**Source.** Branch `feat/phase4-map-frame` (PR 3a), `npm run build && npm run start -p 3000` against the **local
Docker Supabase stack** (`npm run db:start` + `db:seed`; `.env.local` pointed at `http://127.0.0.1:54321` for the
run, backed up outside the repo and restored after; the stack stopped with `supabase stop --no-backup`). Signed in as
the seeded local admin `e2e-admin@example.test`. **No production data and no production write**: every name, seat
and count on these pages is `supabase/seed.sql` sample data on a converged draft ("Draft · 0", Publish disabled with
its reason). The e2e-auth tier ran AFTER the captures (it publishes on the local stack; the seed cannot re-apply over
that publish — `supabase db reset` + `db:seed` between runs).

**Method.** Playwright `chromium.launch({ channel: "chrome" })`, viewport 1920×1080 (1024×768 / 1000×768 for the
narrow frames), device scale 1, after `document.fonts.ready` + 500–800 ms; theme set by writing `sp-theme` to
localStorage and reloading, so the boot script derives `data-theme` / `data-carbon-theme` exactly as a user's browser
would. Three rigs: `audit/map-states.mjs` (new — the 43 state captures at the root of this folder),
`audit/runtime-audit.mjs` (`runtime/`: route captures + the undefined-`var()` audit — **0 undefined on 6 routes × 2
themes; console errors = the Vercel Speed Insights script 404ing under a local `next start`, no app error**),
`audit/marker-contrast.mjs` (`markers/`: **28 measurements, 2 under 4.5:1 — the ledgered `filtered-out` dim, closes in
3b with the `.sp-pill` rewrite — 0 outside the ledger**; not driven yet: `invalid-target` (O4, 3b) and
`planner-highlight` (3b adds it to the rig)). `shell/` is PR 2's shell rig re-run on this branch (no tenant row).

| File | What | Theme | Width |
|---|---|---|---|
| `admin-{light,dark}-1920.png` | `/admin`: control row (draft cluster, Publish disabled + "No changes to publish"), band, no tenant row | both | 1920 |
| `admin-row-*-1920.png` | the row strip alone (48px) | both | crop |
| `admin-row-overflow-*` | "More actions" menu → the one danger item, Discard draft changes | both | crop |
| `admin-floor-menu-*` | floor menu (`role="menu"`, `menuitemradio`, current floor marked; Floor 2 with its "not mapped" meta) | both | crop |
| `admin-row-undo-tooltip-*` | Undo hovered: tier-C tooltip with the disabled reason ("No map changes to undo") | both | crop |
| `admin-band-names-{on,off}-*` | the legend follows the Names toggle: mini pill on, ● off (P3-13) | both | crop |
| `admin-palette-browse-*`, `admin-palette-results-*`, `admin-palette-zero-*` | Find palette on `/admin`: browse on focus · results with "N on this floor · M in building" · zero state with Widen | both | crop |
| `admin-search-scope-*` | the D1-d scope menu (This floor / Whole building) | both | crop |
| `admin-filters-applied-*-1920.png`, `admin-row-filters-*` | left panel open, one filter applied: `Filters · 1` split control, "1 of 60 seats match", dimmed non-matches, band verbs; **the row wraps at the 1664px pane (O6, content-driven)** | both | 1920 |
| `home-{light,dark}-1920.png`, `home-row-*`, `home-band-*` | `/`: the published row (no draft cluster, no Names toggle below the plan surface), the band | both | 1920 · crops |
| `home-find-me-*` | Find me: the seeded admin has no seat → canvas status notice (info, inline) | both | 1920 |
| `home-roster-*`, `home-roster-copy-hover-*`, `home-roster-copied-*` | Floor 2 roster (`.sp-roster`): groups, Copy link icon button hovered, "Copied" done state | both | 1920 · crops |
| `admin-light-1024.png` | O6: the row wraps to two 40px lines inside a 96px row, nothing clipped; the draft cluster stays (editing is `lg`-and-up) | light | 1024 |
| `home-light-1024.png` | `/` at 1024: one line (the published row fits) | light | 1024 |
| `admin-light-1000-read-only.png` | below `lg`: cluster Hidden, "Editing needs a wider window." fully visible in the band (D2 / deviation 4) | light | 1000 |
| `runtime/*` | route captures from the undefined-`var()` audit | both | 1920 · 1024 |
| `markers/marker-<state>-<theme>.png` | marker-state crops (the shipped pill; 3b rewrites it) | both | crops |
| `shell/*` | PR 2's shell rig on this branch | both | 1920 · 1024 |

## Findings (fixed on the branch before the PR opened)

1. **The wrapped row hid its second line.** The O6 rule in `app/globals.css` sat at `(0,1,0)` and `sp-components.css`
   loads after it, so `height: 48px` won and the wrapped controls painted under the canvas (first 1024 capture:
   only the floor button visible). And the panel-open 1920 frame overflowed the same way at its 1664px pane, with
   buttons overlapping — a viewport query was the wrong tool. Now: `.sp-control-row[role="toolbar"]` wraps whenever
   its content does not fit, at any width; a single line is exactly 48px (4 + 40 + 4), a wrapped row 96px; the
   search keeps its token width, shrinks to 240px before the row wraps, never grows into the slack; `white-space`
   stays `nowrap` so the floor label and the `Ctrl K` key never wrap inside their 40px boxes. Above `lg` the stage is
   `flex-1`, so the extra line is absorbed; below ~800px the page scrolls by one line (accepted, not ruling-bearing).
2. **The band's read-only note clipped at 1000.** It sat at the tail of the keyboard-scrollable legend region and
   lost 9px. The note now renders OUTSIDE the scroll region (reading order unchanged), and below `lg` on `/admin` the
   plain total count yields — it duplicates the title's "60 seats"; the filtered "N of M match" count is never dropped.
3. **`Ctrl K` hint at 4.36:1.** The e2e-auth axe scan of `/` flagged `.sp-kbd`: `--sp-text-helper` (gray 60) on
   `field-01` (gray 10). Now `--sp-text-secondary` — 7.10:1 light, 8.86:1 dark — in `app/styles/sp-components.css`
   AND the Phase 3 copy (byte-identical pair kept); two pairs added to `generate-pairs.mjs` → **195/195 pass**.
4. **Marker rig, dark pass:** `getByRole("button", { name: "Swap CW01" })` matched two buttons once a swap was in the
   history — the row's Undo is named "Undo Swap CW01 · Ctrl Z". The rig uses `exact: true` now.
5. **Canvas status notice** sat under the roster's sticky header (`z-10`); the region is `z-20`.
6. **e2e-auth `draft-dialogs` / `publish-flow`** still looked for the retired "N unpublished changes" pill; both
   open the review from the row's "Publish N changes" primary now.

## Known, ledgered for 3b

- The palette rows still wear the shipped Tailwind row styling (kind pill, count circles) — the `.sp-palette` frame,
  header, zero state and footer are Phase 3; the rows are 3b's marker/slot sweep.
- The add-seat mode card is positioned at `header + 48px`; when the row wraps (panel open at 1920) it overlaps the
  row's second line by 40px. 3b's 400px slot work owns the card's placement.
- `filtered-out` marker contrast 2.95 / 3.53 (ledger row; the quiet pill in 3b).
