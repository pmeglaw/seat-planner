import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const { formatDisplayName, formatSeatCode } = await importTsModule("lib/formatName.ts");

test("formatSeatCode uppercases a mixed-case seat code", () => {
  assert.equal(formatSeatCode("Cw01"), "CW01");
});

test("formatSeatCode trims surrounding whitespace before uppercasing", () => {
  assert.equal(formatSeatCode(" cw07 "), "CW07");
});

test("formatSeatCode returns empty string for empty input", () => {
  assert.equal(formatSeatCode(""), "");
});

test("formatSeatCode returns empty string for null/undefined", () => {
  assert.equal(formatSeatCode(null), "");
  assert.equal(formatSeatCode(undefined), "");
});

test("formatSeatCode leaves an already-uppercase code untouched", () => {
  assert.equal(formatSeatCode("CW01"), "CW01");
});

test("formatDisplayName title-cases an all-caps name", () => {
  assert.equal(formatDisplayName("PAM"), "Pam");
});

test("formatDisplayName title-cases a full all-caps name", () => {
  assert.equal(formatDisplayName("ALEX MEGERDCHIAN"), "Alex Megerdchian");
});

test("formatDisplayName leaves a naturally-cased name untouched", () => {
  assert.equal(formatDisplayName("van der Berg"), "van der Berg");
});

test("formatDisplayName returns empty string for null/undefined", () => {
  assert.equal(formatDisplayName(null), "");
  assert.equal(formatDisplayName(undefined), "");
});
