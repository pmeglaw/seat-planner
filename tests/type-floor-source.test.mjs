import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// Type-floor ledger (owner rulings, 2026-08-24).
//
// The product type floor is 12px (label-01). Sub-12px type survives only in
// the places the rulings carved out:
//   - MARKS: micro-glyph badges (D/✓/✕/AI) — graphical elements governed by
//     non-text contrast, not text sizing (see
//     desktop-seat-marker-system-source.test.mjs).
//   - Map-canvas WORDS: pill/name labels pending the PR-2 zoom-threshold rule
//     (marks below the threshold, 12px text at or above it).
//   - Map-chrome instances not yet ruled on (Group 3 of the 2026-08-24
//     inventory).
//   - SeatSheet: expressive architectural-sheet artifact, exempt-or-redesign
//     pending the rendered-size report.
//   - app/concepts/**: prototype-only, deliberately unscanned — but a concept
//     file cannot GRADUATE out of app/concepts/ still carrying sub-12px type:
//     moving it into the shipped tree lands it in this scan and fails here
//     until the debt is paid or the owner extends the ledger.
//
// If this test fails because a count went UP: you added sub-12px type to a
// shipped surface — use 12px (text-xs / label-01), or get an owner ruling and
// extend the ledger with a comment naming it. If a count went DOWN: good —
// update the ledger to the new number so the ratchet holds.
const SUB12_LEDGER = new Map(Object.entries({
  // Marks (Ruling 1 — exempt):
  "components/seat-map/AiHighlightChip.tsx": 1,
  "components/ui/AppRail.tsx": 1,
  "app/login/page.tsx": 1,
  // Map canvas: marks + words pending the PR-2 zoom-threshold rule:
  "components/seat-map/SeatMarker.tsx": 16,
  // Map chrome, not yet ruled (Group 3 of the 2026-08-24 inventory):
  "components/seat-map/AskPlannerDrawer.tsx": 18,
  "components/seat-map/FilterPanel.tsx": 9,
  "components/seat-map/FloorSelector.tsx": 2,
  "components/seat-map/MapStatusBand.tsx": 3,
  "components/seat-map/MapWashLayer.tsx": 1,
  "components/seat-map/MapZoomControl.tsx": 2,
  "components/seat-map/NamesVisibilityToggle.tsx": 1,
  "components/seat-map/ResultsPanel.tsx": 6,
  "components/seat-map/SeatInspector.tsx": 12,
  "components/seat-map/SeatMap.tsx": 10,
  "components/seat-map/ViewerFindPalette.tsx": 12,
  "components/seat-map/ViewerSeatFinder.tsx": 4,
  "components/ui/design-system.tsx": 1,
  // SeatSheet (owner rulings 2026-08-24): info-pane CSS promoted to the 12px
  // floor; below 880px the plan is a picture (SVG text + title block hidden,
  // info pane carries the content at ≥12px). Remaining 5 = title-block conceit
  // (8.5px label, 10px block — desktop-only by ruling) + the three SVG
  // fontSize literals (desk codes / zone ref / leader annotation), whose
  // desktop treatment (raise vs remove) is pending the owner's branch call.
  "components/seat-map/SeatSheet.tsx": 5
}));

const ROOTS = ["app", "components", "lib"];
const SKIP_DIRS = new Set(["concepts", "fonts", "node_modules"]);
const FILE_RE = /\.(?:tsx|ts|css)$/;

const PATTERNS = [
  { re: /text-\[(\d+(?:\.\d+)?)px\]/g, toPx: v => Number(v) },
  { re: /text-\[(\d*\.?\d+)rem\]/g, toPx: v => Number(v) * 16 },
  { re: /font-size:\s*(\d+(?:\.\d+)?)px/g, toPx: v => Number(v) },
  { re: /fontSize=\{(\d+(?:\.\d+)?)\}/g, toPx: v => Number(v) },
  { re: /fontSize:\s*(\d+(?:\.\d+)?)\s*[,}\s]/g, toPx: v => Number(v) }
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function collectFiles(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collectFiles(path.join(dir, entry.name), out);
    } else if (FILE_RE.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function countSub12(source) {
  let count = 0;
  for (const { re, toPx } of PATTERNS) {
    re.lastIndex = 0;
    for (const match of source.matchAll(re)) {
      if (toPx(match[1]) < 12) count += 1;
    }
  }
  return count;
}

test("sub-12px type on shipped surfaces stays inside the ruled ledger", async () => {
  const files = [];
  for (const root of ROOTS) {
    await collectFiles(path.join(repoRoot, root), files);
  }

  const actual = new Map();
  for (const file of files) {
    const count = countSub12(await readFile(file, "utf8"));
    if (count > 0) {
      const rel = path.relative(repoRoot, file).split(path.sep).join("/");
      actual.set(rel, count);
    }
  }

  const problems = [];
  for (const [rel, count] of [...actual.entries()].sort()) {
    const allowed = SUB12_LEDGER.get(rel);
    if (allowed === undefined) {
      problems.push(`NEW sub-12px type in ${rel} (${count} instance${count === 1 ? "" : "s"})`);
    } else if (count !== allowed) {
      problems.push(`${rel}: ${count} sub-12px instances, ledger says ${allowed}`);
    }
  }
  for (const rel of SUB12_LEDGER.keys()) {
    if (!actual.has(rel)) problems.push(`${rel}: in ledger but no sub-12px type found — remove the entry`);
  }

  assert.deepEqual(
    problems,
    [],
    `Type-floor ledger drift:\n${problems.join("\n")}\n\nActual counts:\n${JSON.stringify(Object.fromEntries([...actual.entries()].sort()), null, 2)}`
  );
});
