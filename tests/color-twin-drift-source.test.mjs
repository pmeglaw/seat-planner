import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Every `--x-rgb` channel twin exists ONLY to feed `rgb(var(--x-rgb) / a)`
// call sites — it is a stored derivation of its hex partner `--x`, and the
// hex is the source of truth (twin-resolution ruling 2026-08-21). Fifteen
// twins once drifted: the hexes moved to the greige/shell palette while the
// twins kept the old IBM-gray/green channels, so solid paints and alpha
// washes of "the same token" rendered two different hues. Those twins were
// deleted; this test pins the survivors: in every theme cascade a stored
// twin's channels must equal its partner's, and a twin without a partner is
// itself an error (nothing can verify it). New alpha washes should derive in
// place — color-mix(in srgb, var(--x) N%, transparent) — not mint a twin.

const cssUrl = new URL("../app/globals.css", import.meta.url);

function parseBlocks(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m; (m = re.exec(noComments)); ) {
    // The selector is the text after the previous block's closing brace; any
    // at-rules or stray text before it ends with a newline, so the selector
    // proper is the final non-empty chunk.
    const selector = m[1].trim().split(/;|\n{2,}/).pop().trim();
    const vars = {};
    const vr = /--([a-z0-9-]+)\s*:\s*([^;]+);/g;
    for (let v; (v = vr.exec(m[2])); ) vars[v[1]] = v[2].trim();
    blocks.push({ selector, vars });
  }
  return blocks;
}

function collect(blocks, predicate) {
  const out = {};
  for (const block of blocks) {
    if (predicate(block.selector)) Object.assign(out, block.vars);
  }
  return out;
}

function resolve(value, vars, depth = 0) {
  if (depth > 8 || typeof value !== "string") return value;
  const alias = value.match(/^var\(--([a-z0-9-]+)\)$/);
  return alias ? resolve(vars[alias[1]], vars, depth + 1) : value;
}

function channels(value) {
  if (typeof value !== "string") return null;
  let m;
  if ((m = value.match(/^#([0-9a-f]{3})$/i))) {
    return m[1].split("").map((c) => parseInt(c + c, 16));
  }
  if ((m = value.match(/^#([0-9a-f]{6})$/i))) {
    return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  }
  if ((m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/))) {
    return [+m[1], +m[2], +m[3]];
  }
  if ((m = value.match(/^(\d+)\s+(\d+)\s+(\d+)$/))) {
    return [+m[1], +m[2], +m[3]];
  }
  return null;
}

test("every stored -rgb twin matches its hex partner in every theme cascade", async () => {
  const blocks = parseBlocks(await readFile(cssUrl, "utf8"));

  const isRoot = (s) => s === ":root";
  const isDarkRoot = (s) => s === ':root[data-theme="dark"]';
  const isLightShell = (s) =>
    !s.includes("dark") && /(^|,\s*)\.(shell|admin)-theme$/.test(s);
  const isDarkShell = (s) =>
    s.includes('[data-theme="dark"]') && /\.(shell|admin)-theme/.test(s);

  const light = collect(blocks, isRoot);
  const dark = { ...light, ...collect(blocks, isDarkRoot) };
  const shellLight = { ...light, ...collect(blocks, isLightShell) };
  const shellDark = { ...dark, ...collect(blocks, isLightShell), ...collect(blocks, isDarkShell) };

  // Sanity: the parser found the real blocks, not an empty set.
  assert.ok(Object.keys(light).length > 50, "expected :root variables");
  assert.ok(Object.keys(shellLight).length > Object.keys(light).length, "expected .shell-theme variables");
  assert.ok("sp-status-success-mark" in shellDark, "expected the dark admin block in the cascade");

  const problems = [];
  for (const [context, vars] of Object.entries({ light, dark, shellLight, shellDark })) {
    for (const twin of Object.keys(vars).filter((k) => k.endsWith("-rgb")).sort()) {
      const partner = twin.slice(0, -"-rgb".length);
      if (!(partner in vars)) {
        problems.push(`${context}: ${twin} has no hex partner --${partner} — an unverifiable twin can drift silently`);
        continue;
      }
      const twinChannels = channels(resolve(vars[twin], vars));
      const hexChannels = channels(resolve(vars[partner], vars));
      if (!twinChannels || !hexChannels) {
        problems.push(`${context}: could not parse --${twin} (${resolve(vars[twin], vars)}) or --${partner} (${resolve(vars[partner], vars)})`);
        continue;
      }
      if (twinChannels.join() !== hexChannels.join()) {
        problems.push(`${context}: --${twin} is [${twinChannels}] but --${partner} is [${hexChannels}] — regenerate the twin from the hex`);
      }
    }
  }
  assert.deepEqual(problems, [], `stored -rgb twins drifted from their hex partners:\n${problems.join("\n")}`);
});
