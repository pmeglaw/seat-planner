import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Focus-ring guardrail (PR-A 2026-08-21; rewritten for the token layer in
// redesign-v2 Phase 4 PR 1). The ring must be visible on every surface in
// both themes: it comes from ONE token, `--sp-focus`, which aliases Carbon's
// `$focus` — a token the asset defines for the light theme and again for the
// forced / system dark theme — and the theme-invariant dark panels carry
// their own `--sp-panel-dark-focus` so the ring never drops below 3:1 on
// gray 100. The old brand orange (#FF5715, 2.88:1 on layered light surfaces)
// is gone from the system; nothing may bring it back, and no surface may
// pair white text with a raw brand fill. These checks pin the guardrail, not
// a hue: any future focus colour is fine as long as every theme defines it.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(join(repoRoot, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const spTokens = read("app/styles/sp-tokens.css");
const carbonTokens = read("app/styles/carbon-tokens.css");

test("--sp-focus is one token that aliases Carbon's $focus", () => {
  const declarations = [...spTokens.matchAll(/^\s*--sp-focus\s*:\s*([^;]+);/gm)].map(m => m[1].trim());
  assert.equal(declarations.length, 1, `--sp-focus must be declared exactly once in sp-tokens.css; found ${declarations.length}`);
  assert.equal(declarations[0], "var(--cds-focus)");
  // The inset ring: 2px, offset -2px (SKILL "Focus is 2px, $focus, inset").
  assert.match(spTokens, /^\s*--sp-focus-width\s*:\s*var\(--cds-spacing-01\);/m);
  assert.match(spTokens, /^\s*--sp-focus-offset\s*:\s*calc\(-1 \* var\(--cds-spacing-01\)\);/m);
});

test("Carbon's $focus is defined for the light theme and for dark (system and forced)", () => {
  // Light: the bare :root block. Dark: the prefers-color-scheme guard AND the
  // forced data-carbon-theme="g100" block — the three-state theme model
  // (lib/theme.ts) needs all three, or a system-dark user loses the ring.
  const blocks = [...carbonTokens.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
    selector: m[1].trim().split("\n").pop().trim(),
    body: m[2]
  }));
  const declares = (predicate) => blocks.some(b => predicate(b.selector) && /--cds-focus\s*:/.test(b.body));
  assert.ok(declares(s => s === ":root"), "light :root must declare --cds-focus");
  assert.ok(declares(s => s.startsWith(":root:not([data-carbon-theme=\"white\"])")), "the prefers-color-scheme dark block must declare --cds-focus");
  assert.ok(declares(s => s === ':root[data-carbon-theme="g100"]'), "the forced g100 block must declare --cds-focus");
});

test("the theme-invariant dark panels carry their own focus token", () => {
  // Tier C (PHASE3DS §1.1): the gray-100 shell and right panels do not follow
  // the theme, so the light $focus (blue 60, 3.0:1 on gray 100) cannot serve
  // them; sp-tokens.css gives them --sp-panel-dark-focus.
  assert.match(spTokens, /^\s*--sp-panel-dark-focus\s*:/m);
});

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      // Prototype-only concept surfaces are flag-gated and out of scope.
      if (entry === "concepts" || entry === "node_modules" || entry === "fonts") continue;
      collectSourceFiles(path, out);
    } else if (/\.(tsx|ts|css)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const RAW_BRAND = [/#ff5715/i, /255[,\s]+87[,\s]+21/];

test("the raw brand orange is gone from every shipped surface and stylesheet", () => {
  const offenders = [];
  const files = [
    ...collectSourceFiles(join(repoRoot, "app")),
    ...collectSourceFiles(join(repoRoot, "components")),
    ...collectSourceFiles(join(repoRoot, "lib"))
  ];
  for (const file of files) {
    // Comments may name the old value while explaining its absence; only
    // code and stylesheets count.
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const pattern of RAW_BRAND) {
      if (pattern.test(source)) offenders.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], `#FF5715 / 255 87 21 fails the 3:1 focus floor and must not return:\n${offenders.join("\n")}`);
});

test("no shipped surface pairs white text with a raw brand-orange fill", () => {
  // Kept as a guard: white text is legal on --sp-button-primary (blue 60);
  // a raw brand fill with white text is 3.17:1 and never legal.
  const brandFill = /bg-\[(var\(--sp-brand\)|#ff5715)\]|bg-sp-brand-accent/i;
  const offenders = [];
  const files = [
    ...collectSourceFiles(join(repoRoot, "app")),
    ...collectSourceFiles(join(repoRoot, "components"))
  ].filter(f => f.endsWith(".tsx"));
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (brandFill.test(line) && /\btext-white\b/.test(line)) {
        offenders.push(`${file}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `White text on a raw brand fill fails AA:\n${offenders.join("\n")}`);
});
