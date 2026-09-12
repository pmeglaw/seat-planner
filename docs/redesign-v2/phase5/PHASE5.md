# Phase 5 — after the redesign

Phase 4 closed at **v2.0.0** (PR 6, squash `0caedc6`, 2026-09-08) and its record is closed: `phase4/` is read,
never edited. Phase 5 is the arc of slices that follow, each one an owner-ruled amendment to the Phase 1–4
record rather than a reopening of it.

Method is unchanged: the record (PHASE1IA / PHASE2UX / PHASE3DS / DECISIONS) is the spec, the brief is read
through it, and a contradiction becomes a dated amendment or a question — never a silent build call. The
`ibm-design-language` skill fingerprint is verified before each slice by the PHASE3DS §0 recipe.

| Slice | What | Tag | State |
|---|---|---|---|
| PR 1 | The publish-history record surface returns to Management as a fourth tab | v2.1.0 | **merged 2026-09-08** — #525 squashed as `524c087`, tagged `v2.1.0`, production READY at that SHA |
| PR 2 | Reception's narrow frame: the readout splits by job, the answer pins under the search | v2.2.0 | **merged 2026-09-09** — #526 squashed as `740fd57`, tagged `v2.2.0`, production READY at that SHA; pre-merge smoke 67/67 on `763d489` |
| PR 3 | The names-off marker becomes ● in the footprint: one status-mark language on the plan | v2.3.0 | **merged 2026-09-09** — #527 squashed as `bedecbb`, tagged `v2.3.0`, production READY at that SHA; CI green on `6efe9d6`, read-only preview walk 8/8 (step 6 N/A) on `2f7e262` |
| PR 4 | Reception's locked row gets its own surface (O4), and 24 between the readout's groups (amendment K) | v2.4.0 | **merged 2026-09-10** — #528 squashed as `365dc7f`, tagged `v2.4.0`; CI green on `d71a450`; read-only walk 18/18 on a local build of the head with the preview artifact proven via share link (owner could not sign in; owner ruling: merge) |
| PR 5 | Dark interactive edges carry the hue: `--cds-border-interactive` is #E8A07A in the two dark blocks (O5) | v2.5.0 | **merged 2026-09-10** — #529 squashed as `cdc44b9`, tagged `v2.5.0`; CI green on `6815686` (verify, e2e, e2e-auth, CodeQL); Codex review 0 findings; owner ruling: merge. The PR 5 / PR 4 rigs, runtime audit and the real-Chrome brand checklist were not run before merge (no Docker or Chrome in the build session) — owed as a post-merge check on `main` |

---

## PR 1 — Publish history returns to Management

**Plan of record:** `plans/phase5-pr1-publish-history.md` (v1, commit `17a7a39`), cleared as written with owner
rulings R1–R3 and five reviewer rulings on the findings.
**Rulings landed in DECISIONS:** **D0-a′** (the panel keeps the glance, the record returns to a page) and
**D5-e** (the tab returns; R1 no primary, R2 the subtitle, R3 the Changes column and the coupling it forces).
**Skill fingerprint:** `f997ee525800e755`, verified before reading anything.

### What the slice is

D0-a bundled two jobs under "publish events". *Orientation* — which mode am I in, what is unpublished, when did
this last go live — stays in the History panel, untouched: same mode switch, same status line, same ten newest
publishes with one Show more to the 25 cap, same `getPublishHistoryAction(limit)` call. *The record* — what went
out over months, who published it, which publish moved the west pod — is a scanning task on a data set, and a
320px panel serves it badly by its own spec. It is a page again: `?tab=publishHistory`, the whole log, sortable,
paginated, no cap, no drill-in.

### Engineering calls the code forced, one line each

- **A second action, never a widening.** `getPublishLogAction` sits *immediately after*
  `getPublishHistoryAction` in `app/actions.ts`, whose diff is empty. The placement is load-bearing:
  `restore-draft-snapshot-transaction-safety` and `seat-creation-ui-source` both regex the source span ending at
  that export, so an insertion above it breaks two tests for an unrelated reason.
- **The whole log, client-sorted.** PostgREST can order by a column and even by one JSON key, but not by a sum
  of nine — that needs a generated column, view or RPC, i.e. a migration. A Changes sort that ranks only the
  visible page cannot find the large publishes, so the sort happens in the client. Paged through `fetchAllRows`,
  because an unpaged select is silently truncated at the row cap and a truncated *record* reads as "we never
  published before that".
- **Fetched on tab mount, not in the page's server render.** The Management route is `force-dynamic`; putting
  the log in its `Promise.all` would charge every admin an extra round trip for a tab they mostly do not open.
  That is also where the in-tab loading and error states come from, with the History panel as the precedent.
- **One definition of "unreadable".** `formatPublishChangeSummary`'s validity check was extracted as
  `validBucketEntries` so the sentence and the count cannot disagree: the cell reads "—" exactly where the
  sentence would be null. Unreadable rows sort **last in both directions** — unknown is not small.
- **`seat_count` never becomes a column.** It is the map size at publish, not a delta. It survives only inside
  `Initial publish · N seats`, the sentence that names it, on the one kind of row with no summary.
- **The ct harness needed a default.** The panel can now reach `getPublishLogAction` on any render, so
  `admin-management-panel`'s `beforeEach` stubs an empty log; the tests that care pass their own.
- **Two pagination chevrons** joined `components/ui/icons.tsx` as their own glyphs — a rotated `ChevronIcon`
  would fight the asset's `.cds-btn--icon svg` sizing rule.

### Sheet amendment H (2026-09-08) — and what the captures changed about it

One dated amendment to `sp-components.css`, byte-identical in both copies; no new tokens, so `sp-tokens.css`,
`carbon-tokens.css` and `carbon-components.css` are untouched. `.sp-log` rides `.sp-table`, so §1.23's 40 header
/ 32 rows come in unchanged; only the column shapes differ. The count pair mirrors the shipped `.sp-col-ext`
(right + tabular + the sort button following it) rather than inventing a second way to right-align a number. The
`<colgroup>` alternative was rejected: it still cannot right-align the header's sort button, and "the CSS is the
deliverable" (PHASE3DS §7).

**The percentages were judged from pixels, not paper (reviewer ruling), and the first draft was wrong.** At 13 /
20 / 9 with no minimum, the 1024 capture crushed the count column to 86px and ellipsed its **label** to
"hanges", while the date lost its time to "Sep 8, 2026…". Measured at 14px on the live table: the date needs
190px, the publisher 201px, and Changes **113px — the header, not the number, being the binding constraint**.
The fix is a measured `min-width: 1216px` with **16 / 17 / 10**, so below that width the table scrolls inside
`.sp-table-scroll` — which is §1G.5's own rule for this page's narrow frame — instead of ellipsing a column
label.

> **The label-vs-sentence rule (reusable beyond this table).** In a fixed-layout table, a truncated column
> **label** is a defect and a truncated **cell sentence** is a design choice. The label is the only thing that
> makes the column readable at all, and no `title` restores it — nothing hovers a header looking for its own
> name. A sentence, by contrast, has a `title`, and a well-chosen neighbouring column can carry the part of its
> meaning that must survive truncation (here, the magnitude). So size a column from **max(header, data)** and
> give the table a `min-width` from the sum, rather than trusting percentages that always fit their container:
> percentages guarantee a fit, not a reading.

Rendered after the revision (`screenshots/phase5-pr1/`):

| Frame | Table | Published | Published by | Changes | What changed | Sentences truncated |
|---|---|---|---|---|---|---|
| 1920 (live area 1584) | 1520 | 243 | 258 | 152 | 866 | 0 / 25 |
| 1024 (scrolls in its container) | 1216 | 195 | 207 | 122 | 693 | 0 / 25 |

### Carried, not fixed

- **`.sp-tab-count` is a Phase 4 conformance gap, carried** (reviewer ruling 2026-09-08). The class is defined
  in `sp-components.css` (:836 after amendment H; :835 before it), drawn twice by specimen
  `phase3/specimens/04-forms-and-tables.html`, and listed in PHASE3DS §2's tab
  component row — but **no shipped component renders it**. The reviewer's PR 1 mockup drew per-tab counts; the
  shipped app has none on any tab, so the new tab ships countless like its three siblings and no counts were
  wired in this slice. The unused rule is recorded here for a later pass, not removed.
- **`phase4/audit/pr4-smoke.mjs:109` is one assertion stale** — it asserts the old subtitle, which R2 changed.
  The rig is manual, in no npm script and no CI job, and it is closed Phase 4 record; editing closed-phase
  evidence to keep a manual rig green is the wrong trade (reviewer ruling). The assertion is inside the rig's
  **step 1 (Frame)**, which reads the Management page header; a future re-run fails there for this reason and no
  other — the heading, the primary and its brand colours in the same block still hold.
- **The `publish_events` row count, measured 2026-09-08: 44 events**, most recent Aug 31, 2026, 6:23 PM — read
  from the tab's own count line during the read-only preview walk, not from a query. A direct
  `select count(*)` against production was blocked by the session's tool classifier, and the point of this entry
  is that it no longer needs to run: the surface reports the number continuously. That is **two orders of
  magnitude** of headroom against D5-e's ~5,000-event ceiling — 113× under it, below 1% — so the client-side
  whole-log sort R3 forces is not near its limit. A dated measurement, not a standing fact: it is the log on
  2026-09-08 and it only grows.

### Verification, on the final head

`npm test` **1480/1480** (incl. `test:db`) · `npm run test:ct` **332/332** · `npm run gate` **exit 0**
(lint 0 errors / 81 pre-existing warnings, typecheck clean, coverage **98.36 lines / 92.44 branches / 98.33
functions** against floors 90 / 80 / 95) · `npm run build` clean · `npm run test:e2e` **36/36** ·
`npm run test:browser` **26/26** · **`npm run test:e2e:auth` 59/59** on the local Docker stack (56 at the Phase 4
close-out plus this slice's three frame tests) · runtime audit **0 undefined `var()`** across 6 routes × 2 themes
+ 1280 + the system state + the viewer routes, re-run after the sheet change · **contrast not re-run — no token
moved** · `sp-components.css` byte-identical to the docs copy · capture + measure rig
`audit/pr1-publish-history.mjs` **32/32** plus **7/7** for the empty state, captures and `results.json` under
`screenshots/phase5-pr1/`.

**Reviewer's pre-merge smoke** (`audit/pr1-smoke.mjs`, ten steps × two themes, real Chrome at 1024 and 1920 on
the local Docker stack, every geometric claim a hit-test): **22/22**, captures + `results.json` + README under
`screenshots/phase5-pr1-smoke/`. It proved the narrow frame unclipped at the 1216 minimum, the whole-log Changes
sort surviving a page change, pagination's disabled ends and total-not-page count, the error state **in
isolation** (only `getPublishLogAction` aborted, so the shell status stays healthy — which closes the caveat the
capture pass had to carry), the History panel untouched at 10 → Show more → 25 + caption, the retired redirect,
the unsaved-edits veto still covering the destination, and the brand sweep. **One number is corrected by it:**
the Changes column's right edge is **854px**, not the 838 quoted before amendment H's revision — the edges still
agree exactly, only the geometry moved.

---

## PR 2 — Reception's narrow frame

**Plan of record:** `plans/phase5-pr2-reception-narrow.md` (hand-off `…-HANDOFF.md`, committed as Task 0),
cleared with owner rulings **R1** / **R2** and five reviewer rulings on the plan's findings (O-1…O-4 and the
record addition, all granted).
**Rulings landed in DECISIONS:** **D3-f** — the narrow frame is a pinned band, not a drill-down, and the back
path retires with it.
**Skill fingerprint:** `f997ee525800e755`, verified before reading anything.

### What the slice is

`/reception` has one job: take the call, find the person, read the extension aloud. The receptionist runs it
in a **dragged narrow window**, routinely about a third of a 1920 monitor. Amendment E stacked the whole
readout under the list below the 1055 fold, which cost nothing while the row extension was 20px semibold — the
list answered by itself. The redesign set it to `--sp-type-code-02` (400 14/20), so the list stopped answering
and the one number she reads aloud moved below the fold: locking scrolled down to it and left the search
above, and the next lookup meant scrolling back up. That loop is the whole job.

The readout now **splits by job** under the fold. The **band** — name, extension tile, seat line — pins under
the search and the list scrolls beneath it; the **tail** — the same-department fallbacks and Show on map — and
Recent lookups follow the list. The `heading-06` numeral survives, the list stays dense, and **nothing at 1920
changes**. Two of the three obvious hypotheses about the regression were wrong and the hand-off had already
disproved them: the pre-redesign layout stacked below 1024 too, and amendment E's 1055 fold is a faithful
reading of §1R.6. The type change was the regression.

### Engineering calls the code forced, one line each

- **CSS-only, `display: contents` + `order`, no JS.** The alternative — two trees from `matchMedia` — has no
  viewport on the server, so every narrow load would flip layout after hydration on the width she always uses,
  and it would reintroduce a JS breakpoint constant weeks after PR 6 retired `SEAT_CENTER_PANEL_BREAKPOINT_PX`.
- **Constraint 2 had to move, and the reviewer moved it.** The hand-off asked for WCAG **C27** (DOM order
  matches visual order) *and* an unchanged ≥1056 frame; no mechanism satisfies both, because the band needs one
  DOM position at each frame. C27 is a **sufficient technique, not a success criterion**: 1.3.2 holds (search →
  results → detail → tail is the list-then-detail sequence D3 chose) and **2.4.3 holds because the band carries
  zero focusable elements** — which is true only because D3-f retires "Back to the list", its one control.
  Asserted at all four widths, not argued.
- **The sticky offset needed no new class.** The band is a DOM descendant of the readout, and custom properties
  inherit through the DOM regardless of `display: contents`, so it picks up `lg:[--sp-shell-header-h:0px]` —
  which is exactly what the **1024–1055 seam** wants, where the shell pane already scrolls (Tailwind `lg` is
  1024) while the sheet is still below its 1055 fold. Measured: `top: 48px` below 1024, `0px` at 1024.
- **The pinned band would have swallowed the ↑ cursor.** `scrollIntoView({ block: "nearest" })` counts a row
  hidden behind a sticky band as visible. One `scroll-margin-top` fixes it and is exact in *both* scroll
  models: below 1024 the document scrolls and `html`'s `scroll-padding-top` adds the 48 header; in the seam the
  pane scrolls and has none.
- **The tail must not render empty.** An empty flex child still takes one of the readout column's 16px gaps at
  wide, so `hasTail` gates it — the "wide unchanged" claim is that literal.
- **The loading skeleton got the same two groups**, or the frame would jump by the band's height at narrow —
  which is the one thing `loading.tsx` exists to prevent. *Corrected 2026-09-09: the two groups were in the markup, but the
  skeleton's rows (`.sp-recep-skeleton-row`) carried no `order`, so at narrow they streamed between the search
  and the band, then the band, then the count header — found by the pre-merge smoke's step 14, fixed in `763d489`
  (one selector added to amendment I's order rule, both copies).*

### Sheet amendment I — and the measurement that contradicted the brief

One dated amendment, byte-identical in both copies; **no new tokens**, so `sp-tokens.css`, `carbon-tokens.css`,
`carbon-components.css` and `app/styles/brand/` are untouched and **contrast was not re-run**. Both constants
were read off the live band, and one of them disagreed with the hand-off:

- §4.2 predicted the name block would wrap under the numeral "below roughly 560". **It wraps at 420 and below.**
  The numeral is only 87–101px wide, so on a 224px basis the two sit side by side across the whole of R2's
  480–1055 range (at 480: 101 + 32 + 224 = 357 in a 416 frame). The wrap is therefore **not a designed reflow
  inside R2's range at all** — it is the safety valve that keeps DECISIONS §2's 320 floor working, and 224 is
  the basis that makes it engage there.
- The band is **232px** tall wrapped (320) and a flat **170px** side by side (460 up) — measured against
  injected worst-case name, role and seat-line text as well as the seed's longest. The tile column dominates,
  so a name wrapping to two lines inside its own block costs nothing. 232 is the `scroll-margin-top`.
- No horizontal scroll and nothing off-edge at 320 / 360 / 390 / 420 / 460 / 480. F-9's failure mode was a
  fixed width beating the computed frame; there is no fixed width here.

> **The prediction-vs-pixels rule, again.** Amendment H learned it on column widths; this slice learned it on a
> reflow threshold. A width predicted from the *content* ("a name needs room by 560") was out by 140px because
> the binding term was the *other* item's width, not the name's. Measure the pair, not the part.

### Two clarifications the build asked for

- **Constraint 1 says "exactly one `aria-live` region on the page"; the page has two, and always did.** The
  second is the list's result count, which PHASE2UX §1R.2 and D3-b require ("the result count is always
  published, zero included"). The constraint is about the **readout**: the answer is announced once, from one
  place. `reception-source` pins both — one live region inside the readout, and the count as the only other.
- **§5's "the search field is still reachable without scrolling up" is about the loop, not the pixels**
  (ruling O-4). `lock()` clears the query and returns focus to the field, so the next lookup is typed straight
  away; the search is never pinned, and pinning it would stack 48 + 64 + band on an 800-tall window and eat the
  list. Asserted as: after a lock with the list scrolled to its end, focus is in the field, typing filters, and
  the band is still fully inside the viewport.

### Carried, not fixed

- **`npm run test:e2e:auth` cannot be run twice without a database reset**, and this is **pre-existing** — the
  tier's own `publish-flow` spec performs a real publish, so the next run's global-setup seed dies on
  `duplicate key value violates unique constraint "one_published_seat_per_employee"`. Nothing in this slice
  writes to the database. The recipe between runs is `npx supabase db reset --no-seed` (the tier seeds itself).
  Recorded here rather than "fixed" by making the seed idempotent, which would quietly change what the seed
  means; it is a hand-off note for the next session, not a defect in the tier's coverage.
- **Two rig findings, fixed in the rig, both easy to repeat.** "The band stays pinned" was first asserted as
  "the band does not move" — pinning is precisely the band moving up to its offset and stopping. And the
  tail-order claim ran on whichever person happened to be locked, so someone who is simply the only extension
  in their department read as an O-2 regression; the rig now locks a person who *has* fallbacks first.
- **The local `next start` console carries Speed Insights 404s and a MIME refusal** — the same local-only noise
  PHASE4BUILD §1.46 recorded for the PR 5 smoke. Nothing else on any route.
- **The band→tail gap at wide equals the intra-band gap** (reviewer critique at 1920, 2026-09-09, rubric level 2
  Spacing). Amendment I names two jobs — band and tail — but above the fold the readout column spaces them at the
  same 16 it uses inside the band, where the rubric wants tight inside groups and loose between. Fenced out of this
  PR by its own "nothing at 1920 changes" contract, so a **post-tag candidate raise**, not a defect; the fallback
  heading's 32px box already gives ~14px of air, so it reads acceptably today. → **fixed in PR 4 (v2.4.0, sheet
  amendment K).**
- **The count header and the locked row sit on the same surface** (reviewer critique at 1920, 2026-09-09, rubric
  level 5 Depth). `.sp-recep-header` is on `--sp-layer-selected` and `.sp-recep-row[aria-selected="true"]` on
  `--sp-recep-row-locked`, both aliases of `--cds-layer-selected-01` (rgb 224 224 224 light), so when the locked
  person is row 1 the header and the row fuse into one slab with only the 3px terracotta bar between them.
  **Pre-existing** — amendment I touched neither rule — and it **needs an owner ruling**, because the fix moves a
  token alias (one of the two onto another surface, or the header tint dropped). Carried, not fixed. → **fixed in PR 4
  (v2.4.0, owner ruling R1 = option C, brand-file O4, DECISIONS D3-g).**

### Verification, on the final head

`npm test` **1488/1488** (incl. `test:db`) · `npm run test:ct` **336/336** · `npm run gate` **exit 0**
(lint 0 errors / 81 pre-existing warnings, typecheck clean, coverage **98.36 lines / 92.44 branches / 98.33
functions** against floors 90 / 80 / 95) · `npm run build` clean · `npm run test:e2e` **36/36** ·
`npm run test:browser` **26/26** · **`npm run test:e2e:auth` 63/63** on the local Docker stack (59 at the PR 1
close-out, plus this slice's four narrow-fold axe frames) · runtime audit **0 undefined `var()`** across 6
routes × 2 themes + the system state + the viewer routes · **contrast not re-run — no token moved** ·
`sp-components.css` byte-identical to the docs copy.

**The audit rig** `audit/pr2-reception-narrow.mjs` — **148/148**, four widths × two themes, every geometric
claim a hit test (`document.elementFromPoint`, all four corners against the viewport), captures +
`results.json` + README under `screenshots/phase5-pr2/`. It proves the band pinned under the search and above
the list at 480 / 640 / 800 / 1024, the numeral still painted **with the list scrolled to its end**, the sticky
offset switching correctly across the 1024 seam, zero focusable elements in the band, the tab order never
entering it, the ↑ cursor never parking under it, one live region and one extension slot, "Waiting for a call"
and "No extension on file" both held by the band, no sideways scroll, and — at 1920, both themes — the wide
frame untouched at **readout 480 · gutter 32 · list 1008**.

**Reviewer's pre-merge smoke** (`audit/pr2-smoke.mjs`, sixteen steps, real Chrome 320 → 1920, both themes on the
local Docker stack, every geometric claim a hit test; captures + `results.json` + README under
`screenshots/phase5-pr2-smoke/`): **67/67 on `763d489`**. It proved the band pinned at the header's bottom with the
list scrolled to its end at 640 and in the 1024–1055 seam (offset **0px** proved by the pane scrolling while the
window does not), the ↑ ↓ cursor never under the band in **both** scroll models (23/23 steps each), the O-4 loop
(focus in the field after a lock, typing filters, band still fully in view), the live region narrowed to the band
with the count as the only other, zero focusables in the band plus a real Tab walk (clear × → tail → recents,
never the band) at five widths, the F-1 no-extension state reaching its fallback by keyboard, the wrap threshold at
420, no sideways scroll 320 → 480, the zero-match band holding the last lock, the partial-state notification above
the band, the waiting copy spanning the band, the loading skeleton in the new order, the brand sweep clean on every
capture, and — the strongest line — **1920 against a `next build` of `main`, both themes, same state: 0 of
2,073,600 pixels differ.** **One product fix it forced:** the loading skeleton's rows had no `order` under the fold
(the bullet above), `763d489`. The seed needed a one-row fixture (`audit/pr2-smoke-fixture.sql`) because no
extension-holder in it has a same-department colleague with one.

**The ≥1056 proof** additionally rides in CI: `page-frames`' wide branch is unchanged and still asserts the
480 / 32 / 1008, and the four new `accessibility` frames prove the labelled "Caller detail" landmark survives
`display: contents` at every narrow width (reviewer condition O-1(c)).

---

## PR 3 — the names-off marker becomes ● in the footprint

**Plan of record:** `plans/phase5-pr3-names-off-marker.md` (hand-off `…-HANDOFF.md`, committed `05778a2` as Task 0;
the plan `1289fde`), cleared with owner ruling **R1** (Option B), reviewer defaults **R2–R4** confirmed by the owner,
owner rulings **P-1 / P-2 / P-3** on the plan's findings and reviewer rulings **A–D** on the plan, all 2026-09-09.
**Rulings landed in DECISIONS:** none — a PHASE3DS §1.16 conformance amendment (3), with §1.4 cross-amended; the §6
header carries one line, next free stays 19.
**Skill fingerprint:** `f997ee525800e755`, verified before reading anything.

### What the slice is

"Why is it just a black box when the names are off?" With Names off every assigned seat on `/admin` and `/` was a
solid 28×28 block in `--sp-icon-primary` — PHASE3DS §1.16 as ruled in Phase 3. Drawn beside the legend in both
themes, the block shipped three defects: **F-1** the selected state was invisible with Names off, **F-2** the ◇
changed-in-draft badge was clipped to a corner nick, **F-3** the band's legend showed ● while the plan painted ■.
Root cause: §1.16 minted a *second* visual language for "assigned, names off" instead of reusing the status-mark
language every other seat already speaks — a 28px footprint with a 16px symbol inside — so hover, focus, selected,
quiet and the badge all had to be re-solved for the block, and three of those re-solutions were wrong. **R1:** the
assigned pill with Names off is now the empty-seat footprint carrying the legend's own ●, and the legend's ● carries
the same colour (P-1). Names on is untouched; nothing at 1920 with Names on changes.

### Engineering calls the code forced, one line each

- **F-1's cause was the colour, not the cascade** (the hand-off read it as `.sp-pill--names-off`'s `box-shadow:
  none` out-cascading the selected rule). `.sp-pill[data-state="selected"]` is (0,2,0) and outranks the (0,1,0)
  modifier in either order; the edge was invisible because `--sp-pill-selected-edge` = border-inverse **is** the
  block's fill in both themes (gray-100 on gray-100, gray-10 on gray-10). The footprint fill removes the collision,
  so no rule is restated — corrected by the build, recorded in §1.16 amendment (3).
- **The base `.sp-pill` rules already are the footprint.** `--sp-pill-fill` / `--sp-pill-edge` /
  `--sp-pill-fill-hover` alias layer-02 / icon-secondary / layer-hover-02 — the same Carbon roles as
  `--sp-seat-footprint-fill` / `-border` / `--sp-layer-hover-02`. Amendment J is therefore three rules, not the
  hand-off's five-plus-restated-selected (owner ruling P-2): width, no pads, the ● colour; the ● inherits; the quiet
  ● steps.
- **`currentColor` alone never reached the ●.** `.sp-seat-mark` sets its own `color` (the stroke colour), so the
  pill's colour needs `.sp-pill--names-off .sp-seat-mark { color: inherit; }` — the hand-off's "no new selector"
  was wrong.
- **The quiet ● needs one combined rule.** `.sp-pill--quiet` and `.sp-pill--names-off` are both (0,1,0) and
  names-off is declared later, so its `color` would win and the ● would stay gray-100 on the quiet fill;
  `.sp-pill--names-off.sp-pill--quiet { color: var(--sp-pill-quiet-text); }` makes the step order-independent and
  pinnable.
- **The badge override goes, not moves.** The base `.sp-pill-badge` fill is `--sp-pill-fill` = layer-02, which is
  now the surface the ◇ sits on; the PR 3b inversion existed only for the block.
- **The legend's ● was the wrong colour all along.** `MapStatusBand` rendered `assigned-dot` without
  `sp-seat-mark--assigned`, so the legend's ● painted icon-secondary while §1.4 specifies icon-primary (the
  Management table already passes the class). One attribute, owner ruling P-1.
- **The rig measures the edge on the mat now.** The names-off branch of the marker rig read fill-on-mat; with the
  footprint that pair is layer-02 on layer-01 — a surface step, not a mark — so it reads the footprint's edge
  instead, and the ● on the fill comes through the generic mark branch once the svg exists.
- **One a11y pin followed the ternary.** `accessibility-source`'s "one visible text node, then only aria-hidden
  marks" guardrail pinned the old render expression; with names off the aria-hidden ● replaces the text node, so the
  guardrail holds and the regex now matches `namesOff ? <SeatMark kind="assigned-dot" /> : …`.

### Sheet amendment J (2026-09-09)

One dated amendment, byte-identical in both copies; **no new tokens, no token value moved** — `--sp-pill-names-off`
is **retired** from both `sp-tokens.css` copies (its only consumers were the block and the specimen swatch). Three
rules replace the nine-line block group; `overflow: hidden`, `color: transparent`, `box-shadow: none`, the hover
restatement, the quiet fill/hover pair and the badge inversion are gone. The sheet's §2 and §12 header comments
stop saying "● never appears on the map". `desktop-seat-marker-system-source` pins the three rules and, against
the comment-stripped sheet, the absence of every retired declaration and of the token.

### Contrast — the footprint's four pairs

Static gate (`phase3/contrast/generate-pairs.mjs` — the five filled-block rows replaced by the footprint's four ×
two themes; `check_contrast.py` run with `PYTHONUTF8=1`, the Windows console codec otherwise chokes on the ●):

| Pair | Light | Dark |
|---|---|---|
| ● on the footprint (layer-02) | gray 100 on white **18.10** | gray 10 on gray 80 **10.50** |
| ● on the quiet fill (layer-01) | gray 70 on gray 10 **7.10** | gray 30 on gray 90 **8.86** |
| ◇ on the footprint (layer-02) | purple 60 on white **5.00** | purple 40 on gray 80 **4.91** |
| footprint edge on the mat (layer-01) | gray 70 on gray 10 **7.10** | gray 30 on gray 90 **8.86** |

```
product-pairs.json: 206 pairs · surface-pairs-not-gated.json: 14 pairs
206/206 pass
```

Live (`audit/marker-contrast.mjs`, real Chrome on the local Docker stack, the states `names-off`,
`names-off-quiet`, `names-off-draft` added): **69 measurements, 0 under their floor, 0 outside the ledger. Ledger: empty** (`screenshots/phase5-pr3/contrast/summary.txt`). The names-off states, light / dark: ● on the footprint **18.1 / 10.5**; the footprint edge on the rendered mat **7.81 / 10.59** (the rig reads the canvas behind the marker — white / #161616 — not the layer-01 token the static pair assumes; both clear 3:1); quiet ● **7.1 / 8.86**; ◇ on the footprint **5.00 / 4.91**. The quiet pill's subtle edge is deliberately not gated: it is every quiet pill's and quiet footprint's edge (PR 3b's own 1.7 on the mat), and the ● is that state's mark.

### A closed-record edit the hand-off asked for, and the build declined

Hand-off §5/§6 asked for edits to `phase4/audit/marker-contrast.mjs` and a dated block in PHASE4BUILD §3. `phase4/`
is closed record — this document's PR 1 section carried `pr4-smoke.mjs:109`'s stale assertion rather than edit it —
so the rig was **copied** to `phase5/audit/marker-contrast.mjs` and re-pointed there, the table lives above, and
`git diff main -- docs/redesign-v2/phase4` is empty. Reviewer ruling A (2026-09-09) confirmed the decline.

### Carried, not fixed

- **The working tree on `main` carried `CLAUDE.md` / `skills-lock.json` edits and untracked `.agents/skills/*`
  before this slice** (a skills install). Not in this PR; every commit used explicit `git add`; the owner rules on
  them separately.
- **`npm run test:e2e:auth` still needs `npx supabase db reset --no-seed` between runs** — PR 2's note, unchanged.
- **The ◇-painted claim is a pixel sample, not a hit test.** `.cds-touch-target::after` (44×44, absolute, painted
  after the badge svg) answers every `elementFromPoint` over the marker — by design (deviation 7) — so the rig
  decodes the 3x capture and counts Draft-purple pixels in the badge rect, including the ones outside the 28×28 box
  (reviewer ruling B).

### Verification, on the final head

`npm test` **1488/1488** (incl. `test:db`) · `npm run test:ct` **336/336** · `npm run gate` **exit 0** (lint 0 errors /
84 warnings, none in a file this slice touched; typecheck clean; coverage **98.36 lines / 92.44 branches / 98.33
functions** against floors 90 / 80 / 95) · `npm run build` clean · `npm run test:e2e` **36/36** · `npm run test:browser`
**26/26** · **`npm run test:e2e:auth` 63/63** on the local Docker stack (after `npx supabase db reset --no-seed`) ·
runtime audit **0 undefined `var()`** on 6 routes × 2 themes + the system state + the viewer routes, so nothing
still references the retired token · static contrast **206/206** (four names-off pairs × two themes replace the
block's five) · live contrast **69 measurements, 0 under floor** · `sp-components.css` byte-identical to the docs
copy · `git diff main -- app/styles` is one deleted token line · `git diff main -- docs/redesign-v2/phase4` empty ·
no `#0f62fe` outside `carbon-tokens.css`.

**The capture + hit-test rig** `audit/pr3-names-off-marker.mjs` — **38/38**, twelve claims × two themes × `/admin`
and `/`, captures + `results.json` + README under `screenshots/phase5-pr3/`. It proves every names-off pill a 28×28
footprint carrying ● with no text; rest fill and edge equal to an open footprint's; hover lifting to layer-hover-02
(R2); the 2px terracotta focus ring; **selected visible** by click and by keyboard (F-1); the quiet ● stepped to the
quiet text colour; the **◇ painted beyond the 28px box** — 50 purple pixels inside and 148 outside at 3x (F-2); the
44px touch target answering on all four diagonals; the **legend's ● in the marker's colour** (P-1, F-3); and the
Names-ON pill's rect and computed style **byte-equal to a build of `main`**. The same rig on `main`
(`results-baseline-main.json`) scores **7/38**, failing on exactly the block's defects — and on a fourth nobody had
named: the block's `overflow: hidden` also clipped the 44px touch pseudo, so `elementFromPoint` at ±21px hit the
layer beneath. Amendment J removes that with the rest.

**Brand checklist on the Vercel preview:** **10/10** on the Vercel preview of #527 (`seat-planner-git-feat-phase5-a5adc2-…vercel.app`, behind Vercel Authentication via a 23h share link; read-only, computed colours only, both themes): primary `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`, focus ring 2px inset `rgb(184, 92, 46)`, links `--cds-link-primary` `rgb(143, 69, 33)` light / `rgb(232, 160, 122)` dark, the header's current-section bar a 3px inset `rgb(184, 92, 46)` in both themes, no `#0f62fe` painted by any rule outside the Carbon token declarations — and on `/` with Names off, **58 of 58** assigned seats carry ● in `rgb(22, 22, 22)` on `rgb(255, 255, 255)` light / `rgb(244, 244, 244)` on `rgb(57, 57, 57)` dark. Captures of production data stay out of the repo.
---

## PR 4 — Reception's locked row gets its own surface (+ the band→tail gap)

**Plan of record:** `phase5/plans/phase5-pr4-reception-locked-row.md` (hand-off: `phase5-pr4-reception-locked-row-HANDOFF.md`;
reviewer rulings A–D of 2026-09-10 folded into the plan before "go").
**Rulings landed in DECISIONS:** D3-g (R1 = option C, R5 the dark bar; reviewer defaults R2–R4 accepted); the §6 header
carries one line, next free stays 19.
**Skill fingerprint:** `f997ee525800e755`, verified before reading anything.

### What the slice is

PR 2 carried "the count header and the locked row sit on the same surface". The reviewer's mockup showed it wider: the
hover / keyboard-cursor row sat one ladder rung from the locked row in both themes — header `layer-selected-01`
#e0e0e0 / #393939, locked row the same, hover `layer-hover-01` #e8e8e8 / #333333 — so the row the receptionist reads
from fused with the header at row 1 and barely parted from the mouse. Owner ruling R1 = option C: the locked row is
the search's hit, so it takes the hit surface the way O2 expresses it — `--sp-recep-row-locked` keeps its name and its
neutral default in `sp-tokens.css`; the brand file overrides it to the O2 tint #FBE8DC (light) and `layer-selected-02`
#525252 (dark). R5 (owner, in planning): the dark bar `--sp-recep-row-bar` goes #E8A07A — terracotta measured 1.71:1
on #525252 (and was already 2.53 on the header, 2.77 on the cursor row), the same reason O2 never uses it as a dark
edge. Bundled (R4): sheet amendment K — 24 between the readout column's groups at wide. No `.tsx` change.

### Engineering calls the code forced, one line each

- The value lives in the brand file, not `sp-tokens.css`: the semantic layer is hex-free and byte-locked to Phase 3;
  the brand file is the one place a product hex may live (O2's precedent).
- Two dark blocks, one value each: the system-dark `@media` block and the forced `g100` block are both required (the
  source test walks both).
- The dark bar override is a consequence, not scope creep: R1's fill made a pre-existing 3:1 failure worse
  (2.53 → 1.71); the hand-off's own gate stopped the slice until the owner ruled R5.
- The hand-off's "PHASE3DS §1.22" is the page frame; Reception is §1.29 — amended there.
- The recents `<aside>` is the readout column's third direct child, so amendment K's 24 also lands tail→recents
  (R4 accepted with that).
- The hand-off's helper-text fallback is moot: `--sp-text-helper-on-row` aliases `text-secondary` = gray 70, not
  gray 60 — 6.58 on the tint, not the ≈4.6 estimated.

### Contrast — the locked row's pairs

| pair | light | dark |
|---|---|---|
| text-primary on the locked fill | 15.23 | 7.10 |
| `--sp-text-helper-on-row` on the locked fill | 6.58 | 4.57 |
| bar on the locked fill | 3.84 (#B85C2E) | 3.62 (#E8A07A) |
| bar on the cursor row (light terracotta; dark #E8A07A, R5) | 3.72 | 5.86 |
| bar on the header (R5, dark only) | — | 5.36 |
| tab bar on its host (ruling A — measured for the first time as terracotta) | 4.56 | 3.97 |
| *retired:* terracotta bar on #525252 | — | 1.71 (not gated) |

Ruling A: `generate-pairs.mjs:119` / `:130` had measured Carbon blue 60 / 50 for "row bar / tab bar" — the static
gate had never measured the terracotta bar on any row surface, which is why the dark 2.53 / 2.77 were never caught.
Both retargeted; the tab bar is its own pair per theme on `--sp-tabs-bg`. The two locked-row-meta pairs moved with
the fill; ruling B's two failing consumers are recorded not-gated.

```
product-pairs.json: 212 pairs · surface-pairs-not-gated.json: 17 pairs
212/212 pass
```

### Sheet amendment K (2026-09-09)

`.sp-recep-readout`'s column gap goes `--sp-space-05` → `--sp-space-06`; the band's and the tail's own 16 (line 1110)
stands; both copies, byte-identical. Measured at 1920, both themes: band→tail **24.00**, tail→recents **24.00**
(16.00 / 16.00 on main); the band's box and the tile's box are pixel-identical to a `next build` of main
(416×260 at 1272,182). Below the 1055 fold the column is `display: contents` — nothing changes there.

### Carried, not fixed

- **`npm run test:e2e:auth` still needs `npx supabase db reset --no-seed` between runs** — PR 2's note, unchanged
  (and `npm run db:seed` needs it too when the volume persisted: `one_published_seat_per_employee` collides).
- **Every dark 3px bar or edge resolving through `--cds-border-interactive` #B85C2E is under 3:1 on its layer today**
  (reviewer ruling B, 2026-09-10; measured with the skill's checker). R5 fixed the Reception row bar only. One row
  each — consumer · surface · ratio today · if #E8A07A:
  - `--sp-nav-current-bar` (`.sp-left-nav a[aria-current]`) · `--sp-nav-current-bg` = layer-selected-01 #393939 ·
    **2.53** · 5.36
  - `.sp-menu button[aria-current]` bar · `--sp-layer-selected` #393939 · **2.53** · 5.36
  - `.sp-palette-row[aria-selected] / [aria-current]` bar · `--sp-layer-selected` #393939 · **2.53** · 5.36
  - `--sp-ai-border-start` on the hovered `.sp-ai-label` · layer-hover-01 #333333 · **2.77** · 5.86
  - `--sp-ai-border-start` at rest / `.sp-textarea--ai` · layer-01 / field-01 #262626 · 3.32 (passes) · 7.02
  - `.sp-menu-button[aria-expanded]` 1px rule · field-01 #262626 · 3.32 (passes)
  - `--sp-tab-bar` · `--sp-tabs-bg` = background #161616 · 3.97 (passes; now gated by ruling A) · 8.39
  - `--sp-shell-current-bar` (tier-C) · shell g100 · 3.97 (passes, ledgered)

  **Not fixed in PR 4** — a brand-layer question for the owner: either `--cds-border-interactive` goes #E8A07A in
  the two dark blocks (one line; every consumer follows — O2's dark-edge shape), or each failing consumer is themed
  like O4. The two failing surfaces are in `surface-pairs-not-gated.json` labelled "carried — dark
  --cds-border-interactive consumers, owner ruling pending". No DECISIONS entry until ruled. **→ fixed in PR 5
  (v2.5.0, O5): the one-line flip; the two pairs are gated at #E8A07A.**
- **`phase4/audit/pr5-smoke.mjs` asserts the locked bar is terracotta** — true in light, no longer in dark. phase4/
  is closed record (PR 3 ruling A); not run for this slice.
- **The local `next start` console still carries the Speed Insights 404s and the MIME refusal** — PR 2's note,
  unchanged; sampled on `/` and `/reception` after the runtime audit's count (114 across 22 loads ≈ 5 per load): nothing
  else on any route.

### Verification, on the final head

Unit **1489/1489** · ct **337/337** · browser **26/26** · e2e **36/36** · e2e-auth **63/63** (Docker, local
stack) · runtime audit **0 undefined `var()` across 6 routes × 2 themes + the system state + the viewer routes** · static contrast 212/212 · lockstep byte-identical (`phase4-token-layer-source`
14/14, `HEX_LEDGER` two rows) · `git diff main -- app/styles/sp-tokens.css app/styles/carbon-*.css` empty ·
`git diff --stat main -- docs/redesign-v2/phase4` empty · `git grep 0f62fe` hits only `carbon-tokens.css` ·
typecheck clean · lint 0 errors.

**The capture + hit-test rig** `phase5/audit/pr4-reception-locked-row.mjs`: **84/84** claims at 480 / 640 / 800 /
1024 / 1920 × light / dark on the branch build (`5373ebc`), baseline `results-main.json` from a `next build` of main
(`d9d52ee`) in a second worktree (ruling C; 38/82 there — locked = header, gaps 16.00, by design); captures + README in
`screenshots/phase5-pr4/`. Header · locked · hovered are three computed values at every width in both themes; hovering
the locked row changes nothing (R2); the bar is rgb(184, 92, 46) light / rgb(232, 160, 122) dark on both the locked and
the cursor row; the locked row is hittable under the pinned band at every width below the fold.

**Brand checklist on the local build (real Chrome, both themes):** primary `rgb(184, 92, 46)`, hover
`rgb(143, 69, 33)`, focus ring `2px solid rgb(184, 92, 46)` inset −2px on the search field, current-section bar
`rgb(184, 92, 46)` 3px inset, links light `rgb(143, 69, 33)` / dark `rgb(232, 160, 122)`, locked row
`rgb(251, 232, 220)` / `rgb(82, 82, 82)`, row bar `rgb(184, 92, 46)` / `rgb(232, 160, 122)`; no `#0f62fe` outside
`carbon-tokens.css`. The Vercel preview walk is the reviewer's.

---

## PR 5 — dark interactive edges carry the hue

**Plan of record:** `phase5/plans/phase5-pr5-dark-interactive-edges.md` (hand-off: `phase5-pr5-dark-interactive-edges-HANDOFF.md`,
reviewer Cowork, 2026-09-10).
**Ruling landed:** brand ruling **O5** (owner, 2026-09-10, "flip it") — recorded inside DECISIONS §6 no. 16 and in D3-g's
open item; the §6 header carries one line, **next free stays 19**.
**Skill fingerprint:** `f997ee525800e755`, verified before reading anything.

### What the slice is

PR 4's reviewer ruling B measured every dark consumer of `--cds-border-interactive` on its real host with the skill's
checker: the brand file set the role to terracotta #B85C2E in all three theme blocks, and terracotta cannot reach the
3:1 graphic floor on the dark greys the panels are made of. R5 had fixed the Reception row bar alone, by a per-consumer
override. The owner was shown the enumeration (the vendored Carbon sheet does not reference the role; `--cds-focus`,
`--cds-interactive` and the `--cds-button-*` roles are separate and untouched) and chose the **one-line flip** over
per-consumer overrides: `--cds-border-interactive: #E8A07A` in the two dark blocks only. Light keeps #B85C2E. It matches
O2's existing dark rule ("the edge carries the hue") and gives dark one coherent statement — apricot for interactive
edges and links, terracotta for filled primaries — where per-consumer overrides would say the same thing seven times and
leave the eighth consumer to fail. PR 4's dark `--sp-recep-row-bar: #E8A07A` retires: the bar inherits the role through
`sp-tokens.css`. No `.tsx`, no sheet, no `sp-tokens.css` change.

| consumer | dark host | was #B85C2E | now #E8A07A |
|---|---|---|---|
| `--sp-nav-current-bar` (`.sp-left-nav a[aria-current]`) | layer-selected-01 #393939 | **2.53** | 5.36 |
| `.sp-menu button[aria-current]` bar | layer-selected #393939 | **2.53** | 5.36 |
| `.sp-palette-row[aria-selected] / [aria-current]` bar | layer-selected #393939 | **2.53** | 5.36 |
| `--sp-ai-border-start` on the hovered `.sp-ai-label` | layer-hover-01 #333333 | **2.77** | 5.86 |
| `--sp-ai-border-start` at rest / `.sp-textarea--ai` · `.sp-menu-button[aria-expanded]` rule | layer-01 / field-01 #262626 | 3.32 | 7.02 |
| `--sp-tab-bar` | `--sp-tabs-bg` = background #161616 | 3.97 | 8.39 |
| `--sp-recep-row-bar` (PR 4's override, now inherited) | #525252 / #333333 / #393939 | — | 3.62 / 5.86 / 5.36 |

Light: terracotta 3.7–4.6 on its surfaces, unchanged.

### Engineering calls the code forced, one line each

- The brand file is the only file whose value changes: the role is aliased from `sp-tokens.css` (byte-locked) by every
  consumer, so one declaration per dark block is the whole fix.
- Both dark blocks carry the value (the source test walks the system-dark `@media` block and the forced `g100` block).
- The O4 bar override comes out rather than staying as a no-op: two declarations of one value would be the "per-consumer"
  shape the owner declined, and the source test now pins its absence.
- `--cds-interactive` stays #B85C2E: it is a fill role (switch / checkbox on), not an edge; its own dark consumers are
  measured and listed under Carried, not flipped in this slice.
- The static gate measured blue for the dark AI border start (`P.b50`) — ruling A's stale-blue shape, retargeted to the
  real value as PR 4 did for the row bar; the dark tab-bar pair follows the value it now paints.

### Contrast

Regenerated with `generate-pairs.mjs`, checked with the skill's `check_contrast.py --pairs` (surfaces: #393939, #333333,
#262626, #161616, #525252):

```
product-pairs.json: 214 pairs · surface-pairs-not-gated.json: 16 pairs
214/214 pass
```

Gated: the two ruling-B rows at #E8A07A (5.36 / 5.86), the dark AI border start / menu-button open rule on #262626
(7.02), the dark tab bar (8.39); the PR 4 Reception pairs are unchanged in value. Not gated: "terracotta on #393939 —
the value O5 replaces (fails 3:1)" stays as the record of what was replaced, beside PR 4's #525252 row.

### Carried, not fixed

- **2026-09-10 — Agent design-system chore:** added the `AGENTS.md` design-system section, vendored `ibm-design-language` 1.3.0, corrected the `CLAUDE.md` vendored-skills sentence and, with owner approval, replaced its stale free-form design paragraph with a pointer to `AGENTS.md`; docs-only, no tag.
- **`npm run test:e2e:auth` still needs `npx supabase db reset --no-seed` between runs** — PR 2's note, unchanged.
- **`--cds-interactive` (#B85C2E, all blocks) has dark consumers under 3:1** — measured 2026-09-10: the pinned zone
  chip's border (`ViewerFindPalette.tsx:426`, `--sp-interactive` on `--sp-layer-hover` #333333) **2.77**; the map's
  clear-result button hover border (`SeatMap.tsx:2611`, on a terracotta-alpha fill); the login dot-pulse halo
  (`globals.css:149`, decorative). A fill role by name, an edge on those two `.tsx` consumers — out of PR 5's scope
  (hand-off §5); an owner question for a later slice.
- **`--sp-ai-border-end` (tier-C, #B85C2E, theme-invariant)** is the AI gradient's end stop: 2.77 on the hovered label
  #333333, 3.32 at rest. The record already treats the gradient's low stop as not gated ("the label carries meaning");
  listed here so the next slice sees it beside the `--cds-interactive` rows.
- **`phase4/audit/pr5-smoke.mjs` asserts a terracotta locked bar** — closed record (PR 3 ruling A); not run.
- **The local `next start` console** — PR 2's note, unchanged.

### Verification, on the final head

Run in the cloud build session on the tree committed as `00d65fe` (Node 22, no Docker, Playwright Chromium — the
Docker-bound tiers are the owner's, below): unit **1488/1489** (1 skipped — `publish-guard`'s ".env.local must not
define VERCEL_ENV", which skips wherever no `.env.local` exists; 0 fail) · ct **337/337** · browser **26/26** · e2e smoke **36/36** on a `next build` of
the head · static contrast **214/214** (`generate-pairs.mjs` + the skill's `check_contrast.py --pairs`; surfaces #393939,
#333333, #262626, #161616, #525252) · `phase4-token-layer-source` 14/14 (the brand test now pins #B85C2E light /
#E8A07A dark for the border role, `--cds-interactive` and `--cds-focus` #B85C2E in all three blocks, and the absence
of the O4 bar override in both dark blocks) · lockstep byte-identical (`git diff main -- app/styles/sp-components.css
app/styles/sp-tokens.css app/styles/carbon-*.css` empty) · `git diff --stat main -- docs/redesign-v2/phase4` empty ·
`git grep 0f62fe` hits only `carbon-tokens.css` · typecheck clean · lint 0 errors (84 pre-existing warnings).

**Owed before the smoke hand-off, on the owner's machine (Docker + real Chrome):** `npm run test:e2e:auth`;
`phase4/audit/runtime-audit.mjs` (0 undefined `var()`); the PR 5 rig `phase5/audit/pr5-dark-edges.mjs` (dark
`rgb(232, 160, 122)` / light `rgb(184, 92, 46)` on the five consumers, primary / focus / `--cds-interactive` still
`rgb(184, 92, 46)`, crops into `screenshots/phase5-pr5/`); the PR 4 rig once at 1920 × both themes (Reception's bar
unchanged after the override is retired); the brand checklist in dark. Then PR → CI → a read-only preview walk in
dark (nav, floor menu, palette, tabs, Reception locked row) → owner's "merge" → v2.5.0.

## 2026-09-11 — UI review follow-through

**Authorization:** after reviewing viewer, admin, reception and management, the owner
requested an implementation plan and then approved starting it ("lets start"). This
amendment covers the four planned improvements; the closed Phase 2–4 record stays intact.

- **Admin picker — PHASE3DS §1.17, DECISIONS D2-a.** Keep the 400px inspector and
  existing assignment flow. The employee dropdown trigger now has an explicit
  `.sp-combobox-trigger` rule: absolute within the field, 40×40, top/right zero.
  The later Carbon `.cds-btn` had overridden Tailwind's `absolute`, and the later
  `.cds-btn--icon` height had overridden `--sm`, leaving a 32×48 button below the
  input. Both product/specimen sheets carry the same dated rule; no vendor edits.
- **Reception — PHASE2UX §1R.6, DECISIONS D3-f.** Retain the locked person's
  extension during a failed new search, adding “Last selected caller” above the
  name only in that state. It uses existing secondary text styling inside the
  existing polite live band. It adds no focus stop or separate announcement region.
  Preview, clear, unlock, fallback and map-link behavior remain as recorded.
- **Viewer search — DECISIONS D1-d.** A name result already includes its assigned
  seat, so omit that seat's redundant row unless the query also matches the seat
  code, status, zone or department. Deduplicate by the represented seat ID before
  sorting/capping and computing counts. Distinct people with identical names,
  additional assignments, unassigned people and direct seat hits remain choices.
  The shared search helper applies the same result rule to the admin palette.
  Floor scope, keyboard opening and `?q=` landing retain their existing behavior.
- **Management — PHASE2UX §1G.4, DECISIONS D5-c.** Keep visible “Rename” in each
  department/zone row; its accessible name now includes the row name.

**Verification:** Node 24.19.0; focused tests 107/107; `npm run gate` passed
(1514/1514 tests, zero lint errors with 84 existing warnings; coverage 98.55%
lines, 98.57% functions, 92.85% branches); `npm run build` passed. No token values
changed. Product/specimen component sheets verified byte-identical.

Real Chromium rendered the actual shell and affected components with fixture
data, bundled production CSS in its declared order and local Plex fonts. At
1920×1080 in both themes: inspected all four surfaces; measured the admin field
368×40 and its aligned trigger 40×40, with the listbox immediately below; exercised
typing, arrows, Enter, Escape and mouse selection. Reception retained-state label,
extension hit tests, absence of focusable band elements and two-step Escape passed
at 480, 640, 1055 and 1920 in both themes. Viewer counts, keyboard selection,
unique URL landing, direct seat code and cross-floor unassigned navigation passed.
Department/zone accessible names and inline rename keyboard entry/cancel passed.

**Limits and follow-up:** the fixture harness replaces server actions and routing
boundaries; it does not verify authenticated Next navigation, real save/publish,
production data density, server loading/failure states or screen-reader speech.
Docker's daemon was unavailable, so `npm run test:e2e:auth` remains unrun. When the
local stack is available: `npm run db:start`, `npm run db:seed`, then
`npm run test:e2e:auth`. The separate 390px viewer check still shows crowded header
utilities without document overflow; long roster metadata remains an earlier
review follow-up outside this slice. No deployment, commit or production write.

**Authenticated follow-up, 2026-09-11:** Docker Desktop was started and the local
Supabase stack recovered. The first setup hit stale fixture assignments
(`one_draft_seat_per_employee`); the local database was backed up to the ignored
`node_modules/.cache/ui-auth-before-reset.dump` before a local-only reset to the
repository migrations. Auth and Kong were restarted, then the normal harness
seed and build ran successfully. `npm run test:e2e:auth`: **63/63 passed (2.7m)**,
including viewer sign-in, admin refusal for viewers, real draft publishing with
database assertions, draft dialogs, persistent navigation, accessibility, layout
and reception keyboard checks. No application-code changes were needed for this
follow-up. The earlier Docker blocker is resolved; the 390px reflow and manual
screen-reader follow-ups remain. Production was untouched.

## 2026-09-11 — Narrow header and roster reflow

**Authorization:** after the authenticated follow-up passed, the owner approved
the recommended next step: resolve the 390px viewer header crowding and truncated
roster details. This amends D0-d/e's narrow fallback and PHASE3DS §1.20; the desktop
target and closed Phase 2–4 record remain intact.

**Header:** below 640px, use two 48px rows: hamburger + the complete organization
and product name, then mode status + Help / History / Account. DOM and keyboard
order remain unchanged. Keep every control 48px tall and all functions present.
The first boundary tried was 480px; browser measurements still found overlaps at
480, so the fallback covers 320–639. The shared header-height variable becomes
96px only on shell pages, keeping content, panels and sticky offsets aligned.
At 640 and above the existing 48px header and its fluid centre remain unchanged.

**Roster:** give job title and extension separate spans so the title cannot
truncate the extension. Below 768px, stack name, position/extension and email,
allowing long text to wrap; reserve a 40px column for Copy link. Rows remain static
list items, without a new disclosure or control. At wider widths keep the existing
four-column, 40px row geometry. All styling uses existing semantic tokens; the
product/specimen component sheets carry the same amendment.

**Browser evidence:** actual components, production CSS and local Plex fonts;
320, 390, 479, 480, 640, 767, 768, 1055 and 1920 in both themes. Measured no header
control collisions or document overflow; all narrow roster facts stayed in the
viewport without clipping. Account panels start below the 96px header. Inspected
390 and 320 narrow captures plus 1920 in both themes. Reception's retained-call
state, numeral hit tests and Escape sequence also passed at 480, 640, 1055 and
1920 in both themes with a long job title.

**Regression coverage:** the authenticated header width ladder now spans the
640px boundary and 320px floor and checks the organization name against the mode
indicator. `roster-reflow.spec.ts` creates and cleans up one independent local
published-snapshot fixture with long metadata, measures visibility and clipping
in both themes, and exercises the real clipboard action. It rejects non-local
database hosts before writing. Gate: 1514/1514 tests, zero lint errors (84 existing
warnings), typecheck and coverage passed.

**Authenticated result:** after resetting the disposable local test data to the
required clean migration baseline, `npm run test:e2e:auth` passed **64/64 (2.9m)**,
including the new long-roster/clipboard regression and expanded header widths.
The runner rebuilt the app with local Supabase settings before testing. Both
component sheets verified byte-identical; `git diff --check` clean. This closes
the narrow reflow findings from the UI review. Changes remain local/uncommitted;
no production writes or deployment. Next step: review the combined changes for
a PR and preview deployment.

## 2026-09-11 — Add seat moves into More actions

**Authorization:** the owner identified Add seat as the least-used feature
(estimated 10% usage), approved moving it into More actions, and requested
implementation. This dated amendment supersedes D2-b and PHASE2UX §1M.3 only
for the entry point and overflow contents; the closed record is preserved.

**Behavior:** the idle draft toolbar no longer has an Add seat button. More
actions contains labeled Add seat first, then a divider and the existing danger
Discard draft changes item. On an unmapped floor, Add seat and its divider are
absent. The existing narrow-window editing restriction is unchanged. While Add
seat mode is active, the toolbar displays Exit add seat and the menu offers the
same exit; the mode card, instructions and Escape exit remain available.

**Interaction:** ArrowDown opens the menu and focuses the first enabled item;
Up/Down wrap between enabled items, Home/End go to the ends, and Escape closes
only the menu and restores trigger focus. Tab closes the menu and proceeds to
the next control. Choosing Add seat closes the menu and uses the existing
startAddSeatMode / inspector-guard path. Unsaved edits still require resolution.
Creation, protected-seat rules, draft/published separation and Discard's
confirmation/disabled behavior are unchanged.

**Verification:** focused component and safety/source tests 57/57; real-browser
SeatMap tests 28/28, including menu activation, visible exit, Escape layering,
unsaved-inspector guarding and roster-floor absence. Gate passed 1525/1525 with
typecheck, coverage and zero lint errors (84 existing warnings); Next build
passed. No production dependencies or token values changed. The separator uses
an existing semantic border token; both component sheets are byte-identical.

Styled local Chromium checks at 1920×1080, 1280 and 1056 in light and dark verified
menu bounds, divider, keyboard traversal, Tab focus, active mode and visible exit.
The 390px check confirmed editing actions remain absent under the existing
restriction. Screenshots inspected after mode transitions finished. The fixture
uses real components/CSS with mocked backend boundaries; this slice has not yet
received a hosted preview or a fresh authenticated full-suite run. No hosted
seat or directory writes. Work remains on codex/add-seat-menu, uncommitted.

## 2026-09-11 — Compact floor label and inspector refinement

**Authorization:** the owner approved implementation and local/demo verification
of the selected images under `output/playwright/admin-mockup/`:
`proposed-admin-light.png` establishes the inspector direction and
`proposed-admin-full-floor.png` the final selector direction;
`current-admin-light.png` is the baseline. Generated images establish hierarchy
and spacing intent, not exact pixels, font metrics, colours or map geometry.
This amends PHASE2UX §1M.3/§1M.5 and PHASE3DS §1.14/§1.17, preserving
DECISIONS D2-a's 400px slot and §6 deviations 16/17 plus BR-2/BR-5.

**Floor selector:** retain the 224px width and IBM Plex 14/18 type. Recover
space with a 12px leading inset, 4px icon gap, 32px chevron reserve and 8px
trailing chevron inset. Keep the full `Floor 3 · Pre-Litigation` label on one
line. Styling is scoped to the map control row; search and other pages are
outside this amendment. Menu semantics and keyboard behavior are unchanged.

**Inspector:** retain the existing slot, header/body/commit-bar structure and
progressive assignment editor. Use a 24px content inset (16px below 640px),
32px section separation and 12px heading-to-content spacing; align contact
values in a shared 96px label column with a 16px gap. Keep metadata labels at
the productive 14/18 scale and the identity heading at 20/28. The viewer puts
role/department under identity, then a sentence-case `Contact` section with
read-only facts and existing copy/link actions. Assignment editing, seat
actions, notes, activity, AI entry and commit controls remain admin-only.
Footer facts may wrap at narrow widths. No new content or transaction is added.

**Responsive correction:** QA exposed the inspector host retaining 400px at
320px, clipping its left edge, and a selected marker painting over the panel.
Constrain only the inspector host to the available width; layer it at the
existing selected-marker level, later in DOM order. Desktop remains 400px;
mode cards and Ask Planner retain their existing layout. Floor-plan assets,
calibration, coordinates and pan/zoom behavior are unchanged.

**Brand and release boundary:** consume existing semantic tokens in both
themes, including system preference. No colour values, vendored Carbon assets,
font files or dependencies change. No Carbon v12 migration is approved.
The runtime and Phase 3 component sheets remain byte-identical. Pre-existing
API and IBM documentation edits are preserved in the owner's working tree,
outside this refinement's PR.

**Verification evidence:** see the project-root `design-qa.md` for the final
comparison, exact commands, browser states, results and fixture limitations.
Initial approval covered implementation and verification only. The owner later
authorized committing and opening a PR, followed by a smoke test. Merging and
deployment remain outside the authorization.
