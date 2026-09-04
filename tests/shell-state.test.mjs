// lib/shellState.ts — the shell layout's server facts (published date, my
// seat), derived from viewer-safe published rows only.
import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { deriveShellState, escapeIlikePattern } = await importTsModule("lib/shellState.ts");

test("deriveShellState: nothing published, no seat → both null", () => {
  assert.deepEqual(deriveShellState({ latestPublishedUpdatedAt: null, mySeatRow: null }), { publishedAt: null, mySeat: null });
  assert.deepEqual(deriveShellState({ latestPublishedUpdatedAt: undefined, mySeatRow: undefined }), { publishedAt: null, mySeat: null });
  assert.deepEqual(deriveShellState({ latestPublishedUpdatedAt: "", mySeatRow: null }), { publishedAt: null, mySeat: null });
});

test("deriveShellState: rows → publishedAt + mySeat", () => {
  assert.deepEqual(deriveShellState({ latestPublishedUpdatedAt: "2026-09-02T21:12:00Z", mySeatRow: { label: "L02", floor: "3" } }), {
    publishedAt: "2026-09-02T21:12:00Z",
    mySeat: { label: "L02", floor: "3" }
  });
  // A seat row with no label is not a seat the panel can name.
  assert.equal(deriveShellState({ latestPublishedUpdatedAt: "2026-09-02T21:12:00Z", mySeatRow: { label: null, floor: "3" } }).mySeat, null);
  // A missing floor never breaks the row; the panel just omits it.
  assert.deepEqual(deriveShellState({ latestPublishedUpdatedAt: "x", mySeatRow: { label: "L02", floor: null } }).mySeat, { label: "L02", floor: "" });
});

test("escapeIlikePattern: PostgREST wildcards in an email are literal", () => {
  assert.equal(escapeIlikePattern("first_last@example.com"), "first\\_last@example.com");
  assert.equal(escapeIlikePattern("100%@example.com"), "100\\%@example.com");
  assert.equal(escapeIlikePattern("plain@example.com"), "plain@example.com");
});
