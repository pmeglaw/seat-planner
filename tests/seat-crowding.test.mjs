import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const {
  PILL_CLEARANCE_PX,
  PILL_DEFAULT_CLEARANCE,
  PILL_HEIGHT_PX,
  PILL_NUDGE_PX,
  PILL_PAD_PX,
  PILL_CHAR_PX,
  estimatePillWidthPx,
  clearanceFromScale,
  computeCrowdedSeatIds,
  computeNameLabelNudges
} = await importTsModule("lib/seatCrowding.ts");

// Phase 4 PR 3b: ONE pill layer. The 44px hit-floor gate and the code-pill
// nudge graph (the retired code-pill graph) retired with the Phase 3 pill — every
// marker carries the asset's touch target, and one collision graph models
// each pill at its own estimated width.
test("the pill height is exactly two nudges (DECISIONS D1) and the width estimate is bounded", () => {
  assert.equal(PILL_HEIGHT_PX, 28);
  assert.equal(PILL_HEIGHT_PX, 2 * PILL_NUDGE_PX);
  assert.equal(PILL_CLEARANCE_PX.y, PILL_HEIGHT_PX + 2);
  // An empty label (or a blank one) is the square footprint; otherwise pads +
  // characters, never narrower than the footprint.
  assert.equal(estimatePillWidthPx(""), PILL_HEIGHT_PX);
  assert.equal(estimatePillWidthPx("   "), PILL_HEIGHT_PX);
  assert.equal(estimatePillWidthPx("A"), PILL_HEIGHT_PX);
  assert.equal(estimatePillWidthPx("Sarah R."), Math.round(2 * PILL_PAD_PX + 8 * PILL_CHAR_PX));
  assert.ok(estimatePillWidthPx("Christopher W.") > estimatePillWidthPx("Kai M."), "wider label, wider pill");
});

test("computeNameLabelNudges is width-aware when given per-seat widths and a scale", () => {
  // Two named seats 60px apart at 1000px per unit. Two 36px pills (half-sum
  // 36) sit clear; two 80px pills (half-sum 80) overlap and must diverge.
  const seats = [
    { id: "a", x: 0.5, y: 0.5, label: "Kai M." },
    { id: "b", x: 0.56, y: 0.5, label: "Christopher W." }
  ];
  const named = new Set(["a", "b"]);
  const clearance = clearanceFromScale(1000, 1000 * (867 / 1911));
  const narrow = computeNameLabelNudges(seats, named, clearance, { widthPx: () => 36, pixelsPerXUnit: 1000 });
  assert.equal(narrow.get("a"), 0);
  assert.equal(narrow.get("b"), 0);
  const wide = computeNameLabelNudges(seats, named, clearance, { widthPx: () => 80, pixelsPerXUnit: 1000 });
  assert.notEqual(wide.get("a"), wide.get("b"));
  assert.ok([wide.get("a"), wide.get("b")].includes(0));
  // Without a usable scale the uniform clearance box applies (72px > 60px → collide).
  const boxed = computeNameLabelNudges(seats, named, clearance, { widthPx: () => 36, pixelsPerXUnit: 0 });
  assert.notEqual(boxed.get("a"), boxed.get("b"));
  // A named pill overlapping an unnamed FOOTPRINT (28px) prefers the off-anchor rows.
  const withFootprint = computeNameLabelNudges(
    [seats[0], { id: "empty", x: 0.54, y: 0.5, label: "" }],
    new Set(["a"]),
    clearance,
    { widthPx: seat => (seat.id === "empty" ? PILL_HEIGHT_PX : 60), pixelsPerXUnit: 1000 }
  );
  assert.notEqual(withFootprint.get("a"), 0);
});

test("adjacent seats inside the clearance box are both flagged", () => {
  const seats = [
    { id: "cw05", x: 0.35, y: 0.62 },
    { id: "cw06", x: 0.382, y: 0.62 }, // 0.032 pitch — the tightest real pod
    { id: "e01", x: 0.62, y: 0.42 } // far away from both
  ];
  const crowded = computeCrowdedSeatIds(seats, { x: 0.044, y: 0.024 });
  assert.deepEqual([...crowded].sort(), ["cw05", "cw06"]);
});

test("seats aligned on x but vertically separated are not crowded", () => {
  const seats = [
    { id: "n01", x: 0.3, y: 0.2 },
    { id: "n05", x: 0.3, y: 0.26 } // same column, next row — pills stack fine
  ];
  assert.equal(computeCrowdedSeatIds(seats, { x: 0.044, y: 0.024 }).size, 0);
});

test("clearance shrinks as the render scale grows, uncrowding zoomed-in pods", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.532, y: 0.5 }
  ];
  // Fit zoom (~1060px per normalized unit): 0.032 pitch = 34px < the 72px pill clearance → crowded.
  const atFit = computeCrowdedSeatIds(seats, clearanceFromScale(1060));
  assert.equal(atFit.size, 2);
  // Zoomed to ~230% (2400px per unit): 0.032 * 2400 = 77px > 72px → clear.
  const zoomed = computeCrowdedSeatIds(seats, clearanceFromScale(2400));
  assert.equal(zoomed.size, 0);
});

test("clearanceFromScale converts px clearance and falls back on degenerate scales", () => {
  const converted = clearanceFromScale(1000);
  assert.equal(converted.x, PILL_CLEARANCE_PX.x / 1000);
  assert.equal(converted.y, PILL_CLEARANCE_PX.y / 1000);
  assert.deepEqual(clearanceFromScale(0), PILL_DEFAULT_CLEARANCE);
  assert.deepEqual(clearanceFromScale(Number.NaN), PILL_DEFAULT_CLEARANCE);
  assert.deepEqual(clearanceFromScale(-5), PILL_DEFAULT_CLEARANCE);
});

test("clearanceFromScale divides the y clearance by its own axis scale", () => {
  // Normalized y spans the frame height — on the 1911×867 plan a 1100px-wide
  // frame is only ~499px tall, so 26px of vertical clearance is a much larger
  // normalized-y span than the width-divided fallback pretends.
  const converted = clearanceFromScale(1100, 499);
  assert.equal(converted.x, PILL_CLEARANCE_PX.x / 1100);
  assert.equal(converted.y, PILL_CLEARANCE_PX.y / 499);
  // A degenerate y scale falls back entirely.
  assert.deepEqual(clearanceFromScale(1100, 0), PILL_DEFAULT_CLEARANCE);
});

test("a diagonal pair whose pills overlap vertically is crowded under the y-aware clearance", () => {
  // SE03/SE04 on prod: dx ≈ 0.030 normalized-x, dy ≈ 0.022 normalized-y —
  // ~33px apart horizontally and ~11px vertically at a 1096×497 frame, i.e.
  // physically overlapping 24px-tall pills. The width-divided fallback put the
  // y cutoff at ~12px-equivalent and let the pair render untreated.
  const seats = [
    { id: "se03", x: 0.63, y: 0.5 },
    { id: "se04", x: 0.66, y: 0.522 }
  ];
  const yAware = computeCrowdedSeatIds(seats, clearanceFromScale(1096, 497));
  assert.deepEqual([...yAware].sort(), ["se03", "se04"]);
});

test("empty and single-seat inputs return an empty set", () => {
  assert.equal(computeCrowdedSeatIds([]).size, 0);
  assert.equal(computeCrowdedSeatIds([{ id: "solo", x: 0.5, y: 0.5 }]).size, 0);
});

test("the tightest real pod is crowded at a narrowed rest scale", () => {
  // ~1100px rendered frame. This was the viewer's at-rest width while the
  // docked People directory held the right slot; that panel is retired (the
  // Find palette floats), so the viewer rests wider now — but the case stays
  // worth pinning, because 1100px is still exactly what a 1440 viewport
  // renders once the browser chrome and a narrow window take their share.
  // CW-pod pitch ≈ 0.025 normalized — well inside the 72px clearance, so
  // these pills must be nudged apart.
  const clearance = clearanceFromScale(1100);
  const seats = [
    { id: "cw05", x: 0.35, y: 0.62 },
    { id: "cw06", x: 0.375, y: 0.62 }
  ];
  assert.deepEqual([...computeCrowdedSeatIds(seats, clearance)].sort(), ["cw05", "cw06"]);
});

test("computeCrowdedSeatIds honors an explicit clearance override", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.6, y: 0.5 }
  ];
  // Not crowded under the default clearance...
  assert.equal(computeCrowdedSeatIds(seats).size, 0);
  // ...but crowded under a wide explicit clearance.
  assert.deepEqual([...computeCrowdedSeatIds(seats, { x: 0.2, y: 0.2 })].sort(), ["a", "b"]);
});

test("computeNameLabelNudges gives two colliding named seats distinct nudges", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 } // within default clearance
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["a", "b"]), PILL_DEFAULT_CLEARANCE);
  const nudgeA = nudges.get("a");
  const nudgeB = nudges.get("b");
  assert.notEqual(nudgeA, nudgeB);
  assert.ok([nudgeA, nudgeB].includes(0));
  const other = nudgeA === 0 ? nudgeB : nudgeA;
  assert.ok([-1, 1].includes(other));
});

test("computeNameLabelNudges gives three colliding named seats in a row pairwise-distinct nudges", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 },
    { id: "c", x: 0.54, y: 0.5 }
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["a", "b", "c"]), PILL_DEFAULT_CLEARANCE);
  const values = ["a", "b", "c"].map((id) => nudges.get(id));
  assert.equal(new Set(values).size, 3, "expected all three nudges to be pairwise distinct");
  for (const value of values) {
    assert.ok([-1, 0, 1].includes(value));
  }
});

// 2026-07-16 critique, minor 9 (contract change from the earlier "unnamed
// neighbours are irrelevant" rule): an unnamed neighbour's CODE pill renders
// pinned at the anchor line, so a name pill overlapping it must prefer a
// vertical offset — nudge 0 would leave the lateral clip (C06→"C07 Daniel",
// CW01↔CW02 at 1920 fit). Unnamed seats still never receive a nudge and never
// consume a palette slot (the 4-clique phantom-member fix stands).
test("computeNameLabelNudges lifts a named seat off the anchor row when it collides with an unnamed seat", () => {
  const seats = [
    { id: "namedSeat", x: 0.5, y: 0.5 },
    { id: "unnamedSeat", x: 0.52, y: 0.5 } // within clearance, but not named
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["namedSeat"]), PILL_DEFAULT_CLEARANCE);
  assert.ok([-1, 1].includes(nudges.get("namedSeat")), "expected a non-zero nudge away from the code pill row");
  assert.equal(nudges.has("unnamedSeat"), false);
});

test("computeNameLabelNudges keeps 0 for a named seat with no collisions at all", () => {
  const seats = [
    { id: "namedSeat", x: 0.5, y: 0.5 },
    { id: "farUnnamed", x: 0.8, y: 0.8 }
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["namedSeat"]), PILL_DEFAULT_CLEARANCE);
  assert.equal(nudges.get("namedSeat") ?? 0, 0);
});

test("computeNameLabelNudges keeps colliding named pairs distinct when both also collide with unnamed seats", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 },
    { id: "openLeft", x: 0.48, y: 0.5 },
    { id: "openRight", x: 0.54, y: 0.5 }
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["a", "b"]), PILL_DEFAULT_CLEARANCE);
  const nudgeA = nudges.get("a");
  const nudgeB = nudges.get("b");
  assert.notEqual(nudgeA, nudgeB);
  assert.ok([-1, 1].includes(nudgeA), "obstacle-colliding name pill must leave the anchor row");
  assert.ok([-1, 1].includes(nudgeB), "obstacle-colliding name pill must leave the anchor row");
});

test("computeNameLabelNudges returns an empty map when no seats are named", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 }
  ];
  const nudges = computeNameLabelNudges(seats, new Set(), PILL_DEFAULT_CLEARANCE);
  assert.equal(nudges.size, 0);
});

test("computeNameLabelNudges never mutates the input seats", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 }
  ];
  const snapshot = JSON.parse(JSON.stringify(seats));
  computeNameLabelNudges(seats, new Set(["a", "b"]), PILL_DEFAULT_CLEARANCE);
  assert.deepEqual(seats, snapshot);
});

function assertCollidingPairsDistinct(seats, clearance, nudges) {
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      const a = seats[i];
      const b = seats[j];
      const colliding = Math.abs(a.x - b.x) < clearance.x && Math.abs(a.y - b.y) < clearance.y;
      if (colliding) {
        assert.notEqual(
          nudges.get(a.id),
          nudges.get(b.id),
          `expected distinct nudges for colliding pair ${a.id}/${b.id}`
        );
      }
    }
  }
}

test("computeNameLabelNudges is collision-aware, not just positional (reviewer counterexample)", () => {
  // A(0,0), B(0.05,0.001), C(0.02,0.002), D(0.03,0.003) under default clearance
  // {x:0.044,y:0.024}. Collision edges: A-C, A-D, B-C, B-D, C-D (NOT A-B).
  // A positional [0,-1,1] pattern by sorted (y,x) order (A,B,C,D) assigns
  // [0,-1,1,0] — A and D share nudge 0 despite actually colliding.
  const seats = [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 0.05, y: 0.001 },
    { id: "C", x: 0.02, y: 0.002 },
    { id: "D", x: 0.03, y: 0.003 }
  ];
  const clearance = PILL_DEFAULT_CLEARANCE;
  const nudges = computeNameLabelNudges(seats, new Set(["A", "B", "C", "D"]), clearance);
  assertCollidingPairsDistinct(seats, clearance, nudges);
});

test("computeNameLabelNudges handles a non-collinear 2D cluster pairwise-distinctly", () => {
  // n1/n2/n3 form a mutually-colliding triangle (max clique = 3, exactly the
  // palette size); n4 collides only with n3. Not collinear: n1/n2 share y=0,
  // n3 is offset vertically, n4 is offset further in both x and y.
  const clearance = { x: 0.044, y: 0.024 };
  const seats = [
    { id: "n1", x: 0, y: 0 },
    { id: "n2", x: 0.02, y: 0 },
    { id: "n3", x: 0, y: 0.01 },
    { id: "n4", x: 0.02, y: 0.03 }
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["n1", "n2", "n3", "n4"]), clearance);
  assertCollidingPairsDistinct(seats, clearance, nudges);
});

test("computeNameLabelNudges: excluded seats don't influence coloring — 4-clique minus one named stays pairwise-distinct", () => {
  // Contract pin for the SeatMap fix (fix/pill-legibility-crowding): the
  // caller's namedSeatIds must contain only seats that actually render name
  // labels (e.g. NOT dimmed seats). With all 4 members of a mutual clique
  // named, the 3-value palette is exhausted and the least-used fallback may
  // hand two seats the same nudge; with one member excluded, the remaining
  // 3 named seats must get pairwise-distinct nudges and the excluded seat
  // must receive no nudge at all.
  // This is a generic lib-level contract (the "excluded" member is just an
  // id absent from namedSeatIds) — it equally pins the round-2 fix, where
  // SeatMap excludes a selected/dragging/swap-source/swap-target seat (which
  // SeatMarker's nameNudgeApplicable never nudges) from namedSeatIdSet.
  const clearance = { x: 0.05, y: 0.05 };
  const seats = [
    { id: "dimmedSeat", x: 0.5, y: 0.5 },
    { id: "a", x: 0.51, y: 0.5 },
    { id: "b", x: 0.52, y: 0.51 },
    { id: "c", x: 0.51, y: 0.51 }
  ];
  // Sanity: all four seats mutually collide (a true 4-clique).
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      assert.ok(
        Math.abs(seats[i].x - seats[j].x) < clearance.x &&
          Math.abs(seats[i].y - seats[j].y) < clearance.y,
        `fixture broken: ${seats[i].id}/${seats[j].id} should collide`
      );
    }
  }
  const nudges = computeNameLabelNudges(seats, new Set(["a", "b", "c"]), clearance);
  assert.equal(nudges.has("dimmedSeat"), false, "excluded seat must not be nudged");
  const values = ["a", "b", "c"].map((id) => nudges.get(id));
  assert.equal(new Set(values).size, 3, "expected the three named seats to be pairwise distinct");
  for (const value of values) {
    assert.ok([-1, 0, 1].includes(value));
  }
});

test("computeNameLabelNudges is input-order invariant, including tied coordinates", () => {
  const clearance = PILL_DEFAULT_CLEARANCE;
  const baseSeats = [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 0.05, y: 0.001 },
    { id: "C", x: 0.02, y: 0.002 },
    { id: "D", x: 0.03, y: 0.003 },
    // Two seats sharing identical coordinates, distinguished only by id.
    { id: "E", x: 0.5, y: 0.5 },
    { id: "F", x: 0.5, y: 0.5 }
  ];
  const namedIds = new Set(baseSeats.map((seat) => seat.id));
  const baseline = computeNameLabelNudges(baseSeats, namedIds, clearance);

  const shuffled = [
    baseSeats[4],
    baseSeats[2],
    baseSeats[5],
    baseSeats[0],
    baseSeats[3],
    baseSeats[1]
  ];
  const shuffledResult = computeNameLabelNudges(shuffled, namedIds, clearance);

  assert.deepEqual(
    [...shuffledResult.entries()].sort(),
    [...baseline.entries()].sort(),
    "expected identical nudge assignment regardless of input array order"
  );
});
