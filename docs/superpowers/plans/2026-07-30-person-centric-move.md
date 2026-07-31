# Person-centric Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the seat-geometry Move (drag machinery, `moveSeatAction`, `seatMoves`, reset-position) and ship a person-centric Move: pick an occupant, click their new seat on the map, confirm — occupied destinations become a swap offer.

**Architecture:** Mirrors the existing Swap machinery one-for-one: verb on the canvas `SeatActionBar`, mode + confirm dialog + mutation in `SeatMap.tsx`, marker affordances in `SeatMarker.tsx`. Backend is untouched — the open-destination path calls the existing `updateSeatAction` with `forceMove: true` (the `update_draft_seat` RPC vacates the source seat atomically), the occupied-destination path calls the existing `swapSeatAssignmentsAction`.

**Tech Stack:** Next.js App Router client components, Supabase RPCs (existing only), Node test runner (`tests/*.test.mjs`), jsdom component tier (`npm run test:ct`), Playwright browser tier.

**Spec:** `docs/superpowers/specs/2026-07-30-person-move-design.md` — read it first.

## Global Constraints

- **No new RPCs, no migrations.** Backend = existing `update_draft_seat` (`force_move`) + `swap_draft_seat_assignments`.
- **Draft-layer only.** Every mutation stays on `layer = 'draft'`; nothing viewer-facing changes until publish.
- All new UI sits inside `canEdit` paths — viewers must never see any of it (`tests/accessibility-source.test.mjs` enforces).
- Every new modal dialog MUST pair all four: `role="dialog"`, `aria-modal="true"`, `ref={<x>DialogFocusRef}` from `useDialogFocus<HTMLElement>()`, `tabIndex={-1}` — the a11y source test counts these relationally and fails on any mismatch.
- Draft timestamps (`updated_at`) are forwarded **verbatim** — never through `new Date(...)` (drops microseconds, trips the concurrency fence).
- CI is disabled until 2026-08-01 — a PR with no checks is NOT a passing PR. Verify locally: `npm test` and `npm run test:ct` after every task.
- If `npm test` fails in login-form/rpc-execution/seat-inspector/seat-map-components with module-resolution errors, that's node_modules drift, not your change — run `npm install` (NOT `npm ci`; it EPERMs on this machine).
- Commit messages: conventional type, end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Local dev writes PRODUCTION.** Draft edits are safe; NEVER run publish from local. The manual verification task must undo its draft edits and must not publish.

## File Structure

| File | Responsibility in this work |
|---|---|
| `lib/seatDraftActions.ts` | + `vacateOtherSeatsForEmployee` (client-side mirror of the RPC's force-move vacate) |
| `tests/seat-move-employee.test.mjs` | new: behavior tests for the helper |
| `components/seat-map/SeatMap.tsx` | − geometry-move mode/drag/reset; + move-employee mode, confirm dialog, mutations |
| `components/seat-map/SeatInspector.tsx` | − `MOVE_UI_ENABLED` block, move props, reset-position button |
| `components/seat-map/SeatMarker.tsx` | − `moveSeatMode`/`dragging`/`onMovePointerDown`/`moveOrigin`; + `moveEmployeeMode`/`moveEmployeeSource` |
| `components/seat-map/ViewerSeatFinder.tsx` | − noop drag prop; + explicit `false` for the two new marker props |
| `components/seat-map/SeatActionBar.tsx` | + Move verb (occupied seats), docstring correction |
| `app/actions.ts` | − `moveSeatAction` + `MoveSeatResult` |
| `lib/publishSummary.ts` | − `seatMoves` category; position drift folds into `otherChanges` |
| tests (many, enumerated per task) | update pins; add new coverage |

Line numbers below are from the 2026-07-30 extraction pass — treat them as anchors, not gospel; they shift as tasks land. Symbol names are exact.

---

### Task 1: `vacateOtherSeatsForEmployee` helper (lib + tests)

> **SUPERSEDED (fix round 1, commit e5c4262):** the helper approach below shipped and was then replaced — client-spread rows keep stale `updated_at` and break undo with MLS02. The live design: `updateSeatAction` returns the fresh draft payload; both force-move consumers ingest `result.seats`/`result.employees`. Do not rebuild `vacateOtherSeatsForEmployee`; `tests/draft-concurrency.test.mjs` pins its absence.

**Files:**
- Modify: `lib/seatDraftActions.ts` (currently exports `canVacateSeat`, `vacateNeedsConfirmation`)
- Create: `tests/seat-move-employee.test.mjs`

**Interfaces:**
- Produces: `vacateOtherSeatsForEmployee(seats: SeatWithEmployee[], updatedSeat: SeatWithEmployee): SeatWithEmployee[]` — consumed by Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests.** Create `tests/seat-move-employee.test.mjs`. Copy the import prologue style from `tests/publish-summary.test.mjs` lines 1–4 verbatim (it loads a real `lib/*.ts` module via the repo's ts-import helper), pointing it at `lib/seatDraftActions.ts`. Then:

```js
test("vacateOtherSeatsForEmployee clears the employee's previous seat", () => {
  const updated = { id: "b", employee_id: "e1", employee: { id: "e1", full_name: "Alice" }, status: "assigned", label: "B01" };
  const seats = [
    { id: "a", employee_id: "e1", employee: { id: "e1", full_name: "Alice" }, status: "assigned", label: "A01" },
    { id: "c", employee_id: "e2", employee: { id: "e2", full_name: "Bo" }, status: "assigned", label: "C01" },
    updated
  ];
  const result = vacateOtherSeatsForEmployee(seats, updated);
  const byId = Object.fromEntries(result.map(seat => [seat.id, seat]));
  assert.equal(byId.a.employee_id, null);
  assert.equal(byId.a.employee, null);
  assert.equal(byId.a.status, "available");
  assert.equal(byId.c.employee_id, "e2", "other people's seats untouched");
  assert.equal(byId.b.employee_id, "e1", "the updated seat itself untouched");
});

test("vacateOtherSeatsForEmployee is a no-op when the updated seat is open", () => {
  const updated = { id: "b", employee_id: null, employee: null, status: "available", label: "B01" };
  const seats = [{ id: "a", employee_id: "e1", employee: { id: "e1", full_name: "Alice" }, status: "assigned", label: "A01" }, updated];
  assert.deepEqual(vacateOtherSeatsForEmployee(seats, updated), seats);
});
```

- [ ] **Step 2: Run to verify failure.** `node --test tests/seat-move-employee.test.mjs` — expect FAIL (export missing).
- [ ] **Step 3: Implement** in `lib/seatDraftActions.ts`:

```ts
/**
 * After a force_move commit, the update_draft_seat RPC has already vacated the
 * employee's other draft seat server-side. Mirror that locally: replacing only
 * the updated seat would leave the person visible on both seats until the next
 * full reload — and bake the double-assignment into the recorded undo snapshot.
 */
export function vacateOtherSeatsForEmployee(
  seats: SeatWithEmployee[],
  updatedSeat: SeatWithEmployee
): SeatWithEmployee[] {
  const employeeId = updatedSeat.employee_id;
  if (!employeeId) return seats;
  return seats.map(seat =>
    seat.id !== updatedSeat.id && seat.employee_id === employeeId
      ? { ...seat, employee_id: null, employee: null, status: "available" }
      : seat
  );
}
```

Add the `SeatWithEmployee` import if the file doesn't already have it. If `"available"` fails the `SeatStatus` union check, annotate `"available" as SeatStatus` (import the type).

- [ ] **Step 4: Run to verify pass.** `node --test tests/seat-move-employee.test.mjs` → PASS. Then `npm test` (coverage floors are scoped to `lib/**` — the new export needs its tests to keep funcs ≥ 95).
- [ ] **Step 5: Commit.** `feat(lib): add vacateOtherSeatsForEmployee for force-move reconciliation`

---

### Task 2: Dismantle the geometry-move UI

One atomic task: `SeatMarker`'s deleted props are required, so `SeatMap`/`ViewerSeatFinder` and `SeatMarker` must change in the same commit to compile. `moveSeatAction` stays in `app/actions.ts` until Task 3 (unused-but-exported is fine).

**Files:**
- Modify: `components/seat-map/SeatMap.tsx`, `components/seat-map/SeatInspector.tsx`, `components/seat-map/SeatMarker.tsx`, `components/seat-map/ViewerSeatFinder.tsx`
- Tests: `tests/seat-inspector.test.mjs`, `tests/seat-map-components.test.mjs`, `tests/seat-marker-memo.test.mjs`, `tests/desktop-seat-marker-system-source.test.mjs`, `tests/accessibility-source.test.mjs`, `tests/draft-concurrency.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SeatMarkerProps` WITHOUT `moveSeatMode`/`dragging`/`onMovePointerDown`; `SeatInspectorProps` WITHOUT `onStartMoveSeat`/`moveMode`/`canResetPosition`/`onResetPosition`; `latestSeatHandlers.current = { selectSeat }`.

- [ ] **Step 1: Update the pinning tests to the post-deletion state** (deletions invert TDD — pin the target state first):
  - `tests/draft-concurrency.test.mjs`: delete the whole test `"moveSeatAction fences the position write and SeatMap threads it on both move paths"` (lines 87–117). Leave the swap-fence test above it untouched.
  - `tests/desktop-seat-marker-system-source.test.mjs`: line 21 regex becomes `/markerUsesTrueCoordinate = addSeatMode \|\| swapMode/`; delete lines 25–30 (the drag-wiring comment + the `onMovePointerDown={stableMovePointerDown}` and `latestSeatHandlers.current.handleMovePointerDown` asserts).
  - `tests/seat-marker-memo.test.mjs`: delete the asserts at lines 79 (`onMovePointerDown={stableMovePointerDown}`), 81 (`NOOP_MOVE_POINTER_DOWN`), 89–93 (inline-arrow doesNotMatch for `onMovePointerDown`); line 100 becomes `assert.match(adminMapSource, /latestSeatHandlers\.current = \{ selectSeat \}/);`.
  - `tests/accessibility-source.test.mjs`:
    - line 75: the `indexOf` needle becomes `"if (addSeatMode || swapSourceSeatId)"`.
    - line 78 (`assert.match(source, /label: "Move seat"[\s\S]*exitLabel: "Exit move seat"/)`): DELETE (Task 5 adds the `"Move employee"` replacement).
    - line 381 (`requestInspectorGuard\(\{ kind: "start-move-seat" \}\)`): DELETE (Task 5 adds `start-move-employee`).
  - `tests/seat-inspector.test.mjs`: remove `onStartMoveSeat() {}` from the props at lines 98, 116, 122. In `"admin mode exposes the edit affordances"`, replace the MOVE_UI_ENABLED comment block + final assert with:

```js
  // Geometry move is RETIRED (owner call, 2026-07-30): seats never move,
  // people do. The person-centric Move lives on the canvas action bar.
  assert.equal(byLabelPrefix("Move seat"), null, "geometry move is retired");
  assert.equal(byLabelPrefix("Reset"), null, "reset-position went with it");
```

  - `tests/seat-map-components.test.mjs`: in `markerProps` delete the `moveSeatMode: false,`, `dragging: false,` and `onMovePointerDown() {},` defaults; delete the test `"move mode snaps the plate back to the true anchor (offset dropped, width kept)"` (lines 181–192 — Task 5 re-adds it for the new mode).

- [ ] **Step 2: `SeatInspector.tsx` deletions:** docstring+flag lines 87–111 (`MOVE IS HIDDEN…` through `const MOVE_UI_ENABLED = false;`); props `onStartMoveSeat?`/`moveMode?` (36–37) and `canResetPosition?`/`onResetPosition?` (38–41) with their comments; the matching destructuring entries (~264–265 plus the two reset entries); `handleStartMoveSeat` (862–865); the Move button block (1244–1254), the move-mode microcopy (1256–1260), and the reset-position button (1261–1272). Rewrite the action-row comment at 1212–1220 to current truth (assignment CTA + Status-for-open + Delete live here; the reseat verbs Move/Swap/Vacate live on the canvas `SeatActionBar`). Keep the Status select and Delete blocks byte-identical.
- [ ] **Step 3: `SeatMarker.tsx` deletions:** props `moveSeatMode` (31), `dragging` (44), `onMovePointerDown` (53) + their destructuring (146, 156, 163); `isMovable`/`moveOrigin` (180–181); drop `dragging` from `activeMarker` (183); remove the `moveOrigin` branch from `markerIntent` (213–214) and the `"move-origin"` member from the `MarkerIntent` type; drop `moveOrigin` from `statusToneClass` (247) and from line 308; delete the `moveOrigin` class block (314–317); delete the `onPointerDown` handler (442–445); cursor line 461 becomes `"cursor-pointer",`; delete the `dragging` z/scale class line (462); line 483 drops `!dragging &&`; aria template (465) drops the `${moveOrigin ? " Move origin. Drag to reposition." : ""}` segment; `markerUsesTrueCoordinate` (368) becomes `addSeatMode || swapMode`; rewrite the memo comment (590–597) — the memo stays (marker layer still re-renders wholesale on selection/notice state), only the drag rationale goes. `seatMarkerPropsEqual` needs NO edit (generic key loop).
- [ ] **Step 4: `ViewerSeatFinder.tsx`:** delete `NOOP_MOVE_POINTER_DOWN` (14–18, comment included) and the `onMovePointerDown={NOOP_MOVE_POINTER_DOWN}` prop (1145).
- [ ] **Step 5: `SeatMap.tsx` deletions** (spec extraction table — compiler-guided sweep after the list):
  - Import line 29: remove `moveSeatAction, ` (Task 3 deletes the export).
  - `DragState` type (117–121); `"start-move-seat"` union member (150); `moveSeatMode` state (345); `dragState` state (355).
  - Esc mode layer (851–859) becomes:

```ts
      if (addSeatMode || swapSourceSeatId) {
        const canceledMode = swapSourceSeatId ? "Swap" : "Add seat";
        setAddSeatMode(false);
        setSwapSourceSeatId(null);
        setActionNotice(`${canceledMode} canceled — no changes made.`, "neutral");
        return;
      }
```

  and drop `moveSeatMode` from the effect dep array (910).
  - `selectedSeatPublishedPosition` memo (1030–1039); every single-line `setMoveSeatMode(false)` / `setDragState(null)` (≈16 sites — grep them); `applyStartMoveSeatAction` (1231–1237); guard dispatcher arm (1282–1285); guard text arm (1345); pan guard 1677 → `if (canEdit && addSeatMode) return;`; the `!dragState` condition in `handleMapPointerDown`'s tail (2064–2072); `handleMovePointerDown` (2075–2081); in `latestSeatHandlers` keep only `{ selectSeat }` and delete `stableMovePointerDown` (2101–2112, keep `stableSelectSeat`); `handleMapPointerMove` (2114–2124); `handleMapPointerUp` (2126–2171); `resetSeatPositionToPublished` (2173–2212); the `activeMode` "Move seat" branch (2416–2425); the move-mode comment (2444–2446); `dragSeatId` (2583) + its nudge exclusion (2597, 2601); office wash line 2622 becomes `draggingSeatId: null` (the lib keeps its param; its tests call it directly); map-frame `onPointerMove`/`onPointerUp`/`onPointerCancel` attributes (3405–3410 — KEEP `onPointerDown={handleMapPointerDown}`, add-seat uses it); marker comment 3461 ("move/add/swap" → "add/swap"); SeatMarker props `moveSeatMode`/`dragging`/`onMovePointerDown` (3478, 3486, 3498); SeatInspector props `onStartMoveSeat`/`moveMode`/`canResetPosition`/`onResetPosition` (3954–3964).
- [ ] **Step 6: Compile + test.** `npx tsc --noEmit` until clean (it will find every missed site), then `npm test` and `npm run test:ct`. Expected: all pass.
- [ ] **Step 7: Commit.** `feat(seat-map): retire the seat-geometry move machinery`

---

### Task 3: Delete `moveSeatAction`

**Files:**
- Modify: `app/actions.ts:308-354` (delete `MoveSeatResult` + `moveSeatAction`; keep `validateSeatCoordinates` — `createSeatAction` uses it)
- Tests: `tests/seat-creation-ui-source.test.mjs`, `tests/map-operations-agent.test.mjs`, `tests/accessibility-source.test.mjs`, `tests/helpers/renderComponent.mjs`, `tests/browser/build-harness.ts`

- [ ] **Step 1: Update pins:**
  - `tests/seat-creation-ui-source.test.mjs`: delete the whole test `"move-seat action updates one draft seat without publishing"` (37–47); re-anchor line 27's extraction regex end from `export async function moveSeatAction` to `export async function updateSeatAction`.
  - `tests/map-operations-agent.test.mjs:1000` and `tests/accessibility-source.test.mjs:19`: remove `moveSeatAction|` from both `doesNotMatch` alternations (they'd still pass, but a dead symbol in a guard regex is noise).
  - `tests/helpers/renderComponent.mjs:78` and `tests/browser/build-harness.ts:22`: remove the `"moveSeatAction",` entry from both `ACTION_EXPORTS` lists.
- [ ] **Step 2: Delete** `MoveSeatResult` + `moveSeatAction` from `app/actions.ts` (lines 308–354).
- [ ] **Step 3: Verify.** `npx tsc --noEmit`, `npm test`, `npm run test:ct` → all pass.
- [ ] **Step 4: Commit.** `feat(actions): delete moveSeatAction — seats never move, people do`

---

### Task 4: Retire `seatMoves`; position drift folds into `otherChanges`

Coordinate drift stays possible (snapshot restore, legacy JSON snapshots), so the position comparison survives — it just reports into `otherChanges` instead of its own category. The publish review must never silently publish a position change.

**Files:**
- Modify: `lib/publishSummary.ts`, `components/seat-map/SeatMap.tsx`
- Tests: `tests/publish-summary.test.mjs`, `tests/accessibility-source.test.mjs`

- [ ] **Step 1: Update tests first.** In `tests/publish-summary.test.mjs` (test `"publish summary classifies reliable draft-vs-published categories"`), line 88 currently `assert.deepEqual(summary.seatMoves.map(item => item.label), ["W03"]);` — delete it, and change the `otherChanges` expectation (line 90) to include W03: `assert.deepEqual(summary.otherChanges.map(item => item.label), ["W03", "W05"]);` (`sortItems` orders by label; W03 < W05 holds). `updatedSeatCount` stays 6 — `updatedSeatKeys` is unchanged. In `tests/accessibility-source.test.mjs`, delete line 227 (`assert.match(source, /Seat moves\/layout changes/);`).
- [ ] **Step 2: Run** `node --test tests/publish-summary.test.mjs` → FAIL (still reports under seatMoves).
- [ ] **Step 3: `lib/publishSummary.ts`:** remove `seatMoves: PublishChangeItem[];` from `PublishChangeSummary` (27); delete the accumulator (166) and the `seatMoves: sortItems(seatMoves),` return entry (222); rewrite the move branch (188–191) to:

```ts
    if (hasSeatMoved(draftSeat, publishedSeat)) {
      // The geometry-move UI is retired (2026-07-30), but snapshot restore and
      // legacy JSON snapshots can still shift coordinates — surface the drift
      // rather than silently publishing it.
      updatedSeatKeys.add(key);
      otherChanges.push({ label: draftSeat.label, detail: `position ${formatPoint(publishedSeat)} -> ${formatPoint(draftSeat)}` });
    }
```

Keep `COORDINATE_EPSILON`, `hasSeatMoved`, `formatPoint`, `formatCoordinate`. (A seat with both a field diff and a position diff yields two `otherChanges` entries with the same label — acceptable; the key Set dedupes the counts.)
- [ ] **Step 4: `SeatMap.tsx`:** remove `...publishSummary.seatMoves,` from `draftChangedSeatLabelSet` (991 — drift now arrives via `otherChanges`, already in the list); delete `publishLayoutChangeCount` (2401) and whatever consumes it (`npx tsc --noEmit` names the consumers — delete the layout-count UI line(s) with it); delete the `PublishChangeList title="Seat moves/layout changes"` row (3791).
- [ ] **Step 5: Verify.** `npm test`, `npm run test:ct` → pass. Note the server-side `compute_publish_change_summary` SQL keeps its own `'seats_moved'` category — deliberately untouched (publish history is historical; no migrations in scope).
- [ ] **Step 6: Commit.** `feat(publish-summary): retire seatMoves — position drift reports as other change`

---

### Task 5: Person-centric Move — bar verb, mode, dialog, mutations

The big one; it transplants the Swap organism. Read `SeatMap.tsx`'s swap machinery (search `swapSourceSeatId`) before starting — every addition below has a swap twin to sit next to.

**Files:**
- Modify: `components/seat-map/SeatActionBar.tsx`, `components/seat-map/SeatMap.tsx`, `components/seat-map/SeatMarker.tsx`, `components/seat-map/ViewerSeatFinder.tsx`
- Tests: `tests/accessibility-source.test.mjs`, `tests/seat-map-components.test.mjs`

**Interfaces:**
- Consumes: `vacateOtherSeatsForEmployee` (Task 1), `updateSeatAction` (existing, `app/actions.ts:361` — note the exact name, NOT `updateDraftSeatAction`), `swapSeatAssignmentsAction` (existing), `canVacateSeat`, `formatDisplayName`/`formatSeatCode` (already imported in SeatMap), `PUBLISH_IMPACT_NOTE`, `seatPersonLabel`/`buildSwapSummary` (existing in SeatMap).
- Produces: `SeatActionBarProps.onMove: () => void`; `SeatMarkerProps.moveEmployeeMode: boolean` + `moveEmployeeSource: boolean`; guard kind `"start-move-employee"`.

- [ ] **Step 1: Failing a11y pins first.** In `tests/accessibility-source.test.mjs`: next to the Add/Swap mode asserts (~78–79) add `assert.match(source, /label: "Move employee"[\s\S]*exitLabel: "Exit move employee"/);`; next to the surviving guard-arm asserts (~380) add `assert.match(source, /requestInspectorGuard\(\{ kind: "start-move-employee" \}\)/);`. Run `node --test tests/accessibility-source.test.mjs` → FAIL.
- [ ] **Step 2: `SeatActionBar.tsx`.** Replace the docstring's `MOVE IS ABSENT: seats never move, people do.` paragraph with: `MOVE RELOCATES THE OCCUPANT, never the seat: the app is person > action. Seat geometry is fixed — the 2026-07-30 owner call retired the drag machinery outright.` Add to props (after `onAssign`):

```ts
  /** Starts move-employee mode: pick the occupant's new seat on the map. */
  onMove: () => void;
```

Destructure `onMove`. Give action entries an optional aria override — the button's label line (118) becomes `aria-label={seat ? action.aria ?? `${action.verb} ${seat.label}` : undefined}` — and extend the occupied list (Move first, so `firstActionRef` lands keyboard users on it):

```ts
    ? [
        { key: "move", label: "Move", verb: "Move", onClick: onMove, tone: "default" as const, aria: occupantName ? `Move ${occupantName} to another seat` : undefined },
        { key: "swap", label: "Swap", verb: "Swap", onClick: onSwap, tone: "default" as const },
        // Opens a confirm every time — see onVacate's contract.
        { key: "vacate", label: "Vacate", verb: "Vacate", onClick: onVacate, tone: "danger" as const }
      ]
```

(If `tsc` complains about the missing `aria` key on the other entries, type the array element as `{ …; aria?: string }` rather than adding `aria: undefined` everywhere.)
- [ ] **Step 3: `SeatMap.tsx` mode machinery.** Each item mirrors its swap twin, placed adjacent to it:
  - Module types: `type MoveEmployeeConfirmState = { targetSeatId: string; offerSwap: boolean } | null;` next to `SwapConfirmState`; add `| { kind: "start-move-employee" }` to `InspectorGuardAction`.
  - State (next to swap's): `moveEmployeeSourceSeatId` / `moveEmployeeConfirm` useStates, `const moveEmployeeConfirmDialogFocusRef = useDialogFocus<HTMLElement>();`
  - Derived (next to 1040): `moveEmployeeSourceSeat`, `moveEmployeeTargetSeat` (find by `moveEmployeeConfirm.targetSeatId`).
  - Functions (exact code):

```ts
  function applyStartMoveEmployeeAction() {
    if (!selectedSeat || !canVacateSeat(selectedSeat)) {
      setActionError("Select an occupied seat first, then choose Move.");
      setActionNotice(null);
      return;
    }
    setActionError(null);
    setActionNotice(null);
    setInspectorDirty(false);
    setAddSeatMode(false);
    setSwapConfirm(null);
    setSwapSourceSeatId(null);
    setMoveEmployeeConfirm(null);
    setMoveEmployeeSourceSeatId(selectedSeat.id);
    setInspectorCollapsed(true);
  }

  function startMoveEmployeeMode(skipDirtyCheck = false) {
    if (!canEdit) return;
    if (!selectedSeat || !canVacateSeat(selectedSeat)) {
      setActionError("Select an occupied seat first, then choose Move.");
      setActionNotice(null);
      return;
    }
    if (!skipDirtyCheck && inspectorDirty) {
      requestInspectorGuard({ kind: "start-move-employee" });
      return;
    }
    applyStartMoveEmployeeAction();
  }

  function cancelMoveEmployeeMode() {
    setMoveEmployeeSourceSeatId(null);
    setMoveEmployeeConfirm(null);
    setInspectorCollapsed(false);
    setActionNotice("Move canceled — no changes made.", "neutral");
  }

  function requestMoveEmployeeTarget(targetSeatId: string) {
    if (!moveEmployeeSourceSeatId) return false;
    if (targetSeatId === moveEmployeeSourceSeatId) {
      // Spec: clicking the person's own seat backs out of the move.
      cancelMoveEmployeeMode();
      return true;
    }
    const sourceSeat = localSeats.find(seat => seat.id === moveEmployeeSourceSeatId) ?? null;
    const targetSeat = localSeats.find(seat => seat.id === targetSeatId) ?? null;
    if (!sourceSeat?.employee || !targetSeat) {
      setActionError("Could not find both seats for the move.");
      return false;
    }
    setActionError(null);
    setActionNotice(null);
    setMoveEmployeeConfirm({ targetSeatId: targetSeat.id, offerSwap: Boolean(targetSeat.employee_id) });
    return true;
  }
```

  - Guard arms (next to swap's): dispatcher `if (action.kind === "start-move-employee") { applyStartMoveEmployeeAction(); return; }`; describe `if (action.kind === "start-move-employee") return "starting move-employee mode.";`
  - `commitSeatSelection`: insert BEFORE the swap branch: `if (canEdit && moveEmployeeSourceSeatId) { return requestMoveEmployeeTarget(seatId); }`
  - Esc handler: dialog layer (next to `if (swapConfirm)`) add `if (moveEmployeeConfirm) { setMoveEmployeeConfirm(null); return; }`; mode layer condition becomes `if (addSeatMode || swapSourceSeatId || moveEmployeeSourceSeatId)`, label `swapSourceSeatId ? "Swap" : moveEmployeeSourceSeatId ? "Move" : "Add seat"`, add `setMoveEmployeeSourceSeatId(null);`. Add both new states to the effect dep array.
  - Every site that clears swap state clears move state too (grep `setSwapSourceSeatId(null)` — applyCloseInspector/applyClearSelection/applyStartAddSeat/applyRestoredDraftPayload/handleStaleDraft/delete-seat success/`commitSeatSelection`'s deselect+reselect branches): add `setMoveEmployeeSourceSeatId(null); setMoveEmployeeConfirm(null);` alongside. `applyStartSwapSeatAction` also clears move state (the mirror of what `applyStartMoveEmployeeAction` does to swap).
  - Pointer guards: extend the two `if (swapSourceSeatId)` stationary-press guards (≈1719, ≈2059) to `if (swapSourceSeatId || moveEmployeeSourceSeatId)`.
  - Notice suppression (≈3242): `{actionNotice && !swapSourceSeatId && !moveEmployeeSourceSeatId && (`; inspector dock tier (≈2457) and mobile surface (≈2483): add the move-mode analogues next to their swap terms.
  - `activeMode`: insert before the swap branch:

```ts
      : moveEmployeeSourceSeat
        ? {
          label: "Move employee",
          message: `Moving ${seatPersonLabel(moveEmployeeSourceSeat)} from ${moveEmployeeSourceSeat.label}. Select the destination seat.`,
          exitLabel: "Exit move employee",
          onExit: cancelMoveEmployeeMode
        }
```

  - Marker props (marker map loop): `moveEmployeeMode={Boolean(moveEmployeeSourceSeatId)}` and `moveEmployeeSource={seat.id === moveEmployeeSourceSeatId}`; nudge-exclusion set adds `moveEmployeeSourceSeatId` and `moveEmployeeConfirm?.targetSeatId`; office wash line ≈2621 becomes `swapMode: Boolean(swapSourceSeatId || moveEmployeeSourceSeatId),` (the lib param means "targeting mode active"); SeatInspector's `swapMode` prop becomes `swapMode={Boolean(swapSourceSeatId || moveEmployeeSourceSeatId)}` (that prop only suppresses the collapsed pill during targeting).
  - Bar wiring: `onMove={() => startMoveEmployeeMode()}` on `<SeatActionBar`.

> **SUPERSEDED (fix round 1, commit e5c4262):** the helper approach below shipped and was then replaced — client-spread rows keep stale `updated_at` and break undo with MLS02. The live design: `updateSeatAction` returns the fresh draft payload; both force-move consumers ingest `result.seats`/`result.employees`. Do not rebuild `vacateOtherSeatsForEmployee`; `tests/draft-concurrency.test.mjs` pins its absence.

- [ ] **Step 4: `SeatMap.tsx` mutations.** Add `updateSeatAction` to the import from `@/app/actions` and `vacateOtherSeatsForEmployee` to the `@/lib/seatDraftActions` import. Refactor `confirmSwapSeats` into a parameterized core (identical body, only the seat-id source changes) and add the two move confirms:

```ts
  function executeSwap(sourceSeatId: string, targetSeatId: string) {
    // Body = the current confirmSwapSeats from `const sourceSeat = …` down,
    // with swapConfirm.sourceSeatId/targetSeatId replaced by the parameters,
    // and the success block additionally clearing move state:
    //   setMoveEmployeeSourceSeatId(null); setMoveEmployeeConfirm(null);
  }

  function confirmSwapSeats() {
    if (!swapConfirm) return;
    executeSwap(swapConfirm.sourceSeatId, swapConfirm.targetSeatId);
  }

  function confirmMoveEmployeeAsSwap() {
    if (!moveEmployeeConfirm?.offerSwap || !moveEmployeeSourceSeatId) return;
    const targetSeatId = moveEmployeeConfirm.targetSeatId;
    const sourceSeatId = moveEmployeeSourceSeatId;
    setMoveEmployeeConfirm(null);
    setMoveEmployeeSourceSeatId(null);
    executeSwap(sourceSeatId, targetSeatId);
  }

  function confirmMoveEmployeeToOpenSeat() {
    if (!moveEmployeeConfirm || moveEmployeeConfirm.offerSwap) return;
    const sourceSeat = moveEmployeeSourceSeat;
    const targetSeat = localSeats.find(seat => seat.id === moveEmployeeConfirm.targetSeatId) ?? null;
    const mover = sourceSeat?.employee ?? null;
    if (!sourceSeat || !targetSeat || !mover) {
      setActionError("Could not find both seats for the move.");
      setMoveEmployeeConfirm(null);
      return;
    }
    const beforeSnapshot = captureDraftSnapshot();
    const moveLabel = `Move ${mover.full_name} to ${targetSeat.label}`;
    setMoveEmployeeConfirm(null);
    startTransition(async () => {
      setMutationInFlight(true);
      try {
        setActionError(null);
        setActionNotice(null);
        setStaleDraftNotice(null);
        const result = await updateSeatAction({
          seatId: targetSeat.id,
          label: targetSeat.label,
          status: "assigned",
          employeeId: mover.id,
          employeeName: mover.full_name,
          // Position/extension omitted on purpose: absent fields are
          // "not provided" to the RPC, which preserves stored values.
          department: mover.department ?? null,
          zone: targetSeat.zone ?? null,
          notes: targetSeat.notes ?? null,
          forceMove: true,
          // Fence on the DESTINATION row; the RPC vacates the source atomically.
          expectedUpdatedAt: targetSeat.updated_at
        });
        if (!result.ok) {
          if (result.code === "STALE_DRAFT") {
            handleStaleDraft(result.message);
            return;
          }
          setActionNotice(null);
          setActionError(result.message);
          return;
        }
        // The RPC vacated the source server-side; mirror it locally so the map
        // and the recorded undo snapshot match the database.
        const afterSeats = replaceSeat(vacateOtherSeatsForEmployee(beforeSnapshot.seats, result.seat), result.seat);
        recordDraftHistory(moveLabel, beforeSnapshot, afterSeats, beforeSnapshot.employees);
        setLocalSeats(afterSeats);
        setSelectedSeatId(targetSeat.id);
        setInspectorDirty(false);
        setMoveEmployeeSourceSeatId(null);
        setInspectorCollapsed(false);
        setActionNotice(`Moved ${formatDisplayName(mover.full_name)} to ${targetSeat.label}.`);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not move the employee.");
      } finally {
        setMutationInFlight(false);
      }
    });
  }
```

If `Employee` has no `department` field, `tsc` flags it — fall back to `department: sourceSeat.department ?? null` (seats carry a legacy department column; `getSeatZone` reads it).
- [ ] **Step 5: Dialog JSX.** After the swap confirm dialog, same shell (copy its wrapper `div` and `section` classNames verbatim; all four a11y requirements present):

```tsx
      {moveEmployeeConfirm && moveEmployeeSourceSeat?.employee && moveEmployeeTargetSeat && (
        <div className={/* swap dialog wrapper classes, verbatim */}>
          <section
            ref={moveEmployeeConfirmDialogFocusRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-employee-map-confirm-title"
            aria-describedby="move-employee-map-confirm-description"
            className={/* swap dialog section classes, verbatim */}
          >
            {moveEmployeeConfirm.offerSwap ? (
              <>
                <h2 id="move-employee-map-confirm-title" className="text-base font-semibold">
                  Swap {formatDisplayName(moveEmployeeSourceSeat.employee.full_name)} and {formatDisplayName(seatPersonLabel(moveEmployeeTargetSeat))}?
                </h2>
                <p id="move-employee-map-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
                  {formatDisplayName(seatPersonLabel(moveEmployeeTargetSeat))} already sits at {formatSeatCode(moveEmployeeTargetSeat.label)}. Swapping moves them to {formatSeatCode(moveEmployeeSourceSeat.label)}. {PUBLISH_IMPACT_NOTE}
                </p>
                <div className="mt-4 rounded-xl border border-[var(--admin-publish-viewer-impact-border)] bg-[var(--admin-publish-viewer-impact-bg)] p-3 text-sm font-semibold text-[var(--admin-publish-viewer-impact-text)]">
                  {buildSwapSummary(moveEmployeeSourceSeat, moveEmployeeTargetSeat)}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button type="button" onClick={() => setMoveEmployeeConfirm(null)} disabled={pending} className="w-full">Cancel</Button>
                  <Button type="button" variant="primary" onClick={confirmMoveEmployeeAsSwap} disabled={pending} className="w-full">Swap them</Button>
                </div>
              </>
            ) : (
              <>
                <h2 id="move-employee-map-confirm-title" className="text-base font-semibold">
                  Move {formatDisplayName(moveEmployeeSourceSeat.employee.full_name)} to {formatSeatCode(moveEmployeeTargetSeat.label)}?
                </h2>
                <p id="move-employee-map-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
                  They currently sit at {formatSeatCode(moveEmployeeSourceSeat.label)}. Moving frees {formatSeatCode(moveEmployeeSourceSeat.label)} (it becomes Open). {PUBLISH_IMPACT_NOTE}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button type="button" onClick={() => setMoveEmployeeConfirm(null)} disabled={pending} className="w-full">Cancel</Button>
                  <Button type="button" variant="primary" onClick={confirmMoveEmployeeToOpenSeat} disabled={pending} className="w-full">Move them</Button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
```

- [ ] **Step 6: `SeatMarker.tsx` affordances.** Add required props (after the swap fields, matching their comment style): `moveEmployeeMode: boolean;` and `moveEmployeeSource: boolean;` + destructuring. Then: `const moveCandidate = canEdit && moveEmployeeMode && !moveEmployeeSource && !invalidTarget;`; `activeMarker` adds `|| moveEmployeeSource`; `plannerHighlighted` adds `&& !moveEmployeeSource`; `markerIntent` head becomes `swapSource || moveEmployeeSource ? "swap-source"` and the candidate arm `swapCandidate || moveCandidate ? "target-valid"`; `validTargetTone` becomes `(swapCandidate || moveCandidate) && !searchProminent && !plannerHighlighted`; the swap-source class line (341) condition becomes `swapSource || moveEmployeeSource ?` (shared green treatment); the hover-ring line (344) becomes `(swapMode && !swapSource) || (moveEmployeeMode && !moveEmployeeSource) ?`; `markerUsesTrueCoordinate` becomes `addSeatMode || swapMode || moveEmployeeMode`; the aria template adds `${moveEmployeeSource ? " Move source." : ""}${moveCandidate ? " Valid destination seat." : ""}` after the swapCandidate segment. `ViewerSeatFinder.tsx` passes `moveEmployeeMode={false} moveEmployeeSource={false}` at its SeatMarker call site.
- [ ] **Step 7: Component-tier tests.** In `tests/seat-map-components.test.mjs`: add `moveEmployeeMode: false,` and `moveEmployeeSource: false,` to `markerProps` defaults; add:

```js
test("move-employee mode snaps the plate back to the true anchor", async () => {
  const officeSeat = makeSeat({ id: "s7", seat_key: "s01", label: "S01", zone: "South Offices" });
  await renderElement(React.createElement(SeatMarker, markerProps(officeSeat, {
    moveEmployeeMode: true,
    officePlateOffsetXPx: 20,
    officePlateOffsetYPx: -10,
    officePlateWidthPx: 120
  })));
  const token = document.querySelector("button > span");
  assert.ok(!/calc\(50% \+ 20px\)/.test(token.getAttribute("style") ?? ""), "offset dropped in move mode");
  assert.match(token.getAttribute("style") ?? "", /width: 120px/, "width still room-fitted");
});

test("move-employee source and candidates announce themselves", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { canEdit: true, moveEmployeeMode: true, moveEmployeeSource: true })));
  assert.match(document.querySelector("button").getAttribute("aria-label") ?? "", / Move source\./);
  cleanup();
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { canEdit: true, moveEmployeeMode: true })));
  assert.match(document.querySelector("button").getAttribute("aria-label") ?? "", / Valid destination seat\./);
});
```

Then check whether a SeatActionBar test exists (`grep -l SeatActionBar tests/*.test.mjs`). If yes, extend it; if no, add to `seat-map-components.test.mjs` (the bar is presentational and jsdom-safe — load it via the same `loadComponent`):

```js
test("occupied seats expose Move · Swap · Vacate on the canvas bar", async () => {
  const seat = makeSeat({ status: "assigned", employee_id: "e1", employee: { id: "e1", full_name: "Alice Example" } });
  let moved = 0;
  await renderElement(React.createElement(SeatActionBar, { seat, onAssign() {}, onSwap() {}, onVacate() {}, onMove: () => (moved += 1) }));
  const move = document.querySelector('[aria-label="Move Alice Example to another seat"]');
  assert.ok(move, "person-centric Move present");
  assert.ok(document.querySelector(`[aria-label="Swap ${seat.label}"]`));
  assert.ok(document.querySelector(`[aria-label="Vacate ${seat.label}"]`));
  await act(async () => fireEvent.click(move));
  assert.equal(moved, 1);
});
```

- [ ] **Step 8: Verify.** `npx tsc --noEmit`, `npm test`, `npm run test:ct` → all pass (the Step-1 a11y pins now go green; the relational aria-modal count passes because the new dialog carries all four markers).
- [ ] **Step 9: Commit.** `feat(seat-map): person-centric Move — pick the occupant's new seat on the map`

---

### Task 6: Fix the latent force-move reconciliation bug in `applySeatUpdated`

> **SUPERSEDED (fix round 1, commit e5c4262):** the helper approach below shipped and was then replaced — client-spread rows keep stale `updated_at` and break undo with MLS02. The live design: `updateSeatAction` returns the fresh draft payload; both force-move consumers ingest `result.seats`/`result.employees`. Do not rebuild `vacateOtherSeatsForEmployee`; `tests/draft-concurrency.test.mjs` pins its absence.

The existing inspector "Move them?" flow leaves the vacated source seat occupied in local state and in the recorded undo snapshot. Same helper, same fix.

**Files:**
- Modify: `components/seat-map/SeatMap.tsx:1361-1376` (`applySeatUpdated`)
- Test: `tests/draft-concurrency.test.mjs`

- [ ] **Step 1: Failing pin.** Add to `tests/draft-concurrency.test.mjs`, using the file's existing `readFile(new URL(...))` pattern:

```js
test("force-move outcomes reconcile the vacated source seat locally", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  // Both force_move commit paths must clear the mover's previous seat before
  // recording history, or undo snapshots bake in a double assignment.
  assert.match(seatMapSource, /replaceSeat\(vacateOtherSeatsForEmployee\(beforeSnapshot\.seats, seat\), seat\)/);
  assert.match(seatMapSource, /replaceSeat\(vacateOtherSeatsForEmployee\(beforeSnapshot\.seats, result\.seat\), result\.seat\)/);
});
```

Run `node --test tests/draft-concurrency.test.mjs` → FAIL (first pattern absent).
- [ ] **Step 2: Fix.** In `applySeatUpdated`, `const afterSeats = replaceSeat(beforeSnapshot.seats, seat);` becomes:

```ts
    // A force_move (inspector "Move them?" or a bar Move) vacated the seat the
    // employee came from server-side — mirror it before recording history.
    const afterSeats = replaceSeat(vacateOtherSeatsForEmployee(beforeSnapshot.seats, seat), seat);
```

- [ ] **Step 3: Verify.** `node --test tests/draft-concurrency.test.mjs` → PASS; `npm test`, `npm run test:ct` → pass.
- [ ] **Step 4: Commit.** `fix(seat-map): reconcile the vacated source seat after a force-move`

---

### Task 7: Browser-tier spec, docs, full verification

**Files:**
- Modify: `tests/browser/seat-map.spec.ts:120-140`, `docs/handoff-v12-shell.md`

- [ ] **Step 1: Browser spec.** Lines 128–134 were ALREADY stale before this work (`MOVE_UI_ENABLED = false` removed the only `Move seat` label; commit 6c87acf never touched this spec). Rewrite: viewer test (≈124–125) asserts `page.locator('[data-seat-action-bar]')` has count 0 and drops both `Move seat`/`Swap seat` locator lines; admin test (≈128–134) replaces the `Move seat`/`Swap seat` attached-asserts with bar-verb assertions matched to the fixture seat's occupancy — occupied fixture: `[aria-label^="Move "]`, `[aria-label^="Vacate "]`; open fixture: `[aria-label^="Assign an employee to"]`, `[aria-label^="Swap "]`. Run `npm run test:browser` if `PW_CHROMIUM_PATH` is set locally (see the `test-tiers` skill); otherwise state plainly in the commit body that the tier was not run and why.
- [ ] **Step 2: Docs.** `docs/handoff-v12-shell.md`: rewrite the "Move hidden behind MOVE_UI_ENABLED" bullet (≈49–62) and the decision-table row (≈104) to the outcome: geometry move retired outright 2026-07-30 (owner confirmed "seats never move, people do" — the app is person > action), person-centric Move shipped on the canvas bar, spec at `docs/superpowers/specs/2026-07-30-person-move-design.md`.
- [ ] **Step 3: Full local verification** (CI is off): `npx tsc --noEmit` · `npm test` · `npm run test:ct` · `npm run coverage:check` · `npm run build`.
- [ ] **Step 4: Manual real-browser pass** (MANDATORY — auth flows have no e2e coverage). Invoke the `run-seat-planner` skill, sign in to `/admin`, then: (a) Move an occupant to an open seat — confirm copy, notice, source seat becomes Open; (b) undo → both seats revert; redo; (c) Move onto an occupied seat — swap offer appears, confirm swaps both; (d) Esc exits the mode; clicking the mover's own seat cancels; (e) start Move with unsaved inspector edits — the save/discard guard fires; (f) publish review shows the assignment changes and NO "Seat moves/layout changes" row — then CLOSE the review. **Do not publish. Undo every draft edit before finishing** (local dev writes the production draft).
- [ ] **Step 5: Commit.** `test(browser): repoint seat-map spec at the action-bar verbs; docs: record the Move retirement`

---

## Post-plan checklist (not tasks)

- Branch stays `feat/v12-shell-action-bar`; PR to `main` only when the owner says so.
- `skills-lock.json` / `next-env.d.ts` working-tree noise predates this work — do not sweep it into these commits.
