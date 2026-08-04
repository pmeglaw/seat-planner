# v12 Slice 5 — Publish Diff Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the publish review modal around one unified per-seat diff table (contract #5), backed by a new pure `buildPublishDiffRows` derivation in `lib/publishSummary.ts`, with the lean prototype layout replacing the stat-card stack.

**Architecture:** A new pure function in the tested `lib/` core turns the draft-vs-published seat layers into sorted `PublishDiffRow`s (one row per changed seat, kind-tagged). `SeatMap.tsx` consumes it via `useMemo`, renders the prototype's table + chips + banner layout inside the existing dialog shell (semantics, focus, Escape order, z-order all unchanged), and deletes the old card/list components. Three new `--admin-diff-*` token triplets carry the tag colors. Guardrail tests move in lockstep.

**Tech Stack:** Next.js App Router, TypeScript strict, Tailwind arbitrary values over CSS custom properties, Node test runner (`tsModuleLoader`), Playwright browser tier.

**Spec:** `docs/superpowers/specs/2026-08-03-v12-slice5-publish-diff-design.md` — read for context; THIS plan is the executable source of truth.

## Global Constraints

- **Publish action path untouched:** `openPublishReview` (incl. its `inspectorDirty` block and the copy `Publish review blocked: Save or discard the selected seat edits before publishing`), `confirmPublishDraftMap`, `publishSeatMapAction`. No RPC/migration changes.
- **Contract #4 cluster untouched** (`SeatMap.tsx:3108-3128`): has-changes-only render, exactly one `onClick={openPublishReview}`, `draftStatusLabel`/`draftStatusTitle`, Publish count badge. The e2e-auth spec finds the entry by accessible name `/unpublished change/` and the confirm by `/^Publish/` — both names must survive.
- **`buildPublishChangeSummary` unchanged** — exact existing call shape in SeatMap (`localSeats, localPublishedSeats, { employees: localEmployees, publishedEmployees: localPublishedEmployees }`) stays; `draftSeatKeys`, header chip, Management/Settings consumers depend on it.
- **Pinned literals that must keep matching** (a11y-source): `aria-labelledby="publish-review-title"`, `Review draft before publishing`, `Confirm the saved draft changes before they become visible in the read-only viewer`, `Ready to publish reviewed changes`, `Draft and viewer map are in sync`, `Publish did not complete`, `Publishing reviewed draft changes`, `{actionError && !pending && (`, `Retry publish`, `No draft changes to publish`, `disabled={pending || !publishSummary.hasChanges}`.
- **Caution line exact copy:** `Publishing copies the saved draft map to the read-only viewer and clears Undo/Redo history after success. Until you publish, viewers keep seeing the currently published map.`
- **Banner subtext exact copy:** `Saved draft changes only — unsaved inspector edits are excluded.`
- **Status-suppression rule (governs over any other reading of the spec):** the `Status x -> y` segment appears in `detail` ONLY when the occupant is unchanged — mirroring `buildPublishChangeSummary`'s `!employeeChanged` guard. Occupant-kind rows never restate the status flip their tag already implies.
- **Frozen files:** `lib/mapLayoutTransform.ts`, `lib/seatMath.ts`.
- **Never run `npm run test:e2e:auth` locally** (builds against prod env). CI covers it.
- Occupant cells always show occupant-state: full name, `Open seat`, or `—` (absent side of added/removed). Metadata goes only in `detail`.

## File Structure

- `lib/publishSummary.ts` — append `PublishDiffRowKind`, `PublishDiffRow`, `getDiffOccupantLabel`, `buildPublishDiffRows` (reuses existing private helpers; no existing exports change).
- `tests/publish-summary.test.mjs` — append diff-row test block.
- `app/globals.css` — `--admin-diff-*` triplets beside the `--admin-publish-*` tokens.
- `components/seat-map/SeatMap.tsx` — modal body rewrite; delete `PublishImpactCard` / `PublishCountCard` / `PublishChangeList` / `formatPublishChangeUnit`; add `PUBLISH_DIFF_TAG_STYLES` / `PublishDiffTag` / `PublishDiffChip`.
- `tests/accessibility-source.test.mjs` — rewrite the `publish review summarizes draft changes before publish` test.
- `tests/browser/seat-map.spec.ts` — one new spec.
- `docs/handoff-v12-shell.md` — shipped note (Task 3).

---

### Task 1: `buildPublishDiffRows` in lib + tests

**Files:**
- Modify: `lib/publishSummary.ts` (append after `buildPublishChangeSummary`)
- Test: `tests/publish-summary.test.mjs` (append at end)

**Interfaces:**
- Consumes: existing private helpers in the same file — `buildSeatMap`, `getSeatPersonLabel`, `getSeatZone`, `normalizeText`, `hasSeatMoved`, `buildOtherChangeDetail`, `formatPoint`.
- Produces (Task 2 relies on these exact names/types):
  ```ts
  export type PublishDiffRowKind = "added" | "removed" | "assigned" | "vacated" | "reassigned" | "updated";
  export type PublishDiffRow = { key: string; label: string; kind: PublishDiffRowKind; from: string; to: string; detail: string | null };
  export function buildPublishDiffRows(draftSeats: SeatWithEmployee[], publishedSeats: SeatWithEmployee[]): PublishDiffRow[];
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/publish-summary.test.mjs` (the `seat(...)`/`employee(...)` factories at the top of the file are reused; note `seat()` defaults `zone: "West Pod"`):

```js
test("diff rows: assigned, vacated, and reassigned occupant changes", () => {
  const alice = employee("emp-1", "Alice Smith");
  const ben = employee("emp-2", "Ben Ito");
  const rows = publishSummary.buildPublishDiffRows(
    [
      seat({ label: "W01", employee: alice }),
      seat({ label: "W02" }),
      seat({ label: "W03", employee: ben })
    ],
    [
      seat({ label: "W01", layer: "published" }),
      seat({ label: "W02", layer: "published", employee: alice }),
      seat({ label: "W03", layer: "published", employee: alice })
    ]
  );

  assert.deepEqual(rows.map(r => [r.label, r.kind, r.from, r.to]), [
    ["W01", "assigned", "Open seat", "Alice Smith"],
    ["W02", "vacated", "Alice Smith", "Open seat"],
    ["W03", "reassigned", "Alice Smith", "Ben Ito"]
  ]);
  // The occupant tag already implies the status flip — no Status noise.
  assert.deepEqual(rows.map(r => r.detail), [null, null, null]);
});

test("diff rows: added and removed seats use the absent marker", () => {
  const alice = employee("emp-1", "Alice Smith");
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "S01", is_custom: true }), seat({ label: "S02", is_custom: true, employee: alice })],
    [seat({ label: "N09", layer: "published", employee: alice })]
  );

  assert.deepEqual(rows.map(r => [r.label, r.kind, r.from, r.to]), [
    ["N09", "removed", "Alice Smith", "—"],
    ["S01", "added", "—", "Open seat"],
    ["S02", "added", "—", "Alice Smith"]
  ]);
  assert.equal(rows[0].detail, "Seat removed from the map");
  assert.equal(rows[1].detail, "West Pod");
});

test("diff rows: metadata-only change is one updated row with combined detail", () => {
  const alice = employee("emp-1", "Alice Smith");
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "W01", employee: alice, status: "reserved", notes: "hot desk" })],
    [seat({ label: "W01", layer: "published", employee: alice, status: "assigned" })]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "updated");
  assert.equal(rows[0].from, "Alice Smith");
  assert.equal(rows[0].to, "Alice Smith");
  assert.equal(rows[0].detail, "Status assigned -> reserved; Notes changed");
});

test("diff rows: occupant change wins over metadata, which rides along in detail", () => {
  const alice = employee("emp-1", "Alice Smith");
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "W01", employee: alice, zone: "East Pod" })],
    [seat({ label: "W01", layer: "published", zone: "West Pod" })]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "assigned");
  assert.equal(rows[0].detail, "Zone West Pod -> East Pod");
});

test("diff rows: position drift surfaces on an otherwise-unchanged seat", () => {
  const alice = employee("emp-1", "Alice Smith");
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "W01", employee: alice, x: 0.5, y: 0.5 })],
    [seat({ label: "W01", layer: "published", employee: alice, x: 0.1, y: 0.2 })]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "updated");
  assert.equal(rows[0].detail, "position 10%, 20% -> 50%, 50%");
});

test("diff rows: a seat restored to its baseline occupant drops out entirely", () => {
  const alice = employee("emp-1", "Alice Smith");
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "W01", employee: alice }), seat({ label: "W02" })],
    [seat({ label: "W01", layer: "published", employee: alice }), seat({ label: "W02", layer: "published" })]
  );

  assert.deepEqual(rows, []);
});

test("diff rows: sorted numeric-aware by label", () => {
  const rows = publishSummary.buildPublishDiffRows(
    [
      seat({ label: "W10", is_custom: true }),
      seat({ label: "W2", is_custom: true }),
      seat({ label: "N1", is_custom: true })
    ],
    []
  );

  assert.deepEqual(rows.map(r => r.label), ["N1", "W2", "W10"]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/publish-summary.test.mjs`
Expected: new tests FAIL with `buildPublishDiffRows is not a function`; the pre-existing tests still pass.

- [ ] **Step 3: Implement**

Append to `lib/publishSummary.ts`:

```ts
export type PublishDiffRowKind = "added" | "removed" | "assigned" | "vacated" | "reassigned" | "updated";

export type PublishDiffRow = {
  key: string;
  label: string;
  kind: PublishDiffRowKind;
  from: string;
  to: string;
  detail: string | null;
};

const DIFF_ABSENT = "—";

function getDiffOccupantLabel(seat: SeatWithEmployee) {
  return normalizeText(seat.employee_id) ? getSeatPersonLabel(seat) : "Open seat";
}

/**
 * One row per changed seat for the publish review's diff table (v12 contract
 * #5), diffed against the published baseline with the same key/occupant
 * semantics as buildPublishChangeSummary — so a seat undone back to its
 * baseline occupant drops out of both in lockstep. `from`/`to` are always
 * occupant-state; metadata (status/zone/label/notes/custom/position) rides in
 * `detail`, and the Status segment is suppressed on occupant-change rows
 * because the tag already implies it (mirrors the summary's !employeeChanged
 * guard on statusChanges).
 */
export function buildPublishDiffRows(
  draftSeats: SeatWithEmployee[],
  publishedSeats: SeatWithEmployee[]
): PublishDiffRow[] {
  const draftByKey = buildSeatMap(draftSeats);
  const publishedByKey = buildSeatMap(publishedSeats);
  const rows: PublishDiffRow[] = [];

  draftByKey.forEach((draftSeat, key) => {
    const publishedSeat = publishedByKey.get(key);
    if (!publishedSeat) {
      rows.push({
        key,
        label: draftSeat.label,
        kind: "added",
        from: DIFF_ABSENT,
        to: getDiffOccupantLabel(draftSeat),
        detail: getSeatZone(draftSeat)
      });
      return;
    }

    const employeeChanged = normalizeText(publishedSeat.employee_id) !== normalizeText(draftSeat.employee_id);
    const metadataParts: string[] = [];
    if (!employeeChanged && publishedSeat.status !== draftSeat.status) {
      metadataParts.push(`Status ${publishedSeat.status} -> ${draftSeat.status}`);
    }
    const otherDetail = buildOtherChangeDetail(draftSeat, publishedSeat);
    if (otherDetail) metadataParts.push(otherDetail);
    if (hasSeatMoved(draftSeat, publishedSeat)) {
      metadataParts.push(`position ${formatPoint(publishedSeat)} -> ${formatPoint(draftSeat)}`);
    }
    const metadataDetail = metadataParts.length ? metadataParts.join("; ") : null;

    if (employeeChanged) {
      const fromOpen = !normalizeText(publishedSeat.employee_id);
      const toOpen = !normalizeText(draftSeat.employee_id);
      rows.push({
        key,
        label: draftSeat.label,
        kind: fromOpen ? "assigned" : toOpen ? "vacated" : "reassigned",
        from: getDiffOccupantLabel(publishedSeat),
        to: getDiffOccupantLabel(draftSeat),
        detail: metadataDetail
      });
      return;
    }

    if (metadataDetail) {
      const occupant = getDiffOccupantLabel(draftSeat);
      rows.push({ key, label: draftSeat.label, kind: "updated", from: occupant, to: occupant, detail: metadataDetail });
    }
  });

  publishedByKey.forEach((publishedSeat, key) => {
    if (!draftByKey.has(key)) {
      rows.push({
        key,
        label: publishedSeat.label,
        kind: "removed",
        from: getDiffOccupantLabel(publishedSeat),
        to: DIFF_ABSENT,
        detail: "Seat removed from the map"
      });
    }
  });

  return rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
```

- [ ] **Step 4: Run to verify green**

Run: `node --test tests/publish-summary.test.mjs` — all pass.
Then: `npm run typecheck` and `npm run coverage:check` (floors lines 90 / funcs 95 / branches 80 must hold — the new function is fully exercised above).

- [ ] **Step 5: Commit**

```bash
git add lib/publishSummary.ts tests/publish-summary.test.mjs
git commit -m "feat(publish): buildPublishDiffRows — per-seat diff rows for the review table"
```

---

### Task 2: Lean modal with unified diff table + tokens + a11y lockstep

**Files:**
- Modify: `app/globals.css` (insert beside the `--admin-publish-*` tokens, ~line 357-365)
- Modify: `components/seat-map/SeatMap.tsx` — import (~line 68), helper components (~219-272), derivations (~2438-2446), modal body (~3564-3710)
- Modify: `tests/accessibility-source.test.mjs:289-325` (full test rewrite)

**Interfaces:**
- Consumes from Task 1: `buildPublishDiffRows(draftSeats, publishedSeats): PublishDiffRow[]`, `type PublishDiffRow`, `type PublishDiffRowKind` from `@/lib/publishSummary`.
- Produces: nothing later tasks import; Task 3's browser spec asserts on the rendered strings `Published now`, `After publish`, tag label `Added`, chip text `1 seat change`.

- [ ] **Step 1: Add the token family**

In `app/globals.css`, inside `.admin-theme`, next to the `--admin-publish-*` block:

```css
  /* Publish diff tags (v12 slice 5). Text-on-bg contrast, measured:
     #284C3B on #DEF3E4 = 8.3:1 · #B3232C on #FBE9EA = 5.6:1 ·
     #6D4712 on #FCF4D6 = 7.4:1 — all ≥ 4.5:1 body-text floor. */
  --admin-diff-assigned-bg: #DEF3E4;
  --admin-diff-assigned-border: #A9D7B8;
  --admin-diff-assigned-text: #284C3B;
  --admin-diff-vacated-bg: #FBE9EA;
  --admin-diff-vacated-border: #E8A5A9;
  --admin-diff-vacated-text: #B3232C;
  --admin-diff-reassigned-bg: #FCF4D6;
  --admin-diff-reassigned-border: #E0C46E;
  --admin-diff-reassigned-text: #6D4712;
```

Verify the three ratios with a quick WCAG relative-luminance computation (any method); if one measures below 4.5:1, darken the TEXT hex until it passes and update the comment.

- [ ] **Step 2: Rewire SeatMap imports and derivations**

At `components/seat-map/SeatMap.tsx:68` replace the publishSummary import with:

```tsx
import { buildPublishChangeSummary, buildPublishDiffRows, type PublishDiffRowKind } from "@/lib/publishSummary";
```

(`type PublishChangeItem` goes away with `PublishChangeList`.)

Directly under the existing `publishSummary` memo (~line 997-1003), add:

```tsx
  const publishDiffRows = useMemo(
    () => buildPublishDiffRows(localSeats, localPublishedSeats),
    [localSeats, localPublishedSeats]
  );
  const publishDiffCounts = useMemo(() => {
    const counts: Record<PublishDiffRowKind, number> = { added: 0, removed: 0, assigned: 0, vacated: 0, reassigned: 0, updated: 0 };
    publishDiffRows.forEach(row => { counts[row.kind] += 1; });
    return counts;
  }, [publishDiffRows]);
```

Delete the three overlap derivations at ~2438-2440 (`publishPeopleChangeCount`, `publishSeatInventoryChangeCount`, `publishMetadataChangeCount`) AND `publishReadinessDescription` (its only consumer was the old banner paragraph — leaving it would fail lint as unused). KEEP `publishReadinessTitle` / `publishReadinessBadgeTone` / `publishReadinessBadgeLabel` and everything else in that block (`draftChangeBreakdown`, `draftStatusLabel`, `draftStatusTitle` feed the contract-#4 cluster; the title ternary also keeps the pinned `Draft and viewer map are in sync` string in source).

- [ ] **Step 3: Replace the helper components**

Delete `PublishCountCard` (~219-226), `formatPublishChangeUnit` (~228-230), `PublishImpactCard` (~232-243), `PublishChangeList` (~245-272). In their place:

```tsx
const PUBLISH_DIFF_TAG_STYLES: Record<PublishDiffRowKind, { label: string; className: string }> = {
  assigned: { label: "Assigned", className: "border-[var(--admin-diff-assigned-border)] bg-[var(--admin-diff-assigned-bg)] text-[var(--admin-diff-assigned-text)]" },
  added: { label: "Added", className: "border-[var(--admin-diff-assigned-border)] bg-[var(--admin-diff-assigned-bg)] text-[var(--admin-diff-assigned-text)]" },
  vacated: { label: "Vacated", className: "border-[var(--admin-diff-vacated-border)] bg-[var(--admin-diff-vacated-bg)] text-[var(--admin-diff-vacated-text)]" },
  removed: { label: "Removed", className: "border-[var(--admin-diff-vacated-border)] bg-[var(--admin-diff-vacated-bg)] text-[var(--admin-diff-vacated-text)]" },
  reassigned: { label: "Reassigned", className: "border-[var(--admin-diff-reassigned-border)] bg-[var(--admin-diff-reassigned-bg)] text-[var(--admin-diff-reassigned-text)]" },
  updated: { label: "Updated", className: "border-[var(--admin-state-neutral-border)] bg-[var(--admin-state-neutral-bg)] text-[var(--admin-text-muted)]" }
};

function PublishDiffTag({ kind }: { kind: PublishDiffRowKind }) {
  const style = PUBLISH_DIFF_TAG_STYLES[kind];
  return (
    <span className={["inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold", style.className].join(" ")}>
      {style.label}
    </span>
  );
}

function PublishDiffChip({ kind, count }: { kind: PublishDiffRowKind; count: number }) {
  const style = PUBLISH_DIFF_TAG_STYLES[kind];
  return (
    <span className={["inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold", style.className].join(" ")}>
      {count} {style.label.toLowerCase()}
    </span>
  );
}
```

- [ ] **Step 4: Rewrite the modal body**

In the `{publishReviewOpen && (...)}` block (~3564-3710), keep the overlay div, `<section>` shell attributes (ref/tabIndex/role/aria-*), header div, and close button EXACTLY as they are, with ONE class change on the section: `max-w-3xl` → `w-full sm:max-w-[560px]`. Replace everything between the header `</div>` and the footer `<div className="grid grid-cols-2 …">` with:

```tsx
            <div className="min-h-0 overflow-y-auto overscroll-contain py-4">
              {!publishSummary.hasChanges && (
                <p className="rounded-xl border border-[var(--admin-publish-no-change-border)] bg-[var(--admin-publish-no-change-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-publish-no-change-text)]">
                  No draft changes to publish. The saved draft already matches the currently published viewer map.
                </p>
              )}

              {publishSummary.hasChanges && (
              <>
              <div className="rounded-xl border border-[var(--admin-publish-ready-border)] bg-[var(--admin-publish-ready-bg)] p-3 text-[var(--admin-publish-ready-text)]">
                <StatusBadge tone={publishReadinessBadgeTone} className="!min-h-0 !bg-[var(--admin-surface)]/80 !px-2 !py-0.5 !text-[11px] !font-semibold !tracking-wide !text-[var(--admin-publish-ready-text)] !ring-[var(--admin-publish-ready-border)]">
                  {publishReadinessBadgeLabel}
                </StatusBadge>
                <h3 className="mt-2 text-sm font-semibold text-[var(--admin-text-primary)]">{publishReadinessTitle}</h3>
                <p className="mt-1 text-xs font-semibold leading-4">Saved draft changes only — unsaved inspector edits are excluded.</p>
              </div>

              {actionError && !pending && (
                <div role="alert" className="mt-3 rounded-xl border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-error-text)]">
                  <span className="font-semibold">Publish did not complete.</span> {actionError}
                </div>
              )}

              {pending && (
                <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-[var(--admin-state-saving-border)] bg-[var(--admin-state-saving-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-saving-text)]">
                  Publishing reviewed draft changes. Viewer map stays unchanged until publish finishes.
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--admin-text-primary)]">
                  {publishDiffRows.length} seat {publishDiffRows.length === 1 ? "change" : "changes"}
                </span>
                <PublishDiffChip kind="assigned" count={publishDiffCounts.assigned} />
                <PublishDiffChip kind="vacated" count={publishDiffCounts.vacated} />
                <PublishDiffChip kind="reassigned" count={publishDiffCounts.reassigned} />
                {publishDiffCounts.added > 0 && <PublishDiffChip kind="added" count={publishDiffCounts.added} />}
                {publishDiffCounts.removed > 0 && <PublishDiffChip kind="removed" count={publishDiffCounts.removed} />}
                {publishDiffCounts.updated > 0 && <PublishDiffChip kind="updated" count={publishDiffCounts.updated} />}
              </div>

              <div className="mt-2 overflow-x-auto border border-[var(--admin-border)]">
                <div className="max-h-56 min-w-[480px] overflow-y-auto">
                  <div className="sticky top-0 z-10 grid grid-cols-[64px_1fr_1fr_96px] border-b border-[var(--admin-border)] bg-[var(--admin-state-neutral-bg)]">
                    <span className="px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-muted)]">Seat</span>
                    <span className="px-2.5 py-1.5 text-[11px] font-semibold text-[var(--admin-text-muted)]">Published now</span>
                    <span className="px-2.5 py-1.5 text-[11px] font-semibold text-[var(--admin-text-muted)]">After publish</span>
                    <span className="px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-muted)]">Change</span>
                  </div>
                  {publishDiffRows.map(row => (
                    <div key={row.key} className="border-b border-[var(--admin-border)]/60 last:border-b-0">
                      <div className="grid grid-cols-[64px_1fr_1fr_96px] items-center">
                        <span className="px-3 py-2 font-mono text-xs font-semibold text-[var(--admin-text-primary)]">{row.label}</span>
                        <span className="flex min-w-0 items-center gap-1.5 px-2.5 py-2 text-[12.5px] text-[var(--admin-text-muted)]">
                          <span className="truncate">{row.from}</span>
                          <span aria-hidden="true" className="flex-shrink-0 text-[var(--admin-text-subtle)]">→</span>
                        </span>
                        <span className="truncate px-2.5 py-2 text-[12.5px] font-semibold text-[var(--admin-text-primary)]">{row.to}</span>
                        <span className="px-3 py-2"><PublishDiffTag kind={row.kind} /></span>
                      </div>
                      {row.detail && (
                        <div className="grid grid-cols-[64px_1fr]">
                          <span />
                          <span className="px-2.5 pb-2 text-[11px] leading-4 text-[var(--admin-text-muted)]">{row.detail}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {publishSummary.employeeDetailChanges.length > 0 && (
                <div className="mt-3 border border-[var(--admin-border)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[var(--admin-text-primary)]">People details</h3>
                    <span className="rounded-full bg-[var(--admin-state-neutral-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--admin-text-muted)] ring-1 ring-[var(--admin-state-neutral-border)]">{publishSummary.employeeDetailChanges.length}</span>
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--admin-text-muted)]">
                    {publishSummary.employeeDetailChanges.map(item => (
                      <li key={`${item.label}-${item.detail}`}>
                        <span className="font-semibold text-[var(--admin-text-primary)]">{item.label}</span> — {item.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-3 text-[11.5px] font-semibold text-[var(--admin-text-muted)]">
                Draft: {publishSummary.draftSeatCount} seats · Currently published: {publishSummary.publishedSeatCount} seats
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--admin-text-secondary)]">
                Publishing copies the saved draft map to the read-only viewer and clears Undo/Redo history after success. Until you publish, viewers keep seeing the currently published map.
              </p>
              </>
              )}
            </div>
```

Then in the footer (KEEP the relocated-discard comment above it verbatim): change `grid grid-cols-2 gap-2 border-t` → `grid grid-cols-[1fr_1.4fr] gap-2 border-t`, and add `h-12` to both buttons' className lists. Everything else in the footer (labels `Publishing…` / `Retry publish` / `Publish changes` / `Publish reviewed changes` / `No changes to publish`, `disabled={pending || !publishSummary.hasChanges}`, CTA token classes) stays byte-identical.

Notes: the `StatusBadge` readiness badge no longer needs its has-changes ternary (block only renders when `hasChanges`); the `Ready to publish reviewed changes` string arrives via `publishReadinessTitle` — both pin styles keep matching because the a11y test greps the whole file and the derivation block survives. Do not remove `PublishChangeItem`-typed code elsewhere — after this step `rg "PublishChangeItem|PublishChangeList|PublishImpactCard|PublishCountCard|formatPublishChangeUnit" components/seat-map/SeatMap.tsx` must return nothing.

- [ ] **Step 5: Rewrite the a11y-source publish test**

Replace the entire `test("publish review summarizes draft changes before publish", …)` block in `tests/accessibility-source.test.mjs` (lines 289-325) with:

```js
test("publish review summarizes draft changes before publish", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");

  // The summary must also diff live employee details against the viewer
  // snapshot so pending people edits are reviewable before they publish.
  assert.match(source, /buildPublishChangeSummary\(localSeats, localPublishedSeats, \{\s+employees: localEmployees,\s+publishedEmployees: localPublishedEmployees\s+\}\)/);
  // v12 slice 5: the modal body is one unified per-seat diff table derived
  // against the published baseline — same drop-out semantics as the summary.
  assert.match(source, /buildPublishDiffRows\(localSeats, localPublishedSeats\)/);
  assert.match(source, /aria-labelledby="publish-review-title"/);
  assert.match(source, /Review draft before publishing/);
  assert.match(source, /Confirm the saved draft changes before they become visible in the read-only viewer/);
  assert.match(source, /Ready to publish reviewed changes/);
  assert.match(source, /Saved draft changes only — unsaved inspector edits are excluded\./);
  assert.match(source, /Draft and viewer map are in sync/);
  // Viewer-impact + undo-history warnings folded into one caution line —
  // both sentences must survive verbatim.
  assert.match(source, /Publishing copies the saved draft map to the read-only viewer and clears Undo\/Redo history after success\. Until you publish, viewers keep seeing the currently published map\./);
  assert.match(source, /Publish did not complete/);
  assert.match(source, /Publishing reviewed draft changes/);
  assert.match(source, /\{actionError && !pending && \(/);
  assert.match(source, /Retry publish/);
  assert.match(source, /No draft changes to publish/);
  assert.match(source, /disabled=\{pending \|\| !publishSummary\.hasChanges\}/);
  // The diff table's column contract and kind-tag tokens.
  assert.match(source, /Published now/);
  assert.match(source, /After publish/);
  assert.match(source, /--admin-diff-assigned-/);
  assert.match(source, /--admin-diff-vacated-/);
  assert.match(source, /--admin-diff-reassigned-/);
  assert.match(source, /People details/);
  assert.match(source, /Publish review blocked: Save or discard the selected seat edits before publishing/);
  assert.match(source, /Save or discard the selected seat edits before publishing/);
  assert.doesNotMatch(source, /Publish draft map to the viewer-facing seat map\?/);
});
```

- [ ] **Step 6: Run the source-facing gate**

Run: `node --test tests/accessibility-source.test.mjs tests/publish-summary.test.mjs tests/bulk-destructive-action-safety-source.test.mjs && npm run typecheck && npm run lint`
Expected: all pass (bulk-destructive pins target the discard/reset paths, which are untouched).

- [ ] **Step 7: Full suite + build**

Run: `npm test` then `npm run test:ct` then `npm run build`
Expected: green (baseline 400+ per local-test-env memory; the 4 known env-dependent files count only if node_modules drifted).

- [ ] **Step 8: Commit**

```bash
git add app/globals.css components/seat-map/SeatMap.tsx tests/accessibility-source.test.mjs
git commit -m "feat(publish): unified per-seat diff table in the review modal (v12 slice 5)"
```

---

### Task 3: Browser-tier spec + docs

**Files:**
- Modify: `tests/browser/seat-map.spec.ts` (append at end of file)
- Modify: `docs/handoff-v12-shell.md` (shipped note)

**Interfaces:**
- Consumes: Task 2's rendered modal (`Published now` / `After publish` headers, `Added` tag, `1 seat change` chip text, dialog name `Review draft before publishing`); the existing `custom` fixture (S01, `is_custom: true`, open) and `mountSeatMap` harness options.

- [ ] **Step 1: Write the spec**

Append to `tests/browser/seat-map.spec.ts`:

```ts
// v12 slice 5: the publish review is a unified per-seat diff table. `custom`
// with an empty published layer reads as one Added change, which renders the
// contract-#4 publish cluster whose entry button opens the review.
test("the publish review lists per-seat diff rows with change tags", async ({ page }) => {
  await mountSeatMap(page, { seats: [custom], employees: [], canEdit: true, publishedSeats: [] });

  await page.getByRole("button", { name: /unpublished change/ }).dispatchEvent("click");

  const dialog = page.getByRole("dialog", { name: "Review draft before publishing" });
  await expect(dialog).toBeAttached();
  await expect(dialog.getByText("Published now")).toBeAttached();
  await expect(dialog.getByText("After publish")).toBeAttached();
  await expect(dialog.getByText("S01", { exact: true })).toBeAttached();
  await expect(dialog.getByText("Added", { exact: true })).toBeAttached();
  await expect(dialog.getByText("1 seat change", { exact: true })).toBeAttached();
});
```

- [ ] **Step 2: Static sanity (browser tier is CI-only locally)**

`npm run test:browser` needs `PW_CHROMIUM_PATH` locally and normally runs in CI. If the local Chromium is available, run `npm run test:browser`; otherwise verify the spec compiles via `npm run typecheck` and leave execution to CI — note which path was taken in the report.

- [ ] **Step 3: Docs note**

In `docs/handoff-v12-shell.md`, append to the shipped-slices note (mirroring the slice-4 entry style): one line stating slice 5 shipped the unified publish diff table (contract #5), the lean modal, and the `--admin-diff-*` family, superseding the card/list review layout.

- [ ] **Step 4: Commit**

```bash
git add tests/browser/seat-map.spec.ts docs/handoff-v12-shell.md
git commit -m "test(browser)+docs: publish diff table spec + slice-5 shipped note"
```

---

## Self-review notes (plan author)

- Spec coverage: data model → T1; modal/tokens/a11y → T2; browser + docs → T3; e2e-auth untouched by design (selectors verified against source). Verification section of the spec runs at SDD final gate + owner pass.
- Status-suppression refinement is declared in Global Constraints and mirrored in T1's tests — reviewers judge against it, not against the spec's looser wording.
- Type/name consistency: `PublishDiffRowKind` / `PublishDiffRow` / `buildPublishDiffRows` / `publishDiffRows` / `publishDiffCounts` / `PUBLISH_DIFF_TAG_STYLES` / `PublishDiffTag` / `PublishDiffChip` used identically across T1–T3.
