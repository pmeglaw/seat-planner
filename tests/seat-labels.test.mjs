import assert from "node:assert/strict";
import test from "node:test";

function inferSeatPrefixFromZone(zone) {
  const text = (zone ?? "").trim().toLowerCase();
  if (!text) return "S";
  if (text.includes("northeast") || text.includes("north east")) return "NE";
  if (text.includes("southeast") || text.includes("south east")) return "SE";
  if (text.includes("center west") || text.includes("central west")) return "CW";
  if (text.includes("west")) return "W";
  if (text.includes("east")) return "E";
  if (text.includes("north")) return "N";
  return "S";
}

function buildNextSeatLabel(seats, zone) {
  const prefix = inferSeatPrefixFromZone(zone);
  const pattern = new RegExp(`^${prefix}(\\d+)$`, "i");
  const existingLabels = new Set(seats.map(seat => seat.label.trim().toUpperCase()));
  let maxNumber = 0;
  for (const seat of seats) {
    const match = seat.label.trim().toUpperCase().match(pattern);
    if (match) maxNumber = Math.max(maxNumber, Number(match[1]));
  }
  for (let nextNumber = maxNumber + 1; nextNumber < 1000; nextNumber += 1) {
    const label = `${prefix}${String(nextNumber).padStart(2, "0")}`;
    if (!existingLabels.has(label)) return label;
  }
  return `${prefix}-1`;
}

test("zone prefixes match existing seat label patterns", () => {
  assert.equal(inferSeatPrefixFromZone("West Pod"), "W");
  assert.equal(inferSeatPrefixFromZone("North Pod"), "N");
  assert.equal(inferSeatPrefixFromZone("Northeast Pod"), "NE");
  assert.equal(inferSeatPrefixFromZone("Southeast Office"), "SE");
  assert.equal(inferSeatPrefixFromZone("Center West"), "CW");
});

test("new seat labels use the selected zone and next number", () => {
  assert.equal(buildNextSeatLabel([{ label: "W01" }, { label: "W12" }], "West Pod"), "W13");
  assert.equal(buildNextSeatLabel([{ label: "NE01" }, { label: "NE04" }], "Northeast Pod"), "NE05");
});
