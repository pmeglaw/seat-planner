import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const { buildNextSeatLabel, inferSeatPrefixFromZone } = await importTsModule("lib/seatLabels.ts");

function seat(label, zone) {
  return { label, zone, department: null };
}

test("zone prefixes match existing seat label patterns", () => {
  assert.equal(inferSeatPrefixFromZone("West Pod"), "W");
  assert.equal(inferSeatPrefixFromZone("North Pod"), "N");
  assert.equal(inferSeatPrefixFromZone("Northeast Pod"), "NE");
  assert.equal(inferSeatPrefixFromZone("Southeast Office"), "SE");
  assert.equal(inferSeatPrefixFromZone("Center West"), "CW");
});

test("center desks continue from C01 through C08", () => {
  const seats = Array.from({ length: 8 }, (_, index) => seat(`C${String(index + 1).padStart(2, "0")}`, "Center Desks"));
  assert.equal(buildNextSeatLabel(seats, "Center Desks"), "C09");
});

test("seeded pod labels continue with the next zone number", () => {
  const westSeats = Array.from({ length: 12 }, (_, index) => seat(`W${String(index + 1).padStart(2, "0")}`, "West Pod"));
  const northeastSeats = Array.from({ length: 8 }, (_, index) => seat(`NE${String(index + 1).padStart(2, "0")}`, "Northeast Pod"));

  assert.equal(buildNextSeatLabel(westSeats, "West Pod"), "W13");
  assert.equal(buildNextSeatLabel(northeastSeats, "Northeast Pod"), "NE09");
});

test("seat labels use the next number after the highest existing zone label", () => {
  const seats = [1, 2, 3, 4, 6, 7, 8].map(number => seat(`C${String(number).padStart(2, "0")}`, "Center Desks"));
  assert.equal(buildNextSeatLabel(seats, "Center Desks"), "C09");
});

test("seat labels do not reuse gaps when higher zone numbers exist", () => {
  const seats = [seat("W01", "West Pod"), seat("W03", "West Pod"), seat("W09", "West Pod")];
  assert.equal(buildNextSeatLabel(seats, "West Pod"), "W10");
});

test("generated labels avoid collisions with all draft labels", () => {
  const seats = [
    seat("C01", "Center Desks"),
    seat("C02", "Center Desks"),
    seat("C04", "Center Desks"),
    seat("C03", "Other Zone")
  ];
  assert.equal(buildNextSeatLabel(seats, "Center Desks"), "C05");
});

test("existing draft labels outside the target zone are considered collisions", () => {
  const seats = [
    seat("W01", "West Pod"),
    seat("W02", "West Pod"),
    seat("W03", "Overflow Training")
  ];
  assert.equal(buildNextSeatLabel(seats, "West Pod"), "W04");
});

test("existing zone prefix and padding are preserved", () => {
  const seats = [seat("LAB001", "Lab Area"), seat("LAB010", "Lab Area")];
  assert.equal(buildNextSeatLabel(seats, "Lab Area"), "LAB011");
});

test("multi-letter prefixes preserve padding across rollover", () => {
  const seats = [seat("NE01", "Northeast Pod"), seat("NE08", "Northeast Pod")];
  assert.equal(buildNextSeatLabel(seats, "Northeast Pod"), "NE09");
});

test("generated labels remain unique within the target zone", () => {
  const seats = [
    seat("SE01", "Southeast Office"),
    seat("SE02", "Southeast Office"),
    seat("SE03", "Southeast Office")
  ];
  const nextLabel = buildNextSeatLabel(seats, "Southeast Office");

  assert.equal(nextLabel, "SE04");
  assert.equal(seats.some(existing => existing.zone === "Southeast Office" && existing.label === nextLabel), false);
});

test("unknown helper-level zones derive a safe prefix", () => {
  assert.equal(buildNextSeatLabel([], "Quiet Area"), "QA01");
});

test("pattern tie-break: equal counts fall to the earlier-seen prefix; higher counts always win", () => {
  // Two prefixes with one seat each — the first one encountered wins the tie.
  assert.equal(buildNextSeatLabel([seat("A01", "Mixed Pod"), seat("B01", "Mixed Pod")], "Mixed Pod"), "A02");
  // A prefix with more seats beats an earlier-seen but rarer one.
  assert.equal(
    buildNextSeatLabel([seat("A01", "Mixed Pod"), seat("B01", "Mixed Pod"), seat("B02", "Mixed Pod")], "Mixed Pod"),
    "B03"
  );
});

test("collision fallback: when 1000 sequential candidates are taken, labels degrade to PREFIX-N", () => {
  // The zone owns one numbered seat (Z5), so candidates start at Z6 — but a
  // thousand OTHER-zone seats already hold exactly the labels the sequential
  // generator would mint. The generator must still terminate with a unique
  // label rather than loop or return a duplicate.
  const zoneSeats = [seat("Z5", "Zulu Pod")];
  const digitWidth = 2; // max(pattern width 1, floor 2)
  const blockers = [];
  for (let n = 6; n <= 1005; n += 1) {
    blockers.push(seat(`Z${String(n).padStart(digitWidth, "0")}`, "Other Pod"));
  }

  assert.equal(buildNextSeatLabel([...zoneSeats, ...blockers], "Zulu Pod"), "Z-1");

  // And the dashed fallback itself skips values that are already taken.
  const withDashTaken = [...zoneSeats, ...blockers, seat("Z-1", "Other Pod")];
  assert.equal(buildNextSeatLabel(withDashTaken, "Zulu Pod"), "Z-2");
});

test("inferSeatPrefixFromZone covers every directional prefix, initials, and the S fallback", () => {
  assert.equal(inferSeatPrefixFromZone("Northeast Pod"), "NE");
  assert.equal(inferSeatPrefixFromZone("south east wing"), "SE");
  assert.equal(inferSeatPrefixFromZone("Southwest Corner"), "SW");
  assert.equal(inferSeatPrefixFromZone("north west annex"), "NW");
  assert.equal(inferSeatPrefixFromZone("Center West"), "CW");
  assert.equal(inferSeatPrefixFromZone("central east"), "CE");
  assert.equal(inferSeatPrefixFromZone("Center Desks"), "C");
  assert.equal(inferSeatPrefixFromZone("West Pod"), "W");
  assert.equal(inferSeatPrefixFromZone("East Pod"), "E");
  assert.equal(inferSeatPrefixFromZone("North Pod"), "N");
  assert.equal(inferSeatPrefixFromZone("South Lounge"), "S");
  // No directional keyword → initials of the words, capped at three.
  assert.equal(inferSeatPrefixFromZone("Quiet Focus Room Annex"), "QFR");
  // Nothing usable at all → the generic "S" seat prefix.
  assert.equal(inferSeatPrefixFromZone(""), "S");
  assert.equal(inferSeatPrefixFromZone("---"), "S");
  assert.equal(inferSeatPrefixFromZone(null), "S");
});

test("labels that do not parse as PREFIX+digits are ignored by pattern detection", () => {
  // "Desk 1" and "Z-9" carry no usable pattern; the zone falls back to the
  // inferred prefix with the 2-digit floor.
  assert.equal(buildNextSeatLabel([seat("Desk 1", "West Pod"), seat("Z-9", "West Pod")], "West Pod"), "W01");
});
