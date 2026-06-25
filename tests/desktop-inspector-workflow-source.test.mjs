import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("desktop inspector shell exposes the selected-seat identity model", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");

  assert.match(inspectorSource, /sm:w-\[420px\]/);
  assert.match(inspectorSource, /xl:w-\[440px\]/);
  assert.match(inspectorSource, /Planning inspector/);
  assert.match(inspectorSource, /assignmentIdentityLabel/);
  assert.match(inspectorSource, /selectedSeatStatusLabel/);
  assert.match(inspectorSource, /Assigned seat/);
  assert.match(inspectorSource, /Open seat/);
  assert.match(inspectorSource, /seatTypeLabel/);
  assert.match(inspectorSource, /Protected original/);
  assert.match(inspectorSource, /Custom draft/);
  assert.match(inspectorSource, /Original/);
  assert.match(seatMapSource, /const desktopInspectorReservePaddingClassName = desktopInspectorOpen \? "lg:pr-\[26\.5rem\] xl:pr-\[27\.75rem\]" : ""/);
  assert.match(seatMapSource, /const desktopInspectorReserveMarginClassName = desktopInspectorOpen \? "lg:mr-\[26\.5rem\] xl:mr-\[27\.75rem\]" : ""/);
  assert.match(seatMapSource, /const activeModeBannerClassName = \[[\s\S]*desktopInspectorReserveMarginClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /className=\{activeModeBannerClassName\}/);
});

test("desktop inspector keeps a persistent draft-state and viewer-impact band", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  assert.match(inspectorSource, /aria-label="Draft state and viewer impact"/);
  assert.match(inspectorSource, /Draft-only impact/);
  assert.doesNotMatch(inspectorSource, /rounded-full px-2\.5 py-1 text-\[10px\] font-black uppercase tracking-wide ring-1", inspectorStateClassName/);
  assert.match(inspectorSource, /const secondaryActionGridClassName = "grid-cols-1 sm:grid-cols-2"/);
  assert.match(inspectorSource, /grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-\[minmax\(6\.5rem,0\.8fr\)_minmax\(0,1\.5fr\)\]/);
  assert.match(inspectorSource, /min-w-0 w-full whitespace-normal rounded-xl/);
  assert.match(inspectorSource, /No unsaved changes/);
  assert.match(inspectorSource, /Unsaved changes/);
  assert.match(inspectorSource, /Saving draft\.\.\./);
  assert.match(inspectorSource, /Saved to draft/);
  assert.match(inspectorSource, /Review before saving/);
  assert.match(inspectorSource, /Viewers continue seeing the published map/);
  assert.match(inspectorSource, /Viewers see changes after review and publish/);
  assert.match(inspectorSource, /min-w-0 max-w-\[34ch\] whitespace-normal break-words font-semibold leading-relaxed/);
  assert.match(inspectorSource, /Fix the highlighted inspector fields before saving/);
  assert.match(inspectorSource, /Create new employee on save/);
});

test("desktop inspector workflow labels and draft-only boundaries stay wired", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const drawerSource = await readSource("../components/seat-map/AdvancedDrawer.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  assert.match(inspectorSource, /Save draft changes/);
  assert.match(inspectorSource, /Cancel/);
  assert.match(inspectorSource, /Swap seat/);
  assert.match(inspectorSource, /Vacate/);
  assert.match(inspectorSource, /Delete seat/);
  assert.match(inspectorSource, /Ask Planner about this seat/);
  assert.match(inspectorSource, /The published viewer map will not change until the draft is published/);
  assert.match(inspectorSource, /getSeatDeleteBlockReason/);
  assert.match(inspectorSource, /deleteHelpText/);
  assert.match(drawerSource, /Move Seat/);
  assert.match(viewerFinderSource, /Published/);
  assert.match(viewerFinderSource, /Read-only/);
  assert.doesNotMatch(viewerFinderSource, /Map tools|Undo|Redo|CSV|JSON|Vacate|Delete seat/);
});
