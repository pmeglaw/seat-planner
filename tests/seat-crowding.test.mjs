import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const {
  CODE_PILL_CLEARANCE_PX,
  CODE_PILL_SIZE_PX,
  CODE_PILL_DEFAULT_CLEARANCE,
  PILL_NUDGE_PX,
  clearanceFromScale,
  computeCrowdedSeatIds,
  computeNameLabelNudges,
  computeCodePillNudges
} = await importTsModule("lib/seatCrowding.ts");

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
  // Fit zoom (~1060px per normalized unit): 0.032 pitch < 48px clearance → crowded.
  const atFit = computeCrowdedSeatIds(seats, clearanceFromScale(1060));
  assert.equal(atFit.size, 2);
  // Zoomed to ~150% (1600px per unit): 0.032 * 1600 = 51px > 48px → clear.
  const zoomed = computeCrowdedSeatIds(seats, clearanceFromScale(1600));
  assert.equal(zoomed.size, 0);
});

test("clearanceFromScale converts px clearance and falls back on degenerate scales", () => {
  const converted = clearanceFromScale(1000);
  assert.equal(converted.x, CODE_PILL_CLEARANCE_PX.x / 1000);
  assert.equal(converted.y, CODE_PILL_CLEARANCE_PX.y / 1000);
  assert.deepEqual(clearanceFromScale(0), CODE_PILL_DEFAULT_CLEARANCE);
  assert.deepEqual(clearanceFromScale(Number.NaN), CODE_PILL_DEFAULT_CLEARANCE);
  assert.deepEqual(clearanceFromScale(-5), CODE_PILL_DEFAULT_CLEARANCE);
});

test("clearanceFromScale divides the y clearance by its own axis scale", () => {
  // Normalized y spans the frame height — on the 1911×867 plan a 1100px-wide
  // frame is only ~499px tall, so 26px of vertical clearance is a much larger
  // normalized-y span than the width-divided fallback pretends.
  const converted = clearanceFromScale(1100, 499);
  assert.equal(converted.x, CODE_PILL_CLEARANCE_PX.x / 1100);
  assert.equal(converted.y, CODE_PILL_CLEARANCE_PX.y / 499);
  // A degenerate y scale falls back entirely.
  assert.deepEqual(clearanceFromScale(1100, 0), CODE_PILL_DEFAULT_CLEARANCE);
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

test("the tightest real pod is crowded at the directory-open rest scale", () => {
  // ~1100px rendered frame (1440 viewport with the People directory holding
  // the right slot). CW-pod pitch ≈ 0.025 normalized — well inside the 48px
  // clearance, so these pills must be nudged apart at rest.
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
  const nudges = computeNameLabelNudges(seats, new Set(["a", "b"]), CODE_PILL_DEFAULT_CLEARANCE);
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
  const nudges = computeNameLabelNudges(seats, new Set(["a", "b", "c"]), CODE_PILL_DEFAULT_CLEARANCE);
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
  const nudges = computeNameLabelNudges(seats, new Set(["namedSeat"]), CODE_PILL_DEFAULT_CLEARANCE);
  assert.ok([-1, 1].includes(nudges.get("namedSeat")), "expected a non-zero nudge away from the code pill row");
  assert.equal(nudges.has("unnamedSeat"), false);
});

test("computeNameLabelNudges keeps 0 for a named seat with no collisions at all", () => {
  const seats = [
    { id: "namedSeat", x: 0.5, y: 0.5 },
    { id: "farUnnamed", x: 0.8, y: 0.8 }
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["namedSeat"]), CODE_PILL_DEFAULT_CLEARANCE);
  assert.equal(nudges.get("namedSeat") ?? 0, 0);
});

test("computeNameLabelNudges keeps colliding named pairs distinct when both also collide with unnamed seats", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 },
    { id: "openLeft", x: 0.48, y: 0.5 },
    { id: "openRight", x: 0.54, y: 0.5 }
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["a", "b"]), CODE_PILL_DEFAULT_CLEARANCE);
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
  const nudges = computeNameLabelNudges(seats, new Set(), CODE_PILL_DEFAULT_CLEARANCE);
  assert.equal(nudges.size, 0);
});

test("computeNameLabelNudges never mutates the input seats", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 }
  ];
  const snapshot = JSON.parse(JSON.stringify(seats));
  computeNameLabelNudges(seats, new Set(["a", "b"]), CODE_PILL_DEFAULT_CLEARANCE);
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
  const clearance = CODE_PILL_DEFAULT_CLEARANCE;
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
  const clearance = CODE_PILL_DEFAULT_CLEARANCE;
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

// --- computeCodePillNudges: uniform-size code pills de-collide by nudging ---

// Post-nudge overlap check in CSS px, using the SAME exported geometry the
// scorer models — the assertions below are about what renders on screen.
function projectedPairOverlap(a, b, nudges, clearance) {
  const pxPerNormX = CODE_PILL_CLEARANCE_PX.x / clearance.x;
  const pxPerNormY = CODE_PILL_CLEARANCE_PX.y / clearance.y;
  const dx = Math.abs(a.x - b.x) * pxPerNormX;
  const dy = Math.abs(
    (a.y - b.y) * pxPerNormY + ((nudges.get(a.id) ?? 0) - (nudges.get(b.id) ?? 0)) * PILL_NUDGE_PX
  );
  const ox = CODE_PILL_SIZE_PX.w - dx;
  const oy = CODE_PILL_SIZE_PX.h - dy;
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

test("computeCodePillNudges sends a colliding pair in opposite directions, upper seat up", () => {
  const clearance = CODE_PILL_DEFAULT_CLEARANCE;
  const seats = [
    { id: "cw05", x: 0.35, y: 0.62 },
    { id: "cw06", x: 0.382, y: 0.62 }, // 0.032 pitch — the tightest real pod
    { id: "e01", x: 0.62, y: 0.42 } // isolated — must stay on the anchor row
  ];
  const nudges = computeCodePillNudges(seats, clearance);
  // Same y — the x/id tiebreaker makes cw05 the "upper/left" seat.
  assert.equal(nudges.get("cw05"), -1);
  assert.equal(nudges.get("cw06"), 1);
  assert.equal(nudges.get("e01") ?? 0, 0);
});

test("computeCodePillNudges diverges a diagonal pair instead of converging it", () => {
  // SE03/SE04-style: the lower-right seat must nudge DOWN while the
  // upper-left seat nudges UP — a converging assignment would stack them.
  const clearance = clearanceFromScale(1096, 497);
  const seats = [
    { id: "se03", x: 0.63, y: 0.5 },
    { id: "se04", x: 0.66, y: 0.522 }
  ];
  const nudges = computeCodePillNudges(seats, clearance);
  assert.equal(nudges.get("se03"), -1);
  assert.equal(nudges.get("se04"), 1);
});

test("computeCodePillNudges never assigns the same direction to a colliding pair", () => {
  const clearance = CODE_PILL_DEFAULT_CLEARANCE;
  // A 4-seat chain: a-b, b-c, c-d collide; a-c, b-d, a-d do not.
  const seats = [
    { id: "a", x: 0.1, y: 0.5 },
    { id: "b", x: 0.14, y: 0.5 },
    { id: "c", x: 0.18, y: 0.5 },
    { id: "d", x: 0.22, y: 0.5 }
  ];
  const nudges = computeCodePillNudges(seats, clearance);
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      const collide =
        Math.abs(seats[i].x - seats[j].x) < clearance.x &&
        Math.abs(seats[i].y - seats[j].y) < clearance.y;
      if (!collide) continue;
      assert.notEqual(
        nudges.get(seats[i].id),
        nudges.get(seats[j].id),
        `${seats[i].id} and ${seats[j].id} collide but share a nudge row`
      );
    }
  }
});

// The scorer is the load-bearing half of the algorithm: two horizontally
// colliding pairs stacked one row apart each resolve internally with EITHER
// orientation, but a palette-order-first assignment (upper pair down, lower
// pair up) converges them into each other — the live NE-pod regression this
// scoring exists to prevent. A plain "first free palette value" greedy fails
// this test.
test("computeCodePillNudges steers stacked pairs apart via projected-overlap scoring", () => {
  // Real fit-zoom geometry: ~1414px frame → clearance {0.034, 0.0406};
  // 39.6px horizontal pitch inside each pair, 45px row pitch between pairs
  // (outside the collision clearance, inside nudge reach).
  const clearance = clearanceFromScale(1414, 641);
  const seats = [
    { id: "a", x: 0.1, y: 0.5 },
    { id: "b", x: 0.128, y: 0.5 },
    { id: "c", x: 0.1, y: 0.5702 },
    { id: "d", x: 0.128, y: 0.5702 }
  ];
  const nudges = computeCodePillNudges(seats, clearance);
  // Upper pair: upper/left seat up, partner down (palette order).
  assert.equal(nudges.get("a"), -1);
  assert.equal(nudges.get("b"), 1);
  // Lower pair must move AWAY from b (+1) above it: c takes +1 too (same
  // direction as the row above = relative pitch preserved), not the naive
  // palette-first -1 that would kiss b's row.
  assert.equal(nudges.get("c"), 1);
  // No colliding pair shares a row, and cross-pair overlap stays tiny
  // (< 15% of a pill) instead of the deep naive convergence.
  assert.notEqual(nudges.get("c"), nudges.get("d"));
  const pillArea = CODE_PILL_SIZE_PX.w * CODE_PILL_SIZE_PX.h;
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      const overlap = projectedPairOverlap(seats[i], seats[j], nudges, clearance);
      assert.ok(
        overlap < pillArea * 0.15,
        `${seats[i].id}/${seats[j].id} project ${Math.round(overlap)}px² of overlap`
      );
    }
  }
});

test("computeCodePillNudges dodges a named neighbour's name-pill row", () => {
  // A crowded unnamed seat next to a named seat whose name label was nudged
  // up (-1) must NOT follow it onto the same row — pre-unification both
  // graphs independently picked -1 and the code pill rendered under the
  // name pill.
  const clearance = CODE_PILL_DEFAULT_CLEARANCE;
  const seats = [
    { id: "named", x: 0.5, y: 0.5 },
    { id: "vacant", x: 0.532, y: 0.5 }
  ];
  const nudges = computeCodePillNudges(seats, clearance, {
    nameNudges: new Map([["named", -1]]),
    namedSeatIds: new Set(["named"])
  });
  assert.equal(nudges.has("named"), false, "named seats never join the code graph");
  assert.equal(nudges.get("vacant"), 1);
});

test("computeCodePillNudges scores the fallback row when a clique exhausts the palette", () => {
  // A 2×2 grid tight enough that all four seats mutually collide (K4). The
  // fourth seat's colliding neighbours cover all three rows — it must pick
  // the least-overlapping one by scoring, not park on a hardcoded 0 (which
  // here shares a row with its direct horizontal neighbour).
  const clearance = CODE_PILL_DEFAULT_CLEARANCE;
  const seats = [
    { id: "t1", x: 0.5, y: 0.5 },
    { id: "t2", x: 0.53, y: 0.5 },
    { id: "t3", x: 0.5, y: 0.52 },
    { id: "t4", x: 0.53, y: 0.52 }
  ];
  const nudges = computeCodePillNudges(seats, clearance);
  assert.equal(nudges.get("t3"), 0, "third clique member takes the only unused row");
  assert.notEqual(
    nudges.get("t4"),
    0,
    "palette-exhausted seat must be scored onto a row, not parked beside its same-row neighbour"
  );
});

test("computeCodePillNudges guards degenerate clearances instead of emitting NaN scores", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.532, y: 0.5 }
  ];
  // Zero clearance would make pxPerNorm Infinity and every score NaN; the
  // guard falls back to the default clearance, so the pair still diverges.
  const nudges = computeCodePillNudges(seats, { x: 0, y: 0 });
  assert.equal(nudges.get("a"), -1);
  assert.equal(nudges.get("b"), 1);
  // Denormal scales overflow clearanceFromScale's quotient — it must fall
  // back rather than return an Infinity clearance.
  assert.deepEqual(clearanceFromScale(1e-320, 1e-320), CODE_PILL_DEFAULT_CLEARANCE);
});

test("computeCodePillNudges leaves non-crowded seats and empty inputs alone", () => {
  const clearance = CODE_PILL_DEFAULT_CLEARANCE;
  const seats = [
    { id: "n01", x: 0.3, y: 0.2 },
    { id: "n05", x: 0.3, y: 0.26 }
  ];
  assert.equal(computeCodePillNudges(seats, clearance).size, 0);
  assert.equal(computeCodePillNudges([], clearance).size, 0);
});

test("computeCodePillNudges is input-order invariant and does not mutate its input", () => {
  const clearance = CODE_PILL_DEFAULT_CLEARANCE;
  const baseSeats = [
    { id: "A", x: 0.1, y: 0.5 },
    { id: "B", x: 0.14, y: 0.5 },
    { id: "C", x: 0.5, y: 0.5 },
    { id: "D", x: 0.532, y: 0.5 },
    { id: "E", x: 0.532, y: 0.5 } // tied coordinates — id tiebreaker
  ];
  const snapshot = JSON.parse(JSON.stringify(baseSeats));
  const baseline = computeCodePillNudges(baseSeats, clearance);
  assert.deepEqual(baseSeats, snapshot, "input seats must not be mutated");

  const shuffled = [baseSeats[3], baseSeats[1], baseSeats[4], baseSeats[0], baseSeats[2]];
  const shuffledResult = computeCodePillNudges(shuffled, clearance);
  assert.deepEqual(
    [...shuffledResult.entries()].sort(),
    [...baseline.entries()].sort(),
    "expected identical nudge assignment regardless of input array order"
  );
});

test("seats at identical coordinates fall back to id order, so input order never changes nudges", () => {
  const clearance = { x: 0.04, y: 0.05 };
  const seats = [
    { id: "b", x: 0.5, y: 0.5 },
    { id: "a", x: 0.5, y: 0.5 }
  ];
  const named = new Set(["a", "b"]);

  const forward = computeNameLabelNudges(seats, named, clearance);
  const reversed = computeNameLabelNudges([...seats].reverse(), named, clearance);

  assert.deepEqual(Object.fromEntries(forward), Object.fromEntries(reversed));
  assert.notEqual(forward.get("a"), forward.get("b"));
  // "a" sorts first on the id tiebreaker, so it takes the anchor row.
  assert.equal(forward.get("a"), 0);
});

test("a 4-clique of named seats exhausts the palette and falls back to the least-used row", () => {
  const clearance = { x: 0.1, y: 0.1 };
  const seats = [
    { id: "n1", x: 0.5, y: 0.5 },
    { id: "n2", x: 0.51, y: 0.5 },
    { id: "n3", x: 0.52, y: 0.5 },
    { id: "n4", x: 0.53, y: 0.5 }
  ];
  const named = new Set(["n1", "n2", "n3", "n4"]);

  const nudges = computeNameLabelNudges(seats, named, clearance);

  // The first three exhaust [0, -1, 1]; each value used exactly once.
  assert.deepEqual(new Set([nudges.get("n1"), nudges.get("n2"), nudges.get("n3")]), new Set([0, -1, 1]));
  // The fourth seat has no free value left — best-effort least-used, tie
  // broken by palette order for determinism.
  assert.equal(nudges.get("n4"), 0);
});

test("an uncrowded unnamed neighbour joins the code-pill graph as a resting obstacle that steers nudges", () => {
  const clearance = CODE_PILL_DEFAULT_CLEARANCE;
  const pair = [
    { id: "p1", x: 0.5, y: 0.5 },
    { id: "p2", x: 0.53, y: 0.5 } // collides with p1 (0.03 < 0.044)
  ];
  // 27.5px below p1: outside the clearance box (never crowded itself), but a
  // pill nudged DOWN from p2's row would land on it.
  const rest = { id: "rest", x: 0.5, y: 0.555 };

  const withoutRest = computeCodePillNudges(pair, clearance);
  const withRest = computeCodePillNudges([...pair, rest], clearance);

  // Alone, the pair diverges to the outer rows.
  assert.equal(withoutRest.get("p1"), -1);
  assert.equal(withoutRest.get("p2"), 1);
  // The resting pill's footprint makes +1 the worse row for p2, so the scorer
  // steers it to the anchor instead — dropping the obstacle handling would
  // leave p2 at +1 and fail here.
  assert.equal(withRest.get("p1"), -1);
  assert.equal(withRest.get("p2"), 0);
  // The resting seat is an obstacle, never a participant — no nudge of its own.
  assert.equal(withRest.has("rest"), false);
});
