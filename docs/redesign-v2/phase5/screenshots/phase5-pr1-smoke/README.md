# Phase 5 PR 1 — pre-merge smoke provenance

**What:** the reviewer's ten-step smoke over Management → **Publish history** (DECISIONS **D0-a′** / **D5-e**).
**When:** 2026-09-08. **Branch / head:** `feat/phase5-publish-history`, after sheet amendment H's revision.
**Result: 22 / 22** — ten steps × two themes, plus the sign-in each theme opens with.
**Rig:** `docs/redesign-v2/phase5/audit/pr1-smoke.mjs`, **real Chrome** (`channel: "chrome"`), 1024 and 1920.
**How:**
`node docs/redesign-v2/phase5/audit/pr1-smoke.mjs http://localhost:3300 <thisDir> e2e-admin@example.test <seeded password>`
**Where from:** the **local Docker stack only**. The rig resets and reseeds per theme
(`npx supabase db reset` → `scripts/seed-local-db.mjs`) and then loads `audit/pr1-log-fixture.sql`, because the
seeded stack holds one publish event, which exercises neither sorting nor paging. The app ran from
`next build` / `next start` with the local URL and anon key **passed inline**; `.env.local` was never edited.
**Nothing here touched production** — no production read, no production write, no firm data in any image. The
accounts shown (`e2e-admin@example.test`, `e2e-viewer@example.test`) are the seeded test users.

**Every geometric claim is a hit-test** (`document.elementFromPoint` at the element's centre returns the element
itself), never a visibility check; every ordering claim reads the rendered rows, never the component's props.

## Steps and what each proved

| Step | Theme | Proof |
|---|---|---|
| **1 narrow-1024** | both | All four labels render **unclipped** (`th.scrollWidth ≤ clientWidth`); table computed **1216px**; `.sp-table-scroll` is the scroller (`overflow-x: auto`, `scrollWidth > clientWidth`) and the **document does not** scroll sideways. Hit-tests: the Changes sort button returns `button.cds-sort:Changes`, a Changes cell returns `td.sp-col-count:1`; cell `text-align: right`, `font-variant-numeric: tabular-nums`, header `justify-content: flex-end`. Widths **195 / 207 / 122 / 693** |
| **2 ruling-1920** | both | Same assertions at the ruling frame. Widths **243 / 258 / 152 / 866**; the sort button's right edge and the column's right edge **agree at 854px** |
| **3 no-primary** | both | On the record tab: **0 primaries and 0 focusable nodes** anywhere in the page header. The Tab chain from the skip-link marker is `div[region]:Management → button[tab]:Publish history` — it reaches the tablist and **no stop survives inside `.cds-page-header`**. Back on Employees the primary reads "Add employee" at **1720, 94** — the same box Zones gives it, so the position is permanent and only the presence changed |
| **4 sorting** | both | Clicking Changes actually reorders and puts **41** first — the 41-change publish is twelve days back, so only a whole-log rank surfaces it. `aria-sort` follows. The sort **survives a page change**: page 2's largest (2) ≤ page 1's smallest (2). Keyboard: **Enter** flips Changes to ascending (first row 1), **Space** on Published returns newest-first (`Sep 8, 2026, 2:12 PM`) |
| **5 pagination** | both | `1–25 of 30` → `26–30 of 30`; page 2's first row differs; **Previous disabled on page 1**, **Next disabled on the last page**, Previous enabled on page 2; the toolbar count stays the **total** (`30 publishes · most recent …`) on both pages |
| **6 error-isolated** | both | Only `getPublishLogAction` is aborted — identified by elimination from the `Next-Action` header ids seen on the record tab minus those seen on Employees. The shell's own status stays healthy: the header reads **"Draft — no changes"**, not "Publish state unavailable". The notification replaces the table, and the ghost **Retry** hit-tests as itself and recovers to a loaded `1–25 of 30` |
| **7a empty** | both | `.cds-empty` "Nothing published yet" with **zero buttons**; count "No publishes yet"; no pagination |
| **7b loading** | both | Four `.cds-skeleton-row`s under the four **real** headers; count "Loading publish history…" |
| **8 panel-untouched** | both | The History panel is unchanged: the two-segment **Published ⇄ Draft** switch, a status line, **10** three-line events, one **Show more** → **25** and the caption "Showing the 25 most recent publishes.", after which Show more is gone |
| **9 deeplink-veto** | both | `?tab=publishHistory` selects the record tab and renders **no directory rows** — the Phase 4 redirect is retired. From `/admin` with a dirty inspector, clicking Management in the header still raises the unsaved-edits guard ("Save or discard changes to C01 before opening Management") and the path stays `/admin` |
| **10 sweep** | both | `sp-components.css` byte-identical to the docs copy; no hex and no `--cds-*` in the new component. Brand: primary `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`, selected tab bar and header current-section bar both `rgb(184, 92, 46)`, focus ring `rgb(184, 92, 46)` at **2px** with `:focus-visible` matching, `--cds-link-primary` **#8f4521** light / **#e8a07a** dark. Console: 74 messages, **6 caused by the rig's own step-6 aborts**, the rest the known Speed-Insights 404 + MIME pair, **0 unexplained** |

## Corrections this smoke forced

**The 838px figure in the earlier hand-off is superseded — the agreed edge is 854px.** 838 was measured while
amendment H still read 13 / 20 / 9; the revision to 16 / 17 / 10 widened the Changes column, so the sort
button's right edge and the column's right edge now agree at **854**. Both still agree exactly, which is the
claim that mattered; only the number moved.

**Three rig defects were found and fixed before the run stood up — none was a product defect.** They are
recorded because each would otherwise read as a finding:

1. **The Tab assertion skipped a real stop.** The shipped focus order is marker → the page's focusable scroll
   region (a tab stop by `axe scrollable-region-focusable`) → the tablist. The rig now walks the chain and
   asserts what R1 actually claims: a tab is reached, and nothing in the emptied header is a stop.
2. **The tab bar and focus ring were sampled mid-transition**, giving `rgba(184, 92, 46, 0.945)` and a UA-default
   outline. Read after they land, both are the brand values above.
3. **Chrome withholds `:focus-visible` from a programmatic `.focus()` that follows a mouse click.** The rig now
   reaches the sort button by pressing Tab, as a keyboard user does, which is the only way the assertion means
   anything.

## Files

`01`–`10` are the step captures, both themes; `results.json` carries every measured value, the hit-test strings
and the console attribution.
