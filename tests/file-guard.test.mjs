import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { checkUpload, UPLOAD_LIMIT_BYTES, describeUploadLimit } = await importTsModule("lib/fileGuard.ts");

// DECISIONS D6-b / frame invariant (owner 2026-09-03), PHASE2UX §1S.3: the
// type and the 5 MB limit are stated BEFORE choosing a file, and every unhappy
// path is an inline error under the section before any tearsheet opens. This
// is the client-side guard the two file triggers run first: wrong type, too
// large (the size named), empty. Content-level checks (missing columns, the
// snapshot shape) belong to the parsers.

const file = (name, size, type = "") => ({ name, size, type });

test("the limit is 5 MB and is described in the trigger's own words", () => {
  assert.equal(UPLOAD_LIMIT_BYTES, 5 * 1024 * 1024);
  assert.equal(describeUploadLimit("csv"), ".csv up to 5 MB");
  assert.equal(describeUploadLimit("json"), ".json up to 5 MB");
});

test("a conforming file passes", () => {
  assert.equal(checkUpload(file("roster.csv", 1200, "text/csv"), "csv"), null);
  assert.equal(checkUpload(file("ROSTER.CSV", 1200, ""), "csv"), null, "extension check is case-insensitive; a missing MIME type is fine");
  assert.equal(checkUpload(file("seat-map-export.json", 1200, "application/json"), "json"), null);
});

test("wrong type is refused by extension, naming the expected one", () => {
  assert.equal(checkUpload(file("roster.xlsx", 1200, ""), "csv"), "Choose a .csv file.");
  assert.equal(checkUpload(file("roster.csv", 1200, ""), "json"), "Choose a .json file — a file exported from this page.");
});

test("too large names the actual size and the limit", () => {
  assert.equal(checkUpload(file("roster.csv", 7.2 * 1024 * 1024, "text/csv"), "csv"), "This file is 7.2 MB — the limit is 5 MB.");
  assert.equal(checkUpload(file("roster.csv", UPLOAD_LIMIT_BYTES, "text/csv"), "csv"), null, "exactly the limit passes");
  assert.equal(checkUpload(file("roster.csv", UPLOAD_LIMIT_BYTES + 1, "text/csv"), "csv"), "This file is 5.0 MB — the limit is 5 MB.");
});

test("a File-like without name or size (a test double) is not refused on those grounds", () => {
  assert.equal(checkUpload({}, "csv"), null);
});

test("an empty file is refused before parsing", () => {
  assert.equal(checkUpload(file("roster.csv", 0, "text/csv"), "csv"), "The CSV is empty.");
  assert.equal(checkUpload(file("export.json", 0, ""), "json"), "Cannot restore an empty snapshot.");
});
