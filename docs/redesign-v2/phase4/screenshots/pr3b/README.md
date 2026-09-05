# Phase 4 · PR 3b captures — markers + slot (2026-09-05)

**What these show.** The Phase 3 map on both surfaces: the 28px fit-width name pill with every §1.16 state
(rest · hover + code tooltip · focus · selected · search hit · quiet · origin · target · **invalid** · ◇ changed in
draft · names off), the empty-seat footprints with their inlined marks, the 400px right slot pushing the canvas
(inspector Published / Draft editing · the mode card with the O4 note · Ask Planner with the Carbon-for-AI label and
its popover), the move confirm over the slot, the publish review as the wide tearsheet, the Find palette rows on the
Phase 3 row anatomy, and the Draft family in **purple** (owner ruling O3, DECISIONS §6 no. 17) beside the terracotta
primary. The frame (control row, band, roster, palette, narrow frames) is re-captured too — nothing in PR 3a moved.

**Source.** Branch `feat/phase4-map-markers` (PR 3b), `npm run build && npm run start -p 3000` against the **local
Docker Supabase stack** (`npm run db:start` + `db:seed`; `.env.local` pointed at `http://127.0.0.1:54321` for the
run, backed up outside the repo and restored after; the stack stopped with `supabase stop --no-backup`). Signed in as
the seeded local admin `e2e-admin@example.test`. **No production data and no production write**: every name, seat
and count is `supabase/seed.sql` sample data — the seed now sets NE07 reserved and NE08 unavailable (owner ruling Q4)
so the invalid-target pill and the legend's non-zero counts are real. The draft writes the rigs make (a swap, a move
and its undo) are local; the stack was `db reset` + reseeded between rigs and before the e2e-auth tier.

**Method.** Playwright `chromium.launch({ channel: "chrome" })`, viewport 1920×1080 (1024×768 / 1000×768 for the
narrow frames), device scale 1 (3 for the `badge-focus-3x-*` crops via CDP), after `document.fonts.ready` +
400–800 ms; theme set by writing `sp-theme` to localStorage and reloading, so the boot script derives `data-theme` /
`data-carbon-theme` exactly as a user's browser would. Four rigs under `../../audit/`:

- `map-states.mjs` — the 65 state captures at the root of this folder (PR 3a's list + the PR 3b states).
- `runtime-audit.mjs` (`runtime/`) — route captures + the undefined-`var()` audit: **0 undefined on 6 routes × 2
  themes**; console errors = the Vercel Speed Insights script 404ing under a local `next start`, no app error.
- `marker-contrast.mjs` (`markers/`) — rewritten for the pill: text on fill at 4.5 for the name pill, the status mark /
  the ◇ badge on the fill at 3.0 for the graphic states, the names-off footprint on the mat. **59 measurements, 0 under their floor, 0 outside the ledger; ledger empty** — worst text 7.1:1 (the light quiet
  pill), worst graphic 3.95:1 (◇ on the hovered dark pill #474747); `marker-measurements.json` holds every number.
  The `filtered-out` ledger row is gone (the quiet pill measures); `planner-highlight` is a real Ask Planner call
  (light: highlighted; dark: the model answered broadly and highlighted nothing — SKIPPED, not a failure).
- `shell-states.mjs` (`shell/`) — PR 2's shell rig re-run on this branch (unchanged shell).

## Draft mark — the O3 evidence (`markers/badge-*.png`)

| Theme | ◇ badge | Focus ring | ΔE2000 badge vs ring | Contrast between them | ◇ on the pill fill | Header ◇ · current bar |
|---|---|---|---|---|---|---|
| light | `#8a3ffc` purple 60 | `#b85c2e` | **47.1** | 1.10:1 (the two are NOT meant to contrast — they are different hues) | 5.00:1 | `#be95ff` · `#b85c2e` |
| dark | `#be95ff` purple 40 | `#b85c2e` | **45.4** | 1.94:1 | 4.91:1 | `#be95ff` · `#b85c2e` |

Before the ruling (PHASE4BUILD §1.26): light orange 60 vs terracotta was ΔE 5.3 / 1.10:1 — one hue. `badge-focus-1x-*`
and `badge-focus-3x-*` are the focused changed pill (ring + ◇ in one 28px), `badge-header-indicator-*` the header's
Draft ◇ beside the current bar.

## Captures

| File | What | Theme | Width |
|---|---|---|---|
| `admin-{light,dark}-1920.png`, `admin-row-*`, `admin-row-overflow-*`, `admin-floor-menu-*`, `admin-row-undo-tooltip-*` | the PR 3a frame, unchanged: control row, ⋯ menu, floor menu, Undo tooltip | both | 1920 · crops |
| `admin-band-names-{on,off}-*` | the band's legend follows the Names toggle | both | crop |
| `admin-palette-{browse,results,zero}-*`, `admin-search-scope-*` | the Find palette — rows now on `.sp-palette-row` (kind tag · code / count / Floor tag, no avatar) | both | crop |
| `admin-filters-applied-*`, `admin-row-filters-*` | Filters · 1 + Clear, **quiet pills** (no dim) for the non-matches, the row wrapping in the 1664 pane | both | 1920 |
| `admin-pills-*` | the pill sheet at rest on the draft: name pills, footprints (○ · lock NE07 · hatch NE08), ◇ on changed seats | both | canvas crop |
| `admin-slot-inspector-*`, `admin-slot-inspector-editing-*` | the inspector as the 400 slot (eyebrow · title · legend · Copy link · ×; Actions; Delete hidden for an original) and its editing state (combobox, create-on-save tag, commit bar) — the canvas pushed, the band untouched | both | 1920 |
| `admin-slot-mode-card-move-*`, `admin-pills-move-mode-*` | Move mode: the card owns the slot with the O4 note; dashed origin, solid success targets, **dashed error pills on NE07 / NE08** | both | 1920 · crop |
| `admin-move-confirm-over-slot-*` | the move confirm modal over the slot (a side panel is not a modal) | both | 1920 |
| `admin-pills-draft-changed-*` | after the move: ◇ on both changed seats in purple | both | crop |
| `admin-slot-ask-*`, `admin-slot-ask-popover-*` | Ask Planner in the slot: `.sp-ai-label` + subline + stacked prompts + AI-bordered textarea + Ask in the commit bar; the explainability popover open | both | 1920 · crop |
| `admin-tearsheet-ready-*` | the publish review tearsheet: readiness rail with the tag set, floor group rows, facts footer, Cancel · Publish 2 changes, no × | both | 1920 |
| `home-slot-inspector-*` | the published inspector in the slot (contact rows, Copy link) | both | 1920 |
| `home-{light,dark}-1920.png`, `home-row-*`, `home-band-*`, `home-find-me-*`, `home-roster-*`, `home-roster-copy-hover-*`, `home-roster-copied-*` | the PR 3a viewer frame, unchanged | both | 1920 · crops |
| `admin-light-1024.png`, `home-light-1024.png`, `admin-light-1000-read-only.png` | narrow frames: the row wraps (O6), the below-lg read-only line | light | 1024 · 1000 |
| `runtime/*` | route captures from the undefined-`var()` audit | both | 1920 · 1024 |
| `markers/marker-<state>-<theme>.png`, `markers/badge-*.png`, `markers/marker-measurements.json` | every measured marker state (320×160 crops) + the Draft-mark crops + the numbers | both | crops |
| `shell/*` | PR 2's shell rig on this branch | both | 1920 · 1024 |

## Findings (fixed on the branch before the PR opened)

1. **The ◇ on the names-off footprint was never measured** (Phase 3 drew it with the footprint's fill): purple 40 on the
   gray-10 square is 2.14:1 on dark (light 3.62). The badge now inverts on the filled footprint (stroke = the pill
   fill; the shape carries, the legend count and the inspector text keep the colour) — 10.5 / 18.1:1. PHASE3DS §1.16
   amendment (6), pairs added.
2. **Names off + filtered out had no state**, and the first cut (the quiet EDGE as the fill) was 1.71:1 on the white mat.
   The quiet TEXT colour (gray 70 / gray 30) is the fill now — 7.81 / 10.59:1.
3. **The inspector's contact rows tripped axe `definition-list`** in the e2e-auth tier (a third `<span>` beside `<dt>` /
   `<dd>` in the group). The copy action lives inside the `<dd>` now.
4. **The map-states rig** re-clicked the selected seat (which deselects) and landed on the remembered Floor 2 roster in
   the second theme pass — rig fixes only.

## Known, ledgered for later PRs

- The popover's "How Ask Planner works" link has no shell panel opener to reach the Help panel yet (PHASE4BUILD §1.35).
- Below 900px the selection-centering anchor still assumes the retired bottom sheet (§1.35) — harmless.
