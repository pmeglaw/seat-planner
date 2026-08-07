# Plan 016: Keep the focused row mounted in the Management directory's windowed table

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 89a8fea..HEAD -- components/admin-management/AdminManagementPanel.tsx lib/virtualizedList.ts tests/virtualized-directory.test.mjs`
> On any change, compare the "Current state" excerpts against the live code
> before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug (accessibility)
- **Planned at**: commit `89a8fea`, 2026-08-07

## Why this matters

The Management employee directory windows its table rows for scale
(`computeVirtualWindow` + slice). Rows contain tab stops — the employee-name
`<Link>` and the kebab edit `<button>`. When a keyboard user focuses one and
the window then moves (scroll, resize), the focused element unmounts and the
browser silently drops focus to `<body>`: Tab restarts from the top of the
page and the user loses their place. `lib/virtualizedList.ts` documents
exactly this hazard and provides the cure — `computeVirtualSegments` with a
`pinnedIndex` that keeps the focused row mounted at its true offset — and the
repo's two other windowed lists (viewer People directory, admin Results panel,
both via `useVirtualListWindow`) already use it. The Management table — the
original scalability surface this math was written for — is the one consumer
that never got the pin.

## Current state

- `components/admin-management/AdminManagementPanel.tsx`:
  - Geometry measurement effect (lines 316-354): window-scroll driven; measures
    `rowHeight` from the FIRST `[data-directory-row]`:
    ```ts
    const firstRow = grid.querySelector<HTMLElement>("[data-directory-row]");
    const rowHeight = firstRow ? firstRow.offsetHeight : 52;
    ```
  - Window + slice (lines 356-367):
    ```ts
    const employeeWindow = useMemo(() => computeVirtualWindow({ ... }), [...]);
    const visibleEmployees = useMemo(
      () => sortedEmployees.slice(employeeWindow.startIndex, employeeWindow.endIndex),
      [sortedEmployees, employeeWindow]
    );
    ```
  - Render (lines 814-897): `<tbody ref={employeeGridRef}>` with a top spacer
    `<tr aria-hidden>` when `topPadding > 0`, then `visibleEmployees.map(...)`
    producing `<tr data-directory-row ...>` rows (each contains the name Link
    and the kebab button — the tab stops), then a bottom spacer `<tr>`.
- `lib/virtualizedList.ts`:
  - `computeVirtualSegments({ window, itemCount, rowHeight, pinnedIndex })`
    (lines 56-88) — returns `{kind:"spacer",height}` / `{kind:"row",index,pinned}`
    segments, splitting spacers around an out-of-window pinned row so every row
    sits at its true scroll offset. Single-column (the table is 1-column). Its
    doc comment: pinned rows "must be excluded from row-height measurement".
  - Do not modify this module — it already supports everything needed.
- `components/seat-map/useVirtualListWindow.ts` (lines 59-63, 107-128) — the
  EXEMPLAR for pin bookkeeping. It is element-scrolled so it cannot be dropped
  in against this window-scrolled `<tbody>`; replicate its two handlers
  locally instead. The load-bearing subtlety, verbatim from its comment:
  > Set from focusin (any row gaining focus), cleared on focusout only when
  > focus provably moved OUTSIDE the list (relatedTarget elsewhere) — an
  > unmount-blur reports relatedTarget null, and clearing on it would defeat
  > the pin.
- `tests/virtualized-directory.test.mjs` — existing tests for the
  `virtualizedList` math (pattern for any math-level additions; likely none
  needed).
- Note: `AdminManagementPanel.tsx` is NOT mounted by any executing test tier
  (source-text tests only) — a known repo gap. Your verification is therefore
  the lib tests + manual QA below.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` (NOT `npm ci`) | exit 0 |
| Tests | `npm test` | all pass |
| Typecheck / Lint | `npm run typecheck` / `npm run lint` | exit 0 |

## Scope

**In scope**:
- `components/admin-management/AdminManagementPanel.tsx`
- `tests/virtualized-directory.test.mjs` — ONLY the source-text render-shape
  test ("management directory is windowed…"): re-anchor its 3
  implementation-literal regexes (`visibleEmployees.map`,
  `employeeWindow.topPadding`, `employeeWindow.bottomPadding`) to the
  segment-based render without weakening any invariant, and add pins for the
  new focus-pin machinery. (Plan correction 2026-08-07: the original scope
  wrongly listed this file as untouchable and claimed it was math-only — it
  also pins the render shape; first execution STOPPED on exactly this.)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `lib/virtualizedList.ts` — the math is done and tested.
- The math tests in `tests/virtualized-directory.test.mjs` (everything except
  the one render-shape test named above).
- `components/seat-map/useVirtualListWindow.ts` — element-scrolled; a
  generalization to window scrolling is explicitly deferred (see Maintenance).
- The row markup/handlers themselves (Link/kebab/aria) beyond adding the
  pinned-row data attribute.
- The other two windowed lists (viewer directory, results panel).

## Git workflow

- Branch: `advisor/016-management-directory-focus-pin`
- Commit style: `fix(a11y): pin the focused Management directory row across window moves`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Track the focused row index

In `AdminManagementPanel`, add pin state near the geometry state:

```ts
const [pinnedEmployeeIndex, setPinnedEmployeeIndex] = useState<number | null>(null);
```

Add a `data-vindex={absoluteIndex}` attribute to each rendered `<tr
data-directory-row>` (absolute index into `sortedEmployees`, i.e.
`employeeWindow.startIndex + mapIndex` — restructure the `.map` to iterate
segments in step 2, which provides the absolute index directly).

Add an effect on the employees tab registering `focusin`/`focusout` on
`employeeGridRef.current`, replicating `useVirtualListWindow.ts:110-120`:
focusin → `closest("[data-vindex]")` → `setPinnedEmployeeIndex(index)`;
focusout → clear ONLY when `relatedTarget` exists and is outside the tbody.
Also clear an out-of-range pin when `sortedEmployees.length` shrinks
(exemplar: `useVirtualListWindow.ts:131-134`).

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Render segments instead of window+spacers

Replace the `visibleEmployees` slice and the hand-rolled spacer `<tr>`s with
`computeVirtualSegments`:

```ts
const employeeSegments = useMemo(() => computeVirtualSegments({
  window: employeeWindow,
  itemCount: sortedEmployees.length,
  rowHeight: employeeGridGeometry.rowHeight,
  pinnedIndex: pinnedEmployeeIndex
}), [employeeWindow, sortedEmployees.length, employeeGridGeometry.rowHeight, pinnedEmployeeIndex]);
```

In the `<tbody>`, map segments: `kind === "spacer"` → the existing
`aria-hidden` spacer `<tr>` with `style={{ height }}` (same `colSpan` cell);
`kind === "row"` → the existing row JSX for `sortedEmployees[segment.index]`,
plus `data-vindex={segment.index}` and, when `segment.pinned`,
`data-vpinned=""`. Use `employee.id` as the React key exactly as today (id
keys are what let the pinned row keep identity — and its focus — across
window moves). The import of `computeVirtualSegments` comes from
`@/lib/virtualizedList` alongside the existing `computeVirtualWindow` import.

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass (the
management source tests must stay green — if one trips, read what invariant it
guards before touching it; see STOP conditions).

### Step 3: Exclude the pinned row from row-height measurement

In the measurement effect, change the selector to skip pinned rows (they sit
against split spacers, so measuring one reads the gap, not the row —
`lib/virtualizedList.ts:33-36` says so):

```ts
const firstRow = grid.querySelector<HTMLElement>("[data-directory-row]:not([data-vpinned])");
```

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Full gates + manual QA

`npm test`, `npm run lint` → all pass / exit 0.

Manual (needs a directory long enough to window — local seed data has
thousands of employees; `npm run db:start` + `npm run db:seed` per README, or
any environment with 100+ employees):

1. `/admin/management`, employees tab. Tab to a mid-list row's kebab button.
2. Scroll (mouse wheel AND PageDown) until that row would leave the window.
3. Press Tab once.

**Verify**: focus moves to the next tab stop after the (still-mounted) pinned
row — NOT back to the top of the page. Then click elsewhere (focus leaves the
table) and confirm scrolling renders normally (pin cleared). Confirm total
scroll height did not change (scrollbar doesn't jump when the pin engages).

## Test plan

- The segment math is already covered in `tests/virtualized-directory.test.mjs`
  — no additions expected there.
- Component-level: no executing tier mounts this panel today (known repo gap,
  recorded in the audit); the manual gate in step 4 is the acceptance test.
  If `tests/management-detail-source.test.mjs` (source-text tier) asserts on
  the tbody/spacer shape, update the anchors to the segment render WITHOUT
  weakening what they assert (per the repo's guardrail-test policy in
  CLAUDE.md).

## Done criteria

- [ ] `grep -n "computeVirtualSegments" components/admin-management/AdminManagementPanel.tsx` → at least one hit
- [ ] `grep -n "data-vpinned" components/admin-management/AdminManagementPanel.tsx` → hits in both the render and the measurement selector
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all exit 0
- [ ] Manual QA in step 4 confirmed (state observations in your report)
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The render block no longer matches the Current state shape (drift).
- A `*-source.test.mjs` failure whose assertion you would need to DELETE (not
  re-anchor) to pass — that means this change crossed a safety/a11y guardrail,
  which must not happen for a pure windowing change.
- The pinned row visibly renders at the wrong offset or the scrollbar length
  changes when the pin engages — the spacer split math disagrees with the
  table's real row metrics (border-collapse borders are inside `offsetHeight`,
  but if `rowHeight` drifts from the true stride, report rather than fudge).
- You cannot produce a windowed-length directory to run step 4.

## Maintenance notes

- This leaves the repo with pin bookkeeping in two places (this component and
  `useVirtualListWindow`). Generalizing the hook to window-scrolling would
  unify them — deliberately deferred: the hook's measurement contract
  (element `scrollTop`/`clientHeight`) differs enough that forcing it now
  risks the two working consumers.
- If the directory ever becomes multi-column, `computeVirtualSegments` is
  single-column by design — revisit before reusing.
- Reviewer: scrutinize the focusout guard (`relatedTarget` null must NOT clear
  the pin) and that spacer heights + rendered rows still sum to
  `itemCount * rowHeight` (assert by eye against `lib/virtualizedList.ts:50-55`).
