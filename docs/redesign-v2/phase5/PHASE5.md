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
