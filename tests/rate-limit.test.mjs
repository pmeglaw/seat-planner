import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { applyFixedWindow } = await importTsModule("lib/rateLimit.ts");

const CONFIG = { limit: 3, windowMs: 60_000 };

test("requests inside the window are allowed up to the limit", () => {
  const store = new Map();
  const t0 = 1_000_000;

  assert.deepEqual(applyFixedWindow(store, "admin-a", t0, CONFIG), { allowed: true });
  assert.deepEqual(applyFixedWindow(store, "admin-a", t0 + 1_000, CONFIG), { allowed: true });
  assert.deepEqual(applyFixedWindow(store, "admin-a", t0 + 2_000, CONFIG), { allowed: true });
});

test("the request past the limit is denied with the time until the window resets", () => {
  const store = new Map();
  const t0 = 1_000_000;
  for (let i = 0; i < CONFIG.limit; i += 1) {
    applyFixedWindow(store, "admin-a", t0 + i, CONFIG);
  }

  const denied = applyFixedWindow(store, "admin-a", t0 + 10_000, CONFIG);
  assert.equal(denied.allowed, false);
  // Fixed window: reset happens windowMs after the FIRST request, not the last.
  assert.equal(denied.retryAfterMs, t0 + CONFIG.windowMs - (t0 + 10_000));
});

test("a new window opens once windowMs has elapsed since the window started", () => {
  const store = new Map();
  const t0 = 1_000_000;
  for (let i = 0; i < CONFIG.limit; i += 1) {
    applyFixedWindow(store, "admin-a", t0, CONFIG);
  }
  assert.equal(applyFixedWindow(store, "admin-a", t0 + CONFIG.windowMs - 1, CONFIG).allowed, false);
  assert.deepEqual(applyFixedWindow(store, "admin-a", t0 + CONFIG.windowMs, CONFIG), { allowed: true });
});

test("keys are throttled independently", () => {
  const store = new Map();
  const t0 = 1_000_000;
  for (let i = 0; i < CONFIG.limit; i += 1) {
    applyFixedWindow(store, "admin-a", t0, CONFIG);
  }

  assert.equal(applyFixedWindow(store, "admin-a", t0 + 1, CONFIG).allowed, false);
  assert.deepEqual(applyFixedWindow(store, "admin-b", t0 + 1, CONFIG), { allowed: true });
});

test("stale keys are swept once the store outgrows the prune threshold", () => {
  const store = new Map();
  const t0 = 1_000_000;
  for (let i = 0; i < 1001; i += 1) {
    store.set(`stale-${i}`, { windowStart: t0 - CONFIG.windowMs * 2, count: CONFIG.limit });
  }

  const decision = applyFixedWindow(store, "fresh", t0, CONFIG);
  assert.equal(decision.allowed, true);
  assert.equal(store.size, 1, "expired windows are dropped, only the fresh key remains");
});
