import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("desktop inspector shell exposes the selected-seat identity model", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");

  // Narrowed for less cognitive load (Claude Design); flat (no heavy shadow/blur).
  assert.match(inspectorSource, /sm:w-\[360px\]/);
  assert.match(inspectorSource, /xl:w-\[384px\]/);
  // Shared light identity header: label chip + assignee/open + zone · type + status badge.
  assert.match(inspectorSource, /canEdit \? "Seat details" : "Published seat"/);
  assert.match(inspectorSource, /rounded-\[10px\] bg-\[var\(--admin-primary-cta\)\]/);
  assert.match(inspectorSource, /assignmentIdentityLabel \|\| "Open seat"/);
  assert.match(inspectorSource, /\{currentZone\} · \{seatTypeLabel\}/);
  assert.match(inspectorSource, /headerStatusBadgeClass/);
  assert.match(inspectorSource, /seatTypeLabel/);
  assert.match(inspectorSource, /Protected original/);
  assert.match(inspectorSource, /Custom draft/);
  assert.match(inspectorSource, /Original/);
  // The verbose dark eyebrow/subtitle model is gone.
  assert.doesNotMatch(inspectorSource, /Planning inspector/);
  assert.doesNotMatch(inspectorSource, /selectedSeatStatusLabel/);
  assert.match(seatMapSource, /const desktopInspectorReserveMarginClassName = desktopPanelSlotOpen \? "sm:mr-\[28rem\] xl:mr-\[29\.5rem\]" : ""/);
  assert.match(seatMapSource, /const canvasBannerSafeAreaClassName = desktopInspectorReserveMarginClassName/);
  assert.match(seatMapSource, /const activeModeBannerClassName = \[[\s\S]*canvasBannerSafeAreaClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /className=\{activeModeBannerClassName\}/);
  assert.match(seatMapSource, /const actionErrorBannerClassName = \[[\s\S]*canvasBannerSafeAreaClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /const actionNoticeBannerClassName = \[[\s\S]*canvasBannerSafeAreaClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /className=\{actionErrorBannerClassName\}/);
  assert.match(seatMapSource, /className=\{actionNoticeBannerClassName\}/);
  assert.match(seatMapSource, /className="min-w-0 flex-1 whitespace-pre-wrap break-words"/);
});

test("desktop inspector drops the verbose draft-state band for a quiet sr-only status", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  // The heavy persistent band + inline dirty paragraph are gone; status stays announced only.
  assert.doesNotMatch(inspectorSource, /aria-label="Draft state and viewer impact"/);
  assert.doesNotMatch(inspectorSource, /Draft-only impact/);
  assert.doesNotMatch(inspectorSource, /Unsaved assignment edits are not saved yet/);
  assert.match(inspectorSource, /<div role="status" aria-live="polite" className="sr-only">\s*\{inspectorStateLabel\}/);
  assert.match(inspectorSource, /const inspectorStateLabel = pending/);
  assert.match(inspectorSource, /No unsaved changes/);
  assert.match(inspectorSource, /Unsaved changes/);
  assert.match(inspectorSource, /Saving draft\.\.\./);
  // Footer action grid stays intact.
  assert.match(inspectorSource, /const secondaryActionGridClassName = "grid-cols-1 sm:grid-cols-2"/);
  assert.match(inspectorSource, /grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-\[minmax\(6\.5rem,0\.8fr\)_minmax\(0,1\.5fr\)\]/);
  assert.match(inspectorSource, /min-w-0 w-full whitespace-normal rounded-xl/);
  assert.match(inspectorSource, /Create new employee on save/);
});

test("desktop inspector semantic states use admin theme meaning tokens", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  // Remaining semantic surfaces keep meaning tokens (no raw hex, no viewer sp-color states).
  assert.match(inspectorSource, /--admin-state-clean-bg/);
  assert.match(inspectorSource, /--admin-state-dirty-bg/);
  assert.match(inspectorSource, /--admin-state-error-bg/);
  assert.match(inspectorSource, /warningSurfaceClassName/);
  assert.match(inspectorSource, /successPillClassName/);
  assert.match(inspectorSource, /neutralPillClassName/);
  assert.match(inspectorSource, /No existing employee match/);
  assert.match(inspectorSource, /Saving will create a new employee record named/);
  assert.match(inspectorSource, /role="note"/);
  assert.match(inspectorSource, /!border-\[var\(--admin-danger\)\] !bg-\[var\(--admin-danger\)\]/);
  assert.doesNotMatch(inspectorSource, /#7E2F24|#6D4712|#244E50|#284C3B/);
  assert.doesNotMatch(inspectorSource, /sp-color-state-danger|sp-color-state-draft|sp-color-state-info|sp-color-state-success/);
  // Removed state-derivation consts should not linger.
  assert.doesNotMatch(inspectorSource, /draftStateBandClassName|inspectorStateClassName|infoSurfaceClassName|dangerPillClassName/);
});

test("desktop assignment section stays clean while preserving the employee combobox", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  // Clean single-line heading + short hint replace the verbose workflow eyebrow/description/badge.
  assert.match(inspectorSource, /hasCurrentAssignment \? "Assignment" : "Assign this seat"/);
  assert.match(inspectorSource, /Search an existing employee or type a new name/);
  assert.match(inspectorSource, /Change or clear the draft assignment below/);
  assert.match(inspectorSource, /Status &amp; notes/);
  // The employee combobox + new-employee guidance stay wired.
  assert.match(inspectorSource, /Saving will create a new employee record named/);
  assert.match(inspectorSource, /Viewers see it only after publish/);
  assert.match(inspectorSource, /role="note"/);
  assert.match(inspectorSource, /seat-inspector-new-employee-notice/);
  // The verbose workflow copy and the redundant sub-panels are gone.
  assert.doesNotMatch(inspectorSource, /Assignment workflow/);
  assert.doesNotMatch(inspectorSource, /Current draft assignee/);
  assert.doesNotMatch(inspectorSource, /Actions \/ Rules/);
  assert.doesNotMatch(inspectorSource, /Detected zone/);
  assert.doesNotMatch(inspectorSource, /Seat Summary/);
});

test("desktop inspector workflow labels and draft-only boundaries stay wired", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  assert.match(inspectorSource, /Save draft changes/);
  assert.match(inspectorSource, /Cancel/);
  assert.match(inspectorSource, /Swap seat/);
  assert.match(inspectorSource, /Vacate/);
  assert.match(inspectorSource, /Delete seat/);
  assert.match(inspectorSource, /Discard edits/);
  assert.match(inspectorSource, /Ask Planner about this seat/);
  assert.match(inspectorSource, /The published viewer map will not change until the draft is published/);
  assert.match(inspectorSource, /getSeatDeleteBlockReason/);
  assert.match(inspectorSource, /deleteHelpText/);
  assert.match(inspectorSource, /Move seat/);
  assert.match(inspectorSource, /Exit move/);
  assert.match(viewerFinderSource, /Published/);
  assert.match(viewerFinderSource, /Read-only/);
  assert.doesNotMatch(viewerFinderSource, /Map tools|Undo|Redo|CSV|JSON|Vacate|Delete seat/);
});

test("desktop assignment cancel and discard reset unsaved no-match editor state", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");

  assert.match(inspectorSource, /resetSignal: number/);
  assert.match(inspectorSource, /const resetInspectorDraftForm = useCallback/);
  assert.match(inspectorSource, /setEmployeeComboboxOpen\(false\)/);
  assert.match(inspectorSource, /setActiveEmployeeIndex\(0\)/);
  assert.match(inspectorSource, /setVacateConfirmOpen\(false\)/);
  assert.match(inspectorSource, /function handleResetEdits\(\) \{[\s\S]*resetInspectorDraftForm\(initialForm\);[\s\S]*\}/);
  assert.match(inspectorSource, /function handleCancelEditing\(\) \{[\s\S]*if \(isDirty\) \{[\s\S]*resetInspectorDraftForm\(initialForm\);[\s\S]*return;[\s\S]*\}[\s\S]*onClose\(\);[\s\S]*\}/);
  assert.match(inspectorSource, /onClick=\{handleCancelEditing\} aria-label=\{`Cancel editing \$\{selectedSeat\.label\}`\}/);
  assert.match(inspectorSource, /onClick=\{handleResetEdits\} disabled=\{pending\} aria-label=\{`Discard edits for \$\{selectedSeat\.label\}`\}/);
  assert.match(inspectorSource, /const showNewEmployeeNotice = Boolean\(employeeNameValue && !matchedEmployee\)/);
  assert.match(inspectorSource, /Saving will create a new employee record named/);
  assert.match(inspectorSource, /Save draft changes/);
  assert.match(inspectorSource, /Viewers see it only after publish/);

  assert.match(seatMapSource, /const \[inspectorResetSignal, setInspectorResetSignal\] = useState\(0\)/);
  assert.match(seatMapSource, /setInspectorResetSignal\(current => current \+ 1\)/);
  assert.match(seatMapSource, /resetSignal=\{inspectorResetSignal\}/);
});
