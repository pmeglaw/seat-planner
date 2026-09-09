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
| PR 3 | The names-off marker becomes ● in the footprint: one status-mark language on the plan | v2.3.0 | **in review** — branch `feat/phase5-names-off-marker`, PR #527 |

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
  heading's 32px box already gives ~14px of air, so it reads acceptably today.
- **The count header and the locked row sit on the same surface** (reviewer critique at 1920, 2026-09-09, rubric
  level 5 Depth). `.sp-recep-header` is on `--sp-layer-selected` and `.sp-recep-row[aria-selected="true"]` on
  `--sp-recep-row-locked`, both aliases of `--cds-layer-selected-01` (rgb 224 224 224 light), so when the locked
  person is row 1 the header and the row fuse into one slab with only the 3px terracotta bar between them.
  **Pre-existing** — amendment I touched neither rule — and it **needs an owner ruling**, because the fix moves a
  token alias (one of the two onto another surface, or the header tint dropped). Carried, not fixed.

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
