import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("normal add-seat UI does not pass manual labels or zones", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const createCall = source.match(/createSeatAction\(\{[\s\S]*?\}\)/);

  assert.ok(createCall, "SeatMap should call createSeatAction from add-seat mode.");
  assert.match(source, /detectSeatZoneForPoint/);
  assert.doesNotMatch(source, /addSeatZone|onAddSeatZoneChange|buildNextSeatLabel/);
  assert.doesNotMatch(createCall[0], /\blabel\s*:/);
  assert.doesNotMatch(createCall[0], /\bzone\s*:/);
});

test("inspector copy uses Job Title instead of Team", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");

  assert.match(source, /Job Title/);
  assert.match(source, /employeePosition/);
  assert.doesNotMatch(source, />\s*Team\s*</);
  assert.doesNotMatch(source, /No team/);
});

test("typing an unmatched employee name clears stale job title", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");
  const unmatchedBranch = source.match(/if \(!matchedEmployee\) \{[\s\S]*?return \{[\s\S]*?\};\s*\}/);

  assert.ok(unmatchedBranch, "SeatInspector should handle unmatched employee names.");
  assert.match(unmatchedBranch[0], /employeeId:\s*""/);
  assert.match(unmatchedBranch[0], /employeePosition:\s*""/);
  assert.match(unmatchedBranch[0], /phoneExtension:\s*""/);
});
