import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const {
  SEAT_ZONE_RECTS,
  detectSeatZoneForPoint,
  detectSeatZoneForPointResult,
  getSeatZoneDetectionFailureMessage,
  inferSeatZoneFromPoint,
  inferSeatZoneFromPointResult
} = await importTsModule("lib/seatZones.ts");

function seat(label, x, y, zone) {
  return { label, x, y, zone, department: null };
}

test("known preview coordinates infer their seating zones", () => {
  assert.equal(inferSeatZoneFromPoint({ x: 0.337, y: 0.081 }), "North Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.713, y: 0.081 }), "Northeast Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.147, y: 0.415 }), "West Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.325, y: 0.397 }), "Center West");
  assert.equal(inferSeatZoneFromPoint({ x: 0.443, y: 0.588 }), "Center Desks");
  assert.equal(inferSeatZoneFromPoint({ x: 0.586, y: 0.414 }), "East Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.815, y: 0.586 }), "Southeast Office");
});

test("points outside approved zone rectangles do not infer a zone", () => {
  assert.equal(inferSeatZoneFromPoint({ x: 0.48, y: 0.35 }), null);
  assert.equal(inferSeatZoneFromPoint({ x: 0.12, y: 0.3 }), null);
});

test("private office coordinates infer their nearest approved zones", () => {
  assert.equal(inferSeatZoneFromPoint({ x: 0.08, y: 0.16 }), "North Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.55, y: 0.16 }), "Northeast Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.13, y: 0.77 }), "West Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.34, y: 0.58 }), "Center West");
  assert.equal(inferSeatZoneFromPoint({ x: 0.52, y: 0.74 }), "Center Desks");
  assert.equal(inferSeatZoneFromPoint({ x: 0.72, y: 0.68 }), "Southeast Office");
  assert.equal(inferSeatZoneFromPoint({ x: 0.85, y: 0.38 }), "Southeast Office");
  assert.equal(inferSeatZoneFromPoint({ x: 0.85, y: 0.78 }), "Southeast Office");
});

test("zone detection uses approved office rectangles without requiring nearby seats", () => {
  assert.equal(detectSeatZoneForPoint({ x: 0.12, y: 0.16 }, []), "North Pod");
  assert.equal(detectSeatZoneForPoint({ x: 0.55, y: 0.16 }, []), "Northeast Pod");
  assert.equal(detectSeatZoneForPoint({ x: 0.85, y: 0.78 }, []), "Southeast Office");
});

test("zone detection reports exact rectangle matches as deterministic", () => {
  assert.deepEqual(inferSeatZoneFromPointResult({ x: 0.586, y: 0.414 }), {
    status: "detected",
    zone: "East Pod"
  });
});

test("zone detection falls back to nearby same-zone seat clusters", () => {
  const seats = [
    seat("W07", 0.136, 0.588, "West Pod"),
    seat("W08", 0.187, 0.588, "West Pod"),
    seat("W10", 0.136, 0.768, "West Pod")
  ];

  const point = { x: 0.12, y: 0.66 };
  assert.equal(inferSeatZoneFromPoint(point), null);
  assert.equal(detectSeatZoneForPoint(point, seats), "West Pod");
  assert.deepEqual(detectSeatZoneForPointResult(point, seats), {
    status: "detected",
    zone: "West Pod"
  });
});

test("zone detection avoids clear hallway guesses and ambiguous clusters", () => {
  const farResult = detectSeatZoneForPointResult({ x: 0.16, y: 0.31 }, [
    seat("W01", 0.147, 0.415, "West Pod")
  ]);
  assert.equal(detectSeatZoneForPoint({ x: 0.16, y: 0.31 }, [
    seat("W01", 0.147, 0.415, "West Pod")
  ]), null);
  assert.deepEqual(farResult, { status: "none", zone: null });
  assert.equal(
    getSeatZoneDetectionFailureMessage(farResult),
    "Could not detect a zone for this location. Try clicking closer to an existing seating area."
  );

  const ambiguousResult = detectSeatZoneForPointResult({ x: 0.5, y: 0.95 }, [
    seat("A01", 0.46, 0.95, "Alpha Zone"),
    seat("B01", 0.54, 0.95, "Beta Zone")
  ]);
  assert.equal(detectSeatZoneForPoint({ x: 0.5, y: 0.95 }, [
    seat("A01", 0.46, 0.95, "Alpha Zone"),
    seat("B01", 0.54, 0.95, "Beta Zone")
  ]), null);
  assert.deepEqual(ambiguousResult, { status: "ambiguous", zone: null });
  assert.equal(
    getSeatZoneDetectionFailureMessage(ambiguousResult),
    "This location is between zones. Try again closer to the intended seating area."
  );
});

test("zone detection stays conservative between nearby zones", () => {
  const seats = [
    seat("A01", 0.46, 0.66, "Alpha Zone"),
    seat("B01", 0.54, 0.66, "Beta Zone")
  ];

  assert.deepEqual(detectSeatZoneForPointResult({ x: 0.5, y: 0.66 }, seats), {
    status: "ambiguous",
    zone: null
  });
});

test("zone rectangles are explicit normalized bounds", () => {
  const counts = SEAT_ZONE_RECTS.reduce((current, rect) => {
    current[rect.zone] = (current[rect.zone] ?? 0) + 1;
    return current;
  }, {});

  assert.deepEqual(counts, {
    "North Pod": 2,
    "Northeast Pod": 3,
    "West Pod": 2,
    "Center West": 2,
    "Center Desks": 2,
    "East Pod": 1,
    "Southeast Office": 5,
    "South Offices": 1
  });

  for (const rect of SEAT_ZONE_RECTS) {
    assert.ok(rect.xMin >= 0 && rect.xMin <= rect.xMax && rect.xMax <= 1);
    assert.ok(rect.yMin >= 0 && rect.yMin <= rect.yMax && rect.yMax <= 1);
  }
});

test("the bottom-band offices detect as South Offices (owner request 2026-07-23)", () => {
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
});

// ---- Per-floor dispatch (multi-floor PR-2, approach A)

test("floor dispatch: floor 3 is the default, floor 2 has no rectangles yet", () => {
  assert.equal(inferSeatZoneFromPoint({ x: 0.337, y: 0.081 }), inferSeatZoneFromPoint({ x: 0.337, y: 0.081 }, "3"));
  assert.deepEqual(inferSeatZoneFromPointResult({ x: 0.337, y: 0.081 }, "2"), { status: "none", zone: null });
});

test("floor dispatch: the nearby-seat fallback ignores seats on another floor", () => {
  // A floor-2 seat sitting right on top of a floor-3 click must not lend it a zone.
  const other = [{ ...seat("L01", 0.48, 0.35, "Litigation Pod"), floor: "2" }];
  assert.deepEqual(detectSeatZoneForPointResult({ x: 0.48, y: 0.35 }, other, "3"), { status: "none", zone: null });
  assert.deepEqual(detectSeatZoneForPointResult({ x: 0.48, y: 0.35 }, other, "2"), { status: "detected", zone: "Litigation Pod" });
  // Seats that carry no floor are floor 3 (the column default), as before.
  assert.deepEqual(detectSeatZoneForPointResult({ x: 0.48, y: 0.35 }, [seat("N09", 0.48, 0.35, "North Pod")]), { status: "detected", zone: "North Pod" });
});
