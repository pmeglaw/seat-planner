import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("component state board route stays prototype guarded and production isolated", async () => {
  const pageSource = await readSource("../app/concepts/component-state-board/page.tsx");
  const componentSource = await readSource("../app/concepts/component-state-board/ComponentStateBoard.tsx");
  const dataSource = await readSource("../app/concepts/component-state-board/componentStateBoardData.ts");
  const viewerSource = await readSource("../app/page.tsx");
  const adminSource = await readSource("../app/admin/page.tsx");
  const managementSource = await readSource("../app/admin/management/page.tsx");

  assert.match(pageSource, /SEAT_PLANNER_ENABLE_PROTOTYPES/);
  assert.match(pageSource, /process\.env\.NODE_ENV !== "production"/);
  assert.match(pageSource, /notFound\(\)/);
  assert.match(pageSource, /<ComponentStateBoard \/>/);

  for (const source of [pageSource, componentSource, dataSource]) {
    assert.doesNotMatch(source, /from ["']@\/app\/actions|from ["']@\/lib\/supabase|from ["']@\/lib\/permissions|publishSeatMapAction|createServerSupabaseClient|requireAdmin|createClient/);
    assert.doesNotMatch(source, /insert\(|update\(|delete\(|upsert\(|rpc\(/);
  }

  assert.doesNotMatch(viewerSource, /component-state-board|ComponentStateBoard/);
  assert.doesNotMatch(adminSource, /component-state-board|ComponentStateBoard/);
  assert.doesNotMatch(managementSource, /component-state-board|ComponentStateBoard/);
});

test("component state board documents the approved hybrid product model", async () => {
  const componentSource = await readSource("../app/concepts/component-state-board/ComponentStateBoard.tsx");
  const dataSource = await readSource("../app/concepts/component-state-board/componentStateBoardData.ts");

  assert.match(componentSource, /Apple-like clarity with youthful operational energy/);
  assert.match(componentSource, /Viewer[\s\S]*Search/);
  assert.match(componentSource, /Planning[\s\S]*Workflow/);
  assert.match(componentSource, /Publish[\s\S]*Review/);
  assert.match(componentSource, /Management[\s\S]*Lists/);
  assert.match(componentSource, /Spatial Truth/);
  assert.doesNotMatch(componentSource, /map-first/i);

  assert.match(dataSource, /orange 500/);
  assert.match(dataSource, /#F97316/);
  assert.match(dataSource, /accessible primary orange/);
  assert.match(dataSource, /#C2410C/);
  assert.match(dataSource, /charcoal 850/);
  assert.match(dataSource, /Ask Planner highlight/);
  assert.match(componentSource, /unique publish-summary total/);
});

test("component state board locks screenshot-review correction contracts", async () => {
  const componentSource = await readSource("../app/concepts/component-state-board/ComponentStateBoard.tsx");
  const dataSource = await readSource("../app/concepts/component-state-board/componentStateBoardData.ts");
  const combinedSource = `${componentSource}\n${dataSource}`;

  for (const heading of [
    "Ready to publish reviewed changes",
    "Draft matches published",
    "Save or discard seat edits first",
    "Publishing reviewed changes",
    "Publish did not complete",
    "Published map updated"
  ]) {
    assert.match(componentSource, new RegExp(heading));
  }

  assert.match(componentSource, /pluralizeChange/);
  assert.match(componentSource, /count === 1 \? "change" : "changes"/);
  assert.doesNotMatch(combinedSource, /Save directory draft/);
  assert.match(combinedSource, /Save record|Save changes/);

  assert.match(dataSource, /orange 500 accent/);
  assert.match(dataSource, /not the default normal-size white-text button fill/);
  assert.match(componentSource, /defaultClass: "bg-\[#C2410C\] text-white"/);
  assert.doesNotMatch(componentSource, /bg-\[#F97316\][^"`]*text-white/);

  for (const state of ["Default", "Hover", "Pressed", "Keyboard focus", "Disabled", "Loading"]) {
    assert.match(componentSource, new RegExp(state));
  }
  assert.match(componentSource, /buttonStateExamples/);
  assert.match(componentSource, /aria-busy/);
  assert.match(componentSource, /Icon button example: search seat map/);
  assert.doesNotMatch(componentSource, /action: "\?"/);

  assert.match(componentSource, /Temporary brand placeholder/);
  assert.match(componentSource, /Logo asset not found/);
  assert.match(componentSource, /No approved Megeredchian Law logo asset was found/);
  assert.doesNotMatch(componentSource, />\s*ML\s*</);
});

test("component state board locks final approval corrections", async () => {
  const componentSource = await readSource("../app/concepts/component-state-board/ComponentStateBoard.tsx");

  for (const description of [
    "The saved draft already matches the published viewer map. No publish action is needed.",
    "Save or discard the open seat edits before reviewing the saved draft. Viewers continue seeing the published map.",
    "Publishing the reviewed draft now. Viewers continue seeing the current published map until this completes.",
    "The publish did not complete. The viewer map remains unchanged. Review the error and retry.",
    "The published map was updated successfully. Viewers now see the reviewed version."
  ]) {
    assert.match(componentSource, new RegExp(description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(componentSource, /secondaryAction: "Close"/);
  assert.match(componentSource, /example\.secondaryAction \?\? "Cancel"/);

  assert.match(componentSource, /<svg \{\.\.\.common\}>/);
  assert.match(componentSource, /IconGlyph/);
  assert.match(componentSource, /iconButtonExamples/);
  for (const label of ["Search seat map", "Open filters", "Open more options", "Close panel", "Show names"]) {
    assert.match(componentSource, new RegExp(label));
  }

  assert.match(componentSource, /current: true/);
  assert.match(componentSource, /aria-current=\{section\.current \? "page" : undefined\}/);
  assert.match(componentSource, /border border-\[#E2BDA0\] bg-\[#F6E7D8\] text-\[#6F2C13\]/);

  assert.match(componentSource, /from "next\/font\/google"/);
  assert.match(componentSource, /Inter\(/);
  assert.match(componentSource, /Manrope\(/);
  assert.match(componentSource, /--font-component-board-ui/);
  assert.match(componentSource, /--font-component-board-display/);
  assert.doesNotMatch(componentSource, /Arial/);
});
