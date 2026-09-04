import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Scope note: this file guards marker *correctness* — that true coordinates and
// the map calibration constants stay untouched, and that the marker/map code
// never crosses data/auth/publish/route boundaries. The marker's visual styling
// (colors, pill sizes, name truncation classes) is intentionally NOT locked here
// so the marker look can be redesigned freely. GLYPH PRESENCE per state is the
// one styling-adjacent thing pinned (PR-C): it is the WCAG 1.4.1 vocabulary,
// not a look — hues and geometry stay free, the non-colour signals do not.

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("desktop marker system keeps true coordinates and calibration constants untouched", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const transformSource = await readSource("../lib/mapLayoutTransform.ts");

  assert.match(markerSource, /style=\{pointToStyle\(\{ x: seat\.x, y: seat\.y \}\)\}/);
  assert.match(markerSource, /markerUsesTrueCoordinate = addSeatMode \|\| swapMode \|\| moveEmployeeMode/);
  assert.match(markerSource, /resolvedViewportEdgeOffsetPx = markerUsesTrueCoordinate \|\| !tokenCanHugViewportEdge \? 0 : Math\.max\(0, Math\.round\(viewportEdgeOffsetPx\)\)/);
  assert.match(seatMapSource, /const visualSeat = visualSeatById\.get\(seat\.id\) \?\? seat/);
  assert.match(seatMapSource, /viewportEdgeOffsetPx=\{viewportPlacement\.offsetPx\}/);

  assert.match(transformSource, /MAP_IMAGE_SRC = "\/images\/office-floor-plan\.webp\?v=map-v2-cool-2x-3822x1734"/);
  assert.match(transformSource, /MAP_IMAGE_WIDTH = 3822/);
  assert.match(transformSource, /MAP_IMAGE_HEIGHT = 1734/);
  assert.match(transformSource, /xScale: 0\.815189/);
  assert.match(transformSource, /xOffset: 0\.101478/);
  assert.match(transformSource, /yScale: 1\.125499/);
  // Chair-centre re-fits. Phase 1 (fix/floor-plan-chair-calibration): north /
  // west / center-west (both) / center-desks were ~10–17px above their chairs.
  // Phase 2 (fix/floor-plan-calibration-ene-tighten, #178/#179) re-fit east and
  // both NE quads — but NE-right regressed to a savedBounds->visualBounds
  // RECTANGLE fit, landing NE01-NE08 3.0-8.4px off their chairs with the two
  // quads disagreeing by 13.3px. The 2026-07-19 chair-centre fit below is the
  // correct one; tests/map-calibration.test.mjs measures the alignment these
  // constants exist to produce and is the authority — these pins are only a
  // change-detector, so update both together. SE-lower xScale is unchanged
  // since the fix/floor-plan-polish micro-tune:
  assert.match(transformSource, /xOffset: -0\.056543/);
  assert.match(transformSource, /xScale: 0\.835824/);
});

test("marker vocabulary: glyph presence per state cannot drift (PR-C 1.4.1)", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");

  // Presence dot = person attached: assigned AND reserved carry it, and it
  // yields while a target-mode glyph is active (one glyph speaks at a time).
  assert.match(markerSource, /\(seat\.status === "assigned" \|\| seat\.status === "reserved"\) && !targetGlyphActive &&/);
  assert.match(markerSource, /const targetGlyphActive = swapCandidate \|\| moveCandidate \|\| invalidTarget;/);

  // Target modes: underlying fill preserved (no tone swap left in the state
  // classes), validity rides the ✓/✕ badges.
  assert.match(markerSource, /\(swapCandidate \|\| moveCandidate\) && \(\s*<span[^>]*>\s*✓/);
  assert.match(markerSource, /invalidTarget && \(\s*<span[^>]*>\s*✕/);
  assert.doesNotMatch(markerSource, /validTargetTone/);
  assert.doesNotMatch(markerSource, /--sp-marker-invalid-surface|--sp-legend-target-invalid-surface/);

  // Hatch = structurally unusable, on the unavailable arm only, clipped off
  // the border so the hover edge's measured contrast stays honest.
  assert.match(markerSource, /bg-\[image:var\(--sp-marker-unavailable-hatch\)\] bg-clip-padding/);

  // Draft badge survives with its glyph-ink token, and also yields to ✓/✕.
  assert.match(markerSource, /draftChanged && !selected && !searchProminent && !targetGlyphActive &&/);

  // Invalid targets: not-allowed cursor, and no hover affordance ring.
  assert.match(markerSource, /invalidTarget \? "cursor-not-allowed" : "cursor-pointer"/);
  assert.match(markerSource, /swapMode && !swapSource && !invalidTarget\) \|\| \(moveEmployeeMode && !moveEmployeeSource && !invalidTarget\)/);

  // Borders carry zero semantic weight — the uniform hover repaint stays.
  assert.match(markerSource, /group-hover:border-\[var\(--sp-marker-active-edge\)\]/);
});

test("type-floor ruling 1 (2026-08-24): the micro-glyph MARKS are exempt from the 12px text floor", async () => {
  // Owner ruling, 2026-08-24 type-floor pass. These glyphs are GRAPHICAL
  // ELEMENTS, not text: WCAG governs them under non-text contrast (1.4.11,
  // 3:1 — all measured ≥5.31:1), the same category as chart symbols and
  // status indicators. Text-size floors do NOT apply to them; do not refile
  // their sub-12px sizes as violations. The registry:
  //   - SeatMarker draft "D" badge, ✓ valid-target, ✕ invalid-target
  //     (14px circles; also the PR-C 1.4.1 second signal — see the glyph
  //     test above)
  //   - SeatMarker planner "AI" provenance chip
  //   - the five-site chrome "AI" badge: AppRail AiCell, SeatMap bar tenant,
  //     AskPlannerDrawer header + response chip, AiHighlightChip,
  //     SeatInspector Ask-Planner row
  //   - the login page's decorative "C05" faux seat code (owner ruling on the
  //     #444 scope note): a coordinate drawn ON an aria-hidden illustration,
  //     not information — it stays at its 9px illustration scale
  // WORDS on the canvas (code pill label, inline names, office plate title)
  // are NOT covered by this exemption — they follow the PR-2 zoom-threshold
  // rule (marks below the threshold, 12px text at or above it).
  // What is pinned: the marker glyphs stay aria-hidden decoration (their
  // meaning always rides the accessible name / a second signal, never the
  // tiny glyph itself). Sizes and hues stay free.
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");

  for (const glyph of ["D", "✓", "✕"]) {
    assert.match(
      markerSource,
      new RegExp(`<span[^>]*aria-hidden="true"[^>]*/?>\\s*${glyph}\\s*</span>|aria-hidden="true"\\s*>\\s*${glyph}`),
      `${glyph} badge must stay aria-hidden decoration`
    );
  }
  assert.match(markerSource, /plannerHighlighted && adminMarker && \(\s*<span\s*aria-hidden="true"/);

  // The login "C05" mark stays inside the aria-hidden illustration container
  // (the whole decorative panel is hidden, so the mark can never be read as
  // content) at its illustration scale.
  const loginPageSource = await readSource("../app/login/page.tsx");
  assert.match(loginPageSource, /aria-hidden="true"[^]*?text-\[9px\][^]*?C05/);
});

test("sanctioned eyebrow variant (2026-08-25): the Ask Planner label keeps the AI accent on eyebrow metrics", async () => {
  // Owner ruling 2026-08-25 (candidate B of the SeatInspector label question,
  // SEAT-PLANNER-HANDOFF.md §3). The Ask Planner card label unifies METRICS
  // with the inspector eyebrow family — 12px semibold uppercase
  // tracking-[0.08em], matching InspectorSectionLabel — because bold on
  // already-uppercase, already-tracked words was a third emphasis device
  // ("belt and suspenders"). The COLOUR deliberately stays --sp-ai-accent
  // (inherited from the wrapper): it marks an AI-touched surface, the same
  // five-site vocabulary as the "AI" chrome badge in the registry above.
  // That is signal, not drift — a consistency sweep must NOT re-flag it or
  // unify it to --sp-text-helper.
  // Measured 2026-08-25 per the hovered-surface rule (handoff §6): light
  // #8a3ffc on the hover wash #f6f2ff = 4.54:1 (12px text needs 4.5 — pass);
  // on white at rest = 5.00. Dark accent RULED 2026-08-25 (handoff §9):
  // purple-50 #a56eff measured 4.31 on the dark hover wash composite
  // (rgba(138,63,252,.16) over #1f1f1f = #302442), so the dark
  // --sp-ai-accent is purple-40 #be95ff — 6.13 on that composite, 6.44 on
  // the resting #262626, 7.01 on #1f1f1f. Change the accent hexes or the
  // wash alpha → re-measure all of these.
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  assert.match(
    inspectorSource,
    /<span className="text-xs font-semibold uppercase tracking-\[0\.08em\]">Ask Planner<\/span>/,
    "Ask Planner label holds eyebrow metrics (12px semibold uppercase 0.08em)"
  );
  assert.doesNotMatch(
    inspectorSource,
    /font-bold[^"]*">Ask Planner</,
    "Ask Planner label must not return to bold"
  );
  // The accent wrapper still colours the label (the sanctioned half of the
  // variant): the eyebrow row's wrapper carries --sp-ai-accent.
  assert.match(
    inspectorSource,
    /text-\[var\(--sp-ai-accent\)\]">[^]{0,1200}?Ask Planner<\/span>/,
    "Ask Planner label keeps the AI accent colour"
  );
});

test("desktop marker redesign stays clear of data auth publish and route boundaries", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../app/(shell)/page.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const managementSource = await readSource("../app/(shell)/admin/management/page.tsx");

  assert.match(viewerSource, /\.eq\("layer", "published"\)/);
  assert.match(viewerSource, /<ViewerSeatFinder/);
  assert.match(viewerFinderSource, /Read-only/);
  assert.match(viewerFinderSource, /Published/);
  assert.doesNotMatch(viewerFinderSource, /Map tools|Undo|Redo|CSV|JSON|Publish changes|Vacate|Delete seat/);
  assert.doesNotMatch(managementSource, /SeatMarker|draftChangedSeatLabelSet|Admin command row/);

  for (const source of [markerSource, seatMapSource]) {
    assert.doesNotMatch(source, /createServerSupabaseClient|requireAdmin|profiles\.role|\.rpc\("publish_seat_map"\)|\.from\("seats"\)\.insert|\.from\("seats"\)\.delete/);
  }
});
