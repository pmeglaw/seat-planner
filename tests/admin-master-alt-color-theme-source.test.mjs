import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function cssBlock(source, selector) {
  const startIndex = source.indexOf(`${selector} {`);
  assert.notEqual(startIndex, -1, `Expected ${selector} block to exist.`);
  const endIndex = source.indexOf("\n}", startIndex);
  assert.notEqual(endIndex, -1, `Expected ${selector} block to close.`);
  return source.slice(startIndex, endIndex + 2);
}

test("master alternative palette exposes inert brand primitives and scoped admin aliases", async () => {
  const globalsSource = await readSource("../app/globals.css");
  const rootBlock = cssBlock(globalsSource, ":root");
  const adminThemeBlock = cssBlock(globalsSource, ".admin-theme");

  for (const token of [
    "--ml-orange-signature: #F26E22",
    "--ml-orange-hover: #C95A14",
    "--ml-orange-cta: #A63A12",
    "--ml-cognac: #8C6645",
    "--ml-espresso: #594225",
    "--ml-graphite: #282F36",
    "--ml-ink: #101114",
    "--ml-porcelain: #EAEDF0",
    "--ml-ivory: #F7F3EE",
    "--ml-neutral-gray: #D8DADF",
    "--ml-electric-blue: #1B25F2",
    "--ml-teal: #165359",
    "--ml-oxblood: #732D2D"
  ]) {
    assert.match(rootBlock, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const token of [
    "--admin-bg: #EAE5D9",
    "--admin-chrome-bg: #1B1A17",
    "--admin-chrome-text: #F0ECE4",
    "--admin-rail-bg: var(--admin-chrome-bg)",
    "--admin-rail-surface: rgba(255, 255, 255, 0.05)",
    "--admin-surface: #FAF7F1",
    "--admin-primary: #F26E22",
    "--admin-primary-cta: #A63A12",
    "--admin-primary-soft: rgba(242, 110, 34, 0.10)",
    "--admin-warning-text: #7A4E00",
    "--admin-info: #165359",
    "--admin-focus: #1B25F2",
    "--admin-state-clean-bg: #EDF5EF",
    "--admin-state-dirty-bg: var(--admin-warning-soft)",
    "--admin-state-error-text: #8A2424",
    "--admin-state-danger-bg: var(--admin-danger-soft)",
    "--admin-publish-ready-bg: var(--admin-primary-soft)",
    "--admin-publish-no-change-bg: var(--admin-state-clean-bg)",
    "--admin-publish-viewer-impact-bg: var(--admin-info-soft)",
    "--admin-marker-assigned-surface: rgba(255, 253, 248, 0.95)",
    "--admin-marker-selected-border: var(--admin-primary)",
    "--admin-marker-search-surface: var(--admin-info-soft)",
    "--admin-marker-draft-surface: var(--admin-warning-soft)"
  ]) {
    assert.match(adminThemeBlock, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(rootBlock, /--sp-color-action-primary: #C2410C/);
  assert.match(rootBlock, /--sp-color-brand-accent: #F97316/);
  assert.doesNotMatch(adminThemeBlock, /--sp-color-|--sp-focus-ring-color/);
});

test("admin theme wrapper is scoped to the admin route only", async () => {
  const adminRouteSource = await readSource("../app/admin/page.tsx");
  const viewerRouteSource = await readSource("../app/page.tsx");
  const managementRouteSource = await readSource("../app/admin/management/page.tsx");

  assert.match(adminRouteSource, /className="admin-theme min-h-screen bg-\[var\(--admin-bg\)\]/);
  assert.match(adminRouteSource, /<SeatMap[\s\S]*canEdit/);
  assert.doesNotMatch(viewerRouteSource, /admin-theme|--admin-/);
  assert.doesNotMatch(managementRouteSource, /admin-theme|--admin-/);
});

test("admin color slices scope shell marker and semantic aliases without redesigning viewer", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const seatMarkerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  assert.match(seatMapSource, /bg-\[var\(--admin-bg\)\]/);
  assert.match(seatMapSource, /aria-label="Admin workspace rail"[\s\S]*bg-\[var\(--admin-rail-bg\)\]/);
  // Claude Design top bar: dark warm-charcoal chrome holds the flat "Admin command row" text toolbar.
  assert.match(seatMapSource, /bg-\[var\(--admin-chrome-bg\)\][\s\S]*aria-label="Admin command row"/);
  assert.match(seatMapSource, /const chromeToolbarBtn = "[\s\S]*text-\[var\(--admin-chrome-muted\)\]/);
  assert.match(seatMapSource, /const chromeToolbarBtnActive = "[\s\S]*text-\[var\(--admin-primary\)\]/);
  assert.match(seatMapSource, /aria-labelledby="admin-planning-canvas-title"[\s\S]*bg-\[var\(--admin-surface\)\]\/68/);
  assert.match(seatMapSource, /border-\[var\(--admin-border-strong\)\] bg-\[var\(--admin-surface-muted\)\]/);
  assert.match(seatMapSource, /showNames \? chromeToolbarBtnActive : chromeToolbarBtn/);
  assert.match(seatMapSource, /variant="admin"/);

  assert.match(seatMarkerSource, /variant\?: "admin" \| "viewer"/);
  assert.match(seatMarkerSource, /variant = "viewer"/);
  assert.match(seatMarkerSource, /--admin-marker-assigned-surface/);
  assert.match(seatMarkerSource, /--admin-marker-available-surface/);
  assert.match(seatMarkerSource, /--admin-marker-selected-border/);
  assert.match(seatMarkerSource, /--admin-marker-search-border/);
  assert.match(seatMarkerSource, /--admin-marker-draft-surface/);
  assert.match(seatMarkerSource, /border-\[#B7AB9E\]\/85 bg-\[#FFFDF8\]\/95/);
  assert.match(seatMarkerSource, /border-\[#D4CABF\]\/90 bg-\[#F9F5ED\]\/\[0\.86\]/);
  assert.doesNotMatch(viewerSource, /--admin-/);
  assert.doesNotMatch(viewerSource, /variant="admin"/);
  assert.match(inspectorSource, /--admin-state-clean-bg/);
  assert.match(inspectorSource, /--admin-state-dirty-bg/);
  assert.match(inspectorSource, /--admin-state-error-bg/);
  assert.match(inspectorSource, /--admin-state-danger-bg/);
});

test("admin color slice preserves shell controls and behavior boundaries", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerRouteSource = await readSource("../app/page.tsx");
  const actionSource = await readSource("../app/actions.ts");

  assert.match(seatMapSource, /aria-label="Admin command row"[\s\S]*Open filters[\s\S]*namesToggleLabel[\s\S]*aria-label="Map tools"[\s\S]*Undo last map change[\s\S]*Redo last undone change[\s\S]*\/admin\/management[\s\S]*Open Ask Planner/);
  assert.match(seatMapSource, /onClick=\{activeMode\.onExit\}/);
  assert.match(seatMapSource, /await publishSeatMapAction\(\)/);
  assert.match(actionSource, /export async function publishSeatMapAction\(\) \{/);
  assert.doesNotMatch(viewerRouteSource, /<SeatMap|admin-theme|Map tools|Undo|Redo|publishSeatMapAction/);
});
