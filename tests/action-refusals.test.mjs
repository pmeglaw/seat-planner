import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { PUBLISHED_EMPLOYEE_SQLSTATE, isPublishedEmployeeRefusal } = await importTsModule("lib/actionRefusals.ts");

// Phase 4 PR 6 row 2 (finding F-2): only the database guard's own SQLSTATE is
// a refusal the panel may render as one; transport and permission errors are
// not, whatever their message says.

test("the deactivate guard's SQLSTATE is MLS03 — its own code, beside the MLS02 fence", () => {
  assert.equal(PUBLISHED_EMPLOYEE_SQLSTATE, "MLS03");
  assert.notEqual(PUBLISHED_EMPLOYEE_SQLSTATE, "MLS02");
});

test("isPublishedEmployeeRefusal recognises the guard by code only", () => {
  assert.equal(isPublishedEmployeeRefusal({ code: "MLS03", message: "This employee is still on the published map at N01." }), true);
  // The same words with no code (a transport failure echoing text) are not a refusal.
  assert.equal(isPublishedEmployeeRefusal({ code: null, message: "This employee is still on the published map at N01." }), false);
  assert.equal(isPublishedEmployeeRefusal({ code: "42501", message: "Admin permission required." }), false);
  assert.equal(isPublishedEmployeeRefusal({ code: "MLS02", message: "stale draft" }), false);
  assert.equal(isPublishedEmployeeRefusal({}), false);
  assert.equal(isPublishedEmployeeRefusal(null), false);
  assert.equal(isPublishedEmployeeRefusal(undefined), false);
});
