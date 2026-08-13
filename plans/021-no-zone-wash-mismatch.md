# Plan 021: Make the "No zone" chip's wash match the seats its filter keeps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 52b652f..HEAD -- lib/zoneWash.ts lib/viewerFindPalette.ts lib/seatFilters.ts tests/zone-wash.test.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `52b652f`, 2026-08-13

## Why this matters

A published seat with neither `zone` nor `department` gets a real "No zone"
chip in the viewer's Find palette and zone filter (the display fallback in
`lib/viewerFindPalette.ts`). Pinning that chip filters correctly — those
seats stay lit — but the zone wash box never appears: `lib/zoneWash.ts`
computes seat membership with the fallback `seat.zone ?? seat.department`
(no display fallback), so for those seats the key is `""` while the pinned
chip's key is `"no zone"`. Chip pressed, filter applied, no wash — the one
case where two consumers of "the zone key" disagree, which is exactly what
the shared `zoneKey` exists to prevent. Only fires when a published seat has
both columns null (possibly dormant in today's data), but the mechanism is
certain.

## Current state

- `lib/viewerFindPalette.ts` — the display fallback that creates the
  pinnable "No zone" pseudo-zone, lines 22–25:

```ts
/** A seat's zone, falling back the way the viewer has always displayed it. */
export function getSeatZone(seat: Pick<SeatWithEmployee, "zone" | "department">) {
  return seat.zone ?? seat.department ?? "No zone";
}
```

  The module's own contract comment (lines 27–34) says everything acting on
  a chip — "the pinned filter, the map's wash" — must compare on the shared
  `zoneKey`. The filter side honors it
  (`ViewerSeatFinder.tsx:288`: `zoneKey(getSeatZone(seat)) === zoneKey(zone)`);
  the wash side does not.

- `lib/zoneWash.ts` — the mismatched side. `buildZoneWash(zone, seats)`
  at lines 46–61 (excerpt):

```ts
export function buildZoneWash(zone: string | null | undefined, seats: ZoneWashSeat[]): ZoneWashRect | null {
  const washZone = zone?.trim();
  if (!washZone) return null;
  ...
  const washKey = zoneKey(washZone);
  ...
  for (const seat of seats) {
    if (zoneKey(seat.zone ?? seat.department) !== washKey) continue;
```

  It imports `zoneKey` from `@/lib/seatFilters` (line 14). Its doc comment
  (lines 40–45) says membership "mirrors the filter facet's own grouping
  (seat.zone ?? seat.department)" — written before the palette added the
  "No zone" display fallback; the comment needs updating with the fix.

- `lib/seatFilters.ts` — home of the shared `zoneKey` (normalize: trim +
  lowercase; read it before writing code). This is where the shared label
  constant should live (see Step 1) so `zoneWash` does not import from
  `viewerFindPalette` (keeps lib dependency direction simple).

- Known, deliberately NOT fixed here: the seat-zone fallback exists in ~6
  places with 3 different fallbacks (recorded as D-08 in `plans/README.md`).
  This plan fixes ONLY the chip↔wash disagreement; full consolidation is a
  separate, user-visible decision. Do not consolidate the other sites.

- Tests: `tests/zone-wash.test.mjs` exercises `buildZoneWash` directly
  (plain node:test on the lib). Model new cases on its existing tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install (if needed) | `npm install` | exit 0 (NOT `npm ci`) |
| Zone wash tests | `node --test tests/zone-wash.test.mjs` | all pass |
| Palette lib tests | `node --test tests/viewer-find-palette.test.mjs tests/viewer-seat-finder.test.mjs` | all pass (file names: verify with `ls tests/ | grep -i palette` — run whichever exist) |
| Typecheck | `npm run typecheck` | exit 0 |
| Full suite | `npm test` | ~1090 pass / 0 fail |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `lib/seatFilters.ts` (add one exported constant only)
- `lib/zoneWash.ts`
- `lib/viewerFindPalette.ts` (swap the literal for the constant only)
- `tests/zone-wash.test.mjs`

**Out of scope** (do NOT touch):
- The other seat-zone fallback sites (D-08): `lib/viewerSeatSearch.ts`,
  `components/seat-map/useSeatFilters.ts`, `AdminManagementPanel.tsx`,
  `lib/mapOperationsAgent.ts`, `SeatInspector.tsx`, `SeatMarker.tsx`,
  `lib/csv.ts`.
- Admin filter semantics: the admin surface groups no-zone seats under `""`
  and cannot pin a "No zone" option today — this plan must not change any
  admin-visible behavior.
- `lib/officeRoomWash.ts` — rooms, not zones.

## Git workflow

- Branch: `advisor/021-no-zone-wash-mismatch`
- Conventional commits (e.g. `fix(zone-wash): "No zone" pin lights its wash`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Export the display fallback label from `lib/seatFilters.ts`

Next to `zoneKey`, add:

```ts
/**
 * Display label for a seat with neither zone nor department. The viewer
 * palette synthesizes a pinnable chip from it, so every consumer that
 * compares against a pinned zone (the filter predicate, the wash) must
 * treat a null zone/department as THIS value — two spellings of the
 * fallback is how a chip ends up filtering seats its wash can't find.
 */
export const NO_ZONE_LABEL = "No zone";
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Use it in `lib/viewerFindPalette.ts`

Replace the literal in `getSeatZone`:

```ts
import { NO_ZONE_LABEL, zoneKey } from "@/lib/seatFilters";
...
export function getSeatZone(seat: Pick<SeatWithEmployee, "zone" | "department">) {
  return seat.zone ?? seat.department ?? NO_ZONE_LABEL;
}
```

(The file already imports `zoneKey` from `@/lib/seatFilters` — extend that
import.) No behavior change; byte-identical output.

**Verify**: `node --test` on the palette/viewer test files from the command
table → all pass.

### Step 3: Give `buildZoneWash` the same fallback

In `lib/zoneWash.ts`, import `NO_ZONE_LABEL` alongside `zoneKey` and change
the membership line:

```ts
    if (zoneKey(seat.zone ?? seat.department ?? NO_ZONE_LABEL) !== washKey) continue;
```

Update the function's doc comment (current lines 40–45): membership mirrors
the VIEWER filter's grouping — `seat.zone ?? seat.department ?? NO_ZONE_LABEL`
— so a pinned "No zone" chip lights exactly the seats its filter keeps.
Note in the comment why admin is unaffected: the admin surface groups
no-zone seats under `""` and never produces a "No zone" pin, and
`buildZoneWash("", ...)` still returns null via the `!washZone` guard.

**Verify**: `node --test tests/zone-wash.test.mjs` → existing tests still
pass (no existing test seeds a seat with BOTH columns null against a
"No zone" pin — if one does and now flips, STOP: the plan's assumption
about current coverage is wrong).

### Step 4: Pin the fix with tests

In `tests/zone-wash.test.mjs`, add (modeled on existing cases):

1. `"a pinned 'No zone' chip washes the seats with neither zone nor department"` —
   seats: two with `zone: null, department: null` at distinct x/y, one with
   `zone: "Ops"`. `buildZoneWash(NO_ZONE_LABEL, seats)` (import the
   constant) → non-null rect with `seatCount === 2`, bounds covering the two
   null-zone seats only.
2. `"the no-zone fallback matches on the shared key, not the spelling"` —
   `buildZoneWash("no ZONE", seats)` (case/pad variation) → same rect
   (zoneKey normalization applies to the fallback too).
3. `"an empty pin still returns null"` — `buildZoneWash("", seats)` and
   `buildZoneWash(null, seats)` → null (the admin path, unchanged).
4. Mutation check (manual, in this step's verify): revert Step 3's line,
   rerun, confirm test 1 FAILS; re-apply.

**Verify**: `node --test tests/zone-wash.test.mjs` → all pass including the
3 new tests; mutation check performed.

### Step 5: Full gate

**Verify**: `npm test` → 0 fail. `npm run typecheck` → exit 0.
`npm run lint` → exit 0.

## Test plan

Covered in Step 4. Lib-level tests only — the chip→pin→wash wiring in
`ViewerSeatFinder` is already covered by its component tests; the broken
link was inside `buildZoneWash`, which is where the tests go.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test tests/zone-wash.test.mjs` exits 0 with the 3 new tests
- [ ] `grep -c "No zone" lib/viewerFindPalette.ts` returns 0 hits as a string literal (the constant is imported instead; doc-comment mentions are fine — check with `grep -n '"No zone"' lib/viewerFindPalette.ts` → no matches)
- [ ] `grep -n "NO_ZONE_LABEL" lib/zoneWash.ts lib/seatFilters.ts lib/viewerFindPalette.ts` → present in all three
- [ ] `npm test` exits 0; `npm run typecheck` exits 0; `npm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt doesn't match the live code (drift).
- An EXISTING zone-wash or viewer test fails after Step 3 — that means some
  current consumer depends on no-zone seats being invisible to the wash;
  report which test and stop.
- You find the admin surface CAN pin a value whose `zoneKey` equals
  `"no zone"` (e.g. a zone option literally named "No zone") — the plan
  assumed it cannot; report before proceeding, because the fix would then
  make that admin pin wash the null-zone seats too.

## Maintenance notes

- This deliberately leaves D-08 (six fallback copies) open — record stays in
  `plans/README.md`. When D-08 is consolidated, `NO_ZONE_LABEL` is the
  constant the consolidation should rally around.
- Reviewer: confirm the doc-comment in `zoneWash.ts` was updated — the old
  text documents the pre-palette grouping and would mislead the next reader.
- Edge accepted: a real zone option named "No zone" would collide with the
  fallback chip (same key). That collision predates this fix (the palette
  already aggregates them) — not introduced here.
