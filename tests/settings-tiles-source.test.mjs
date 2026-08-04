import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// v12 slice 8, contract #14. The utility rows became tiles. These pin the
// data-safety claims the surface makes and the naming honesty INFRA-02 (#277)
// established — not the tile styling, which is free to evolve.

const panelUrl = new URL("../components/admin-settings/DataUtilitiesPanel.tsx", import.meta.url);
const readPanel = () => readFile(panelUrl, "utf8");

test("the standing notice states the publish boundary and the restore blast radius", async () => {
  const source = await readPanel();

  // Both halves matter: the first says nothing here reaches viewers, the
  // second says a restore is not a partial merge.
  assert.match(source, /The published map is never touched until you publish\./);
  assert.match(source, /Restores replace the entire draft — review before confirming\./);
});

test("section names stay honest in the source, uppercased only in CSS", async () => {
  const source = await readPanel();

  // INFRA-02 (#277): this panel is a draft working copy, not a backup. The v12
  // prototype relabels it "ADVANCED RECOVERY" with "Export/Restore JSON backup"
  // tiles — the exact framing that guardrail removed, and an all-caps spelling
  // would slip past a case-sensitive assertion while reinstating the risk. The
  // uppercase look comes from the `uppercase` utility instead.
  assert.match(source, /uppercase tracking-\[0\.04em\][^>]*>CSV assignments</);
  assert.match(source, /uppercase tracking-\[0\.04em\][^>]*>Draft working-copy snapshots</);
  assert.doesNotMatch(source, /ADVANCED RECOVERY/);
  assert.doesNotMatch(source, /JSON backup/);
});

test("the destructive tile is toned and still routes through its review dialog", async () => {
  const source = await readPanel();

  assert.match(source, /label="Reset draft to published"[\s\S]{0,200}tone="danger"/);
  assert.match(source, /label="Reset draft to published"[\s\S]{0,240}onClick=\{openResetReview\}/);
  // Reviewing is the only path to the mutation — the tile never calls it.
  assert.equal((source.match(/resetDraftToPublishedAction\(/g) ?? []).length, 1);
});

test("every tile keeps an accessible name that carries its description", async () => {
  const source = await readPanel();

  // The visible title alone ("Import CSV") does not say whether a file lands
  // immediately or a review opens; the description does, so it stays in the
  // accessible name rather than living only in a tooltip.
  assert.match(source, /aria-label=\{`\$\{label\}\. \$\{description\}`\}/);
});
