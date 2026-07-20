import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// lib/permissions.ts is the pure-function half of the admin security boundary
// (used by components and by assertAdmin call sites). It had no test at all.
const { isAdmin, assertAdmin } = await importTsModule("lib/permissions.ts");

test("isAdmin is true only for the admin role", () => {
  assert.equal(isAdmin({ role: "admin" }), true);
  assert.equal(isAdmin({ role: "viewer" }), false);
});

test("isAdmin treats missing/blank profiles as non-admin", () => {
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin(undefined), false);
  assert.equal(isAdmin({}), false);
});

test("assertAdmin passes for admins and throws for everyone else", () => {
  assert.doesNotThrow(() => assertAdmin({ role: "admin" }));
  assert.throws(() => assertAdmin({ role: "viewer" }), /Admin permission required\./);
  assert.throws(() => assertAdmin(null), /Admin permission required\./);
  assert.throws(() => assertAdmin(undefined), /Admin permission required\./);
});
