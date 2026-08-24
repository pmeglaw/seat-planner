import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// Tailwind v3 silently drops arbitrary `shadow-[var(--…)]` candidates: the
// `shadow-` prefix registers both a box-shadow and a shadow-color matcher, a
// bare var() can't be disambiguated, and the utility never reaches the built
// CSS (live-verified on prod 2026-07-14 — every elevation popover computed
// box-shadow: none while the tokens existed). Shadows bound to CSS vars must
// go through named theme utilities (shadow-elevation-N / shadow-panel /
// shadow-sp-*), which pass vars through verbatim.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const FORBIDDEN = /shadow-\[var\(/g;

// No exceptions: the seat-marker shadows (the last allowlisted no-ops) were
// restored by owner decision on 2026-07-15 via named utilities like
// everything else.
const ALLOWLIST = {};

async function collectSourceFiles(dir) {
  const entries = await readdir(path.join(repoRoot, dir), { recursive: true, withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map(entry => path.join(entry.parentPath ?? entry.path, entry.name));
}

test("tailwind config maps the elevation tokens to named shadow utilities", async () => {
  const config = await readFile(path.join(repoRoot, "tailwind.config.ts"), "utf8");

  for (const tier of [2, 3, 4]) {
    assert.match(
      config,
      new RegExp(`"elevation-${tier}":\\s*"var\\(--sp-elevation-${tier}\\)"`),
      `boxShadow theme must expose shadow-elevation-${tier} bound to its token`
    );
  }
  assert.match(config, /panel:\s*"var\(--sp-elevation-panel\)"/, "boxShadow theme must expose shadow-panel bound to its token");
  assert.match(config, /"marker-selected":\s*"var\(--sp-legend-selected-shadow\)"/, "boxShadow theme must expose the selected-marker shadow");
  assert.match(config, /"marker-hover":\s*"var\(--sp-legend-hover-shadow\)"/, "boxShadow theme must expose the hover-marker shadow");
});

test("no component uses the silently-dropped arbitrary shadow-[var(…)] form", async () => {
  const [appFiles, componentFiles] = await Promise.all([collectSourceFiles("app"), collectSourceFiles("components")]);
  const files = [...appFiles, ...componentFiles];
  assert.ok(files.length > 20, "source walk should find the app and component files");

  const sources = await Promise.all(files.map(file => readFile(file, "utf8")));
  const offenders = [];
  files.forEach((file, index) => {
    const relative = path.relative(repoRoot, file);
    const matches = sources[index].match(FORBIDDEN) ?? [];
    if (!matches.length) return;
    const allowed = ALLOWLIST[relative] ?? [];
    const occurrences = allowed.flatMap(token => sources[index].match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []);
    if (matches.length !== occurrences.length) offenders.push(`${relative} (${matches.length} found, ${occurrences.length} allowlisted)`);
  });
  assert.deepEqual(offenders, [], `use a named boxShadow theme utility instead of shadow-[var(…)] in: ${offenders.join(", ")}`);
});
