import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// One close affordance (2026-07-16 detail critique, action 4): three map
// dialogs and the Management confirm rendered their close control as the
// literal text character "x" — off-baseline, reads as a typo next to the
// drawn SVG closes elsewhere. Every dialog close now uses the shared
// components/ui/CloseIcon.

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("the shared CloseIcon exists and carries the canonical X path", async () => {
  const source = await readSource("../components/ui/CloseIcon.tsx");
  assert.match(source, /m5\.5 5\.5 9 9m0-9-9 9/);
  assert.match(source, /aria-hidden="true"/);
});

test("dialog closes use the shared icon — no literal 'x' text glyphs remain", async () => {
  // SeatMap's dialogs (and their close buttons) live in SeatMapDialogs.tsx
  // since the R-02a extraction — that file carries the shared-icon contract.
  const seatMapDialogs = await readSource("../components/seat-map/SeatMapDialogs.tsx");
  const management = await readSource("../components/admin-management/AdminManagementPanel.tsx");
  const settings = await readSource("../components/admin-settings/DataUtilitiesPanel.tsx");
  const inspector = await readSource("../components/seat-map/SeatInspector.tsx");

  for (const [name, source] of [["SeatMapDialogs", seatMapDialogs], ["AdminManagementPanel", management]]) {
    assert.doesNotMatch(source, /\n\s*x\s*\r?\n\s*<\/button>/, `${name} must not render a literal 'x' close`);
    assert.match(source, /from "@\/components\/ui\/CloseIcon"/, `${name} imports the shared CloseIcon`);
  }
  // The settings review dialogs had two inline copies of the same path —
  // consolidated onto the shared component.
  assert.match(settings, /from "@\/components\/ui\/CloseIcon"/);
  assert.doesNotMatch(settings, /<svg[^>]*><path d="m5\.5 5\.5 9 9m0-9-9 9"/);
  // The inspector's private definition moves to the shared module.
  assert.match(inspector, /from "@\/components\/ui\/CloseIcon"/);
  assert.doesNotMatch(inspector, /function CloseIcon\(/);
});
