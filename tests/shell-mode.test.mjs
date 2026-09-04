// lib/shellMode.ts — the mode indicator + History status strings (PHASE2UX
// §1.5). These pin the specimen copy (docs/redesign-v2/phase3/specimens/
// 01-shell.html) and the D0-a rule that a viewer never sees "Draft".
import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const {
  routeModeFor,
  modeStatusFor,
  modeIndicatorText,
  historyStatusLine,
  relativeMinutes,
  formatPublishDate
} = await importTsModule("lib/shellMode.ts");

// 2026-09-02T21:12:00Z = 2:12 PM in America/Los_Angeles (PDT).
const PUBLISHED_AT = "2026-09-02T21:12:00Z";
const NOW = new Date("2026-09-04T18:00:00Z");

test("routeModeFor: /admin and below edit the draft; everything else reads published", () => {
  assert.equal(routeModeFor("/admin"), "draft");
  assert.equal(routeModeFor("/admin/management"), "draft");
  assert.equal(routeModeFor("/admin/settings"), "draft");
  assert.equal(routeModeFor("/"), "published");
  assert.equal(routeModeFor("/reception"), "published");
  assert.equal(routeModeFor("/administrator"), "published", "prefix match must be path-segment aware");
});

test("formatPublishDate is the app's existing en-US office-timezone shape", () => {
  assert.equal(formatPublishDate(PUBLISHED_AT), "Sep 2, 2026");
  assert.equal(formatPublishDate(PUBLISHED_AT, { withTime: true }), "Sep 2, 2026, 2:12 PM");
  assert.equal(formatPublishDate("not a date"), "", "malformed input renders empty, never throws");
});

test("modeStatusFor: viewer routes and viewers read published; never published is its own state", () => {
  assert.deepEqual(modeStatusFor({ pathname: "/", isAdmin: false, publishedAt: PUBLISHED_AT, draft: null }), {
    kind: "published",
    publishedAt: PUBLISHED_AT
  });
  assert.deepEqual(modeStatusFor({ pathname: "/reception", isAdmin: true, publishedAt: PUBLISHED_AT, draft: null }), {
    kind: "published",
    publishedAt: PUBLISHED_AT
  });
  // D0-a / PHASE2UX §1.4: a viewer on /admin still reads Published.
  assert.deepEqual(
    modeStatusFor({ pathname: "/admin", isAdmin: false, publishedAt: PUBLISHED_AT, draft: { changeCount: 4, lastEditAt: null } }),
    { kind: "published", publishedAt: PUBLISHED_AT }
  );
  assert.deepEqual(modeStatusFor({ pathname: "/", isAdmin: false, publishedAt: null, draft: null }), { kind: "unpublished" });
});

test("modeStatusFor: admin draft routes → loading / error / unpublished / draft", () => {
  assert.deepEqual(modeStatusFor({ pathname: "/admin", isAdmin: true, publishedAt: PUBLISHED_AT, draft: null }), { kind: "loading" });
  assert.deepEqual(modeStatusFor({ pathname: "/admin/management", isAdmin: true, publishedAt: PUBLISHED_AT, draft: "error" }), {
    kind: "error"
  });
  assert.deepEqual(modeStatusFor({ pathname: "/admin", isAdmin: true, publishedAt: null, draft: { changeCount: 4, lastEditAt: null } }), {
    kind: "unpublished"
  });
  assert.deepEqual(
    modeStatusFor({ pathname: "/admin", isAdmin: true, publishedAt: PUBLISHED_AT, draft: { changeCount: 4, lastEditAt: "2026-09-04T17:58:00Z" } }),
    { kind: "draft", publishedAt: PUBLISHED_AT, changeCount: 4, lastEditAt: "2026-09-04T17:58:00Z" }
  );
});

test("modeIndicatorText: full forms match the specimen", () => {
  const full = { compact: false };
  assert.equal(modeIndicatorText({ kind: "published", publishedAt: PUBLISHED_AT }, full), "Published · Sep 2, 2026");
  assert.equal(modeIndicatorText({ kind: "draft", publishedAt: PUBLISHED_AT, changeCount: 4, lastEditAt: null }, full), "Draft — 4 changes");
  assert.equal(modeIndicatorText({ kind: "draft", publishedAt: PUBLISHED_AT, changeCount: 1, lastEditAt: null }, full), "Draft — 1 change");
  assert.equal(modeIndicatorText({ kind: "draft", publishedAt: PUBLISHED_AT, changeCount: 0, lastEditAt: null }, full), "Draft — no changes");
  assert.equal(modeIndicatorText({ kind: "unpublished" }, full), "Not yet published");
  assert.equal(modeIndicatorText({ kind: "error" }, full), "Publish state unavailable");
  assert.equal(modeIndicatorText({ kind: "loading" }, full), "", "loading renders a skeleton, no text");
  // PHASE2UX §1.5 overflow row: 120 changes still fits the indicator's ≤ 22 characters.
  const overflow = modeIndicatorText({ kind: "draft", publishedAt: PUBLISHED_AT, changeCount: 120, lastEditAt: null }, full);
  assert.equal(overflow, "Draft — 120 changes");
  assert.ok(overflow.length <= 22, `${overflow.length} chars`);
});

test("modeIndicatorText: compact forms keep the mark + count (D0-e)", () => {
  const compact = { compact: true };
  assert.equal(modeIndicatorText({ kind: "published", publishedAt: PUBLISHED_AT }, compact), "Published");
  assert.equal(modeIndicatorText({ kind: "draft", publishedAt: PUBLISHED_AT, changeCount: 4, lastEditAt: null }, compact), "Draft · 4");
  assert.equal(modeIndicatorText({ kind: "draft", publishedAt: PUBLISHED_AT, changeCount: 0, lastEditAt: null }, compact), "Draft · 0");
  assert.equal(modeIndicatorText({ kind: "unpublished" }, compact), "Not yet published");
  assert.equal(modeIndicatorText({ kind: "error" }, compact), "Unavailable");
});

test("historyStatusLine: the four panel status lines", () => {
  assert.equal(
    historyStatusLine({ kind: "draft", publishedAt: PUBLISHED_AT, changeCount: 4, lastEditAt: "2026-09-04T17:58:00Z" }, NOW),
    "4 unpublished changes · last edit 2 min ago"
  );
  assert.equal(
    historyStatusLine({ kind: "draft", publishedAt: PUBLISHED_AT, changeCount: 1, lastEditAt: null }, NOW),
    "1 unpublished change",
    "no last-edit time → no trailing clause"
  );
  assert.equal(historyStatusLine({ kind: "draft", publishedAt: PUBLISHED_AT, changeCount: 0, lastEditAt: null }, NOW), "Draft matches the published map");
  assert.equal(historyStatusLine({ kind: "published", publishedAt: PUBLISHED_AT }, NOW), "Showing what everyone sees");
  assert.equal(historyStatusLine({ kind: "unpublished" }, NOW), "Nothing published yet");
  assert.equal(historyStatusLine({ kind: "error" }, NOW), "Publish state unavailable");
  assert.equal(historyStatusLine({ kind: "loading" }, NOW), "");
});

test("relativeMinutes: just now / minutes / hours / date, never negative", () => {
  assert.equal(relativeMinutes("2026-09-04T17:59:30Z", NOW), "just now");
  assert.equal(relativeMinutes("2026-09-04T17:58:00Z", NOW), "2 min ago");
  assert.equal(relativeMinutes("2026-09-04T15:00:00Z", NOW), "3 h ago");
  assert.equal(relativeMinutes("2026-09-02T18:00:00Z", NOW), "Sep 2, 2026");
  assert.equal(relativeMinutes("2026-09-04T18:05:00Z", NOW), "just now", "clock skew: a future edit reads as just now");
  assert.equal(relativeMinutes("garbage", NOW), "just now");
});
