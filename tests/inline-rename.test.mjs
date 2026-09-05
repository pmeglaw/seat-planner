import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { resolveInlineRename, duplicateNameMessage } = await importTsModule("lib/inlineRename.ts");

// PHASE3DS §1.25 / PHASE2UX §1G.4: the inline rename row is field + Save ·
// Cancel; Enter saves, Esc cancels, blur VALIDATES (never commits). This is
// the pure resolution the row reads on every keystroke and on blur: an
// unchanged draft disables Save, an empty one is invalid, a duplicate is
// invalid with the specimen's copy (the name quoted, the next step named).

const existing = ["Intake", "Litigation"];

test("unchanged (after trimming, case-preserving) → Save disabled, nothing to send", () => {
  assert.deepEqual(resolveInlineRename({ kind: "department", draft: "Intake", original: "Intake", existing }), { kind: "unchanged" });
  assert.deepEqual(resolveInlineRename({ kind: "department", draft: "  Intake  ", original: "Intake", existing }), { kind: "unchanged" });
});

test("empty → invalid with a reason", () => {
  assert.deepEqual(resolveInlineRename({ kind: "department", draft: "   ", original: "Intake", existing }), {
    kind: "invalid",
    message: "Enter a department name."
  });
});

test("duplicate (case-insensitive, another row) → invalid, name quoted, next step named", () => {
  assert.deepEqual(resolveInlineRename({ kind: "department", draft: "litigation", original: "Intake", existing }), {
    kind: "invalid",
    message: "A department named “Litigation” already exists. Rename it from the list instead."
  });
  assert.deepEqual(resolveInlineRename({ kind: "zone", draft: "north pod", original: "South Pod", existing: ["North Pod", "South Pod"] }), {
    kind: "invalid",
    message: "A zone named “North Pod” already exists. Rename it from the list instead."
  });
});

test("too long → invalid naming the bound", () => {
  const result = resolveInlineRename({ kind: "zone", draft: "x".repeat(121), original: "A", existing: ["A"] });
  assert.equal(result.kind, "invalid");
  assert.match(result.message, /120/);
});

test("valid → the trimmed name to send", () => {
  assert.deepEqual(resolveInlineRename({ kind: "department", draft: "  Client Intake ", original: "Intake", existing }), { kind: "valid", name: "Client Intake" });
  // Changing only the case of the SAME row is a real rename, not a duplicate.
  assert.deepEqual(resolveInlineRename({ kind: "department", draft: "INTAKE", original: "Intake", existing }), { kind: "valid", name: "INTAKE" });
});

test("the create modal reuses the duplicate copy (no original row)", () => {
  assert.equal(duplicateNameMessage("zone", "North Pod"), "A zone named “North Pod” already exists. Rename it from the list instead.");
  assert.deepEqual(resolveInlineRename({ kind: "zone", draft: "north pod", original: null, existing: ["North Pod"] }), {
    kind: "invalid",
    message: "A zone named “North Pod” already exists. Rename it from the list instead."
  });
});
