import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";

// F-ERR-1 (AUDIT-2): once expected failures are returned rather than thrown,
// anything a client catch receives is an unexpected throw — and in production
// Next.js has already digest-stripped its message. Preferring error.message
// there shows the digest sentence instead of the written recovery copy, so the
// helper always returns the fallback and keeps the original on the console for
// dev diagnosis.
const { clientActionErrorMessage } = await importTsModule("lib/clientActionError.ts");

test("returns the written fallback for a thrown Error (prod digest-strips its message)", () => {
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const message = clientActionErrorMessage(new Error("Server Components render digest: 123"), "Could not create seat.");
    assert.equal(message, "Could not create seat.");
    assert.equal(logged.length, 1, "the original error should be logged for dev diagnosis");
  } finally {
    console.error = originalError;
  }
});

test("returns the fallback for non-Error throws too", () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(clientActionErrorMessage("boom", "Could not publish seat map."), "Could not publish seat map.");
    assert.equal(clientActionErrorMessage(undefined, "Could not save."), "Could not save.");
  } finally {
    console.error = originalError;
  }
});
