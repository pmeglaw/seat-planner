import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// SeatMarker is memoized with a hand-written comparator, which buys a large
// win on drag and hover but introduces one failure mode: if the component
// starts rendering a seat field the comparator does not compare, React will
// skip an update that should have happened and the marker renders stale data
// — silently, with no error anywhere. These tests exist to make that mistake
// fail in CI instead of on the map.

const markerSource = readFileSync(new URL("../components/seat-map/SeatMarker.tsx", import.meta.url), "utf8");
const adminMapSource = readFileSync(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
const viewerSource = readFileSync(new URL("../components/seat-map/ViewerSeatFinder.tsx", import.meta.url), "utf8");

/** Seat fields the component body actually reads, e.g. `seat.label`. */
function renderedSeatFields(source) {
  const body = source.slice(source.indexOf("function SeatMarkerComponent"));
  const fields = new Set();
  for (const match of body.matchAll(/\bseat\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) fields.add(match[1]);
  return fields;
}

/** Fields listed in the comparator's RENDERED_SEAT_FIELDS array. */
function comparedSeatFields(source) {
  const declaration = source.match(/const RENDERED_SEAT_FIELDS = \[([^\]]*)\]/);
  assert.ok(declaration, "RENDERED_SEAT_FIELDS must exist for the memo comparator to be auditable");
  return new Set([...declaration[1].matchAll(/"([a-zA-Z_][a-zA-Z0-9_]*)"/g)].map(m => m[1]));
}

test("every seat field SeatMarker renders is covered by the memo comparator", () => {
  const rendered = renderedSeatFields(markerSource);
  const compared = comparedSeatFields(markerSource);

  // `employee` is compared through its two leaf fields (full_name, position)
  // rather than by object identity, so it is expected to be absent from the
  // primitive list.
  const missing = [...rendered].filter(field => field !== "employee" && !compared.has(field));

  assert.deepEqual(
    missing,
    [],
    `SeatMarker reads seat.${missing.join(", seat.")} but the memo comparator does not compare ` +
      `${missing.length === 1 ? "it" : "them"}. Add ${missing.length === 1 ? "it" : "them"} to ` +
      `RENDERED_SEAT_FIELDS, or the marker will render stale data.`
  );
});

test("the occupant fields the marker reads are compared explicitly", () => {
  // Comparing seat.employee by reference would defeat the memo, since the maps
  // rebuild employee objects when they re-stitch seats to people.
  assert.match(markerSource, /previous\.employee\?\.full_name/);
  assert.match(markerSource, /previous\.employee\?\.position/);
  const employeeReads = [...markerSource.matchAll(/seat\.employee\?\.([a-zA-Z_]+)/g)].map(m => m[1]);
  for (const field of new Set(employeeReads)) {
    assert.match(
      markerSource,
      new RegExp(`previous\\.employee\\?\\.${field}`),
      `SeatMarker reads seat.employee?.${field} but the comparator ignores it.`
    );
  }
});

test("SeatMarker is exported memoized, not as a bare component", () => {
  assert.match(markerSource, /export const SeatMarker = memo\(SeatMarkerComponent, seatMarkerPropsEqual\)/);
  assert.doesNotMatch(markerSource, /export function SeatMarker\b/);
});

test("the comparator checks every prop, so a new prop cannot be silently ignored", () => {
  // The loop over Object.keys is what makes future props safe by default.
  assert.match(markerSource, /Object\.keys\(next\)/);
  assert.match(markerSource, /Object\.is\(previous\[key\], next\[key\]\)/);
});

test("both maps pass identity-stable callbacks, or the memo is inert", () => {
  // An inline arrow or a re-created function declaration here hands every
  // marker a new prop on every render and silently undoes the memo.
  assert.match(adminMapSource, /onSelect=\{stableSelectSeat\}/);
  assert.match(adminMapSource, /onMovePointerDown=\{stableMovePointerDown\}/);
  assert.match(viewerSource, /onSelect=\{stableSelectSeat\}/);
  assert.match(viewerSource, /onMovePointerDown=\{NOOP_MOVE_POINTER_DOWN\}/);

  for (const [name, source] of [["SeatMap", adminMapSource], ["ViewerSeatFinder", viewerSource]]) {
    assert.doesNotMatch(
      source,
      /onSelect=\{\([^)]*\)\s*=>/,
      `${name} must not pass an inline arrow to SeatMarker's onSelect — it disables the memo.`
    );
    assert.doesNotMatch(
      source,
      /onMovePointerDown=\{\([^)]*\)\s*=>/,
      `${name} must not pass an inline arrow to SeatMarker's onMovePointerDown — it disables the memo.`
    );
  }
});

test("the stable wrappers read through a ref, so no closure goes stale", () => {
  // Stability without freshness would be worse than no memo: the marker would
  // call yesterday's handler. The ref assignment is what prevents that.
  assert.match(adminMapSource, /latestSeatHandlers\.current = \{ selectSeat, handleMovePointerDown \}/);
  assert.match(adminMapSource, /latestSeatHandlers\.current\.selectSeat\(seatId\)/);
  assert.match(viewerSource, /latestSelectSeat\.current = selectSeat/);
  assert.match(viewerSource, /latestSelectSeat\.current\(seatId\)/);
});
