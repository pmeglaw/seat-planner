import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
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

test("formatPublishChangeSummary handles realistic SQL wire shape with all six keys and mixed zeros", () => {
  assert.equal(
    publishHistory.formatPublishChangeSummary({
      seats_added: 0,
      seats_removed: 0,
      assignments_changed: 0,
      seats_moved: 2,
      status_changes: 0,
      employee_edits: 0
    }),
    "2 seats moved"
  );
});

test("formatPublishChangeSummary pluralizes two seats added", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({ seats_added: 2 }), "2 seats added");
});

test("formatPublishChangeSummary pluralizes three seats moved", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({ seats_moved: 3 }), "3 seats moved");
});

test("formatPublishChangeSummary pluralizes two status changes", () => {
  assert.equal(
    publishHistory.formatPublishChangeSummary({ status_changes: 2 }),
    "2 status changes"
  );
});

test("formatPublishChangeSummary pluralizes four employee edits", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({ employee_edits: 4 }), "4 employee edits");
});

test("formatPublishChangeSummary singularizes a single seat detail change", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({ seat_detail_changes: 1 }), "1 seat detail change");
});

test("formatPublishChangeSummary pluralizes two seat detail changes", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({ seat_detail_changes: 2 }), "2 seat detail changes");
});

test("formatPublishChangeSummary singularizes a single person added", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({ employees_added: 1 }), "1 person added");
});

test("formatPublishChangeSummary pluralizes two people added", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({ employees_added: 2 }), "2 people added");
});

test("formatPublishChangeSummary singularizes a single person removed", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({ employees_removed: 1 }), "1 person removed");
});

test("formatPublishChangeSummary pluralizes two people removed", () => {
  assert.equal(publishHistory.formatPublishChangeSummary({ employees_removed: 2 }), "2 people removed");
});

test("formatPublishChangeSummary orders all nine buckets, including the added/removed-people and seat-detail parity additions", () => {
  assert.equal(
    publishHistory.formatPublishChangeSummary({
      employees_removed: 1,
      employees_added: 1,
      employee_edits: 1,
      seat_detail_changes: 1,
      status_changes: 1,
      seats_moved: 1,
      assignments_changed: 1,
      seats_removed: 1,
      seats_added: 1
    }),
    "1 seat added · 1 seat removed · 1 assignment changed · 1 seat moved · 1 status change · 1 seat detail change · 1 employee edit · 1 person added · 1 person removed"
  );
});

// ---------------------------------------------------------------------------
// The publish log (Phase 5 PR 1): the Changes derivation, the whole-log sort
// and the page slice behind Management's Publish history tab.
// ---------------------------------------------------------------------------

const logEvent = (createdAt, summary, email = "admin@example.com") => ({
  created_at: createdAt,
  seat_count: 61,
  published_by: email ? "user-1" : null,
  published_by_email: email,
  change_summary: summary
});

test("publishChangeTotal sums all nine buckets", () => {
  assert.equal(
    publishHistory.publishChangeTotal({
      seats_added: 1,
      seats_removed: 2,
      assignments_changed: 3,
      seats_moved: 4,
      status_changes: 5,
      seat_detail_changes: 6,
      employee_edits: 7,
      employees_added: 8,
      employees_removed: 9
    }),
    45
  );
});

test("publishChangeTotal returns 0 for a well-formed all-zero summary, not null", () => {
  assert.equal(publishHistory.publishChangeTotal({ seats_added: 0, seats_removed: 0 }), 0);
});

// The cell reads "—" in exactly the cases the sentence is null: the two must
// never disagree about what "unreadable" means.
test("publishChangeTotal is null wherever formatPublishChangeSummary is null", () => {
  const unreadable = [null, undefined, 42, "not an object", [1, 2], {}, { bogus_key: 5 }, '{"seats_added":1}'];
  for (const bad of unreadable) {
    assert.equal(publishHistory.publishChangeTotal(bad), null, `total for ${JSON.stringify(bad)}`);
    assert.equal(publishHistory.formatPublishChangeSummary(bad), null, `sentence for ${JSON.stringify(bad)}`);
  }
});

test("publishChangeTotal ignores unrecognized, negative, non-finite and string counts", () => {
  assert.equal(publishHistory.publishChangeTotal({ seats_added: "3", bogus_key: 5, seats_removed: 2 }), 2);
  assert.equal(publishHistory.publishChangeTotal({ seats_added: -4, seats_removed: 2 }), 2);
  assert.equal(publishHistory.publishChangeTotal({ seats_added: Number.NaN, seats_removed: 2 }), 2);
  assert.equal(publishHistory.publishChangeTotal({ seats_added: Number.POSITIVE_INFINITY, seats_removed: 2 }), 2);
});

test("publishLogActorLabel names the role, never a raw publisher id", () => {
  assert.equal(
    publishHistory.publishLogActorLabel(logEvent("2026-09-01T10:00:00.000Z", {}, "sarah@example.com")),
    "sarah@example.com"
  );
  assert.equal(publishHistory.publishLogActorLabel(logEvent("2026-09-01T10:00:00.000Z", {}, null)), "an admin");
});

test("sortPublishEvents orders by date in both directions and does not mutate its input", () => {
  const events = [
    logEvent("2026-09-01T10:00:00.000Z", { seats_added: 1 }),
    logEvent("2026-09-03T10:00:00.000Z", { seats_added: 2 }),
    logEvent("2026-09-02T10:00:00.000Z", { seats_added: 3 })
  ];
  const original = [...events];

  assert.deepEqual(
    publishHistory.sortPublishEvents(events, "when", "desc").map(event => event.created_at),
    ["2026-09-03T10:00:00.000Z", "2026-09-02T10:00:00.000Z", "2026-09-01T10:00:00.000Z"]
  );
  assert.deepEqual(
    publishHistory.sortPublishEvents(events, "when", "asc").map(event => event.created_at),
    ["2026-09-01T10:00:00.000Z", "2026-09-02T10:00:00.000Z", "2026-09-03T10:00:00.000Z"]
  );
  assert.deepEqual(events, original, "the caller's array is untouched");
});

test("sortPublishEvents ranks the Changes column across the whole log", () => {
  const events = [
    logEvent("2026-09-01T10:00:00.000Z", { seats_added: 1 }),
    logEvent("2026-09-02T10:00:00.000Z", { assignments_changed: 12, employee_edits: 5 }),
    logEvent("2026-09-03T10:00:00.000Z", { status_changes: 3 })
  ];

  assert.deepEqual(
    publishHistory
      .sortPublishEvents(events, "changes", "desc")
      .map(event => publishHistory.publishChangeTotal(event.change_summary)),
    [17, 3, 1]
  );
  assert.deepEqual(
    publishHistory
      .sortPublishEvents(events, "changes", "asc")
      .map(event => publishHistory.publishChangeTotal(event.change_summary)),
    [1, 3, 17]
  );
});

// An unreadable summary is unknown, not small — leading an ascending sort with
// it would answer "the quietest publishes" with "the ones we cannot read".
test("sortPublishEvents keeps unreadable summaries last in BOTH directions", () => {
  const events = [
    logEvent("2026-09-01T10:00:00.000Z", null),
    logEvent("2026-09-02T10:00:00.000Z", { seats_added: 4 }),
    logEvent("2026-09-03T10:00:00.000Z", { seats_added: 0 })
  ];

  for (const direction of ["asc", "desc"]) {
    const sorted = publishHistory.sortPublishEvents(events, "changes", direction);
    assert.equal(publishHistory.publishChangeTotal(sorted[2].change_summary), null, `${direction}: the dash is last`);
  }
});

test("sortPublishEvents breaks every tie with newest-first", () => {
  const events = [
    logEvent("2026-09-01T10:00:00.000Z", { seats_added: 2 }),
    logEvent("2026-09-05T10:00:00.000Z", { seats_added: 2 }),
    logEvent("2026-09-03T10:00:00.000Z", { seats_added: 2 })
  ];

  assert.deepEqual(
    publishHistory.sortPublishEvents(events, "changes", "asc").map(event => event.created_at),
    ["2026-09-05T10:00:00.000Z", "2026-09-03T10:00:00.000Z", "2026-09-01T10:00:00.000Z"]
  );
});

test("sortPublishEvents orders people by the displayed label, case-insensitively", () => {
  const events = [
    logEvent("2026-09-01T10:00:00.000Z", {}, "Zoe@example.com"),
    logEvent("2026-09-02T10:00:00.000Z", {}, null),
    logEvent("2026-09-03T10:00:00.000Z", {}, "beth@example.com")
  ];

  assert.deepEqual(
    publishHistory.sortPublishEvents(events, "who", "asc").map(publishHistory.publishLogActorLabel),
    ["an admin", "beth@example.com", "Zoe@example.com"]
  );
});

// A malformed timestamp must not take the tab down (formatPublishDate has the
// same contract), so it sorts as the epoch rather than throwing.
test("sortPublishEvents tolerates an unparseable timestamp", () => {
  const events = [
    logEvent("not-a-date", { seats_added: 1 }),
    logEvent("2026-09-02T10:00:00.000Z", { seats_added: 2 })
  ];
  assert.equal(publishHistory.sortPublishEvents(events, "when", "desc")[0].created_at, "2026-09-02T10:00:00.000Z");
});

test("publishLogPageSlice cuts the requested page and labels its range", () => {
  const rows = Array.from({ length: 42 }, (_, index) => index);

  const first = publishHistory.publishLogPageSlice(rows, 1, 25);
  assert.deepEqual(first.rows, rows.slice(0, 25));
  assert.equal(first.rangeLabel, "1–25 of 42");
  assert.equal(first.pageCount, 2);

  const last = publishHistory.publishLogPageSlice(rows, 2, 25);
  assert.deepEqual(last.rows, rows.slice(25));
  assert.equal(last.rangeLabel, "26–42 of 42");
});

// A page-size change that strands the reader past the end lands them on the
// last page, never on an empty table with rows still in the log.
test("publishLogPageSlice clamps a page past the end and below the start", () => {
  const rows = Array.from({ length: 12 }, (_, index) => index);
  assert.equal(publishHistory.publishLogPageSlice(rows, 99, 10).page, 2);
  assert.equal(publishHistory.publishLogPageSlice(rows, 0, 10).page, 1);
  assert.equal(publishHistory.publishLogPageSlice(rows, -3, 10).page, 1);
});

test("publishLogPageSlice survives an empty log and a nonsense page size", () => {
  const empty = publishHistory.publishLogPageSlice([], 1, 25);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.pageCount, 1);
  assert.equal(empty.rangeLabel, "0 of 0");
  assert.equal(publishHistory.publishLogPageSlice([1, 2, 3], 1, 0).rows.length, 1);
});

test("publishLogCountLine always publishes the count, zero included", () => {
  assert.equal(publishHistory.publishLogCountLine(0, "Sep 8, 2026, 2:12 PM"), "No publishes yet");
  assert.equal(
    publishHistory.publishLogCountLine(1, "Sep 8, 2026, 2:12 PM"),
    "1 publish · most recent Sep 8, 2026, 2:12 PM"
  );
  assert.equal(
    publishHistory.publishLogCountLine(42, "Sep 8, 2026, 2:12 PM"),
    "42 publishes · most recent Sep 8, 2026, 2:12 PM"
  );
  assert.equal(publishHistory.publishLogCountLine(42, null), "42 publishes");
});
