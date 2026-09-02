import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Find-palette guardrails. These were written for the docked People directory
// (2026-07-16 regrade, review 5) and re-expressed when the v12 Find palette
// replaced it along with the results panel, the collapse rail and the mobile
// PEOPLE pill. They pin the safety properties — snapshot-only data, the one
// existing selection path, no reserved stage width, and the hover highlight
// staying render-only (INV-2) — not the palette's styling.

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("the Find palette is fed from the published snapshot and reserves no stage width", async () => {
  const source = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  // Built from the shared snapshot-derived builder, not an ad-hoc list. The
  // builder wraps buildViewerDirectory, so the palette's people rows are still
  // the same rows search produces (tests/viewer-directory.test.mjs).
  assert.match(source, /buildViewerPaletteBrowse\(\{ seats: publishedSeats, employees, zoneOptions \}\)/);

  // The hydration guarantee the retired `directoryOpen` expression carried —
  // reserve the right slot in the SERVER markup, or every load renders the map
  // full-bleed and then snaps ~330px narrower when the persisted collapse
  // preference arrives — is not merely preserved, it is retired: the palette
  // floats, so no width is reserved for it at any breakpoint and there is
  // nothing left to snap. Pinned as the absence of a reserved gutter.
  assert.doesNotMatch(source, /panel:pr-\[/);
  assert.doesNotMatch(source, /stageReservedClassName|rightSlotTier/);
  // …and the positive half: the palette is viewport-fixed, so it is out of
  // flow and cannot push the map even if a gutter class came back.
  assert.match(await readSource("../components/seat-map/ViewerFindPalette.tsx"), /"fixed z-\[70\] flex flex-col/);

  // At rest nothing is open (contract #1): the palette has no persisted
  // preference and no server-side open state to hydrate away from.
  assert.match(source, /const \[paletteOpen, setPaletteOpen\] = useState\(false\);/);

  // Rows activate through the one existing selection path (explicit click —
  // INV-2 holds by construction).
  assert.match(source, /onOpenRow=\{openResult\}/);
  assert.match(await readSource("../components/seat-map/ViewerFindPalette.tsx"), /onClick=\{\(\) => onOpenRow\(row\)\}/);
});

test("the dead directory-collapse preference stays deleted", async () => {
  const source = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  // Owner answer 4 (2026-08-11): removed outright, no migration, no cleanup
  // sweep. The key stored whether a panel that no longer exists was collapsed,
  // and the palette has no collapsed state to migrate it to. Values already
  // sitting in browsers are inert. Pinned as an absence so a future "restore
  // the collapse pref" cannot quietly reintroduce a second theme-style pref
  // and a second hydration path for one dead boolean.
  // The quoted form, so the source may still NAME the retired key in the
  // comment that warns against bringing it back.
  assert.doesNotMatch(source, /"seat-planner:viewer-directory-collapsed"/);
  assert.doesNotMatch(source, /useSyncExternalStore/);
  // 2026-08-17: the legend's Show-occupant-names toggle became the viewer's
  // ONE persisted preference (owner-approved), so the old blanket "no
  // localStorage" absence narrows to an exact allowlist. 2026-09-01: the
  // remembered floor (multi-floor, owner ruling "viewer lands on own floor,
  // remembers last") is the SECOND — its key constant lives in lib/floors.
  // Every storage call goes through one of the two constants, and the dead
  // collapse key above still cannot return.
  assert.match(source, /const VIEWER_NAMES_VISIBLE_STORAGE_KEY = "seat-planner:viewer-names-visible";/);
  assert.match(source, /VIEWER_FLOOR_STORAGE_KEY/);
  const storageUses = source.match(/localStorage\.\w+\([^),]*/g) ?? [];
  assert.ok(storageUses.length > 0, "the names toggle persists through localStorage");
  assert.deepEqual(
    storageUses.filter(use => !use.includes("VIEWER_NAMES_VISIBLE_STORAGE_KEY") && !use.includes("VIEWER_FLOOR_STORAGE_KEY")),
    [],
    "the viewer touches no localStorage key besides the names toggle's and the remembered floor's"
  );
});

test("palette row hover lights a seat and does nothing else (INV-2)", async () => {
  const source = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const palette = await readSource("../components/seat-map/ViewerFindPalette.tsx");

  // Hover-locate is render-only: it feeds the marker highlight prop and never
  // selects, centers, or scrolls.
  assert.match(source, /hoverSeatId/);
  // Named apart from the search cause so the two can announce differently
  // (accessibility-source pins the announcement itself), but it feeds nothing
  // but `highlighted`.
  assert.match(source, /const seatIsPaletteHover = paletteOpen && seat\.id === hoverSeatId;/);
  assert.match(source, /highlighted=\{seatIsSearchHit \|\| seatIsPaletteHover\}/);
  assert.doesNotMatch(source, /seatIsPaletteHover[\s\S]{0,80}(openResult|selectSeat|scrollIntoView|centerOn)/);
  // And the palette's side of it: hover only ever calls the reporting prop.
  assert.match(palette, /onPointerEnter=\{\(\) => onRowHoverChange\(row\.seatId\)\}/);
  assert.match(palette, /onPointerLeave=\{\(\) => onRowHoverChange\(null\)\}/);
});

test("the palette frame re-measures after the bar re-wraps (P4)", async () => {
  const palette = await readSource("../components/seat-map/ViewerFindPalette.tsx");

  // A synchronous read on `resize` alone measured the anchor BEFORE the bar's
  // own resize handler re-wrapped its tiers, leaving the open palette 40px
  // past the viewport bottom and under the bar (PALETTE-ASSESSMENT P4). Both
  // halves of the fix are load-bearing: the rAF re-read lands after the bar's
  // re-render, and the ResizeObserver catches anchor-box changes that arrive
  // with no window resize at all.
  assert.match(palette, /rafId = requestAnimationFrame\(measure\)/);
  assert.match(palette, /new ResizeObserver\(measure\)/);
  assert.match(palette, /observer\.observe\(anchor\)/);
  // And the teardown for each: no leaked observer, no stale rAF firing into
  // an unmounted palette.
  assert.match(palette, /cancelAnimationFrame\(rafId\)/);
  assert.match(palette, /observer\.disconnect\(\)/);
});

test("the palette copy is scoped per modality and per mode (P5)", async () => {
  const palette = await readSource("../components/seat-map/ViewerFindPalette.tsx");

  // Coarse pointers have no hover, arrows, Enter or Esc, so the keyboard copy
  // hides there and the zones eyebrow swaps to the input that exists: tap.
  // Same ruling as the read-path F5 — copy is scoped per modality.
  assert.match(palette, /tap to filter/);
  assert.match(palette, /\[@media\(pointer:coarse\)\]:hidden/);
  // And per mode: the field's Enter handler is gated on an active query, so
  // only the query-mode legend may claim "Enter opens".
  assert.match(palette, /queryActive \? "↑↓ to move · Enter opens · Esc closes" : "↑↓ to move · Esc closes"/);
});
