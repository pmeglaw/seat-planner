import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not new URL(...).pathname — the latter passes every Windows
// local run and breaks on Linux CI (see docs: windows-local-linux-ci paths).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const conceptsDir = join(repoRoot, "app", "concepts");

const conceptPages = readdirSync(conceptsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(conceptsDir, entry.name, "page.tsx"))
  .filter((pagePath) => existsSync(pagePath));

test("app/concepts has prototype pages to pin", () => {
  // Three shipped prototypes exist today; if this ever drops, the discovery
  // glob broke and every assertion below is vacuously green.
  assert.ok(conceptPages.length >= 3, `found only ${conceptPages.length} concept pages`);
});

for (const pagePath of conceptPages) {
  test(`prototype gate intact: ${pagePath.split(/[\\/]/).slice(-2).join("/")}`, () => {
    const source = readFileSync(pagePath, "utf8");
    assert.match(
      source,
      /process\.env\.NODE_ENV !== "production" \|\| process\.env\.SEAT_PLANNER_ENABLE_PROTOTYPES === "true"/,
      "prototypesEnabled() condition missing or altered"
    );
    assert.match(source, /notFound\(\)/, "404 path missing");
    assert.match(source, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/, "noindex metadata missing");
    assert.doesNotMatch(source, /lib\/supabase/, "concepts page must not touch Supabase");
  });
}
