# Plan 004: Fix the South Offices zone rectangle (visual-space frame + wall coverage)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3119e16..HEAD -- lib/seatZones.ts lib/officeRoomWash.ts tests/seat-zones.test.mjs app/actions.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW-MED (changes which map clicks resolve to the zone — needs a visual sanity check)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3119e16`, 2026-07-24

## Why this matters

The South Offices zone rectangle (added for the bottom-band offices, owner request 2026-07-23) is documented as **saved-coordinate** bounds, but the detection function that consumes it is fed **visual-space** points, and every other rectangle in the same table is visual-space. Two consequences follow from the frame mismatch and the specific numbers chosen (`y` from 0.845 to 0.97):

1. **Under-coverage low in the rooms.** The measured room interiors run to visual `y ≈ 0.99` (`lib/officeRoomWash.ts` `OFFICE_ROOM_VISUAL_RECTS`: `yMax: 0.99`), but the zone rect stops at `0.97`. An "Add seat" click in the bottom ~2% of a room misses the rectangle, falls through to the ≤0.085-radius nearest-seat fallback, and — while the room is still empty — returns "none" and throws "Could not detect a zone for this location." That is the exact failure the zone was added to fix.
2. **Over-coverage above the rooms.** The band `y` from 0.845 to ~0.921 sits *above* both room interiors (which start at `yMin: 0.921`). A corridor click there is zoned "South Offices", gets an `S##` label, and renders as a door-plate nameplate — a phantom office seat in the hallway.

The wrong "saved coordinates" comment also guarantees the next person who adds a zone repeats the frame error. The zone table and the room-wash table are two views of the same physical rooms; this plan re-derives the zone rect from the measured room rects (with wall slack) and corrects both misleading comments.

## Current state

- `lib/seatZones.ts:22-44` — `SEAT_ZONE_RECTS`. All entries are visual-space `[0,1]` bounds (North Pod `x 0.3–0.51`, Center Desks `x 0.42–0.61`, etc.). The last entry and its comment:
  ```ts
    // Bottom-band offices (owner request 2026-07-23): the two rooms along the
    // map's lower edge. Bounds are SAVED coordinates, measured on the floor
    // plan and converted visual->saved through the calibration transform.
    { zone: "South Offices", xMin: 0.06, xMax: 0.43, yMin: 0.845, yMax: 0.97 }
  ];
  ```
- `app/actions.ts:239-243` — the consumer proves the frame is visual:
  ```ts
  const visualPoint = input.visualX === undefined || input.visualY === undefined
    ? savedPointToVisualPoint(point)
    : validateSeatCoordinates(input.visualX, input.visualY);
  let draftSeats = await getDraftSeatZoneSources(supabase);
  const zoneResult = detectSeatZoneForPointResult(visualPoint, seatsToVisualSeats(draftSeats));
  ```
  `detectSeatZoneForPointResult` (`lib/seatZones.ts:81`) calls `inferSeatZoneFromPointResult` (`:60`), which tests the raw point against `SEAT_ZONE_RECTS` with `pointIsInsideSeatZone`. So the rect is compared against a **visual** point.
- `lib/officeRoomWash.ts:20-29` — the measured room interiors (visual space, explicitly), the two bottom rooms being:
  ```ts
    { key: "south-office-1", xMin: 0.118, xMax: 0.223, yMin: 0.921, yMax: 0.99 },
    { key: "south-office-2", xMin: 0.227, xMax: 0.425, yMin: 0.921, yMax: 0.99 }
  ```
  and its header comment says the room rects are VISUAL-space and that the zone band is "saved space" — the same mistaken belief; `:10-12` even says "Never derive one set from the other," which is what created the drift.
- `lib/seatZones.ts:68` — `getSeatZone(seat)` returns `seat.zone ?? seat.department ?? null` (used only by the nearest-seat fallback, not the rect path).
- `tests/seat-zones.test.mjs:135-144` — the existing South Offices test asserts detection at two room-center points and non-bleed into West Pod (`0.2, 0.8`) and Southeast Office (`0.7, 0.88`). It also comments the centers as "converted visual->saved", inheriting the same wrong frame language.
- `tests/seat-zones.test.mjs:112-133` — a structural test asserting the per-zone rectangle *counts* (South Offices: 1) and that every rect has `0 <= xMin <= xMax <= 1` and same for y. If you keep South Offices as a single rectangle, the count stays 1 and this test needs no change.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Install   | `npm install`       | exit 0 (`npm install`, not `npm ci`) |
| One file  | `node --test tests/seat-zones.test.mjs` | all pass (fast loop) |
| Tests     | `npm test`          | all pass (~400; 4-file local-env flake caveat as in the other plans) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint      | `npm run lint`      | exit 0 |

## Suggested executor toolkit

- Load the `run-seat-planner` skill and boot the app to *visually* confirm the new rect: in Add-seat mode, clicking anywhere inside either bottom room (including near the bottom wall) must resolve to "South Offices", and clicking in the corridor above the rooms must NOT. Build/typecheck/tests passing is not visual verification for a geometry change.

## Scope

**In scope**:
- `lib/seatZones.ts` (the one rect + its comment)
- `lib/officeRoomWash.ts` (comment correction only — do NOT change the room rect numbers)
- `tests/seat-zones.test.mjs` (extend + fix comment)

**Out of scope** (do NOT touch):
- The calibration transform (`lib/mapLayoutTransform.ts`) and its constants — the fix is a coordinate re-measure in the existing visual frame, not a recalibration.
- `OFFICE_ROOM_VISUAL_RECTS` numeric values — they are prod-verified for the wash and marker-plate layout; only their header comment is in scope.
- Any other zone rectangle.

## Git workflow

- Branch: `advisor/004-south-offices-zone-rect`
- Commit style: conventional (e.g. `fix(zones): South Offices rect is visual-space and covers both room walls`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-derive the rect from the measured rooms

Replace the South Offices entry in `lib/seatZones.ts` with a visual-space rectangle that covers both bottom rooms plus symmetric wall slack. Derive it from `OFFICE_ROOM_VISUAL_RECTS` south rooms (`x 0.118–0.223` and `x 0.227–0.425`, `y 0.921–0.99`): union is `x 0.118–0.425`, `y 0.921–0.99`. Add ~0.03 x-slack and ~0.02 top-slack so wall-edge clicks land, and extend `yMax` to 1.0 (the map's bottom edge) so no click low in a room misses:

```ts
  // Bottom-band offices (owner request 2026-07-23; frame corrected 2026-07-24):
  // one rectangle over the two rooms along the map's lower edge. Bounds are
  // VISUAL coordinates (like every other rect here) — detectSeatZoneForPoint is
  // fed a visual point (see app/actions.ts). Derived from the two south rooms in
  // OFFICE_ROOM_VISUAL_RECTS (lib/officeRoomWash.ts) with wall slack so clicks
  // anywhere inside either room, including the bottom wall, resolve here.
  { zone: "South Offices", xMin: 0.085, xMax: 0.455, yMin: 0.9, yMax: 1 }
```

Confirm the non-bleed constraints still hold with these numbers by checking the existing neighbours in the table: West Pod's lower rect is `y 0.7–0.83` (well above `0.9`), Southeast Office's rooms are all `x >= 0.65` (well right of `0.455`). So `{0.085–0.455, 0.9–1}` cannot overlap either — but verify by eye against the map in Step 4.

**Verify**: `node --test tests/seat-zones.test.mjs` → the existing South Offices test still passes (its center points `0.13,0.908` and `0.337,0.898` — note `0.908`/`0.898` are *below* the new `yMin: 0.9`!). **This is a real conflict**: see Step 2.

### Step 2: Reconcile the existing test's center points

The existing test (`tests/seat-zones.test.mjs:139-140`) asserts detection at `y 0.908` and `y 0.898`, which are *above* the new `yMin: 0.9`. Those points were measured against the old wrong frame. Re-point them to true room centers in the corrected visual frame — the room-interior y-midpoint is `(0.921 + 0.99) / 2 ≈ 0.955`:

```js
  // Room centers in VISUAL space (frame corrected 2026-07-24): midpoints of the
  // two south rooms in OFFICE_ROOM_VISUAL_RECTS.
  assert.equal(inferSeatZoneFromPoint({ x: 0.17, y: 0.955 }), "South Offices");   // south-office-1
  assert.equal(inferSeatZoneFromPoint({ x: 0.326, y: 0.955 }), "South Offices");  // south-office-2
  // Bottom-wall clicks must still resolve (the old rect stopped at 0.97).
  assert.equal(inferSeatZoneFromPoint({ x: 0.17, y: 0.985 }), "South Offices");
  // Must not bleed into neighbours.
  assert.equal(inferSeatZoneFromPoint({ x: 0.2, y: 0.8 }), "West Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.7, y: 0.88 }), "Southeast Office");
  // The corridor ABOVE the rooms must NOT be zoned (regression: old rect started at 0.845).
  assert.equal(inferSeatZoneFromPoint({ x: 0.25, y: 0.88 }), null);
```

The last assertion is the anti-regression for the over-coverage half of the bug; confirm `0.25, 0.88` is not inside any other rect (it isn't — nearest is West Pod lower at `y <= 0.83`).

**Verify**: `node --test tests/seat-zones.test.mjs` → all pass.

### Step 3: Correct the misleading comments

In `lib/officeRoomWash.ts` header (`:4-13`), fix the sentence that calls the `SEAT_ZONE_RECTS` band "saved space" — it is visual space. Keep the rest of that comment (the room rects being VISUAL and prod-verified is correct). Do not change any numbers in that file.

**Verify**: `grep -n "SAVED" lib/seatZones.ts lib/officeRoomWash.ts` → no matches referring to the zone band (the word may remain elsewhere if legitimately about saved coordinates — check each hit).

### Step 4: Visual confirmation

Boot the app (`run-seat-planner` skill), enter Add-seat mode, and verify by clicking: inside both bottom rooms including near the bottom wall → resolves to South Offices and Add proceeds; corridor above the rooms → no longer resolves to South Offices. Capture a screenshot for the PR.

**Verify**: manual — both behaviors as described; screenshot attached to your summary.

## Test plan

- Extended `tests/seat-zones.test.mjs` South Offices test: two room centers (corrected frame), a bottom-wall click, two non-bleed neighbours, and the corridor-null anti-regression.
- Verification: `node --test tests/seat-zones.test.mjs` then `npm test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test tests/seat-zones.test.mjs` exits 0 with the corridor-null assertion present (`grep -c "0.88" tests/seat-zones.test.mjs` ≥ 2)
- [ ] `grep -n "SAVED coordinates" lib/seatZones.ts` → no match (comment corrected)
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all exit 0
- [ ] `OFFICE_ROOM_VISUAL_RECTS` numeric values unchanged (`git diff lib/officeRoomWash.ts` shows only comment lines)
- [ ] Visual confirmation done (screenshot in summary)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The rect or the consumer in `app/actions.ts` no longer matches the excerpts (drift).
- The proposed rect overlaps another zone rectangle when you check (it should not; if it does, the neighbour bounds changed — report).
- Visual confirmation shows the new rect covering non-room floor area — the numbers need a re-measure against the actual image, which is a judgment call to escalate, not guess.
- The existing test's center points can't be reconciled because the rooms turn out to be elsewhere than `OFFICE_ROOM_VISUAL_RECTS` says.

## Maintenance notes

- The zone table (detection, wants wall slack) and `OFFICE_ROOM_VISUAL_RECTS` (wash/plate, hugs walls) remain two separate tables *by design* — but both are now honestly labeled visual-space and derived from the same measurements, so a future room addition updates both in the same frame.
- Reviewers should scrutinize the non-bleed assertions and the visual screenshot; a zone rect that is too generous silently mislabels corridor clicks, which is invisible to unit tests unless the specific corridor point is asserted.
- Follow-up deferred (recorded in `plans/README.md`): the whole "two rectangles for the same physical rooms" arrangement is a candidate for a single measured source; not in scope here.
