import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Both route boundaries must route a stale-chunk failure through
// planChunkErrorRecovery and hard-reload the document. `reset()` alone cannot
// recover from a purged chunk — it re-renders against the same dead URL — so a
// boundary that only offers "Try again" strands the tab until the user knows to
// hard-refresh. This is a recovery guarantee, not a styling choice.

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

for (const boundary of ["../app/error.tsx", "../app/(shell)/admin/error.tsx"]) {
  test(`${boundary} self-heals a stale-chunk error with a document reload`, async () => {
    const source = await readSource(boundary);

    assert.match(source, /planChunkErrorRecovery/, "boundary must consult the shared recovery decision");
    assert.match(source, /from "@\/lib\/chunkLoadRecovery"/, "decision logic stays in the tested lib module");
    assert.match(source, /window\.location\.reload\(\)/, "only a document reload refetches the new HTML");
    assert.match(source, /sessionStorage/, "the loop guard must survive the reload but not the session");
  });

  test(`${boundary} still renders the manual retry path`, async () => {
    const source = await readSource(boundary);

    assert.match(source, /onClick=\{reset\}/, "non-chunk errors are still recoverable via reset()");
    assert.match(source, /"reload"/, "the reload branch is explicit, so every other error falls through to manual");
  });
}
