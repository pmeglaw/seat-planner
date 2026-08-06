import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { isBuildSkewed, createSkewDetector, BUILD_ID_ENDPOINT } = await importTsModule("lib/deploySkew.ts");

// Deploy-skew detection (2026-08-05 incident): a merge to main flips the prod
// alias mid-session, the open tab's rail clicks then fetch RSC from the NEW
// build and the router falls back with a dead-feeling click + late full
// reload. The detector compares the build id baked into the client bundle
// against /api/build-id (served by whatever deployment is live) so AppRail
// can turn the NEXT click into a deliberate full document navigation instead.

test("isBuildSkewed: equal ids are not skewed", () => {
  assert.equal(isBuildSkewed("abc123", "abc123"), false);
  assert.equal(isBuildSkewed("dev", "dev"), false);
});

test("isBuildSkewed: different non-empty ids are skewed", () => {
  assert.equal(isBuildSkewed("abc123", "def456"), true);
});

test("isBuildSkewed: a missing side is NEVER skew — absent evidence must not trigger a reload", () => {
  // The invariant the old three-state union guarded ("unknown" ≠ "skewed")
  // survives as: missing evidence is falsy, full stop.
  assert.equal(isBuildSkewed("", "abc123"), false);
  assert.equal(isBuildSkewed("abc123", ""), false);
  assert.equal(isBuildSkewed(undefined, "abc123"), false);
  assert.equal(isBuildSkewed("abc123", null), false);
});

function detectorWith({ clientBuildId = "sha-old", responses, now }) {
  const calls = { count: 0 };
  const fetchServerBuildId = async () => {
    calls.count += 1;
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const detector = createSkewDetector({ clientBuildId, fetchServerBuildId, now });
  return { detector, calls };
}

test("detector: matching server id leaves the rail soft", async () => {
  const { detector } = detectorWith({ responses: ["sha-old"] });
  await detector.check();
  assert.equal(detector.isSkewed(), false);
});

test("detector: mismatched server id flags skew", async () => {
  const { detector } = detectorWith({ responses: ["sha-new"] });
  await detector.check();
  assert.equal(detector.isSkewed(), true);
});

test("detector: skew is sticky - a later matching probe cannot clear it", async () => {
  // A deployment flip is one-way for this tab: once the live build differs
  // from the bundle we are running, only a full document load un-skews us.
  let t = 0;
  const { detector } = detectorWith({ responses: ["sha-new", "sha-old"], now: () => t });
  await detector.check();
  t += 120_000;
  await detector.check();
  assert.equal(detector.isSkewed(), true);
});

test("detector: probe failures never flag skew and never throw", async () => {
  const { detector } = detectorWith({ responses: [new Error("offline")] });
  await detector.check();
  assert.equal(detector.isSkewed(), false);
});

test("detector: checks are throttled to one fetch per interval", async () => {
  let t = 0;
  const { detector, calls } = detectorWith({
    responses: ["sha-old", "sha-old"],
    now: () => t
  });
  await detector.check();
  await detector.check();
  assert.equal(calls.count, 1, "second check inside the interval must not refetch");
  t += 61_000;
  await detector.check();
  assert.equal(calls.count, 2, "a check after the interval probes again");
});

test("detector: once skewed, further checks stop fetching entirely", async () => {
  let t = 0;
  const { detector, calls } = detectorWith({ responses: ["sha-new", "sha-old"], now: () => t });
  await detector.check();
  t += 120_000;
  await detector.check();
  assert.equal(calls.count, 1, "a sticky-skewed detector has nothing left to learn");
});

test("detector: concurrent checks share one in-flight probe", async () => {
  const { detector, calls } = detectorWith({ responses: ["sha-new"] });
  await Promise.all([detector.check(), detector.check()]);
  assert.equal(calls.count, 1);
  assert.equal(detector.isSkewed(), true);
});

test("the probe endpoint constant is the API route the client fetches", () => {
  assert.equal(BUILD_ID_ENDPOINT, "/api/build-id");
});
