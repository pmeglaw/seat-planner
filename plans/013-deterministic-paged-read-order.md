# Plan 013: Give every paged Supabase read a deterministic total order

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 89a8fea..HEAD -- app/actions.ts app/page.tsx "app/(shell)/admin/page.tsx" "app/(shell)/reception/page.tsx" lib/fetchAllRows.ts tests/fetch-all-rows.test.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `89a8fea`, 2026-08-07

## Why this matters

`lib/fetchAllRows.ts` pages through PostgREST results with `LIMIT/OFFSET`
(`.range(from, to)`), 500 rows per page. Without a **total** ordering, Postgres
is free to return rows in a different order on each page request, so a
multi-page read can silently skip one row and duplicate another — and the
helper's only integrity check (`rows.length !== expectedTotal`) nets to zero on
a skip+duplicate pair, so it cannot detect this. One call site has **no
`.order()` at all** (`getDraftSeatZoneSources` — the reference set for zone
detection and label generation for every newly created seat: a dropped row
means a seat lands in the wrong zone with nothing catching it). Five more page
on `full_name`, which is not unique on `employees`/`published_employees` — two
people with the same name at a page boundary can be duplicated/skipped in the
viewer directory, the admin roster, and the publish employee-fence payload.
Single-page reads (fewer than 500 rows — today's prod scale) are unaffected;
this closes the trap before data grows into it.

## Current state

- `lib/fetchAllRows.ts` — the paging helper (do not modify; read its header
  comment for the design). The loop at lines 49-64 is plain range paging; the
  assertion at 66-72 checks the total only.
- `app/actions.ts:199-213` — `getDraftSeatZoneSources`, the no-order site:
  ```ts
  return fetchAllRows<DraftSeatZoneSource>(
    (from, to) =>
      supabase
        .from("seats")
        .select("label,zone,department,x,y", { count: "exact" })
        .eq("layer", "draft")
        .range(from, to),
    { label: "draft seats" }
  );
  ```
  Draft-layer seat labels are unique (`seats_unique_label_per_layer` index),
  so `.order("label")` is a valid total order here — and the function's
  consumers (`detectSeatZoneForPointResult`, `buildNextSeatLabel`) treat the
  result as an unordered set, so the added order changes no behavior.
- The seven `full_name` sites, all shaped like this (each needs `.order("id")`
  appended AFTER the existing `.order("full_name")` as a uniqueness
  tiebreaker):
  - `app/actions.ts:95` — `employees` (active), inside `getDraftMapPayload`
  - `app/(shell)/admin/page.tsx:85` — `employees` (active)
  - `app/(shell)/admin/page.tsx:94` — `published_employees`
  - `app/page.tsx:52` — `published_employees`
  - `app/(shell)/reception/page.tsx:49` — `published_employees`
  - `app/(shell)/admin/management/page.tsx:59` — `employees` (active), feeds
    the Management directory (found by the STOP-condition grep on first
    dispatch, 2026-08-07 — the original enumeration missed it)
  - `app/(shell)/admin/settings/page.tsx:60` — `employees` (active), feeds CSV
    export and the JSON snapshot backup (same)
  Excerpt (admin page, representative of all five):
  ```ts
  fetchAllRows<Employee>(
    (from, to) =>
      supabase
        .from("employees")
        .select("*", { count: "exact" })
        .eq("active", true)
        .order("full_name")
        .range(from, to),
    { label: "employees" }
  ),
  ```
  Both tables have a `uuid` primary key `id`, so `.order("full_name").order("id")`
  is total. Supabase's JS builder applies chained `.order()` calls as
  successive sort keys.
- `app/actions.ts:84` — the draft-seats read orders by `label` (unique per
  layer) — already total; leave it alone.
- `tests/fetch-all-rows.test.mjs` — existing unit tests for the helper; the
  structural pattern for any test you add.

Convention: comments in this repo state constraints, not narration. Each
changed call site should keep/extend the existing comment style — e.g. the
zone-sources function already carries a comment explaining why a short read is
dangerous; extend it with one line on why the order must be total.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` (NOT `npm ci`) | exit 0 |
| Tests | `npm test` | all pass (~600+ pass / 0 fail) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `app/actions.ts` (two lines: the zone-sources query, the employees query)
- `app/(shell)/admin/page.tsx`
- `app/(shell)/admin/management/page.tsx`
- `app/(shell)/admin/settings/page.tsx`
- `app/page.tsx`
- `app/(shell)/reception/page.tsx`
- `tests/fetch-all-rows.test.mjs` (optional test, see Test plan)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `lib/fetchAllRows.ts` — the helper is correct; determinism is the caller's
  job (its docstring already says callers must apply the range).
- Any `.order("name")` on `department_options` / `zone_options` — those are
  single-page `.select()`s without `.range()`, not paged reads.
- The `seats` reads ordered by `label` — already total.
- Page sizes, `count: "exact"`, or any query shape beyond adding order keys.

## Git workflow

- Branch: `advisor/013-deterministic-paged-read-order`
- Commit style: conventional commits, e.g. `fix(data): total ordering on every paged read`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Order the zone-sources read

In `app/actions.ts` `getDraftSeatZoneSources`, add `.order("label")` between
`.eq("layer", "draft")` and `.range(from, to)`. Extend the function's existing
header comment with one line: labels are unique per layer, so this is a total
order — required because LIMIT/OFFSET paging without one can skip/duplicate
rows across page boundaries undetectably.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Add the `id` tiebreaker to the seven `full_name` reads

At each of the seven sites listed in Current state, append `.order("id")`
immediately after `.order("full_name")`. Do not reorder anything else.

**Verify**: `grep -rn 'order("full_name")' app` → 7 hits, and for each, the
next chained call is `.order("id")` (confirm with `grep -rn -A1`).

### Step 3: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0.

## Test plan

- The change is order-key addition only; behavior at current scale is
  identical, so existing suites are the primary gate.
- Optional but recommended (S): add one test to `tests/fetch-all-rows.test.mjs`
  documenting the failure mode — a fake `requestPage` that returns overlapping
  pages (row X twice, row Y never) with a correct total; assert the helper
  returns the wrong multiset undetected. Mark it clearly as a
  characterization of WHY callers must order totally (the helper is not being
  asked to fix it). Model on the existing tests in that file.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `getDraftSeatZoneSources` contains `.order("label")`
- [ ] All seven `full_name` sites are followed by `.order("id")` (step 2 grep)
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all exit 0
- [ ] `git status` shows changes only in in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the six call sites no longer matches the excerpt shape (drift).
- Adding `.order(...)` produces a TypeScript error (would suggest the builder
  types changed — do not cast around it).
- You find a NINTH paged read (a `fetchAllRows` call not listed here) without
  a total order — report it; do not silently expand scope.
  (`grep -rn "fetchAllRows" app lib components` should hit only the eight call
  sites named here — the zone-sources read plus the seven `full_name` reads —
  plus the helper, its test, and the already-total seats reads.)

## Maintenance notes

- Rule for future readers: every `fetchAllRows` call must order by a unique
  key (or unique-prefixed chain). A code-review checklist line, not a test —
  unless someone later adds a source test enumerating `fetchAllRows` call
  sites and asserting `.order(` appears in each callback (cheap and in the
  spirit of the repo's `*-source.test.mjs` guardrails; deferred here to keep
  this plan minimal).
- If employee ordering ever becomes user-visible-sorted differently (e.g.
  locale collation), keep `id` as the LAST key; it only breaks ties.
