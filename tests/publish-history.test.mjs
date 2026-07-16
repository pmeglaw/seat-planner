import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTsModule(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

const publishHistory = await importTsModule("lib/publishHistory.ts");

test("publish history resolves publisher ids to profile emails", () => {
  const events = publishHistory.resolvePublishHistoryProfiles(
    [
      {
        created_at: "2026-05-20T16:00:00.000Z",
        seat_count: 61,
        published_by: "user-1"
      }
    ],
    [
      {
        id: "user-1",
        email: "admin@example.com"
      }
    ]
  );

  assert.equal(events[0].published_by_email, "admin@example.com");
  assert.equal(publishHistory.getPublishHistoryActor(events[0]), "admin@example.com");
});

test("publish history falls back to raw publisher id when no profile email exists", () => {
  const [event] = publishHistory.resolvePublishHistoryProfiles(
    [
      {
        created_at: "2026-05-20T16:00:00.000Z",
        seat_count: 61,
        published_by: "missing-profile"
      }
    ],
    []
  );

  assert.equal(event.published_by_email, null);
  assert.equal(publishHistory.getPublishHistoryActor(event), "missing-profile");
});

test("latest publish event uses the newest fetched row", () => {
  const events = publishHistory.resolvePublishHistoryProfiles(
    [
      {
        created_at: "2026-05-21T18:00:00.000Z",
        seat_count: 61,
        published_by: "user-1"
      },
      {
        created_at: "2026-05-20T16:00:00.000Z",
        seat_count: 60,
        published_by: "user-2"
      }
    ],
    [
      {
        id: "user-1",
        email: "admin@example.com"
      }
    ]
  );

  assert.equal(publishHistory.getLatestPublishEvent(events).seat_count, 61);
});

test("formatPublishChangeSummary returns null for null/undefined/non-object input", () => {
  assert.equal(publishHistory.formatPublishChangeSummary(null), null);
  assert.equal(publishHistory.formatPublishChangeSummary(undefined), null);
  assert.equal(publishHistory.formatPublishChangeSummary("not an object"), null);
  assert.equal(publishHistory.formatPublishChangeSummary(42), null);
  assert.equal(publishHistory.formatPublishChangeSummary([1, 2]), null);
});

test("formatPublishChangeSummary returns null for an empty object", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({}), null);
});

test("formatPublishChangeSummary reports all-zero summaries as no changes recorded", () => {
  assert.equal(
    publishHistory.formatPublishChangeSummary({ seats_added: 0, seats_removed: 0 }),
    "No changes recorded"
  );
});

test("formatPublishChangeSummary joins nonzero buckets with singular/plural units in fixed order", () => {
  assert.equal(
    publishHistory.formatPublishChangeSummary({ assignments_changed: 2, employee_edits: 1 }),
    "2 assignments changed · 1 employee edit"
  );
});

test("formatPublishChangeSummary singularizes a single seat added", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({ seats_added: 1 }), "1 seat added");
});

test("formatPublishChangeSummary orders all buckets: added, removed, assignments, moved, status, employee edits", () => {
  assert.equal(
    publishHistory.formatPublishChangeSummary({
      employee_edits: 1,
      status_changes: 1,
      seats_moved: 1,
      assignments_changed: 1,
      seats_removed: 1,
      seats_added: 1
    }),
    "1 seat added · 1 seat removed · 1 assignment changed · 1 seat moved · 1 status change · 1 employee edit"
  );
});

test("formatPublishChangeSummary ignores unknown keys and non-numeric values", () => {
  assert.equal(
    publishHistory.formatPublishChangeSummary({ seats_added: "3", bogus_key: 5, seats_removed: 2 }),
    "2 seats removed"
  );
});

test("formatPublishChangeSummary treats a string-encoded JSON object as invalid (not parsed)", () => {
  assert.equal(publishHistory.formatPublishChangeSummary('{"seats_added":1}'), null);
});
