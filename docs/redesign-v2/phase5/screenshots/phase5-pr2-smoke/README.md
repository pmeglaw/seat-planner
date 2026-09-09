# Phase 5 PR 2 — pre-merge smoke provenance

**What:** the reviewer's sixteen-step smoke over Reception's **narrow frame** (owner rulings **R1** / **R2**, sheet
**amendment I**, DECISIONS **D3-f**, and the F-1 record addition).
**When:** 2026-09-09. **Branch / head:** `feat/phase5-reception-narrow` at **`763d489`** — the head after this
smoke's one product fix (below); the docs commits before it (`2cc9887`) carry F-1 and the two carried findings.
**Result: 67 / 67** — the sixteen steps at their widths and themes, plus a brand sweep on every capture and the
console attribution (`results.json` has every measured value).
**Rig:** `docs/redesign-v2/phase5/audit/pr2-smoke.mjs`, **real Chrome** (`channel: "chrome"`), 320 → 1920.
**How:**
`MAIN_BASE=http://localhost:3301 node docs/redesign-v2/phase5/audit/pr2-smoke.mjs http://localhost:3300 <thisDir> e2e-viewer@example.test <seeded password>`
**Where from:** the **local Docker stack only**. The rig resets and reseeds once (`npx supabase db reset --no-seed` →
`scripts/seed-local-db.mjs`) and then loads `audit/pr2-smoke-fixture.sql` (one row — see *The fixture*). The branch
ran from `next build` / `next start` on **3300** and, for step 7, a second `next build` of **`main` (`b85cc41`)** in a
worktree on **3301**, both with the local URL and anon key **passed inline**; `.env.local` was never edited.
**Nothing here touched production** — no production read, no production write, no firm data in any image. The
signed-in account is the seeded viewer (Reception is read-only for every role, so the viewer is the honest session).

**Every geometric claim is a hit test** — `document.elementFromPoint` at the element's own box (centre, or all four
corners against the viewport), or one box measured against another — never a visibility check. PR 4's amendment D
is the precedent: a tooltip passed `toBeVisible()` while it was clipped, and a numeral under the pinned band would too.

## The fixture

The seed gives every department at most **one** person with an extension, so no extension-holder has a
same-department fallback — and steps 5, 6, 7 and 11 need a locked person whose tail carries **both** the fallback
roster and Show on map. `pr2-smoke-fixture.sql` moves one row: Anthony Cruz (Litigation, no extension in the seed)
gets **205**, so Litigation holds two. F-1's no-extension-with-fallback people are untouched (Jessica Moore → Maria
Lopez 202; Victor Chen → Alex Shabazian 201). It writes `published_employees` directly, which is fine **only** here:
a disposable local snapshot table with no trigger, the same shape as PR 1's `pr1-log-fixture.sql`.

## Steps and what each proved

| Step | Width · theme | Proof |
|---|---|---|
| **1 locked, scrolled to the end** | 640 · both | Numeral's box **84–134**, all four corners painted by itself; band top **48 = header bottom**; element-at-point at the band's centre is `div.sp-recep-band`, not a row; computed `top: 48px`; the band **moved up** to pin (rest top → 48) while the window scrolled |
| **2 the seam** | 1030 · both | Same, and the offset is **proved, not inferred**: computed `top: 0px`, the **pane** scrolled (244) while the window did not (0), the pane's top is 48, and the band still sits at 48 in the viewport |
| **3 `scroll-margin-top`, both scroll models** | 640 and 1030 · light | With "a" keeping all 12 rows, the cursor walked ↓ 11 and ↑ 11 steps; on **23 / 23** the highlighted row's top edge was at or below the band's bottom **and** painted at (centre, top + 4). Both models: window at 640, pane at 1030 |
| **4 O-4, the loop** | 640 · light | List scrolled to its end, then a lock: focus is in the field (`reception-main`), typing "a" filters to "12 matches", the rig scrolled nothing, and the band is inside the viewport at all four corners while the field has focus. The field's own box is **not** asserted |
| **5 O-3, the live region** | 1920 and 640 · light | Exactly **two** `aria-live` elements on the page — the count and the band; the band is the only one inside the readout; its text carries name + **205** + the seat line; the fallback roster and Show on map have **no** live ancestor |
| **6 O-1, zero focusables + the real Tab walk** | 480 / 640 / 800 / 1024 / 1920 · light | `a, button, input, select, textarea, [tabindex], [contenteditable]` inside the band: **0**. The list's stop is the roving cursor: typing sets `aria-activedescendant` to a row, ↓ moves it, ↑ returns it, focus never leaves the combobox. Then real Tab presses from the field, `document.activeElement` read at each: **Clear search → David Kim 203 (tail) → Alex Shabazian 201 (recents)** — never the band, never a row |
| **7 the ≥1056 proof** | 1920 · both | Readout **480 · gutter 32 · list 1008**; readout visual order by box top: who 182 < tile 248 < seat line 410 < fallback 458 < Show on map 546 < recents 602. **Against `main` (`b85cc41`), same state, same theme: 0 of 2,073,600 pixels differ.** `07-1920-side-by-side-*.png` is branch (left) and main (right) on one canvas |
| **8 F-1** | 480 · both | Jessica Moore locked: "No extension on file" painted in the band, unclipped (`scrollWidth ≤ clientWidth`, inside the band and the frame). Keyboard only from the field: the **first** Tab stop is the fallback button (no query, so no clear ×); ↵ locks Maria Lopez and the band reads **202**, numeral hit-tested |
| **9 the wrap** | 410 / 420 / 460 / 480 · light | 410 and 420: name block top (354) **below** the tile's bottom (346) — stacked. 460 and 480: who 248–298 and tile 248–346 overlap vertically — side by side. The sheet's 420 threshold holds |
| **10 no sideways scroll** | 320 / 360 / 390 / 420 / 460 / 480 · light | `documentElement.scrollWidth === clientWidth` at every width; **0** band descendants with a right edge past the frame |
| **11 zero matches** | 640 · both | "zzzzqq": count reads **"0 matches"**; `.cds-empty` painted where the list was (top 388 = count header's bottom), 0 rows; the band **keeps** Anthony Cruz **205** (§1R.6); the tail (578) is below the card (562) |
| **12 partial** | 640 · light | `SELECT` on `public.seats` revoked from the API roles for one load (granted back in a `finally`): the warning notification lands **above** the band (222–282 vs band 282), does not cover it (centre hit-test), the seat line reads *"Seat unknown right now — the map is still loading."*, and the band still pins at 48 when scrolled |
| **13 waiting** | 480 · both | "Waiting for a call." spans the band's full content width (**384 / 384**); **0** tile elements beside it; band has one child |
| **14 loading** | 640 · light | Client navigation from `/admin` while the local DB holds the snapshot table for 5 s: the skeleton's order is search 198 < **band 214–278** < count header 278 < six rows < tail 614 — the new order, not amendment E's stack. This is the step that found the fix below |
| **15 brand sweep** | every capture | Every element's `color`, `background-color`, border, outline and `box-shadow` scanned for the IBM blue scale: **0 hits** on every capture. Primary `rgb(184, 92, 46)`; links `rgb(143, 69, 33)` light / `rgb(232, 160, 122)` dark; Show on map the link colour; focus ring on every tab stop `rgb(184, 92, 46) solid 2px`, offset −2px |
| **16 lockstep + scope** | — | `sp-components.css` byte-identical to the docs copy; `git status` at the end of the run lists nothing outside `docs/redesign-v2/phase5/` |

## The product fix this smoke forced

**Step 14 failed on the first run — a real defect, not a rig defect.** Amendment I ordered `.sp-recep-header`,
`.sp-recep-rows` and the empty card after the band below 1055, but the loading skeleton renders its rows as
`.sp-recep-skeleton-row`, which carried no `order` — so while the directory streamed at 640 the six skeleton rows sat
**between the search and the band**, then the band, then the count header (`output/…/try3` on the first head; the
capture here is after the fix). One selector added to the rule in both lockstep copies, commit **`763d489`**
(`fix(reception): the loading skeleton's rows follow the band under the fold`). PHASE5.md's line *"the loading
skeleton got the same two groups"* was true of the markup and false of the order until this commit.

## Rig defects, fixed in the rig

Recorded because each would otherwise read as a product finding on a re-run:

1. **The cursor exists only while a query is typed** (`cursor = searching ? … : null`). Step 3 first pressed ↓ from
   a cleared field and walked nothing. It now types the single letter that keeps the most rows first.
2. **The seed has no extension-holder with a fallback** — every "tail with fallbacks" step found no tail. Hence the
   one-row fixture above.
3. **"Ant" also matches "Staff Accountant"**, so step 6's extra ↓ previewed Nina Patel, who has no fallback, and the
   walk found no tail. The step now proves the roving stop with ↓ then ↑ back to the locked person before Tab.
4. **The loading skeleton cannot be caught from the browser side.** A document load streams the root
   `app/loading.tsx`, never the section's own; the shell's section links are `prefetch={false}`, so a stalled RSC
   request shows nothing. A client navigation inside the mounted shell while the **database** holds the snapshot
   table is the real streaming path — and the hold must stay under the authenticated role's 8 s
   `statement_timeout`, or the page errors (React #441) instead of loading.

## Console

Across the run's page loads, every console error matched the known local-only pair — the Speed Insights script's
404 and its MIME-type refusal (PHASE4BUILD §1.46) — **0 unexplained**. The React #441 seen while debugging step 14
was the rig's own 10 s hold tripping the statement timeout; it does not occur at 5 s and did not occur in the run.

## Files

`01`–`14` are the step captures (both themes where the step ran both); `07-1920-side-by-side-*` the branch/main
composite; `results.json` every measured value, hit-test string and the console attribution.
