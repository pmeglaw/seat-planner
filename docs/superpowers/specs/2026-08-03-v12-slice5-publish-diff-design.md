# v12 Slice 5 — Publish Diff Table (Design)

**Date:** 2026-08-03 · **Owner-approved:** design gate + 2 rulings (unified table; lean modal)
**Contract:** #5 in `docs/design_handoff_carbon_v12/README.md` — review modal lists per-seat rows: seat code (mono) · occupant now → after · change tag (Assigned green / Vacated red / Reassigned amber) + summary chips. Diff computed against the published baseline; a seat returned to its original occupant drops out of the diff, the count, and the map's D badges.
**Mock:** `screenshots/04-prototype.png` + `Seat Planner v12 Prototype.dc.html:473-517` (modal), `:618-634` (row logic).

## Scope

Restructure the publish review modal in `components/seat-map/SeatMap.tsx` around one unified per-seat diff table, backed by a new pure derivation in `lib/publishSummary.ts`. Lean layout per prototype: the stat cards, count-note card, standalone viewer-impact card, standalone undo-warning card, and the seven `PublishChangeList` sections are removed; their safety copy is folded into one caution line and the readiness banner. No behavior change to the publish action path.

## Owner rulings (this slice)

1. **Unified table** — every changed seat is one row; tag set extends beyond the mock's three: `Assigned` / `Vacated` / `Reassigned` / `Added` / `Removed` / `Updated`. People-detail changes stay a compact list below the table (they are not seats).
2. **Lean modal** — cut `PublishImpactCard` ×3, `PublishCountCard` ×3, count-note card, viewer-impact card, undo-warning card, `PublishChangeList` ×7, stats card. Keep readiness banner, error/pending blocks, no-changes state.

## Data model (lib — tested core)

New exports in `lib/publishSummary.ts` (reuse existing private helpers `getPublishSeatKey`, `getSeatPersonLabel`, `normalizeText`, `hasSeatMoved`, `buildOtherChangeDetail`, `formatPoint`):

```ts
export type PublishDiffRowKind = "added" | "removed" | "assigned" | "vacated" | "reassigned" | "updated";

export type PublishDiffRow = {
  key: string;              // getPublishSeatKey — stable React key
  label: string;            // seat code as rendered (draft side wins when both exist)
  kind: PublishDiffRowKind;
  from: string;             // occupant now: full name | "Open seat" | "—" (added rows)
  to: string;               // occupant after publish: full name | "Open seat" | "—" (removed rows)
  detail: string | null;    // metadata change description, or null
};

export function buildPublishDiffRows(
  draftSeats: SeatWithEmployee[],
  publishedSeats: SeatWithEmployee[]
): PublishDiffRow[];
```

**Kind mapping (one row per changed seat; priority top-down):**

| Condition (vs published baseline, keyed by `getPublishSeatKey`) | kind | from | to | detail |
|---|---|---|---|---|
| Draft seat with no published counterpart | `added` | `"—"` | occupant name or `"Open seat"` | zone (via `getSeatZone`) or null |
| Published seat with no draft counterpart | `removed` | occupant name or `"Open seat"` | `"—"` | `"Seat removed from the map"` |
| Occupant open → person | `assigned` | `"Open seat"` | name | metadata detail or null |
| Occupant person → open | `vacated` | name | `"Open seat"` | metadata detail or null |
| Occupant person A → person B | `reassigned` | A | B | metadata detail or null |
| Same occupant, but status / position / label / zone / department / notes / custom changed | `updated` | occupant label (unchanged) | same occupant label | combined description (required, never null) |

- **Occupant comparison** = `normalizeText(employee_id)` inequality, exactly as `buildPublishChangeSummary` does — so a seat undone back to its baseline occupant yields no row (contract drop-out clause).
- **`from`/`to` are ALWAYS occupant-state** (contract: "occupant now → after"). Metadata never rewrites those cells; it goes in `detail`. (The design-gate ASCII preview showed "Reserved → Available" in the occupant columns — that sketch is superseded by this rule.)
- **detail composition**, joined with `"; "` in this order: status change as `` `Status ${published.status} -> ${draft.status}` `` (only when status differs), then `buildOtherChangeDetail(draft, published)` output, then position drift as `` `position ${formatPoint(published)} -> ${formatPoint(draft)}` `` (only when `hasSeatMoved`). A row whose occupant changed AND metadata changed keeps the occupant kind and carries the metadata text in `detail`.
- **Sort:** `label.localeCompare(other, undefined, { numeric: true })` (same as `sortItems`).
- `buildPublishChangeSummary` is **unchanged** — its outputs still drive the header draft chip, `draftSeatKeys` D badges, `hasChanges` gating, and the Management/Settings consumers.

## Modal structure (SeatMap.tsx, top → bottom)

Container: keep `fixed inset-0 z-[90] … sm:z-50` overlay, mobile bottom-sheet (`items-end` → `sm:items-center`), `role="dialog" aria-modal aria-labelledby="publish-review-title" aria-describedby="publish-review-description"`, `publishReviewDialogFocusRef`, Escape-order position (before active map modes). Section width narrows: `max-w-3xl` → `sm:max-w-[560px]` (prototype 560px), keep `max-h-[92vh]` flex column with scrollable body.

1. **Header** — unchanged copy: title `Review draft before publishing`, description `Confirm the saved draft changes before they become visible in the read-only viewer.`, close button (`aria-label="Close publish review"`).
2. **Readiness banner** (has-changes) — keep heading `Ready to publish reviewed changes` + `Ready` badge; ADD prototype subtext line: `Saved draft changes only — unsaved inspector edits are excluded.` No-changes state keeps `Draft and viewer map are in sync` + `No draft changes to publish…` copy.
3. **Error / pending blocks** — keep both (role=alert / role=status aria-live=polite), keep copy `Publish did not complete` / `Publishing reviewed draft changes…`, restyle compactly if needed.
4. **Chips row** — leading strong text `` `${diffRows.length} seat ${diffRows.length === 1 ? "change" : "changes"}` ``; then pills: `N assigned`, `N vacated`, `N reassigned` ALWAYS rendered (0 allowed, per mock); `N added`, `N removed`, `N updated` rendered only when count > 0. Counts derived from `diffRows` kinds.
5. **Diff table** — bordered container, `max-h-56 overflow-y-auto` (mock 224px), sticky header row. Grid `grid-cols-[64px_1fr_1fr_96px]`, header cells `Seat` / `Published now` / `After publish` / `Change` (11px semibold muted, header bg `--admin-state-neutral-bg`). Rows: seat code mono 12px semibold; `from` muted with trailing `→` (muted arrow, `flex-shrink-0`, from-text truncates); `to` 12.5px semibold truncating; tag pill (rounded-full, 10.5px semibold, kind colors below). When `detail` non-null, second line spanning columns 2–4: 11px muted text. Sub-`sm`: table sits in `overflow-x-auto` wrapper with `min-w-[480px]` inner grid.
6. **People details** (only when `employeeDetailChanges.length > 0`) — heading `People details` + count pill, then full list `Name — detail` (12px, muted detail), shares modal body scroll.
7. **Footnote** — `Draft: {draftSeatCount} seats · Currently published: {publishedSeatCount} seats` (11.5px muted, one line).
8. **Caution line** — exact copy: `Publishing copies the saved draft map to the read-only viewer and clears Undo/Redo history after success. Until you publish, viewers keep seeing the currently published map.` (keeps both currently-pinned sentences as substrings).
9. **Footer** — border-top, two buttons 48px: `Cancel` (neutral, flex 1) and publish CTA (flex 1.4 — `grid-cols-[1fr_1.4fr]`), keeping label states verbatim: `Publishing…` / `Retry publish` / `Publish changes` (sub-sm) + `Publish reviewed changes` (sm+) / `No changes to publish`; classes keep `--admin-primary-cta` / `--admin-primary-cta-hover` and `disabled={pending || !publishSummary.hasChanges}`.

**Deleted from SeatMap.tsx:** `PublishImpactCard`, `PublishCountCard`, `PublishChangeList`, `formatPublishChangeUnit`, `publishPeopleChangeCount` / `publishSeatInventoryChangeCount` / `publishMetadataChangeCount` derivations, count-note card, viewer-impact card, undo-warning card, stats card. `publishReadinessTitle/Description/BadgeTone/BadgeLabel` stay (banner uses them).

## Tag / chip colors — `--admin-diff-*` tokens

New family in `app/globals.css` under `.admin-theme` (slice-1 pattern), surfaced in `tailwind.config.ts` only if the existing config maps token groups (otherwise consume via `var()` arbitrary values like the `--admin-ai-*` family):

| Token triplet | bg | border | text | Used by |
|---|---|---|---|---|
| `--admin-diff-assigned-{bg,border,text}` | `#DEF3E4` | `#A9D7B8` | `#284C3B` | Assigned, Added |
| `--admin-diff-vacated-{bg,border,text}` | `#FBE9EA` | `#E8A5A9` | `#B3232C` | Vacated, Removed |
| `--admin-diff-reassigned-{bg,border,text}` | `#FCF4D6` | `#E0C46E` | `#6D4712` | Reassigned |
| (reuse `--admin-state-neutral-*` + `--admin-text-muted`) | — | — | — | Updated |

Color groups severity (green = occupant/seat gained, red = lost, amber = swapped, neutral = metadata); the tag label differentiates within a group. Implementation must measure text-on-bg contrast for the three new triplets and record ratios in the `globals.css` comment block; if any lands below 4.5:1, darken the text hex (not the bg) until it passes.

## Do-not-touch

- Publish action path: `openPublishReview` (incl. `inspectorDirty` block + `Publish review blocked: Save or discard the selected seat edits before publishing`), `confirmPublishDraftMap` (transition, `setLocalPublishedSeats`, `clearDraftHistory`, success notice), `publishSeatMapAction` / `publish_seat_map` RPC.
- Contract #4 chip cluster: has-changes-only render, single `onClick={openPublishReview}` control, `draftStatusLabel` (`N unpublished change(s)` — the e2e-auth spec locates the review entry by `/unpublished change/`) and Publish-button count badge.
- `draftSeatKeys` derivation (D badges) and `buildPublishChangeSummary` call shape `(localSeats, localPublishedSeats, { employees: localEmployees, publishedEmployees: localPublishedEmployees })` — pinned by a11y-source.
- Discard-draft dialog + kebab entry; z-order (`z-[90] … sm:z-50` review, `z-[95]` discard).
- `lib/mapLayoutTransform.ts`, `lib/seatMath.ts` (frozen).
- Accessible names the e2e-auth publish flow depends on: dialog role, publish button matching `/^Publish/`.

## Test lockstep

- **`tests/publish-summary.test.mjs`** — add `buildPublishDiffRows` block: each kind; priority (occupant + metadata same seat → occupant kind + detail); revert drop-out (baseline occupant restored → no row); detail composition order (status, other, position); numeric-aware sort; `from`/`to` occupant-state invariants (`added` from `"—"`, `removed` to `"—"`). Coverage floors (`lib/**` 90/95/80) hold.
- **`tests/accessibility-source.test.mjs:289-325`** rewrite — DROP pins: `formatPublishChangeUnit(value)`, `value === 1 ? "change" : "changes"` (helper dies), `Count note:`, `Impact groups can overlap`, `Use Total publish changes below…`, `People affected`, `Seat inventory`, `Metadata`, `Added seats`, `Removed seats`, `Assignment changes`, `Vacated seats`, `Status changes`, `Other draft changes`. KEEP pins: summary call shape, `aria-labelledby="publish-review-title"`, title/description copy, `Ready to publish reviewed changes`, `Draft and viewer map are in sync`, `Publishing copies the saved draft map to the read-only viewer`, `Until you publish, viewers keep seeing the currently published map`, `Publish did not complete`, `Publishing reviewed draft changes`, `{actionError && !pending && (`, `Retry publish`, `No draft changes to publish`, `disabled={pending || !publishSummary.hasChanges}`, blocked-publish copy, `doesNotMatch` legacy-confirm. ADD pins: `buildPublishDiffRows(localSeats, localPublishedSeats)` call, `Published now`, `After publish`, `Saved draft changes only — unsaved inspector edits are excluded`, `People details`, tag-pill kind rendering token (`--admin-diff-`), chips-row derivation.
- **Browser tier (`tests/browser/seat-map.spec.ts`)** — one new spec: mount `canEdit:true, seats:[custom], publishedSeats:[]` (reads as one Added change), open review via the draft-chip cluster (dispatchEvent), assert dialog attached, table headers `Published now`/`After publish` attached, one row with mono label `S01` and an `Added` tag, chips row present. Presence-based per harness rules.
- **`tests/e2e-auth/publish-flow.spec.ts`** — verify still green (selectors survive by design); no edits expected.
- **Unaffected guardrails:** `bulk-destructive-action-safety-source` (pins discard/reset paths, not the modal body), `focus-handoff-source`, `seat-creation-ui-source`, `desktop-seat-marker-system-source`.

## Verification

`npm run lint && npm run typecheck && npm test && npm run test:ct && npm run build && npm run test:e2e`; browser tier runs in CI. Then PR → squash-merge on green (standing authority), deploy verify via Vercel git-main alias, owner Chrome pass: publish review on prod with a real draft change (assign + vacate + reassign in draft → open review → verify rows/tags/chips → Cancel; publish only with owner's explicit go), sub-900 sheet check, no-changes state via kebab discard path if needed.

## Out of scope

Publish history surfaces (`lib/publishHistory.ts`), Management/Settings publish gates, any RPC/migration change, slice 6+ items.
