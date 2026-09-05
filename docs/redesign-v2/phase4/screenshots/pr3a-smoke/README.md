# Phase 4 · PR 3a pre-merge smoke captures (2026-09-04)

**What these are.** The owner-ordered twelve-step pre-merge smoke of PR 3a (#516, the map frame) — the
verification record behind the merge, kept the same way as `pr1/`, `pr2/`, `pr3a/`. Every step drives the real
built app in real Chrome and records a pass/fail with the measured facts in `results.json` (`step`, `ok`, `file`,
`note`). Result at the merged head (`2446dc2`): **24/24 PASS** across the twelve steps × the two themes where a
step is theme-bearing, after three fixes pushed to the branch (PHASE4BUILD §1.22 light tertiary was IBM blue 60,
§1.23 search-scope menu behind the Find palette, §1.24 ⋯ trigger without a tooltip). The owner's separate Redo
check is PHASE4BUILD §1.25 (pre-existing on `main`; fixed in 3b).

**Source.** Branch `feat/phase4-map-frame` (PR 3a), `npm run build && npm run start` against the **local Docker
Supabase stack** (`npm run db:start` + `db:seed`; `.env.local` pointed at `http://127.0.0.1:54321` for the run,
backed up outside the repo and restored after; the stack stopped with `supabase stop --no-backup`). Signed in as the
seeded local admin `e2e-admin@example.test` and the seeded viewer `e2e-viewer@example.test`. **No production data and
no production write** — every name, seat and count is `supabase/seed.sql` sample data.

**Method.** Playwright `chromium.launch({ channel: "chrome" })`, viewport 1920×1080 (1024×768 and 1000×768 for step
8), device scale 1, `document.fonts.ready` + 500–800 ms; theme set by writing `sp-theme` to localStorage and
reloading so the boot script derives `data-theme` / `data-carbon-theme` as a user's browser would. The rig
(`smoke-pr3a.mjs`, session scratchpad — not committed; the reusable rigs live under `../../audit/`) collects
console errors, page errors and HTTP ≥ 400 per step; the only noise is the Vercel Speed Insights script 404ing
under a local `next start`, which is filtered as known. Colour audit (step 11) reads the computed backgrounds of the
header, control row, band and panels and asserts no IBM blue anywhere on the surface.

`results.json` holds the record of the **last** rig invocation (steps 5, 7–12 re-run after the §1.22–§1.24 fixes
with `SKIP` set for the steps already green); the earlier steps' captures are the files below.

| Step | Files | What it verified |
|---|---|---|
| 1 `/admin` loads | `01-admin-loads-{light,dark}.png` | header 48 · control row 48 directly under it · no tenant row · zero console/page errors; colour audit |
| 2 Search | `02-search-palette-results.png`, `02-search-scope-menu-open.png`, `02-search-scope-whole-building.png` | palette results with both scope counts; the D1-d scope menu opens ABOVE the palette (§1.23 fix) and "Whole building" is pickable |
| 3 Filters | `03-filters-position-{light,dark}.png` | hamburger → left panel (four groups incl. Position); pick a Position → `?position=` in the URL, `Filters · 1` split control + Clear, quieted non-matches, live count; Clear restores |
| 4 No washes | `04-no-washes-zone-filter-{light,dark}.png` | zero wash-like nodes with and without a Zone filter (D1-h / D1-i) |
| 5 Undo / Redo | `05-move-applied.png`, `05-after-move-them.png`, `05-undo.png`, `05-redo.png` | real move (CW01 → C01) = "Draft — 2 changes"; Ctrl Z → "no changes"; Ctrl Shift Z → 2 changes; final Ctrl Z |
| 6 Status band | `06-band-names-{on,off}-{light,dark}.png` | legend follows the Names toggle (mini pill ↔ ●), zero counts explicit, pill widths restore |
| 7 Left panel at 1920 | `07-left-panel-closed-row-48.png`, `07-left-panel-open-row-fits.png`, `07-left-panel-open-row-wrapped-filter-on.png` | panel open, row 48 in the 1664 pane; with a filter on the row wraps to 96, two lines, nothing overlapping or clipped |
| 8 Narrow | `08-1024-admin.png`, `08-1024-left-panel-sections.png`, `08-1000-read-only-note.png` | 1024: row 96, no horizontal scroll, header nav folded, panel Sections ×4; 1000: "Editing needs a wider window." visible, row back to 48 |
| 9 Floor 2 roster | `09-floor2-roster-copied.png` | Copy link → "Copied" done state (`::after`), rows static (no tab stop, no cursor) |
| 10 `/` as viewer | `10-viewer-home-{light,dark}.png`, `10-viewer-history-{light,dark}.png` | published row only (no draft cluster), zero "Draft" text, indicator "Published · Sep 4, 2026", History panel shows the publish line |
| 11 Colour audit | (reads steps 1, 3, 6, 10) | no IBM blue on any surface; no transparent chrome |
| 12 Keyboard | `12-focus-ring-more-actions-tooltip.png` (the row-ring capture of the last run was superseded by this one) | 9 tab stops in D2-b order, every ring `solid 2px rgb(184, 92, 46)` inset; tooltips on Redo and ⋯ (§1.24 fix) |

Traps recorded while running it (also in the session memory): a seat move counts as two draft changes; the results
header shows both scope counts by design (compare row counts, not the header); disabled Undo/Redo are not tab
stops; the Names toggle has a visible label (not icon-only); another session can switch the checkout mid-run —
verify the branch before building.
