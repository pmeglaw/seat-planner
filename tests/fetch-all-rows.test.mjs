import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Exercises the REAL lib/fetchAllRows.ts. The behaviour under test is the one
// that bit production-shaped data: PostgREST silently truncates a `.select()`
// at the project row cap, so the map drew a partial floor plan that looked
// complete. These cases pin that pagination completes, and that the one case
// pagination cannot rescue fails loudly instead.
const { fetchAllRows } = await importTsModule("lib/fetchAllRows.ts");

/** Serves `total` rows, capping each response at `serverCap` like PostgREST. */
function fakeTable(total, serverCap = Infinity, { reportCount = true } = {}) {
  const calls = [];
  const request = (from, to) => {
    calls.push([from, to]);
    const requested = to - from + 1;
    const size = Math.min(requested, serverCap);
    const data = [];
    for (let i = from; i < Math.min(from + size, total); i += 1) data.push({ id: i });
    return Promise.resolve({ data, error: null, count: reportCount ? total : null });
  };
  return { request, calls };
}

test("returns every row when the total exceeds one page", async () => {
  const { request, calls } = fakeTable(1200);
  const rows = await fetchAllRows(request, { pageSize: 500 });
  assert.equal(rows.length, 1200);
  assert.deepEqual(rows[0], { id: 0 });
  assert.deepEqual(rows[1199], { id: 1199 });
  assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499]]);
});

test("2000 rows under a 1000-row server cap are returned complete", async () => {
  // The exact PERF-01 scenario: 2000 seats, server capping at 1000. A single
  // unpaginated select would have yielded 1000 and drawn half a map.
  const { request } = fakeTable(2000, 1000);
  const rows = await fetchAllRows(request, { pageSize: 500 });
  assert.equal(rows.length, 2000);
});

test("stops after one request when everything fits on a page", async () => {
  const { request, calls } = fakeTable(90);
  const rows = await fetchAllRows(request, { pageSize: 500 });
  assert.equal(rows.length, 90);
  assert.equal(calls.length, 1, "must not issue a second request for a short page");
});

test("an exact multiple of the page size does not lose or duplicate rows", async () => {
  const { request } = fakeTable(1000);
  const rows = await fetchAllRows(request, { pageSize: 500 });
  assert.equal(rows.length, 1000);
  assert.equal(new Set(rows.map(r => r.id)).size, 1000);
});

test("an empty table yields no rows and one request", async () => {
  const { request, calls } = fakeTable(0);
  assert.deepEqual(await fetchAllRows(request, { pageSize: 500 }), []);
  assert.equal(calls.length, 1);
});

test("a server cap below the page size fails loudly instead of truncating", async () => {
  // The case pagination cannot fix: every page comes back short, so the loop
  // cannot tell "last page" from "capped". Silence here would reintroduce the
  // original bug, so it must throw.
  const { request } = fakeTable(2000, 200);
  await assert.rejects(
    () => fetchAllRows(request, { pageSize: 500, label: "published seats" }),
    /Loaded 200 of 2000 published seats/
  );
});

test("query errors propagate rather than yielding a partial result", async () => {
  const failing = () => Promise.resolve({ data: null, error: { message: "permission denied" }, count: null });
  await assert.rejects(() => fetchAllRows(failing), /permission denied/);
});

test("a mid-pagination error is not swallowed", async () => {
  let call = 0;
  const flaky = (from, to) => {
    call += 1;
    if (call === 2) return Promise.resolve({ data: null, error: { message: "connection reset" }, count: 1200 });
    const data = [];
    for (let i = from; i <= to; i += 1) data.push({ id: i });
    return Promise.resolve({ data, error: null, count: 1200 });
  };
  await assert.rejects(() => fetchAllRows(flaky, { pageSize: 500 }), /connection reset/);
});

test("works when the server reports no count, using short pages to terminate", async () => {
  const { request } = fakeTable(1200, Infinity, { reportCount: false });
  const rows = await fetchAllRows(request, { pageSize: 500 });
  assert.equal(rows.length, 1200);
});

test("rejects a nonsensical page size rather than looping forever", async () => {
  const { request } = fakeTable(10);
  await assert.rejects(() => fetchAllRows(request, { pageSize: 0 }), /pageSize must be at least 1/);
});

// Characterizes WHY callers must page on a total order (a unique column, or a
// unique-prefixed chain) — this is not a bug in fetchAllRows to fix. Without
// ORDER BY, Postgres is free to return LIMIT/OFFSET pages in a different row
// order on each request, so a multi-page read can skip one row and duplicate
// another. The length check nets to zero on a skip+duplicate pair, so it is
// undetectable from the row count alone — the multiset of ids is wrong even
// though `rows.length === total`.
test("without a total order, LIMIT/OFFSET paging can skip a row and duplicate another undetected", async () => {
  // 4 logical rows (A-D), page size 2. The first page is served in one
  // ordering; the second page is served as though the table's row order
  // shifted between requests (no ORDER BY pins it) — B reappears, C never
  // appears. This is the exact drop that ordered reads (this plan's fix) close.
  const pages = [
    [{ id: "A" }, { id: "B" }],
    [{ id: "B" }, { id: "D" }]
  ];
  let call = 0;
  const unordered = () => {
    const data = pages[call];
    call += 1;
    return Promise.resolve({ data, error: null, count: 4 });
  };
  const rows = await fetchAllRows(unordered, { pageSize: 2 });
  assert.equal(rows.length, 4, "the length check alone does not catch this");
  const ids = rows.map(r => r.id).sort();
  assert.deepEqual(ids, ["A", "B", "B", "D"], "B is duplicated and C is missing");
});
