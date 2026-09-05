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
//   - Group-3 editor chrome RULED 2026-08-26: all ~52 word sites (including
//     the two kbd keycap hints — they render words) raised to the floor;
//     nine mark analogs of the P3 palette exemptions stay exempt (initials
//     monograms ×3, mono seat-code pill, numeric count badges ×3, mono zoom
//     readout ×2) — named per file below.
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
  "app/login/page.tsx": 1,
  // Map canvas: the Phase 3 pill is label-01 (12px) — SeatMarker.tsx left the
  // ledger in Phase 4 PR 3b (was 16: the code tier and the sub-12 marks).
  // Group-3 ruling 2026-08-26 — remaining counts are EXEMPT marks only:
  // AskPlannerDrawer = the two registry "AI" chrome badges (header + response
  // chip); MapZoomControl = the mono tabular zoom readout (both orientation
  // arms); SeatInspector = the registry "AI" badge, the two initials
  // monograms (header + employee-option row), and the mono seat-code pill
  // (same artifacts the P3 palette ruling exempted); SeatMap = the registry
  // "AI" bar tenant plus the two numeric count badges (planner highlights,
  // publish changes); ViewerSeatFinder = the filter count badge and the
  // aria-hidden "V" brand monogram. Every WORD site in these files sits at
  // the 12px floor now — a count going UP here means a new word slipped in.
  "components/seat-map/AskPlannerDrawer.tsx": 2,
  "components/seat-map/SeatInspector.tsx": 4,
  // P3 ruling 2026-08-25: the palette is the sanctioned FIND surface, so its
  // eight word sites (header count, kind badge — the 9px floor-breaker — result
  // meta, Clear search, zone chip labels, row subtitles, "No seat", footer)
  // were raised to the 12px floor. Phase 4 PR 3b moved the rows to the Phase 3
  // `.sp-palette-row` (code-02 code cell, label-01 sub line, no avatar), so the
  // one remaining EXEMPT mark is the zone chip's mono seat count.
  "components/seat-map/ViewerFindPalette.tsx": 1,
  // SeatSheet (owner rulings 2026-08-24): info-pane CSS promoted to the 12px
  // floor at all widths; SVG plan text raised to fontSize 13 viewBox units and
  // hidden below 1133px viewports where it would render sub-12 (legible-or-
  // absent — see the geometry test below). Remaining 2 = the title-block
  // conceit (8.5px label, 10px block), EXEMPT desktop-only: the block hides
  // below 880px, and above it the drawing-sheet title block earns its
  // micro-print on a large surface by owner ruling.
  "components/seat-map/SeatSheet.tsx": 2
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

// SeatSheet geometry (owner rulings 2026-08-24, measured live). The numbers
// couple: fontSize 13 viewBox units renders 12px only when the plan SVG
// reaches ~591px, which the two-column layout first does at ~1133px viewports
// (it caps at 613px → 12.45px). Below that the text hides rather than render
// sub-12 ("legible-or-absent"); no fontSize both fits the 52×27-unit desk
// boxes and clears 12px across the whole two-column range. Changing any of
// these values requires re-measuring the others — see the CSS comment in
// SeatSheet.tsx.
test("SeatSheet plan text is legible-or-absent and the phone page drops the sheet conceits", async () => {
  const source = await readFile(path.join(repoRoot, "components/seat-map/SeatSheet.tsx"), "utf8");

  // SVG text at 13 viewBox units — desk codes, zone reference, leader annotation.
  assert.equal(source.match(/fontSize=\{13\}/g)?.length, 3, "expected all three SVG text kinds at fontSize 13");

  // The legibility threshold: SVG strings and the zone-reference extension
  // lines hide wherever they would render below 12px.
  const svgHide = source.match(/@media \(max-width: 1132px\) \{[^}]*\.mss-plan svg text,[^}]*\.mss-zone-ref \{ display: none; \}/);
  assert.ok(svgHide, "SVG text + zone-ref must hide below the 1133px legibility threshold");

  // The single-column breakpoint drops the title block; the notice states keep
  // their issued-for line so the name survives the drop.
  const phoneBlock = source.match(/@media \(max-width: 880px\) \{[\s\S]*?\n\}/);
  assert.ok(phoneBlock, "single-column media block missing");
  assert.ok(phoneBlock[0].includes(".mss-title-block { display: none; }"), "title block must drop below 880px");
  assert.ok(phoneBlock[0].includes(".mss-notice-issued { display: block; }"), "notice issued-for line must appear below 880px");
  assert.ok(source.includes('className="mss-notice-issued">Issued for {issuedFor}'), "notice states must render issued-for outside the title block");
});
