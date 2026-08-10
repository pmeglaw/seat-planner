import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

// `npm test` globs tests/*.test.mjs, so CI runs every file no matter what --
// these curated per-tier scripts are what a DEVELOPER runs to exercise one
// tier on its own, and they drift silently when a new file joins a tier. That
// already happened: test:ct sat at 7 of 9 jsdom files for weeks, missing
// app-shell.test.mjs (the #333 persistent-nav pin) and map-status-legend.test.mjs,
// so "test:ct is green" meant less than it looked (recorded as T-06). The tier
// membership is decided by which harness a file imports, so derive it from that
// rather than trusting the hand-written list.

const ROOT = new URL("../", import.meta.url);

async function filesListedIn(scriptName) {
  const pkg = JSON.parse(await readFile(new URL("package.json", ROOT), "utf8"));
  const script = pkg.scripts?.[scriptName];
  assert.ok(script, `package.json is missing the ${scriptName} script`);
  return [...script.matchAll(/tests\/([\w.-]+\.test\.mjs)/g)].map(match => match[1]).sort();
}

// Matches the import statement, not a bare mention of the path -- this file
// names both harnesses in its own assertion messages and must not count itself.
async function filesImporting(harness) {
  const importPattern = new RegExp(String.raw`from\s+["']\./helpers/${harness}["']`);
  const names = (await readdir(new URL("tests/", ROOT))).filter(name => name.endsWith(".test.mjs"));
  const importers = [];
  for (const name of names) {
    const source = await readFile(new URL(`tests/${name}`, ROOT), "utf8");
    if (importPattern.test(source)) importers.push(name);
  }
  return importers.sort();
}

test("test:ct runs every jsdom component test", async () => {
  const listed = await filesListedIn("test:ct");
  const actual = await filesImporting("renderComponent.mjs");

  assert.ok(actual.length > 0, "no test file imports the jsdom render harness — the marker moved");
  assert.deepEqual(
    listed,
    actual,
    "package.json's test:ct list has drifted from the files importing renderComponent.mjs; add the missing ones"
  );
});

test("test:db runs every SQL-execution test", async () => {
  const listed = await filesListedIn("test:db");
  const actual = await filesImporting("pgHarness.mjs");

  assert.ok(actual.length > 0, "no test file imports the PGlite harness — the marker moved");
  assert.deepEqual(
    listed,
    actual,
    "package.json's test:db list has drifted from the files importing pgHarness.mjs; add the missing ones"
  );
});
