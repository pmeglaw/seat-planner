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

  // The wrapper is placed by the calibration transform (left/top %); the
  // collision nudge and the viewport-edge hug are an inline transform on top,
  // and a running mode snaps every marker back to its true coordinate.
  assert.match(markerSource, /\.\.\.pointToStyle\(\{ x: seat\.x, y: seat\.y \}\)/);
  assert.match(markerSource, /markerUsesTrueCoordinate = addSeatMode \|\| swapMode \|\| moveEmployeeMode/);
  assert.match(markerSource, /resolvedViewportEdgeOffsetPx = markerUsesTrueCoordinate \? 0 : Math\.max\(0, Math\.round\(viewportEdgeOffsetPx\)\)/);
  assert.match(markerSource, /const nudge = activeMarker \? 0 : nameNudge;/);
  assert.match(markerSource, /transform: `translate\(\$\{translateX\}, calc\(-50% \+ \$\{nudge \* PILL_NUDGE_PX\}px\)\)`/);
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

test("marker vocabulary: one silhouette per state cannot drift (PHASE3DS §1.16, WCAG 1.4.1)", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const componentsCss = await readSource("../app/styles/sp-components.css");

  // Every state is a distinct silhouette (the specimen's grayscale strip):
  // rest 1px edge · selected 2px inverse edge · search filled + 1px · quiet
  // light edge + lighter text · origin dashed 2px · target solid 2px + tint ·
  // invalid dashed 2px + tint · ◇ badge · names-off filled footprint. The
  // marker picks ONE modifier by precedence; the sheet draws the shapes.
  assert.match(markerSource, /const pillModifier = origin \? "sp-pill--origin" : invalidTarget \? "sp-pill--invalid" : target \? "sp-pill--target" : hit \? "sp-pill--search" : quiet \? "sp-pill--quiet" : "";/);
  assert.match(markerSource, /namesOff \? "sp-pill--names-off" : ""/);
  assert.match(markerSource, /data-state=\{selected \? "selected" : undefined\}/);
  for (const rule of [
    /\.sp-pill\[aria-selected="true"\], \.sp-pill\[data-state="selected"\] \{ box-shadow: inset 0 0 0 var\(--sp-space-01\) var\(--sp-pill-selected-edge\); \}/,
    /\.sp-pill--origin \{ box-shadow: none; outline: var\(--sp-space-01\) dashed/,
    /\.sp-pill--target \{ background: var\(--sp-pill-target-fill\); box-shadow: inset 0 0 0 var\(--sp-space-01\) var\(--sp-pill-target-edge\); \}/,
    /\.sp-pill--invalid \{ background: var\(--sp-pill-invalid-fill\); box-shadow: none; outline: var\(--sp-space-01\) dashed var\(--sp-pill-invalid-edge\);[^}]*cursor: not-allowed; \}/,
    /\.sp-pill--names-off \{ width: var\(--sp-seat-footprint\);/
  ]) {
    assert.match(componentsCss, rule);
  }

  // Empty seats keep their status symbol (○ · lock · hatch), inlined by
  // SeatMark; the ◇ changed-in-draft badge is the same inlined mark on a pill.
  assert.match(markerSource, /<SeatMark kind=\{seatMarkKindFor\(seat\.status\)\} \/>/);
  assert.match(markerSource, /\{draftChanged \? <SeatMark kind="draft-badge" \/> : null\}/);

  // Invalid targets: aria-disabled + the reason in the accessible name; the
  // sheet supplies the not-allowed cursor. The candidates' affordance is the
  // --target edge, never a hover ring on an invalid pill.
  assert.match(markerSource, /aria-disabled=\{invalidTarget \|\| undefined\}/);
  assert.match(markerSource, /invalidTarget \? " Not a valid target\." : ""/);
  assert.match(markerSource, /const target = swapTarget \|\| swapCandidate \|\| moveCandidate;/);

  // The retired vocabularies stay retired: no marker/legend token families,
  // no opacity dim, no Tailwind state recipes on the pill.
  assert.doesNotMatch(markerSource, /--sp-marker-|--sp-legend-|opacity-45|group-hover|ring-4|data-token-mode/);
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
  const seatMarkSource = await readSource("../components/seat-map/SeatMark.tsx");

  // Phase 4 PR 3b: the marks are SeatMark's inlined SVGs — the ◇ badge and the
  // status symbols — every one aria-hidden; the pill's only text is label-01
  // (12px), so the marker carries no sub-12 type at all.
  assert.match(seatMarkSource, /className=\{className \? `sp-pill-badge \$\{className\}` : "sp-pill-badge"\} viewBox="0 0 8 8" aria-hidden="true"/);
  assert.doesNotMatch(markerSource, /text-\[\d/);

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
  assert.match(viewerFinderSource, /canEdit=\{false\}/);
  assert.doesNotMatch(viewerFinderSource, /Map tools|Undo|Redo|CSV|JSON|Publish changes|Vacate|Delete seat/);
  assert.doesNotMatch(managementSource, /SeatMarker|draftChangedSeatLabelSet|Admin command row/);

  for (const source of [markerSource, seatMapSource]) {
    assert.doesNotMatch(source, /createServerSupabaseClient|requireAdmin|profiles\.role|\.rpc\("publish_seat_map"\)|\.from\("seats"\)\.insert|\.from\("seats"\)\.delete/);
  }
});
