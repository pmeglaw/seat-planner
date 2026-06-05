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
