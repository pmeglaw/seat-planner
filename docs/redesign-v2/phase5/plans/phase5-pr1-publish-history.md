# Phase 5 · PR 1 — the publish-history record surface returns to Management (v2.1.0)

**Plan of record. Written 2026-09-08 on `feat/phase5-publish-history` (from `main` @ `50cfa68`).
Nothing below is built until the reviewer clears it and the owner rules items R1–R3.**

---

## 0. Set-up, verified before reading anything

| Check | Recipe | Result |
|---|---|---|
| Tag | `git rev-list -n 1 v2.0.0` | `0caedc6e5813257838426b0bff5428868f7cfd8e` — the PR 6 squash ✓ |
| Head | `git rev-parse HEAD` | `50cfa68` (`docs(redesign-v2): phase 4 — PR 6 merged…`), i.e. `v2.0.0-1-g50cfa68` ✓ |
| Tree | `git status --porcelain` | empty ✓ |
| Branches | `git ls-remote --heads origin` | `refs/heads/main` alone ✓ |
| Skill | PHASE3DS §0 recipe over `…/design-system/1.3.0/skills/ibm-design-language` | **`f997ee525800e755`** ✓ |

Read in the order the hand-off gave: `CLAUDE.md` (Design system), `brand-system/SKILL.md`, DECISIONS
**D0-a · D0-f · D0-g · D5 · D5-a · D5-b · D5-c · D5-d**, PHASE2UX **§1.4 · §1G.1–§1G.6 · §3**,
PHASE3DS **§1.22 · §1.23** (incl. PR 4 amendment D), PHASE4BUILD **§1.37** and §2 rows **P2-7 / P3-15**.
The Phase 4 record was read and is not edited by this slice.

---

## 1. The slice in one paragraph

The History panel keeps **orientation** — mode switch, status line, the ten newest publishes with a Show more
to the 25 cap (D0-a, D0-g). It does not change, and its `getPublishHistoryAction(limit)` call is not touched.
Management gains a fourth tab, **Publish history**, which is the **record**: the whole log, sortable, paginated,
no cap, no drill-in. D0-g already wrote the trigger for this in its own *Would change if* line — *"anyone asks
for a publish older than the 25th — then the log becomes a Management tab with pagination."* This slice is that
sentence being executed, so it is recorded as a **D0-a amendment** (the panel keeps switch + status + recent
list; the record moves back to a page) and a **D5 amendment** (the `publishHistory` tab returns), both dated
2026-09-08, neither reopening Phase 4.

---

## 2. The sheet question, answered up front

**This slice needs one dated amendment to `app/styles/sp-components.css`, in both copies. Nothing else in the
token layer moves.**

Why it is unavoidable. `.cds-table` is `table-layout: fixed` and the shipped Management directory sets **no**
column widths — its seven like-shaped columns simply distribute evenly (only the asset's
`.cds-col-actions { width: var(--cds-size-md) }` is pinned). The log's four columns are *unlike*: a date, a
count, a person, and a sentence that must get every remaining pixel. Even distribution at the 1584 live area
gives each 396px, which is three times what the count needs and ~150px short of what the longest shipped
summary sentence renders at (`12 seats changed · 5 people updated · 1 department renamed`). Right-aligning the
count also needs its `.cds-sort` button right-aligned in the header, which is a rule, not a utility — the
shipped sheet already carries exactly this pair for the extension column (`.sp-table .cds-table td.sp-col-ext`
+ `th.sp-col-ext .cds-sort`).

The amendment, four rules and one new class prefix, **no new tokens** (so `sp-tokens.css` and the two vendored
files stay byte-identical, and only `sp-components.css` moves — in *both* copies):

```css
/* --- Amendment H — Phase 5 PR 1 (2026-09-08): the publish log's four unlike columns.
   `.cds-table` is table-layout: fixed; the directory (block 21) lets seven like columns
   distribute themselves, but the log pairs three narrow facts with one sentence that owns
   the rest of the row. Percentages, so the same rules hold at 1584 and at the 1024 frame
   where `.sp-table-scroll` takes over. -------------------------------------------------- */
.sp-log .cds-table :is(th, td).sp-col-when  { width: 13%; }
.sp-log .cds-table :is(th, td).sp-col-who   { width: 20%; }
.sp-log .cds-table :is(th, td).sp-col-count { width: 9%; text-align: right; font-variant-numeric: tabular-nums; }
.sp-log .cds-table th.sp-col-count .cds-sort { justify-content: flex-end; }
```

The alternative considered and rejected: a `<colgroup>` with inline percentage widths in the component, which
would keep the sheet frozen. Rejected because it still cannot right-align the header's sort button without a
rule, and because "the CSS is the deliverable" (PHASE3DS §7) — layout belongs in the sheet, not in JSX. The
`.sp-table` wrapper is kept as-is and `.sp-log` is added beside it (`<div className="sp-table sp-log">`), so the
40 header / 32 rows geometry of §1.23 comes in unchanged.

Everything else the tab needs already exists and is used as-is: `.cds-table`, `.cds-sort`, `.cds-th-static`,
`.cds-toolbar` + `.cds-toolbar-count`, `.cds-skeleton-row`, `.cds-empty`, `.cds-notification--error`,
**`.cds-pagination`** (vendored asset §7, "advanced — positions are addressable": `.cds-pagination-left/-right`,
`.cds-select-wrap`, `.cds-range`, `.cds-btn--icon`), `.sp-table-scroll`. **No vendored file is edited.**

A toolbar carrying only a count and no search is not a new shape either — `app/(shell)/admin/management/loading.tsx`
already ships `<div class="cds-toolbar sp-toolbar"><span class="cds-toolbar-count">…`.

---

## 3. The data decision (hand-off §2 item 1) — and the coupling the reviewer's three options hide

### 3.1 What the shipped action does

`getPublishHistoryAction` (`app/actions.ts:1027`) clamps `Math.min(Math.max(requestedLimit, 1), 25)`, selects
`created_at,seat_count,published_by,change_summary` ordered `created_at desc`, then resolves publisher emails
through `resolvePublishHistoryProfiles`. It returns a **bare array**. `ShellPanels.tsx:201` is its only product
caller and passes 10, then 25.

### 3.2 The coupling

A paginated table with a **sortable derived Changes column** (option (c)) cannot be served by server-side
paging. PostgREST can order by a column, and even by a single JSON key (`change_summary->>seats_added`), but it
cannot order by a **sum of nine keys** — that needs a generated column, a view or an RPC, i.e. **a migration**,
which §4 puts out of scope and §5 says would make the preview unwalkable. So:

- sort Changes across the whole log ⇒ the client must hold the whole log;
- page on the server ⇒ Changes can only be sorted **within the visible page**, which defeats the one thing the
  reviewer wants it for ("find the large publishes").

The owner is choosing between those two, not between three independent items. R3 below states it that way.

### 3.3 Recommendation — a second action, whole set, client-side sort and paging

**Add `getPublishLogAction()` beside `getPublishHistoryAction`, do not widen it.** Reasons:

1. **The panel is provably unaffected**: `getPublishHistoryAction`'s diff is *empty*. Widening it would change
   its return type from an array to `{ events, total }` and force a `ShellPanels` edit, which §4 forbids.
2. It matches the sibling tab. Employees renders the **whole** active directory server-side and sorts,
   searches and virtualises it on the client (`EmployeesTable`); the log doing the same is one page-level idiom,
   not two.
3. `fetchAllRows` already exists, is tested, and exists precisely to stop PostgREST's silent `max-rows`
   truncation — the failure mode a hand-rolled unbounded select on `publish_events` would reintroduce.
4. The total the toolbar and the pagination range need is then `events.length`; no `count: "exact"` round trip.

**Shape** — read-only, admin-only, no RPC, no migration, no `revalidatePath` (the same contract §1.9 wrote for
`getDraftStatusAction`):

```ts
export async function getPublishLogAction(): Promise<PublishHistoryEvent[]>
```

`requireAdmin()` first; `fetchAllRows` over `publish_events` (`select("created_at,seat_count,published_by,change_summary",
{ count: "exact" })`, `.order("created_at", { ascending: false })`, `.range(from, to)`); then the existing
profile resolution, unchanged. RLS already restricts `publish_events` to admins
(`publish_events_select_admin_only`, migration `20260521000100`), and `publish_events_created_at_idx (created_at desc)`
already backs the ordering — no index work.

**Placement matters.** The new function goes **immediately after** `getPublishHistoryAction`, never before it:
`tests/restore-draft-snapshot-transaction-safety.test.mjs:26` and `tests/seat-creation-ui-source.test.mjs:76`
both match the source span *from* `restoreDraftSnapshotAction` *to* `export async function getPublishHistoryAction`,
and an insertion between them would break two tests for a reason that has nothing to do with either.

**Loaded lazily, on first tab activation**, not in `page.tsx`'s `Promise.all`. The Management route is
`force-dynamic`; adding the log to the server render would cost every admin an extra round trip on every visit
to a page they mostly open for Employees. Lazy fetching is also what produces the in-tab loading and error
states §4 asks for, and the History panel is the shipped precedent for that exact shape (skeletons → list, or
an error notification with Retry).

**The growth ceiling, stated rather than discovered later.** `publish_events` is append-only. Each row is a
timestamp, an int, a uuid and a small jsonb — on the order of 250 bytes of JSON. A few thousand rows is a few
hundred KB and comfortable; ten thousand is not. At the firm's real publish rate (an admin act, a few per
week) the ceiling is many years away. Recorded as a *would change if*: **above ~5,000 events, the log returns
to server-side paging and the Changes sort is re-ruled.** The confirming datum — today's row count — is *not*
in this plan: a read-only `select count(*) from public.publish_events` against production was blocked by the
session's tool classifier. It is one line for the reviewer or owner to run, and it does not change the
recommendation at any plausible value.

### 3.4 `seat_count` (hand-off §2 item 2) — no ruling needed, and it resolves itself

`seat_count` is the **map size at publish**, not a delta. **There is no Seats column.** The number still
survives where it is honest: the What-changed cell reuses the panel's exact expression,

```
formatPublishChangeSummary(event.change_summary) ?? `Initial publish · ${event.seat_count} seats`
```

so `seat_count` appears only inside a sentence that names it, on the one kind of row that has no summary. The
reviewer's mockup drew a Seats column; that column is dropped, not renamed.

---

## 4. The three rulings for the owner

### R1 — the page header carries **no primary** on this tab

**Recommendation: yes — an empty action area, and record it as a dated D5-a amendment.**

D5-a's rule is "the primary is the current tab's create … the primary follows the tab". A record has nothing
to create, so the honest value is *none*. This is expressible in the system: PHASE2UX §3 lists "Page header
(title + subtitle, no action) · Reception · exists `.cds-page-header` · **Zero primaries is allowed**", and
D3-a ships Reception with no primary today.

The departure worth naming precisely: D5-a's trade-off sentence is that the primary "never changes position,
only its verb". On this tab it changes *presence* — the header's right side is empty — so the header does
change shape between tabs. That is the thing the amendment records.

Rejected alternatives: a **Publish** primary linking to `/admin` (publish lives on the map; a navigation dressed
as a create, and a second publish entry point is exactly the confusion the map's one primary avoids); an
**Export CSV** primary (nobody asked for it, it is a new feature, and §4 does not scope it).

**Cost:** `MANAGEMENT_TABS`'s `primary: string` becomes `primary: string | null`; `ManagementFrame` renders the
button only when the current tab has one; `AdminManagementPanel.handlePrimary` gets a fourth branch that is a
no-op (or, better, the primary is simply not rendered so it can never fire). ~10 lines, one new ct assertion.

### R2 — the page subtitle

**Recommendation: "People, departments, zones and publish history."** (the mockup's line).

It enumerates the four tabs in tab order, keeps the existing sentence shape, and needs no per-tab logic — the
subtitle describes the page, and a subtitle that changed with the tab would also have to be guessed by
`loading.tsx`, which renders before the tab is known.

**Cost:** two shipped copies (`ManagementFrame.tsx:71`, `loading.tsx:19`) — plus **one Phase 4 rig that this
slice may not edit**: `docs/redesign-v2/phase4/audit/pr4-smoke.mjs:109` asserts the old string. That rig is
manual (not in any npm script, not in CI) and is Phase 4 record. See finding **F2**.

### R3 — the numeric column, stated as the coupled choice it is

| Option | What ships | Consequence |
|---|---|---|
| **(c) — recommended** | one **Changes** column, the sum of all nine `CHANGE_SUMMARY_BUCKETS`, sortable | requires the whole-log data path of §3.3 (client sort). One new pure helper, one uncontroversial derivation |
| (b) | no numeric column; the summary sentence carries everything | compatible with server-side paging; but the sentence is the only column that can truncate, so magnitude becomes invisible on exactly the wide rows the reader is hunting for |
| (a) | two columns, **Seats** and **People**, each a bucket-group sum | needs a further owner ruling on which of the nine buckets is "seats" and which is "people" (`assignments_changed` and `seat_detail_changes` are genuinely ambiguous), two helpers, two tests. Superseded by the reviewer on this point |

The argument for (c) that is specific to a *table* rather than a panel: `.cds-table` cells are
`white-space: nowrap; text-overflow: ellipsis`, and §1G.5's shipped overflow rule for this page is "long names
truncate with `title`". So the What-changed sentence **will** ellipsis on the long rows — the ones with the
most changes. A right-aligned tabular count is the part of the magnitude that cannot truncate, and it is what
makes the column sortable at all. (§1.4's "wrap to two lines, never truncate" is the *panel's* rule for a
72px three-line event row; it does not govern a fixed-layout table cell, and this plan does not import it.)

**Cost of (c):** `lib/publishHistory.ts` gains `publishChangeTotal(summary): number | null` — `null` for the
same malformed/unrecognised shapes `formatPublishChangeSummary` already returns `null` for, so the cell renders
`—` in exactly the cases the sentence does. Plus the sort/slice helpers of §6. All in one already-covered
module, all in `tests/publish-history.test.mjs`.

---

## 5. The tab as designed

**Columns** (1584 live area, header 40 / rows 32 per §1.23):

| Column | Class | Content | Sortable |
|---|---|---|---|
| Published | `sp-col-when` | `formatPublishDate(created_at, { withTime: true })` — the shipped shape, "Sep 2, 2026, 2:12 PM" | yes — **default, descending** |
| Published by | `sp-col-who` | `published_by_email ?? "an admin"` — the shipped actor fallback | yes |
| Changes | `sp-col-count` | `publishChangeTotal(change_summary)`, right-aligned tabular; `—` when null | yes |
| What changed | — | `formatPublishChangeSummary(…) ?? \`Initial publish · ${seat_count} seats\``, with `title` for the truncated case | no — a `.cds-th-static` header; alphabetising a sentence means nothing |

**Toolbar** (`.cds-toolbar sp-toolbar`, no search — the log has no search in this slice): one
`.cds-toolbar-count` with `aria-live="polite"`, count always published, zero included —
`"42 publishes · most recent Sep 8, 2026, 2:12 PM"`, and `"No publishes yet"` at zero.

**Pagination** (`.cds-pagination`, under the table): left = page-size `<select>` (10 / 25 / 50, default 25) in
`.cds-select-wrap`; right = `.cds-range` "1–25 of 42" + prev / next `.cds-btn--icon`. Page index is component
state, not a URL param — the hand-off scopes drill-in and addressable positions out, and `?tab=` stays the
page's only query contract.

**Route and tab states** (D5-d, §1G.5, reusing what ships):

| State | Design |
|---|---|
| Loading (in-tab) | four `.cds-skeleton-row`s under the four **real** `.cds-th-static` headers; toolbar count reads "Loading publish history…" |
| Error | `.cds-notification--error` in place of the table: "Publish history couldn't load" + ghost **Retry** (the panel's copy and shape) |
| Empty | `.cds-empty`: "Nothing published yet" / "Your first publish appears here." — no button; Publish lives on the map |
| Partial | a `published_by` that does not resolve reads "an admin" (`getPublishHistoryActor`'s shipped fallback) |
| Overflow | the sentence truncates with `title`; the count column never does; at 1024 the table scrolls inside `.sp-table-scroll`, never the page |
| Not admin | unchanged — the page-level 403 card already guards the whole route |

**Keyboard** (no new pattern): tablist ← → Home End as today (`handleTabKeyDown` derives `last` from
`MANAGEMENT_TABS.length`, so it needs no edit); Tab into the tabpanel; sortable headers are `.cds-sort`
buttons; the page-size select and the two pagination buttons are native controls; the 2px inset focus ring
throughout.

**Brand:** zero colour work. No new token, no hex, no `--cds-*` outside the token files. The tab's selected bar
is the same `--sp-tab-bar` terracotta the other three use.

---

## 6. File map

**Changed**

| File | Change |
|---|---|
| `app/actions.ts` | `getPublishLogAction()` added **immediately after** `getPublishHistoryAction` (§3.3). The existing action's diff is empty |
| `lib/publishHistory.ts` | `publishChangeTotal`, `sortPublishEvents`, `publishLogPageSlice`, `publishLogCountLine` — four pure functions in the module that already owns this domain |
| `components/admin-management/ManagementFrame.tsx` | `MANAGEMENT_TABS` gains `{ id: "publishHistory", label: "Publish history", primary: null }`; `primary` becomes `string \| null`; the header button renders only when the current tab has one (R1); subtitle (R2) |
| `components/admin-management/PublishLogTable.tsx` | **new** — the tab: lazy fetch, sort, pagination, the four states. Sibling of `EmployeesTable`, same idioms |
| `components/admin-management/AdminManagementPanel.tsx` | a fourth `activeTab === "publishHistory"` section; `handlePrimary` no longer reachable on that tab |
| `app/(shell)/admin/management/page.tsx` | `managementTabIds` gains `"publishHistory"` — which *is* the retirement of the legacy redirect; the `:11` comment rewritten to the D0-a / D5 amendments |
| `app/(shell)/admin/management/loading.tsx` | the fourth tab in the skeleton strip; the new subtitle |
| `components/ui/icons.tsx` | `ChevronLeftIcon`, `ChevronRightIcon` (the module has only a down `ChevronIcon`) |
| `app/styles/sp-components.css` **and** `docs/redesign-v2/phase3/components/sp-components.css` | amendment H, §2 — **byte-identical in both copies** |
| `.design-sync/shims/app-actions.ts` | one `disabled("getPublishLogAction")` line; the file's own header says to keep it in step with `app/actions.ts` |
| `tests/helpers/renderComponent.mjs`, `tests/browser/build-harness.ts` | `"getPublishLogAction"` added to both `ACTION_EXPORTS` stub lists |

**Not changed, deliberately**

- `components/ui/ShellPanels.tsx` and `getPublishHistoryAction` — D0-a's panel is out of scope (§4).
- `components/seat-map/SeatMap.tsx` — `GUARDED_NAVIGATION_HREFS` **already contains**
  `"/admin/management?tab=publishHistory"` (`:153`), left over from before the tab was retired. The unsaved-edits
  veto therefore already covers the returning tab; no edit, and no gap.
- `lib/deepLink.ts` — `withTabParam` is tab-agnostic string handling.
- The two vendored assets, `sp-tokens.css`, `carbon-tokens.css`, the brand file, `phase4-bridge.css`.
- Everything under `docs/redesign-v2/phase4/` (see F2).
- `ds-bundle/` — untracked build output (`git ls-files ds-bundle` → 0), despite its stale
  `initialTab?: … | "publishHistory"` declaration.

**Docs (last commit of the slice)**

`docs/redesign-v2/phase5/PHASE5.md` (new — the phase's record, opening with this slice), the dated **D0-a** and
**D5 / D5-a** amendments appended to `DECISIONS.md`, and the amendment-H line in both `sp-components.css`
headers. `CLAUDE.md`'s Design-system paragraph gains the amendment-H mention so its "byte-identical" sentence
stays true.

---

## 7. Test dispositions (§6) — re-pointed, never loosened

| Test | Disposition |
|---|---|
| `tests/admin-management-panel.test.mjs` | **Re-pointed.** `:289` expects `["Employees","Departments","Zones"]` → four labels. `:308`'s `assert.equal(screen.queryByRole("tab", { name: /history/i }), null)` **inverts**: the tab must now exist. New assertions: the header renders **no** primary on it (R1), the primary returns when tabbing away, `?tab=publishHistory` deep-links to it, the toolbar count publishes zero, and the four column headers are real while loading |
| `tests/deep-link.test.mjs` | **Unchanged.** `:43` uses `"publishHistory"` as an arbitrary tab value for `withTabParam`; it becomes more accurate, not less |
| `tests/publish-history.test.mjs` | **Extended** with the four new helpers: `publishChangeTotal` (all nine buckets, the all-zero → `0` case, malformed → `null`, a JSON *string* → `null` to match the sibling formatter, unknown keys ignored, negative/NaN rejected), sort stability across equal timestamps, page slicing at the boundaries and past the end |
| `tests/accessibility-source.test.mjs` | **Extended, not loosened.** Its existing tablist and scroll-region pins hold as-is; add that the log's sortable headers are buttons carrying `aria-sort`, that the pagination controls are labelled, and that the count region is `aria-live` |
| `tests/app-shell.test.mjs`, `tests/shell-panels.test.mjs`, `tests/viewer-shell.test.mjs` | **Unchanged** — they stub `getPublishHistoryAction`, which does not move. They will resolve the new stub name only because it is added to `renderComponent.mjs`'s list |
| `tests/restore-draft-snapshot-transaction-safety.test.mjs`, `tests/seat-creation-ui-source.test.mjs` | **Unchanged — and the reason is load-bearing** (§3.3): both regex the source span ending at `export async function getPublishHistoryAction`, so the new action must be inserted *after* it |
| `tests/e2e-auth/page-frames.spec.ts` | **Extended.** The existing Management frame assertions stand; add a fourth-tab walk: click it, assert the tablist has four tabs, assert the header's primary is **absent**, assert the table has a real `thead` and a `.cds-pagination`, and assert no horizontal scroll at each frame |
| `tests/phase4-token-layer-source.test.mjs` | **Green, untouched** — except that its byte-identity fixture is satisfied by amendment H landing in *both* copies. `HEX_LEDGER` keeps its two rows, `SWEPT` keeps `{1,2,3,4}`, no `--cds-*` leaves the token files |
| Coverage | the four new `lib/` functions are pure and fully covered; floors (90 / 95 / 80 over `lib/**`) hold |

---

## 8. Verification block (§7), run on the final head before the PR

`npm test` (incl. `test:db`) · `npm run test:ct` · `npm run gate` (lint 0 errors · typecheck · coverage floors)
· `npm run build` · `npm run test:e2e` · `npm run test:browser` · **`npm run test:e2e:auth` on the Docker stack**
(`db:start` + `db:seed`, URL and anon key inline to `next build` / `next start` — `.env.local` is never edited)
· the runtime audit (0 undefined `var()`, 6 routes × 2 themes + 1280 + system + viewer) · **contrast not re-run
— no token moves** · `sp-components.css` byte-identical to the docs copy (and the other three files unchanged)
· captures of the new tab at **1920 and 1024, both themes**, plus loading / error / empty / partial, under
`screenshots/phase5-pr1/` with a provenance README. The PR carries **no migration**, so the Vercel preview is
walkable and the walk is read-only, open-and-dismiss.

---

## 9. Findings — raised, not decided

**F1 · A second server action, after §1.9 called `getDraftStatusAction` "the ONE sanctioned new server action".**
That wording was scoped to the Phase 4 build. This slice's owner ruling asks for a record surface that cannot
exist without a read, and `getPublishLogAction` keeps the same contract §1.9 imposed (read-only, admin-only,
no RPC, no migration, no `revalidatePath`). *Recommendation: confirm it in the D5 amendment rather than treat
it as a deviation.*

**F2 · R2 makes a Phase 4 audit rig one assertion stale.** `docs/redesign-v2/phase4/audit/pr4-smoke.mjs:109`
asserts the old subtitle. The rig is manual, in no npm script and in no CI job, and it is Phase 4 record, which
this slice may not edit. *Recommendation: leave it, and record the staleness in the Phase 5 doc so a future
re-run knows why step 9 fails. The alternative — the reviewer re-points it as a Phase 4 maintenance commit — is
the reviewer's call, not mine.*

**F3 · "The tab count in the strip" (§4) read as the strip going 3 → 4 tabs**, which is what
`admin-management-panel.test.mjs:289` pins and what `handleTabKeyDown` derives its wrap-around from. The other
reading — a numeric badge *on* the tab, e.g. "Publish history 42" — is not built: no tab in this app carries a
count, Carbon line tabs here have no count slot, and §4 already lists the toolbar count separately. *Flagged so
the reviewer can correct the reading before any code exists.*

**F4 · Two parallel tab lists.** `app/(shell)/admin/management/page.tsx` keeps its own `managementTabIds`
literal alongside `ManagementFrame`'s `MANAGEMENT_TABS`; both need the new entry. *Recommendation: add to both
and leave the duplication — deriving one from the other would pull a client module into the server page for no
behavioural gain, and "the smallest change that solves the problem" governs.*

**F5 · Today's `publish_events` row count is unmeasured.** The read-only `select count(*)` against production
was blocked by this session's tool classifier. It bears only on §3.3's ceiling, not on the recommendation.

---

## 10. Task order after "go"

| # | Commit | Contents |
|---|---|---|
| 1 | `feat` | the data path: `getPublishLogAction` + the four `lib/publishHistory` helpers + their tests; the two stub lists; the design-sync shim |
| 2 | `feat` | the tab: `MANAGEMENT_TABS`, the `string \| null` primary, the subtitle, `page.tsx`'s tab ids and the retired redirect comment, `loading.tsx` |
| 3 | `feat` | `PublishLogTable` — table, toolbar count, `.cds-pagination`, sorting; amendment H in both sheet copies |
| 4 | `feat` | the four states (loading / error / empty / partial) and the ct + a11y + e2e-auth test re-points |
| 5 | `docs` | `phase5/PHASE5.md`, the dated D0-a and D5 / D5-a amendments, the `CLAUDE.md` line, `screenshots/phase5-pr1/` + its provenance README |

Then: the reviewer's smoke hand-off → PR → CI → the read-only preview walk → owner "merge" → squash → tag
**v2.1.0** → prune.

---

*Stop point. Nothing in §10 begins until the reviewer clears this plan and the owner rules R1, R2 and R3.*
