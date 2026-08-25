import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// One status, one name (2026-07-16 detail critique, action 3): the filter
// dropdown offered "Available" while the legend, inventory line, result
// cards, and dialogs all said "Open" — and seat tooltips leaked the raw
// lowercase enum. STATUS_LABELS is the single source of truth; hardcoded
// per-surface spellings of a status are the bug this file guards against.

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("STATUS_LABELS is the single source of truth and calls 'available' Open", async () => {
  const types = await readSource("../lib/types.ts");
  assert.match(types, /available: "Open"/);

  // The viewer-search module keeps a deliberate local mirror (it is
  // transpiled standalone by its test) — the mirror must agree.
  const viewerSearch = await readSource("../lib/viewerSeatSearch.ts");
  assert.match(viewerSearch, /available: "Open"/);
});

test("status pickers render their options from STATUS_LABELS", async () => {
  const filterPanel = await readSource("../components/seat-map/FilterPanel.tsx");
  assert.match(filterPanel, /\{STATUS_LABELS\.available\}/);
  assert.doesNotMatch(filterPanel, />Available</);

  const inspector = await readSource("../components/seat-map/SeatInspector.tsx");
  assert.match(inspector, /\{STATUS_LABELS\.available\}/);
  assert.doesNotMatch(inspector, />Available</);
  // The header chip and status tag derive from the same map, not ad-hoc
  // capitalization of the enum value.
  assert.match(inspector, /const currentStatusLabel = STATUS_LABELS\[effectiveStatus\]/);
});

test("seat marker aria-label formats the status instead of leaking the enum", async () => {
  const marker = await readSource("../components/seat-map/SeatMarker.tsx");
  assert.match(marker, /\$\{STATUS_LABELS\[seat\.status\]\} seat\./);
  assert.doesNotMatch(marker, /\$\{seat\.status\} seat\./);
  // F3 ruling (2026-08-25): the marker carries NO native title tooltip — it
  // was an uncontrolled second disclosure channel. Re-adding one re-litigates
  // that ruling.
  assert.doesNotMatch(marker, /title=\{/);
});
