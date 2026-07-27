import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const recovery = await importTsModule("lib/chunkLoadRecovery.ts");

// A deploy purges the previous build's JS chunks. Any tab still holding the old
// HTML then throws ChunkLoadError on its next lazy import, and the error
// boundary's reset() re-renders against the same dead URL — so "Try again" can
// never recover. Only a document reload can. These pin the decision: reload once
// per stale-chunk incident, never in a loop.

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    snapshot: () => Object.fromEntries(data)
  };
}

test("chunk-load errors are recognised across the shapes bundlers throw", () => {
  const byName = Object.assign(new Error("boom"), { name: "ChunkLoadError" });
  assert.equal(recovery.isChunkLoadError(byName), true);

  assert.equal(
    recovery.isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/1zy1zarbk8e36.js from module 64893")),
    true
  );
  assert.equal(recovery.isChunkLoadError(new Error("Loading chunk 42 failed.")), true);
  assert.equal(
    recovery.isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/a.js")),
    true
  );
});

test("ordinary render failures are not treated as stale chunks", () => {
  assert.equal(recovery.isChunkLoadError(new Error("supabase query failed")), false);
  assert.equal(recovery.isChunkLoadError(undefined), false);
  assert.equal(recovery.isChunkLoadError({ message: 42 }), false);
});

test("a non-chunk error leaves recovery to the user and writes nothing", () => {
  const storage = makeStorage();

  assert.equal(recovery.planChunkErrorRecovery(new Error("supabase query failed"), storage, 1_000), "manual");
  assert.deepEqual(storage.snapshot(), {});
});

test("the first stale-chunk error reloads the document and records the attempt", () => {
  const storage = makeStorage();
  const error = Object.assign(new Error("boom"), { name: "ChunkLoadError" });

  assert.equal(recovery.planChunkErrorRecovery(error, storage, 1_000), "reload");
  assert.equal(storage.getItem(recovery.CHUNK_RELOAD_STORAGE_KEY), "1000");
});

test("a stale-chunk error right after a reload attempt stops instead of looping", () => {
  const storage = makeStorage({ [recovery.CHUNK_RELOAD_STORAGE_KEY]: "1000" });
  const error = Object.assign(new Error("boom"), { name: "ChunkLoadError" });

  assert.equal(recovery.planChunkErrorRecovery(error, storage, 4_000), "manual");
});

test("a later deploy can self-heal again once the guard window has passed", () => {
  const storage = makeStorage({ [recovery.CHUNK_RELOAD_STORAGE_KEY]: "1000" });
  const error = Object.assign(new Error("boom"), { name: "ChunkLoadError" });

  const after = 1_000 + recovery.CHUNK_RELOAD_GUARD_MS + 1;
  assert.equal(recovery.planChunkErrorRecovery(error, storage, after), "reload");
  assert.equal(storage.getItem(recovery.CHUNK_RELOAD_STORAGE_KEY), String(after));
});

test("a corrupt guard value is treated as no prior attempt", () => {
  const storage = makeStorage({ [recovery.CHUNK_RELOAD_STORAGE_KEY]: "not-a-number" });
  const error = Object.assign(new Error("boom"), { name: "ChunkLoadError" });

  assert.equal(recovery.planChunkErrorRecovery(error, storage, 1_000), "reload");
});

test("unusable storage falls back to manual rather than risking a reload loop", () => {
  const throwing = {
    getItem() {
      throw new Error("SecurityError: storage is disabled");
    },
    setItem() {
      throw new Error("SecurityError: storage is disabled");
    }
  };
  const error = Object.assign(new Error("boom"), { name: "ChunkLoadError" });

  assert.equal(recovery.planChunkErrorRecovery(error, throwing, 1_000), "manual");
  assert.equal(recovery.planChunkErrorRecovery(error, null, 1_000), "manual");
});
