import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTsModule(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

const { SEAT_ZONE_RECTS, detectSeatZoneForPoint, inferSeatZoneFromPoint } = await importTsModule("lib/seatZones.ts");

function seat(label, x, y, zone) {
  return { label, x, y, zone, department: null };
}

test("known seeded coordinates infer their seating zones", () => {
  assert.equal(inferSeatZoneFromPoint({ x: 0.288917, y: 0.066468 }), "North Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.771941, y: 0.06746 }), "Northeast Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.080077, y: 0.382937 }), "West Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.299167, y: 0.375992 }), "Center West");
  assert.equal(inferSeatZoneFromPoint({ x: 0.42665, y: 0.536706 }), "Center Desks");
  assert.equal(inferSeatZoneFromPoint({ x: 0.588085, y: 0.382937 }), "East Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.88533, y: 0.548611 }), "Southeast Office");
});

test("points outside approved zone rectangles do not infer a zone", () => {
  assert.equal(inferSeatZoneFromPoint({ x: 0.66, y: 0.6 }), null);
  assert.equal(inferSeatZoneFromPoint({ x: 0.12, y: 0.3 }), null);
});

test("private office coordinates infer their nearest approved zones", () => {
  assert.equal(inferSeatZoneFromPoint({ x: 0.12, y: 0.07 }), "North Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.08, y: 0.16 }), "North Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.55, y: 0.16 }), "Northeast Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.04, y: 0.84 }), "West Pod");
  assert.equal(inferSeatZoneFromPoint({ x: 0.32, y: 0.9 }), "Center West");
  assert.equal(inferSeatZoneFromPoint({ x: 0.52, y: 0.8 }), "Center Desks");
  assert.equal(inferSeatZoneFromPoint({ x: 0.73, y: 0.68 }), "Southeast Office");
  assert.equal(inferSeatZoneFromPoint({ x: 0.91, y: 0.38 }), "Southeast Office");
  assert.equal(inferSeatZoneFromPoint({ x: 0.91, y: 0.78 }), "Southeast Office");
});

test("zone detection uses approved office rectangles without requiring nearby seats", () => {
  assert.equal(detectSeatZoneForPoint({ x: 0.12, y: 0.07 }, []), "North Pod");
  assert.equal(detectSeatZoneForPoint({ x: 0.55, y: 0.16 }, []), "Northeast Pod");
  assert.equal(detectSeatZoneForPoint({ x: 0.91, y: 0.78 }, []), "Southeast Office");
});

test("zone detection falls back to nearby same-zone seat clusters", () => {
  const seats = [
    seat("W10", 0.067905, 0.722222, "West Pod"),
    seat("W11", 0.122357, 0.722222, "West Pod"),
    seat("W12", 0.183857, 0.722222, "West Pod")
  ];

  const point = { x: 0.12, y: 0.8 };
  assert.equal(inferSeatZoneFromPoint(point), null);
  assert.equal(detectSeatZoneForPoint(point, seats), "West Pod");
});

test("zone detection avoids clear hallway guesses and ambiguous clusters", () => {
  assert.equal(detectSeatZoneForPoint({ x: 0.12, y: 0.3 }, [
    seat("W01", 0.080077, 0.382937, "West Pod")
  ]), null);

  assert.equal(detectSeatZoneForPoint({ x: 0.5, y: 0.95 }, [
    seat("A01", 0.46, 0.95, "Alpha Zone"),
    seat("B01", 0.54, 0.95, "Beta Zone")
  ]), null);
});

test("zone rectangles are explicit normalized bounds", () => {
  const counts = SEAT_ZONE_RECTS.reduce((current, rect) => {
    current[rect.zone] = (current[rect.zone] ?? 0) + 1;
    return current;
  }, {});

  assert.deepEqual(counts, {
    "North Pod": 4,
    "Northeast Pod": 3,
    "West Pod": 3,
    "Center West": 2,
    "Center Desks": 2,
    "East Pod": 1,
    "Southeast Office": 5
  });

  for (const rect of SEAT_ZONE_RECTS) {
    assert.ok(rect.xMin >= 0 && rect.xMin <= rect.xMax && rect.xMax <= 1);
    assert.ok(rect.yMin >= 0 && rect.yMin <= rect.yMax && rect.yMax <= 1);
  }
});
