import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// Resolved-value brand guard (docs/audits/2026-09-10/REVIEW.md, BR-1).
//
// tests/phase4-token-layer-source.test.mjs reads the brand file's own TEXT —
// terracotta in every theme block, no blue literal. That cannot see the bug the
// audit found: `--sp-status-search-mark: var(--cds-support-info)` in
// sp-tokens.css aliases a Carbon role the brand file never re-pointed, so the
// roster's search-hit row (sp-components.css `.sp-roster-row[data-highlight]`)
// painted IBM blue 70 / 50 in both themes while every text check stayed green.
//
// This test resolves every `--sp-*` token sp-tokens.css declares through its
// var() chain — the Carbon palette and theme roles (carbon-tokens.css), the
// status marks carbon-components.css adds, and the brand layer's overrides on
// top — in each of the app's three theme states, and fails if any lands on an
// IBM blue. A `--cds-*` role the brand layer forgets cannot paint blue again
// without this file naming the token, the state and the resolved colour.
//
// The cascade is modelled statically, in stylesheet load order (read from
// app/layout.tsx). The `:root` tier applies in every state; the theme block —
// the `prefers-color-scheme: dark` guard's `:root:not([data-carbon-theme=
// "white"])…` for system-dark, `:root[data-carbon-theme="g100"]` for forced
// dark — applies after it, as its higher specificity does in the browser.
// Light has no selector of its own: it is the bare `:root` tier (the forced
// "white" attribute only shares the brand file's light block).

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = rel => readFileSync(path.join(repoRoot, rel), "utf8");

const SP_TOKENS = "app/styles/sp-tokens.css";
const BRAND_FILE = "app/styles/brand/megeredchian-law-tokens.css";

// Carbon's blue scale (the palette in carbon-tokens.css, plus its two hover
// blues) — what CLAUDE.md "Brand System" rule 1 bans from every role.
const IBM_BLUES = new Set([
  "#0f62fe", "#0353e9", "#0043ce", "#4589ff", "#78a9ff", "#a6c8ff", "#d0e2ff", "#edf5ff",
  "#001d6c", "#002d9c", "#001141", "#0050e6", "#0053ff",
]);

// ALLOWLIST — tokens that resolve to a blue in some state and are painted by
// NOTHING (the audit's DS-5 class: "declared, consumed by no rule"). It is
// SHRINK-ONLY: the last test fails a row that stops resolving to a blue (stale
// — delete it) or that gains a consumer (a `var(--name)` in app/ components/
// lib/, or a Tailwind class built on its tailwind.config.ts alias). Never add
// a row: re-point the token in the brand layer instead, as BR-1 did for the
// --sp-status-search-* pair. `--sp-status-info-text` is deliberately NOT here:
// it aliases --cds-text-primary and never resolves to a blue, so the shrink
// check would reject the row as dead.
const ALLOWLIST = {
  "--sp-status-info-mark": "Carbon info status, blue 70 light / blue 50 dark; tailwind.config.ts aliases it as `info`, no class uses it (DS-5)",
  "--sp-status-info-surface": "Carbon info status surface, blue 10 in light (DS-5)",
  "--sp-highlight": "Carbon's highlight role — blue 90 in both dark states (light is the O2 tint); the hit surfaces read --sp-pill-search-* / --sp-status-search-*, nothing reads this alias",
};

// --- a minimal CSS model: innermost blocks, each with its enclosing at-rule ---
function parseBlocks(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  const stack = [];
  let cursor = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "{") {
      stack.push(src.slice(cursor, i).split(/[;}]/).pop().trim());
      cursor = i + 1;
    } else if (src[i] === "}") {
      const selector = stack.pop();
      const atRule = stack.filter(prelude => prelude.startsWith("@")).pop() ?? null;
      const decls = {};
      for (const m of src.slice(cursor, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) decls[m[1]] = m[2].trim();
      if (Object.keys(decls).length) blocks.push({ selector, atRule, decls });
      cursor = i + 1;
    }
  }
  return blocks;
}

// The three theme states (lib/theme.ts; carbon-tokens.css header). Each is an
// ordered list of tiers — later tiers win, as higher specificity does.
const ROOT_TIER = {
  at: atRule => atRule === null,
  sel: s => s === ":root" || s === ':root[data-carbon-theme="white"]',
};
const STATES = {
  'light (:root / [data-carbon-theme="white"])': [ROOT_TIER],
  "system-dark (@media prefers-color-scheme: dark, no forced theme)": [
    ROOT_TIER,
    { at: atRule => atRule !== null && /prefers-color-scheme:\s*dark/.test(atRule), sel: s => s.startsWith(':root:not([data-carbon-theme="white"])') },
  ],
  'forced dark ([data-carbon-theme="g100"])': [
    ROOT_TIER,
    { at: atRule => atRule === null, sel: s => s === ':root[data-carbon-theme="g100"]' },
  ],
};

const SHEETS = [...read("app/layout.tsx").matchAll(/^import "\.\/([^"]+\.css)";/gm)].map(m => `app/${m[1]}`);
const blocks = SHEETS.flatMap(rel => parseBlocks(read(rel)));

function variablesIn(state) {
  const vars = {};
  for (const tier of STATES[state]) {
    for (const block of blocks) {
      if (tier.at(block.atRule) && block.selector.split(",").some(s => tier.sel(s.trim()))) Object.assign(vars, block.decls);
    }
  }
  return vars;
}

function resolve(value, vars, depth = 0) {
  if (depth > 32 || typeof value !== "string") return String(value);
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_, name, fallback) => {
    if (name in vars) return resolve(vars[name], vars, depth + 1);
    return fallback === undefined ? `UNRESOLVED(${name})` : resolve(fallback.trim(), vars, depth + 1);
  });
}

// Every hex colour in a resolved value, lower-cased, 3-digit forms expanded.
const hexesIn = value => [...value.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)]
  .map(m => m[1].toLowerCase())
  .map(h => `#${h.length === 3 ? h.replace(/./g, c => c + c) : h}`);

const resolvedIn = (vars, name) => resolve(vars[name] ?? "", vars);
const isBlue = value => hexesIn(value).some(h => IBM_BLUES.has(h));

const spTokenNames = [...new Set(parseBlocks(read(SP_TOKENS)).flatMap(b => Object.keys(b.decls)).filter(n => n.startsWith("--sp-")))];

test("the model reads the real cascade: the shipped sheets, the brand layer applied, chains complete", () => {
  for (const rel of ["app/styles/carbon-tokens.css", SP_TOKENS, BRAND_FILE, "app/styles/carbon-components.css"]) {
    assert.ok(SHEETS.includes(rel), `app/layout.tsx must import ${rel}`);
  }
  assert.ok(SHEETS.indexOf(BRAND_FILE) > SHEETS.indexOf(SP_TOKENS), "the brand layer loads after sp-tokens.css, so its --sp-* overrides win");
  assert.ok(spTokenNames.length > 100, `sp-tokens.css declares the --sp-* layer (found ${spTokenNames.length})`);
  // Known resolutions in each state — a parser or tier regression cannot pass vacuously.
  const expected = {
    light: { "--sp-background": "#ffffff", "--sp-button-primary": "#B85C2E", "--sp-border-interactive": "#B85C2E", "--sp-shell-current-bar": "#B85C2E" },
    dark: { "--sp-background": "#161616", "--sp-button-primary": "#B85C2E", "--sp-border-interactive": "#E8A07A", "--sp-shell-current-bar": "#B85C2E" },
  };
  for (const state of Object.keys(STATES)) {
    const vars = variablesIn(state);
    for (const [name, value] of Object.entries(state.startsWith("light") ? expected.light : expected.dark)) {
      assert.equal(resolvedIn(vars, name).toLowerCase(), value.toLowerCase(), `${state}: ${name}`);
    }
    // Every chain ends in a literal. next/font's --font-sans / --font-mono are
    // set on <html> at runtime (phase4-bridge.css), so they alone may dangle.
    const dangling = spTokenNames.flatMap(name =>
      [...resolvedIn(vars, name).matchAll(/UNRESOLVED\((--[\w-]+)\)/g)].map(m => m[1]).filter(n => !/^--font-(sans|mono)$/.test(n)).map(n => `${state}: ${name} → ${n}`));
    assert.deepEqual(dangling, [], "a --sp-* token points at a custom property no sheet declares");
  }
});

test("no --sp-* token resolves to an IBM blue in any theme state", () => {
  const offenders = [];
  for (const state of Object.keys(STATES)) {
    const vars = variablesIn(state);
    for (const name of spTokenNames) {
      if (name in ALLOWLIST) continue;
      const resolved = resolvedIn(vars, name);
      if (isBlue(resolved)) offenders.push(`${state}: ${name} → ${resolved}`);
    }
  }
  assert.deepEqual(offenders, [], `IBM blue reaches a --sp-* token — re-point it in ${BRAND_FILE}, in all three theme blocks:\n  ${offenders.join("\n  ")}`);
});

// Consumer scan for the allowlist: the product sources, minus the two token
// files that declare / override the names and the prototype-only concepts.
function collectFiles(root, out = []) {
  for (const entry of readdirSync(path.join(repoRoot, root))) {
    const rel = path.posix.join(root, entry);
    if (rel === "app/concepts" || rel === "app/fonts") continue;
    if (statSync(path.join(repoRoot, rel)).isDirectory()) collectFiles(rel, out);
    else if (/\.(ts|tsx|css)$/.test(entry) && rel !== SP_TOKENS && rel !== BRAND_FILE) out.push(rel);
  }
  return out;
}

test("the allowlist only shrinks: every row still resolves to a blue and is painted by nothing", () => {
  const files = ["app", "components", "lib"].flatMap(root => collectFiles(root));
  const tailwind = read("tailwind.config.ts");
  for (const [name, why] of Object.entries(ALLOWLIST)) {
    assert.ok(spTokenNames.includes(name), `${name} is not declared in sp-tokens.css — delete its allowlist row (${why})`);
    const blueSomewhere = Object.keys(STATES).some(state => isBlue(resolvedIn(variablesIn(state), name)));
    assert.ok(blueSomewhere, `${name} no longer resolves to a blue in any state — delete its allowlist row (${why})`);
    const consumers = files.filter(rel => read(rel).includes(`var(${name})`));
    // A Tailwind colour key aliasing the token makes `text-sp-<key>` & co. paint it.
    const keys = [...tailwind.matchAll(/"?([\w-]+)"?:\s*"var\((--[\w-]+)\)"/g)].filter(m => m[2] === name).map(m => m[1]);
    for (const key of keys) {
      const utility = new RegExp(`(?<![\\w-])[\\w:-]*-sp-${key}(?![\\w-])`);
      consumers.push(...files.filter(rel => utility.test(read(rel))).map(rel => `${rel} (Tailwind sp-${key})`));
    }
    assert.deepEqual(consumers, [], `${name} resolves to IBM blue and is now painted — re-point it in ${BRAND_FILE} and delete its allowlist row`);
  }
});
