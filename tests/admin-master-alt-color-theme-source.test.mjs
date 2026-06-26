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
    "--admin-bg: #F7F3EE",
    "--admin-rail-bg: #101114",
    "--admin-rail-surface: #282F36",
    "--admin-surface: #FFFFFF",
    "--admin-primary: #F26E22",
    "--admin-primary-cta: #A63A12",
    "--admin-primary-soft: rgba(242, 110, 34, 0.10)",
    "--admin-warning-text: #7A4E00",
    "--admin-info: #165359",
    "--admin-focus: #1B25F2",
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

test("admin color slices scope shell and marker aliases without redesigning viewer or inspector internals", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const seatMarkerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  assert.match(seatMapSource, /bg-\[var\(--admin-bg\)\]/);
  assert.match(seatMapSource, /aria-label="Admin workspace rail"[\s\S]*bg-\[var\(--admin-rail-bg\)\]/);
  assert.match(seatMapSource, /aria-label="Admin command row"[\s\S]*bg-\[var\(--admin-surface\)\]\/94/);
  assert.match(seatMapSource, /aria-label="Map command actions"[\s\S]*bg-\[var\(--admin-surface-muted\)\]\/78/);
  assert.match(seatMapSource, /aria-labelledby="admin-planning-canvas-title"[\s\S]*bg-\[var\(--admin-surface\)\]\/68/);
  assert.match(seatMapSource, /border-\[var\(--admin-border-strong\)\] bg-\[var\(--admin-surface-muted\)\]/);
  assert.match(seatMapSource, /showNames \? "border-\[var\(--admin-primary-cta\)\] bg-\[var\(--admin-primary-cta\)\] text-white/);
  assert.match(seatMapSource, /hover:!border-\[var\(--admin-primary-border\)\] hover:!bg-\[var\(--admin-primary-soft\)\]/);
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
  assert.doesNotMatch(inspectorSource, /--admin-/);
});

test("admin color slice preserves shell controls and behavior boundaries", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerRouteSource = await readSource("../app/page.tsx");
  const actionSource = await readSource("../app/actions.ts");

  assert.match(seatMapSource, /aria-label="Map command actions"[\s\S]*Open filters[\s\S]*namesToggleLabel[\s\S]*aria-label="Map tools"[\s\S]*Undo last map change[\s\S]*Redo last undone change[\s\S]*\/admin\/management[\s\S]*Open Ask Planner/);
  assert.match(seatMapSource, /onClick=\{activeMode\.onExit\}/);
  assert.match(seatMapSource, /await publishSeatMapAction\(\)/);
  assert.match(actionSource, /export async function publishSeatMapAction\(\) \{/);
  assert.doesNotMatch(viewerRouteSource, /<SeatMap|admin-theme|Map tools|Undo|Redo|publishSeatMapAction/);
});
