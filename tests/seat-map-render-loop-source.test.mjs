import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Scope note: this file guards ONE correctness anchor — SeatMap's visible-range
// writer must never go back to a single object state.
//
// The bug it pins (fixed 2026-08-10): updateMapVisibleRange held
// `{ left, right, viewportWidth }` in one useState and its updater returned a
// freshly allocated object whenever the geometry had moved. React re-runs an
// updater against the BASE state while it drains the queue, and bails out only
// when the result is Object.is-equal to the current state — which a new object
// never is. Each replay therefore scheduled another render until React threw
// "Maximum update depth exceeded": measured at 200 updater runs across 45
// renders from a single mount, with the map geometry completely static.
// Splitting the object into three primitive states fixes it, because a replayed
// number compares equal by value and the bailout succeeds.
//
// Why this is a SOURCE test and not a runtime one: reproducing the loop needs
// React's development build plus a real layout and real seat data — the dev
// server. `test:browser` bundles React in production mode (a guard written there
// passed 6/6 against the unfixed code), and a dev-mode harness fires the same
// error even when fixed, because it ships no CSS and its floor-plan image 404s,
// so SeatMap's de-collision measurement never settles. No CI tier runs a dev
// server, so the shape of the fix is what gets pinned here. Verified by hand
// against the real dev app: 5/6 runs burst before the fix, 0/6 after.

const readSeatMap = () => readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

function readRangeWriter(source) {
  const writer = source.match(/const updateMapVisibleRange = useCallback\(\(\) => \{[\s\S]*?\n {2}\}, \[\]\);/);
  assert.ok(writer, "updateMapVisibleRange should remain source-visible as a useCallback.");
  return writer[0];
}

test("the visible-range writer stores three numbers, not one object", async () => {
  const writer = readRangeWriter(await readSeatMap());

  for (const setter of ["setMapVisibleLeft", "setMapVisibleRight", "setMapVisibleViewportWidth"]) {
    assert.match(writer, new RegExp(`${setter}\\(current =>`), `${setter} should take a functional updater over a number.`);
  }

  // The regression itself: one setState holding the whole range.
  assert.doesNotMatch(writer, /setMapVisibleRange/, "The range must not go back to a single object state.");
});

test("no visible-range updater can return a fresh object", async () => {
  // Comments stripped first: the writer's own explanation quotes the offending
  // `{left, right, viewportWidth}` shape, and that prose is the point of it.
  const writer = readRangeWriter(await readSeatMap()).replace(/^\s*\/\/.*$/gm, "");

  // An updater that allocates is an updater React can never bail out of, which
  // is the exact shape that produced the render loop. The writer computes the
  // three numbers and hands each to its own setter — a `{ left, ... right }`
  // literal anywhere inside it means the range is being packed up again.
  assert.doesNotMatch(
    writer,
    /\{\s*left\s*[,:][\s\S]{0,120}?\bright\b/,
    "A range updater must not build an object literal — replays allocate a new one every pass and defeat React's bailout."
  );
});

test("consumers still read a single mapVisibleRange object, rebuilt by useMemo", async () => {
  const source = await readSeatMap();
  const memo = source.match(/const mapVisibleRange = useMemo\([\s\S]*?\);/);

  assert.ok(memo, "mapVisibleRange should still exist for consumers, derived via useMemo.");
  assert.match(memo[0], /left: mapVisibleLeft/);
  assert.match(memo[0], /right: mapVisibleRight/);
  assert.match(memo[0], /viewportWidth: mapVisibleViewportWidth/);
  // Deps are the three numbers — so the object's identity changes only when a
  // component number actually moves, which is what keeps consumers stable.
  assert.match(memo[0], /\[mapVisibleLeft, mapVisibleRight, mapVisibleViewportWidth\]/);

  for (const state of ["mapVisibleLeft", "mapVisibleRight", "mapVisibleViewportWidth"]) {
    assert.match(source, new RegExp(`const \\[${state}, set${state[0].toUpperCase()}${state.slice(1)}\\] = useState\\(`));
  }
});
