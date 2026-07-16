# Critique Top-8 Fix Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 8 ranked fix actions from `output/ui-ux-critique-2026-07-15/report.md` as 5 reviewable PRs.

**Architecture:** Styling/copy/reuse-level changes only — no schema or layer-model changes except PR 5
(publish-history change summaries), which persists the already-computed `publishSummary` diff at publish
time via a new timestamped migration + RPC update. Map changes are render-layer only (fill/border, label
collision, pan-into-view); saved coordinates and calibration are untouched.

**Tech Stack:** Next.js 15, React 19, TS strict, Tailwind 3 semantic tokens (`--sp-color-*`, `--admin-*`),
Supabase (Postgres RPCs, timestamped migrations), Node test runner (`tests/*.test.mjs`).

## Global Constraints

- Never replace the raster floor plan with SVG; overlays on top of it are allowed.
- Never point viewer surfaces at draft data; never write `published_employees` outside the publish RPC.
- Saved seat coordinates stay normalized in [0,1]; do not re-run normalization; calibration constants untouched.
- Keep ALL guardrail tests passing unmodified except where a task explicitly ADDS assertions
  (`accessibility-source` kebab-menu pin): `accessibility-source`, `bulk-destructive-action-safety-source`,
  `seat-creation-ui-source`, `desktop-seat-marker-system-source`, `published-employee-snapshot`,
  `*-transaction-safety`.
- Migrations: new timestamped file under `supabase/migrations/`; NEVER apply to prod manually — merging to
  main triggers the Supabase GitHub integration.
- Multi-row mutations go through SQL RPCs (edit both the TS action and a new migration when changing publish).
- Body text contrast ≥ 4.5:1; re-check the measured-contrast comments in `app/globals.css` when changing colors.
- Each PR: `npm run lint && npm run typecheck && npm test && npm run build` green before merge.
- Commit style: match repo (`fix(scope): ...` / `design(scope): ...`), end with the Claude Code co-author line.

## PR structure

| PR | Branch | Actions | Theme |
|---|---|---|---|
| 1 | `fix/pill-legibility-crowding` | 1, 2 | Assigned/reserved pill legibility at fit zoom; seatCrowding for Show-names + docked-fit |
| 2 | `fix/copy-register-identity` | 3, 8 | Copy register pass; seat-code/name casing normalization; Ask Planner warning dedupe |
| 3 | `fix/responsive-geometry` | 4 | 880 sheet auto-pan selected seat; viewer narrow fit-width + flex height |
| 4 | `fix/token-semantics-overlays` | 5, 7 | Latest Publish de-red; selection accent unification; Filter popover styling; kebab menu semantics + a11y pin |
| 5 | `feat/publish-history-summaries` | 6 | Persist + display per-publish change summaries |

---

## Exploration corrections to the critique (bind implementers to these)

- **Selection accent**: admin map and viewer BOTH render `SeatMarker` `variant="viewer"` selected arm = orange
  `#D46A24` (`components/seat-map/SeatMarker.tsx:253-258`). The viewer shot's "teal selection" was the
  `searchSelected` combo state (orange pill + teal `outline-[#2F6668]/75` + teal halo, lines 248-251) because a
  search was active. Scope the accent fix to making the combo state read selected-first (see PR 4 Task 4.3).
- **Latest Publish card**: colors come from `--admin-publish-ready-*` tokens = brand-orange soft
  (`app/globals.css:257-259`), shared with the SeatMap publish modal. Do NOT change the token values — restyle
  the card/chip in `AdminManagementPanel.tsx` to success/neutral tokens directly.
- **`publish_events` has no summary column** (`supabase/migrations/20260521000100_publish_audit_logging_hardening.sql:5-10`);
  the diff is computed client-side only (`SeatMap.tsx:745-751`) and discarded. PR 5 computes a compact summary
  **server-side inside the RPC** (trustworthy, transactional), not by trusting a client-posted diff.
- **Pinned copy**: `tests/bulk-destructive-action-safety-source.test.mjs:80` pins
  `/Published assignments are protected server-side/` and `:81` pins `/published viewer map is unchanged until publish/i`.
  PR 2 must update these assertions together with the copy, preserving equivalent protective meaning.
- **`formatDisplayName`** early-returns any string containing a lowercase letter (`lib/formatName.ts:25`), so
  concatenated titles like `"PAM — Cw01"` pass through raw. Format name and seat-code segments separately.

---

### Task 2.1 (PR 2): Management + Settings copy register pass

**Files:**
- Modify: `components/admin-management/AdminManagementPanel.tsx:593-595, 642, 258-264, 788, 1115`
- Modify: `app/admin/settings/page.tsx:47-49`
- Modify: `components/admin-settings/DataUtilitiesPanel.tsx:256-258`
- Modify: `tests/bulk-destructive-action-safety-source.test.mjs:80-81`

**Steps:**

- [ ] **2.1.1** In `tests/bulk-destructive-action-safety-source.test.mjs` replace the two pinned regexes (lines 80-81):
```js
assert.match(source, /The published map everyone sees won't change until you publish again/);
assert.match(source, /published map (everyone sees )?(won't|will not) change until you publish/i);
```
Run `node --test tests/bulk-destructive-action-safety-source.test.mjs` → expect FAIL (source not yet changed).

- [ ] **2.1.2** Apply copy edits:
  - `AdminManagementPanel.tsx:594`: subtitle → `People, departments, zones, and publish history.`
  - `AdminManagementPanel.tsx:642`: helper → `Search, edit, and deactivate employees. Seat placement happens on the map.`
  - `AdminManagementPanel.tsx:260-263`: stat labels → `"Assigned"` → `"Assigned employees"`, `"Unassigned"` → `"Unassigned employees"` (leave the other three).
  - `AdminManagementPanel.tsx:788` (inline aside, assigned branch): `" Deactivation clears this draft assignment. The published map everyone sees won't change until you publish again."`
  - `AdminManagementPanel.tsx:1115` (confirm dialog, employee branch): `"The published map everyone sees won't change until you publish again. Publish draft changes when ready."`
  - `app/admin/settings/page.tsx:48`: subtitle → `Import, export, and recovery tools. Everything here changes the draft only — the published map is never touched until you publish.`
  - `DataUtilitiesPanel.tsx:257`: helper → `Imports update draft assignments; seat positions don't move.`

- [ ] **2.1.3** Run `node --test tests/bulk-destructive-action-safety-source.test.mjs` → PASS. Grep the repo for any other occurrence of `protected server-side` → none. Commit `fix(copy): management/settings register pass — outcome language, no architecture jargon`.

### Task 2.2 (PR 2): Ask Planner copy + duplicated-warning dedupe

**Files:**
- Modify: `components/seat-map/AskPlannerDrawer.tsx:126, 273, 291, 331-340, 381`
- Test guard: `tests/map-operations-agent.test.mjs:894` pins the truncated server warning — do NOT touch `lib/mapOperationsAgent.ts`.

**Steps:**

- [ ] **2.2.1** In `AskPlannerDrawer.tsx`, add module-level constant mirroring the server string (client filter only):
```ts
const BROAD_ANSWER_EMPTY_HIGHLIGHT_WARNING =
  "No seats highlighted for this broad answer. Ask for a specific zone, department, or smaller group to highlight seats.";
```
In the Warnings section (lines 331-340), render from `const visibleWarnings = response.warnings.filter(w => w !== BROAD_ANSWER_EMPTY_HIGHLIGHT_WARNING)` and gate the amber box on `visibleWarnings.length > 0`.

- [ ] **2.2.2** Replace the Highlighted-seats empty-state paragraph (line 381) with:
`Broad answers don't highlight seats — ask about a specific zone or department to see them on the map.`

- [ ] **2.2.3** Copy edits in the same file:
  - line 126: `{ label: "Any problems on the map?", prompt: "Are there any seating problems or conflicts on the map?" }`
  - line 273 placeholder: `Ask about seats, zones, departments, or assignments`
  - line 291 empty-state intro: `Ask about saved draft seats, assignments, zones, or departments. Ask Planner can highlight supporting seats, but it cannot change the map.`
  (Keep the "Saved draft only" chip at line 237 and subtitle at line 220 — one mention each is fine; the triple
  repetition dies with the line-291 rewrite... verify remaining count of "saved draft" ≤ 2 in visible drawer copy.)

- [ ] **2.2.4** `npm run lint && npm run typecheck && node --test tests/map-operations-agent.test.mjs` → PASS. Commit `fix(ask-planner): concrete prompts, single broad-answer notice, less repetition`.

### Task 2.3 (PR 2): Identity normalization (names + seat codes)

**Files:**
- Modify: `lib/formatName.ts` (add `formatSeatCode`)
- Modify: `components/seat-map/SeatMap.tsx:828,836` (compose admin result titles from formatted segments)
- Modify: `components/seat-map/ResultsPanel.tsx:118-143` (drop redundant "Assigned" token on person rows)
- Modify: `components/seat-map/ViewerSeatFinder.tsx:827,832-833` (format person titles)
- Test: `tests/format-name.test.mjs` (extend or create alongside existing suite)

**Steps:**

- [ ] **2.3.1** Write failing tests first (extend the existing formatName test file if present, else create):
```js
import { formatSeatCode, formatDisplayName } from "../lib/formatName.ts"; // match existing import pattern in tests/
assert.equal(formatSeatCode("Cw01"), "CW01");
assert.equal(formatSeatCode(" cw07 "), "CW07");
assert.equal(formatSeatCode(""), "");
assert.equal(formatDisplayName("PAM"), "Pam");
```
(Check how sibling tests import TS libs — some tests type-check source instead; follow the repo's existing pattern for lib tests.) Run → FAIL.

- [ ] **2.3.2** Implement `formatSeatCode(label: string | null | undefined): string` in `lib/formatName.ts`: trim + `.toUpperCase()`. Run tests → PASS.

- [ ] **2.3.3** Apply at render/composition sites:
  - `SeatMap.tsx:828`: title = `` `${formatDisplayName(seat.employee.full_name)} — ${formatSeatCode(seat.label)}` `` (name and code formatted separately, then concatenated — do not rely on ResultsPanel's whole-title formatting).
  - `SeatMap.tsx:836`: `formatSeatCode(seat.label)`.
  - `ViewerSeatFinder.tsx:827`: `{formatDisplayName(result.title)}` for person rows; seat-row titles through `formatSeatCode` (branch on `result.kind`).
  - `ResultsPanel.tsx`: on person rows, drop the trailing `Assigned` metadata token (the one that truncates to "Assi…"); keep status tokens on seat rows.

- [ ] **2.3.4** `npm run lint && npm run typecheck && npm test` → PASS (fix any source-test fallout knowingly). Manual check strings "Cw0" gone: `grep -rn "Cw0" components/ lib/` → only data-independent hits. Commit `fix(identity): canonical seat-code casing + name casing via one formatter path`.

### Task 3.1 (PR 3): Auto-pan selected seat above the 880 bottom sheet

**Files:**
- Modify: `components/seat-map/SeatMap.tsx` (`scrollMapToPoint:1282-1290`, selection effect near `1470-1472`, sheet-awareness)

**Steps:**

- [ ] **3.1.1** Extend `scrollMapToPoint(x, y, options?: { verticalViewportAnchor?: number })` — anchor the target
point at `clientHeight * anchor` instead of `/2` when provided (default `0.5`, keep exact current behavior otherwise):
```ts
const anchor = options?.verticalViewportAnchor ?? 0.5;
const top = clampScrollPosition((y * map.offsetHeight) - (viewport.clientHeight * anchor), viewport.scrollHeight - viewport.clientHeight);
```

- [ ] **3.1.2** Add a selection effect (place near the existing comment at `SeatMap.tsx:1470-1472`, and REWRITE that comment — it documents the ≥900px assumption; note the <900px sheet overlay case now pans):
```ts
// Below the panel tier the inspector is an overlaying bottom sheet (max-h 60vh),
// so pan the just-selected seat into the visible strip above it.
useEffect(() => {
  if (!selectedSeatId) return;
  if (window.matchMedia("(min-width: 900px)").matches) return;
  const frame = requestAnimationFrame(() => {
    const seat = localSeats.find(s => s.id === selectedSeatId);
    if (!seat) return;
    const point = savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat);
    scrollMapToPoint(point.x, point.y, { verticalViewportAnchor: 0.28 });
  });
  return () => cancelAnimationFrame(frame);
}, [selectedSeatId, localSeats, scrollMapToPoint]);
```
(Match existing seat-lookup + transform usage from `centerSeatInMap:1435-1440`; reuse it if a small refactor lets
`centerSeatInMap` take the anchor option — prefer reuse over duplication.)

- [ ] **3.1.3** `npm run lint && npm run typecheck && npm test && npm run build` → PASS. Live-verify later in the
final verification pass (resize to 880, tap a low seat, selection ring must be visible above the sheet).
Commit `fix(responsive): pan selected seat into view above the narrow-width inspector sheet`.

### Task 3.2 (PR 3): Viewer narrow-width contain-fit (kill the h-scroll + dead band at tablet widths)

**Files:**
- Modify: `components/seat-map/ViewerSeatFinder.tsx:238-268 (updateFitMapWidth + comment), 497-512 (classes/style)`

**Steps:**

- [ ] **3.2.1** Change `updateFitMapWidth` policy: at `≥1024px` keep both-dimension contain-fit (unchanged); at
`≥640px and <1024px` set width-only fit `Math.floor(Math.max(1, viewportElement.clientWidth - 2))`; below 640px
keep `null` (fixed 1040px mobile width, horizontal scroll stays intentional on phones). Update the design-intent
comment at lines 238-241 to describe the new three-tier policy.

- [ ] **3.2.2** Make the frame classes cooperate: in `mapFrameClassName` (504-509) the fit-view arm currently
hardcodes `w-[1040px] sm:w-[1340px]`; since `mapFrameStyle` sets an explicit pixel width whenever `fitMapWidth`
is non-null (which now includes sm..lg), the sm fixed width only applies pre-measurement — verify no flash;
keep classes as fallback. Also verify the wasted band: with width-fit the frame height shrinks to
`width × 1734/3822`; the viewport `max-h` caps remain fine.

- [ ] **3.2.3** `npm run lint && npm run typecheck && npm run build` → PASS. Live-verify at 880 in final pass
(no horizontal scrollbar, full floor visible, no dead band, zoom controls still reachable).
Commit `fix(viewer): contain-fit at tablet widths — no default horizontal scroll or dead band`.

### Task 4.1 (PR 4): Latest Publish card off the alarm palette

**Files:**
- Modify: `components/admin-management/AdminManagementPanel.tsx:970-989 (card), 1022 (Latest chip)`

**Steps:**

- [ ] **4.1.1** Card container → neutral elevated: `border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-elevation-2`. Card heading "Latest Publish" → `text-[var(--admin-text-secondary)]`; the three cell labels ("Created"/"Seat Count"/"Published By") → `text-[var(--admin-text-muted)]`; values → `text-[var(--admin-text-primary)]`. Add a green dot + `Latest` chip in the card heading row reusing the Assigned-pill pattern: `bg-[var(--admin-success-soft)] text-[var(--admin-success)] ring-1 ring-[var(--admin-success)]/30`.

- [ ] **4.1.2** Table "Latest" chip (line 1022) → the same success chip classes (replace `--admin-publish-ready-*` usage). Do NOT touch the `--admin-publish-ready-*` token definitions (the SeatMap publish modal still uses them for its call-to-action state).

- [ ] **4.1.3** `npm run lint && npm run typecheck && npm test` → PASS. Commit `design(management): Latest Publish reads as state, not alarm — success/neutral tokens`.

### Task 4.2 (PR 4): Filter popover elevation/offset + styled select chrome

**Files:**
- Modify: `components/seat-map/FilterPanel.tsx:80-81 (select class), 117 (panel class)`
- Modify: `components/seat-map/SeatMap.tsx` (the filter panel's positioned wrapper — find `{showFilterPanel && (` block; keep DOM order before the search form — `accessibility-source` pins that order)

**Steps:**

- [ ] **4.2.1** In the SeatMap wrapper that positions the panel, add a 4px gap from the header (match the floor menu's `top-[calc(100%+4px)]` pattern) if not already offset.

- [ ] **4.2.2** Panel container (FilterPanel.tsx:117): align border token with sibling menus → `border border-[var(--admin-chrome-border)]` (keep `bg-[var(--admin-chrome-elevated)]`, `shadow-elevation-4`, square corners — shell radius is 0 by design).

- [ ] **4.2.3** Styled selects, native semantics kept: extend `darkSelectClassName` with `appearance-none pr-8` plus an inline chevron via CSS background (data-URI stroke `#9a9a9a`), e.g. append:
`bg-[url('data:image/svg+xml;...')] bg-[length:14px] bg-[position:right_8px_center] bg-no-repeat`
(keep the existing `[&>option]` dark styling; do not swap `<select>` for a custom listbox — `accessibility-source` behavior and the verified disclosure pattern stay intact).

- [ ] **4.2.4** `npm run lint && npm run typecheck && node --test tests/accessibility-source.test.mjs` → PASS. Commit `design(filter): popover reads as an elevated panel; selects get app chrome`.

### Task 4.3 (PR 4): Kebab menu semantics + guardrail pin (+ combo-accent check)

**Files:**
- Modify: `components/seat-map/SeatMap.tsx:2670-2733`
- Modify: `tests/accessibility-source.test.mjs` (extend test block at line 325 area)

**Steps:**

- [ ] **4.3.1** Write the new failing assertions in `tests/accessibility-source.test.mjs` (inside the block that already reads `seatMapSource`):
```js
assert.match(seatMapSource, /id="seat-map-overflow-menu"[\s\S]{0,160}role="menu"/);
assert.match(seatMapSource, /role="menuitem"/);
assert.match(seatMapSource, /aria-haspopup="menu"/);
```
Run → FAIL.

- [ ] **4.3.2** Implement in `SeatMap.tsx`:
  - Trigger (2672-2693): `aria-haspopup="menu"` (was `"true"`).
  - Container (2695-2707): `role="menu"` (was `"group"`), keep `aria-label="Map actions"` (safe — not in the doesNotMatch guards), extend `onKeyDown` for `ArrowDown/ArrowUp/Home/End` cycling focus among items (query `[role="menuitem"]` children) while keeping the exact Escape branch text (the `setMapMenuOpen\(false\);[\s\S]{0,90}returnFocusAfterClose\(mapMenuButtonRef\)` pin must keep matching).
  - Items (2708-2729): add `role="menuitem"`; add an effect (or ref callback) to move focus to the first item when `mapMenuOpen` flips true.

- [ ] **4.3.3** Combo-accent adjustment (scoped per exploration correction): in `SeatMarker.tsx:248-251` make the
`searchSelected` combo read selected-first — orange ring/outline with the teal reduced to the halo only:
replace the teal `outline-[#2F6668]/75` with `outline-[#D46A24]/75`, keep the teal halo shadow. **Gate: first
check `tests/desktop-seat-marker-system-source.test.mjs` for pins on these exact hex strings (see PR 1 report);
if the combo-state classes are pinned as guardrail anchors, leave the code and instead record the decision in
the PR body.**

- [ ] **4.3.4** `npm run lint && npm run typecheck && npm test` → PASS. Commit `fix(a11y): map kebab is a real menu (role, arrow keys, focus) — pinned in accessibility-source`.

### Task 5.1 (PR 5): Server-side publish change summary — migration + RPC

**Files:**
- Create: `supabase/migrations/20260715<HHMMSS>_publish_change_summary.sql`
- Reference (read, copy body faithfully): `supabase/migrations/20260708230000_published_employee_snapshot.sql:56-138`
- Guard test: `tests/published-employee-snapshot.test.mjs` (must keep passing UNMODIFIED)

**Steps:**

- [ ] **5.1.1** Migration part 1: `alter table public.publish_events add column if not exists change_summary jsonb;`

- [ ] **5.1.2** Migration part 2: `create or replace function app_private.publish_seat_map()` — copy the current
body EXACTLY from `20260708230000_published_employee_snapshot.sql`, then insert a summary-computation block
BEFORE the published-seats delete. Compute counts by diffing draft vs published (join on `coalesce(seat_key, label)`)
and active employees vs `published_employees`:
```sql
declare
  change_summary jsonb;
begin
  -- (existing admin gate stays first)
  select jsonb_build_object(
    'seats_added',        (select count(*) from public.seats d where d.layer = 'draft' and not exists (select 1 from public.seats p where p.layer = 'published' and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label))),
    'seats_removed',      (select count(*) from public.seats p where p.layer = 'published' and not exists (select 1 from public.seats d where d.layer = 'draft' and coalesce(d.seat_key, d.label) = coalesce(p.seat_key, p.label))),
    'assignments_changed',(select count(*) from public.seats d join public.seats p on p.layer = 'published' and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label) where d.layer = 'draft' and coalesce(d.employee_id::text,'') is distinct from coalesce(p.employee_id::text,'')),
    'seats_moved',        (select count(*) from public.seats d join public.seats p on p.layer = 'published' and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label) where d.layer = 'draft' and (d.x is distinct from p.x or d.y is distinct from p.y)),
    'status_changes',     (select count(*) from public.seats d join public.seats p on p.layer = 'published' and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label) where d.layer = 'draft' and d.status is distinct from p.status),
    'employee_edits',     (select count(*) from public.employees e join public.published_employees pe on pe.id = e.id where e.active and (e.full_name is distinct from pe.full_name or e.title is distinct from pe.title or e.department is distinct from pe.department or e.phone_extension is distinct from pe.phone_extension or e.email is distinct from pe.email))
  ) into change_summary;
```
**Column-name check**: the implementer MUST verify actual `seats`/`employees` column names against the schema
migrations before writing the diff SQL (e.g. `seat_key`, `status`, `title` are assumptions — use the real ones,
mirroring `lib/publishSummary.ts` semantics). The audit insert (which must remain the LAST statement, exact
literal `insert into public.publish_events` preserved) becomes:
```sql
insert into public.publish_events (published_by, seat_count, change_summary)
values (auth.uid(), copied_count, change_summary);
```
All other pinned literals stay byte-identical: `delete from public.seats where layer = 'published'`,
`delete from public.published_employees where true`, `insert into public.published_employees`,
`from public.employees where active`, `security definer`, the `if not app_private.is_admin() then` gate,
and the delete→insert→audit ordering.

- [ ] **5.1.3** Run `node --test tests/published-employee-snapshot.test.mjs` → must PASS with the new migration
present (the test reads the LATEST publish function definition — check how it locates the SQL; if it reads the
07-08 file specifically, confirm the new migration doesn't need to be the read target; if it globs for the
latest `publish_seat_map` definition, the new file must satisfy every pinned regex). Commit
`feat(publish): persist per-publish change summary computed in-transaction`.

### Task 5.2 (PR 5): Surface summaries in Publish History

**Files:**
- Modify: `lib/publishHistory.ts` (types + `formatPublishChangeSummary`)
- Modify: `app/actions.ts:721-759` (`getPublishHistoryAction` select)
- Modify: `components/admin-management/AdminManagementPanel.tsx:992-1030` (table) and `970-989` (Latest card detail line)
- Test: `tests/publish-history.test.mjs` (extend existing file if present, else create matching repo patterns)

**Steps:**

- [ ] **5.2.1** Failing tests first for `formatPublishChangeSummary(summary: unknown): string | null`:
```js
assert.equal(formatPublishChangeSummary(null), null);
assert.equal(formatPublishChangeSummary({}), null);
assert.equal(formatPublishChangeSummary({ assignments_changed: 2, employee_edits: 1 }), "2 assignments changed · 1 employee edit");
assert.equal(formatPublishChangeSummary({ seats_added: 1 }), "1 seat added");
assert.equal(formatPublishChangeSummary({ seats_added: 0, seats_removed: 0 }), "No changes recorded");
```
Singular/plural per unit; omit zero buckets; order: seats added, seats removed, assignments changed, seats moved, status changes, employee edits.

- [ ] **5.2.2** Implement in `lib/publishHistory.ts`; extend `PublishEventRecord` with `change_summary?: unknown`.
Update `getPublishHistoryAction` select to `"created_at,seat_count,published_by,change_summary"`.

- [ ] **5.2.3** UI: add a "Changes" cell per row rendering `formatPublishChangeSummary(event.change_summary) ?? "—"`
(muted text); add the same line to the Latest Publish card. Old rows (null) render "—".

- [ ] **5.2.4** `npm run lint && npm run typecheck && npm test && npm run build` → PASS. Commit
`feat(management): publish history answers "what changed"`.

---

### Task 1.1 (PR 1): seatCrowding — density tiers + name-label nudges (pure logic, TDD)

**Files:**
- Modify: `lib/seatCrowding.ts`
- Test: `tests/seat-crowding.test.mjs` (5 existing tests must keep passing)

**Interfaces (produced for Tasks 1.2/1.3):**
```ts
export type SeatDensityTiers = { crowded: Set<string>; dense: Set<string> };
export function computeSeatDensityTiers<T extends {id:string;x:number;y:number}>(
  seats: readonly T[], clearance?: CrowdingClearance): SeatDensityTiers;
// crowded = same pairs computeCrowdedSeatIds flags today (keep that function working, reimplement on top);
// dense   = pairs within 0.6 × clearance on both axes (subset of crowded).
export function computeNameLabelNudges<T extends {id:string;x:number;y:number}>(
  seats: readonly T[], namedSeatIds: ReadonlySet<string>, clearance: CrowdingClearance): Map<string, -1|0|1>;
// Only named seats participate. For each colliding cluster (pairs within clearance), sort by (y, then x)
// and alternate nudges 0,-1,+1,0,-1,... deterministically so neighbors never share a nudge value.
// Seats with no named collision → 0 (or absent). Never mutates coordinates.
```

**Steps:**

- [ ] **1.1.1** Extend `tests/seat-crowding.test.mjs` (same import/transpile pattern as the existing 5 tests) with
failing tests: (a) two seats at pitch 0.02 with default clearance → both in `crowded` AND `dense`; at pitch 0.035
→ `crowded` only; (b) `computeNameLabelNudges`: two named colliding seats get distinct nudges (one 0, one -1 or
+1); three in a row get pairwise-distinct nudges; a named seat colliding only with an unnamed seat → nudge 0;
empty named set → empty map. Run `node --test tests/seat-crowding.test.mjs` → new tests FAIL, old 5 PASS.

- [ ] **1.1.2** Implement both functions in `lib/seatCrowding.ts` (keep `computeCrowdedSeatIds`, `clearanceFromScale`,
constants exported and unchanged in behavior). Run → all PASS. Commit
`feat(seatCrowding): density tiers + deterministic name-label nudges`.

### Task 1.2 (PR 1): Assigned/reserved pill legibility at fit zoom (both surfaces)

**Files:**
- Modify: `components/seat-map/SeatMarker.tsx:167-208` (live hex arms — NOT pinned by any test; verified)
- Modify: `components/seat-map/SeatMap.tsx:210-243` (legend accent alignment)

**Steps:**

- [ ] **1.2.1** In the live (else) arm of the resting style (SeatMarker.tsx:176-182), replace the assigned/reserved
surfaces so status is legible at fit zoom, using the legend's token values as the swatch source:
```
assigned:   "border-[#1F7A55]/45 bg-[#E8F3EC]/95 text-[#156045]"   // legend assigned family (green)
reserved:   "border-[#9A6418]/55 bg-[#FCF0D9]/95 text-[#6D4712]"   // legend reserved family (amber)
unavailable + available: unchanged
```
And strengthen the assigned accent bar (line ~203): `bg-[#1F7A55]/85` (matches legend accent
`rgba(31,122,85,0.85)`). Keep the filled-disc vs hollow-ring status shape exactly as is.

- [ ] **1.2.2** Reconcile the three status color sources where cheap: pill accents now match the
`--admin-marker-*-accent` legend dots; leave `--admin-marker-*` token VALUES untouched (legend + dormant arm),
and leave the viewer status-bar dots (`--admin-status-ok/-warn`) for a future token pass (note in PR body).
Contrast check per `app/globals.css` comments: `#156045` on `#E8F3EC` and `#6D4712` on `#FCF0D9` are the
token-derived AA text pairs (they mirror `--admin-marker-assigned-text`/`--admin-marker-reserved-text` pairs).

- [ ] **1.2.3** `npm run lint && npm run typecheck && npm test` → PASS (marker tests pin structure, not colors).
Commit `design(markers): assigned/reserved pills legible at fit zoom — legend-matched tints`.

### Task 1.3 (PR 1): Marker dense tier + name nudges (render layer)

**Files:**
- Modify: `components/seat-map/SeatMarker.tsx` (new props `denseCode?: boolean`, `nameNudge?: -1|0|1`)
- Modify: `components/seat-map/SeatMap.tsx:2131 area + 858-875 + 2795-2825` (compute tiers/nudges, pass props)
- Modify: `components/seat-map/ViewerSeatFinder.tsx:124, 728-753` (same, default clearance)

**Steps:**

- [ ] **1.3.1** `SeatMarker`: when `denseCode && tokenMode === "code"` render the micro form:
`h-[18px] min-h-[18px] min-w-0 rounded-[7px] px-1 text-[8.5px]` (a further tier below `crowdedCode`; keep the
existing `group-hover:min-w-[96px]` hover disclosure so the full code is one hover away; aria-label already
carries the full seat info). When `tokenMode === "name"` and `nameNudge` is ±1, add `translate-y` on the TOKEN
(not the anchor): `-translate-y-[14px]` / `translate-y-[14px]`. The marker root keeps
`style={pointToStyle({ x: seat.x, y: seat.y })}` byte-identical (guardrail pin).

- [ ] **1.3.2** `SeatMap.tsx`: replace the `computeCrowdedSeatIds` call (2131) with `computeSeatDensityTiers`
(same clearance) → pass `crowdedCode={tiers.crowded.has(seat.id)}` `denseCode={tiers.dense.has(seat.id)}`.
Replace the inline name-collision calc (858-875) with `computeNameLabelNudges(visualLocalSeats, namedSeatIds,
clearanceFromScale(mapPixelsPerNormalizedUnit))` where `namedSeatIds` = seats that would render name-mode
(assigned + `showNames && !dimmed`, mirroring `namesVisible` in the marker); keep `compactNameLabel` behavior
(pass `compactNameLabel={nudges.has(seat.id) && nudges.get(seat.id) !== 0}` OR keep the old threshold calc if
strictly narrower — implementer picks the simpler equivalent and documents it in the PR).
Pass `nameNudge={nudges.get(seat.id) ?? 0}`.

- [ ] **1.3.3** `ViewerSeatFinder.tsx:124`: `computeSeatDensityTiers(visualSeats)` → pass both props (viewer has
no Show-names, so nudges only apply to search-prominent pills — pass nudges computed over
`searchResults.resultSeatIds` as the named set).

- [ ] **1.3.4** `npm run lint && npm run typecheck && npm test && npm run build` → PASS. Commit
`fix(markers): dense-tier micro pills + collision nudges for name labels`.

**PR 1 scope note:** do NOT add a viewer Show-names toggle (owner previously rejected a viewer-directory
concept; the map-toggle variant needs an explicit owner call — record in PR body as a follow-up question).
