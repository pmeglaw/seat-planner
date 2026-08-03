import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { animateValue } = await importTsModule("lib/animateValue.ts");

// Deterministic clock: `now` advances only when we fire the queued rAF callback.
function makeClock() {
  let time = 0;
  const queue = [];
  return {
    now: () => time,
    raf: cb => { queue.push(cb); return queue.length; },
    tick(ms) {
      time += ms;
      const cb = queue.shift();
      if (cb) cb(time);
    },
    pending: () => queue.length
  };
}

test("animateValue eases from → to and calls onDone", () => {
  const clock = makeClock();
  const seen = [];
  let done = 0;
  animateValue({ from: 0, to: 100, durationMs: 100, onUpdate: v => seen.push(v), onDone: () => { done += 1; }, raf: clock.raf, now: clock.now });
  clock.tick(50);  // t=0.5 → ease-out cubic 1-(1-0.5)^3 = 0.875
  clock.tick(50);  // t=1 → 100, done
  clock.tick(50);  // nothing queued afterwards
  assert.equal(seen.length, 2);
  assert.ok(Math.abs(seen[0] - 87.5) < 0.001);
  assert.equal(seen[1], 100);
  assert.equal(done, 1);
  assert.equal(clock.pending(), 0);
});

test("animateValue with reducedMotion jumps straight to the target", () => {
  const clock = makeClock();
  const seen = [];
  let done = 0;
  animateValue({ from: 0, to: 100, durationMs: 100, reducedMotion: true, onUpdate: v => seen.push(v), onDone: () => { done += 1; }, raf: clock.raf, now: clock.now });
  assert.deepEqual(seen, [100]);
  assert.equal(done, 1);
  assert.equal(clock.pending(), 0);
});

test("cancel stops the tween mid-flight without onDone", () => {
  const clock = makeClock();
  const seen = [];
  let done = 0;
  const cancel = animateValue({ from: 0, to: 100, durationMs: 100, onUpdate: v => seen.push(v), onDone: () => { done += 1; }, raf: clock.raf, now: clock.now });
  clock.tick(25);
  cancel();
  clock.tick(25);
  clock.tick(25);
  assert.equal(seen.length, 1);
  assert.equal(done, 0);
});

test("zero-length distance still completes exactly once", () => {
  const clock = makeClock();
  const seen = [];
  let done = 0;
  animateValue({ from: 42, to: 42, durationMs: 100, onUpdate: v => seen.push(v), onDone: () => { done += 1; }, raf: clock.raf, now: clock.now });
  clock.tick(100);
  assert.deepEqual(seen, [42]);
  assert.equal(done, 1);
});
