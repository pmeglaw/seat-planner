import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// Phase 4 token-layer guard (docs/redesign-v2/phase4/TEST-TRIAGE.md, PR 0).
// The redesign lands the Phase 3 design system as four CSS files —
// `carbon-tokens.css` and `carbon-components.css` (skill assets, never
// edited), `sp-tokens.css` (the product semantic layer) and
// `sp-components.css` — and every product surface consumes `--sp-*` names
// only. PHASE3DS §5 / the Phase 4 hand-off state the three rules this file
// enforces:
//
//   1. No hex literal outside the two asset files. Product code never
//      references a raw colour (skill "Token discipline").
//   2. No `--cds-*` reference outside `sp-tokens.css` and the two assets —
//      the semantic layer is the only bridge to Carbon, so a v12 rename
//      touches one file.
//   3. No retired `--sp-*` name (PHASE3DS §5 "Retired names") once the PR
//      that sweeps it has merged.
//
// The rules are phased because PR 0 lands before any component moves: rule 1
// runs against a per-file HEX_LEDGER that records today's counts and may only
// shrink (a stale entry — a file that now carries fewer — fails, so the ledger
// stays the record); rule 3 checks only the retired-name groups whose sweep
// PR is in SWEPT. Each Phase 4 PR that lands a sweep removes its ledger rows
// and adds its group number. When the phase closes, HEX_LEDGER is empty and
// SWEPT holds every group.
//
// Mechanics mirror tests/auth-theme-source.test.mjs: TypeScript sources are
// scanned by string literal (comments never reach the rules); CSS is scanned
// with comments stripped. `app/concepts/` (prototypes, superseded) and
// `app/fonts/` are outside the scan.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const SCAN_ROOTS = ["app", "components", "lib"];
const SCAN_FILES = ["tailwind.config.ts"];
const EXCLUDED_DIRS = new Set(["app/concepts", "app/fonts"]);

// The skill assets: copied verbatim, the only files allowed to hold a hex —
// plus the LOCKED brand layer (CLAUDE.md "Brand System"), which by design holds
// the firm's hex values and re-points Carbon's interactive roles at them.
const ASSET_BASENAMES = new Set(["carbon-tokens.css", "carbon-components.css"]);
const BRAND_FILE = "app/styles/brand/megeredchian-law-tokens.css";
const HEX_ALLOWED_BASENAMES = new Set([...ASSET_BASENAMES, path.posix.basename(BRAND_FILE)]);
// The semantic layer: the only non-asset file allowed to reference `--cds-*` —
// and the brand layer, whose whole job is overriding `--cds-*` roles.
const CDS_BRIDGE_BASENAMES = new Set([...HEX_ALLOWED_BASENAMES, "sp-tokens.css"]);

function collectFiles(root) {
  const abs = path.join(repoRoot, root);
  const out = [];
  for (const entry of readdirSync(abs)) {
    const rel = path.posix.join(root, entry);
    if (EXCLUDED_DIRS.has(rel)) continue;
    const p = path.join(abs, entry);
    if (statSync(p).isDirectory()) {
      out.push(...collectFiles(rel));
    } else if (/\.(ts|tsx|css)$/.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

const files = [...SCAN_ROOTS.flatMap(collectFiles), ...SCAN_FILES].sort();

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

// Every double-quoted / single-quoted string literal plus every template
// chunk, with `${…}` interpolations stripped.
function stringLiterals(source) {
  const literals = [];
  for (const match of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) literals.push(match[1]);
  for (const match of source.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) literals.push(match[1]);
  for (const match of source.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    literals.push(match[1].replace(/\$\{[^}]*\}/g, " "));
  }
  return literals;
}

function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

// The text the rules see for a file: CSS minus comments, TS by literal.
function scannable(rel) {
  const source = read(rel);
  return rel.endsWith(".css") ? [stripCssComments(source)] : stringLiterals(source);
}

function countMatches(chunks, re) {
  let n = 0;
  for (const chunk of chunks) n += (chunk.match(re) ?? []).length;
  return n;
}

// ---------------------------------------------------------------------------
// Rule 1 — no hex outside the assets.
// ---------------------------------------------------------------------------

// A `#` followed by 3–8 hex digits and then a non-word character. Id
// selectors like `#seat-inspector-actions` never match (the run must end at a
// word boundary), and the ledger absorbs any that do.
const HEX = /#[0-9a-fA-F]{3,8}(?![\w-])/g;

// PR 0 snapshot (2026-09-03, main @ c36f216). Rows leave in the PR that
// re-tokenises the file — PR 1 for globals.css / tailwind / design-system,
// then the component PRs (TEST-TRIAGE.md names the PR per file). A row may
// only go down or out; it may never appear.
const HEX_LEDGER = {
  "app/global-error.tsx": 10, // PR 5 (route cards)
  "app/layout.tsx": 1, // themeColor meta: gray 100, the header colour — Next's Viewport wants a string (owner, PR 1)
  "components/seat-map/SeatSheet.tsx": 12, // PR 3 (inspector)
  "components/ui/design-system.tsx": 53, // PR 3 (markerStateClassRecipes; the primitives were re-tokenised in PR 1)
};

test("no hex literal outside the two asset files (ledger only shrinks)", () => {
  const actual = {};
  for (const rel of files) {
    if (HEX_ALLOWED_BASENAMES.has(path.posix.basename(rel))) continue;
    const n = countMatches(scannable(rel), HEX);
    if (n > 0) actual[rel] = n;
  }
  const problems = [];
  for (const [rel, n] of Object.entries(actual)) {
    const allowed = HEX_LEDGER[rel];
    if (allowed === undefined) problems.push(`${rel}: ${n} hex literal(s), not in HEX_LEDGER`);
    else if (n > allowed) problems.push(`${rel}: ${n} hex literal(s), ledger allows ${allowed}`);
    else if (n < allowed) problems.push(`${rel}: ${n} hex literal(s), ledger says ${allowed} — shrink the ledger row`);
  }
  for (const rel of Object.keys(HEX_LEDGER)) {
    if (!(rel in actual)) problems.push(`${rel}: ledger row is stale (file has no hex, or no longer exists) — remove it`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

// ---------------------------------------------------------------------------
// Rule 2 — `--cds-*` only through the semantic layer.
// ---------------------------------------------------------------------------

// The one sanctioned exception: next/font/local emits a hashed family name, so
// the Phase 4 bridge re-points the asset's two font tokens at the variables
// app/layout.tsx exposes (PHASE4BUILD §1.3). Exactly these names, in exactly
// this file, as declarations only.
const BRIDGE_FILE = "app/styles/phase4-bridge.css";
const CDS_FONT_BRIDGE = new Set(["--cds-font-sans", "--cds-font-mono"]);

test("no --cds- reference outside sp-tokens.css and the two asset files", () => {
  const offenders = [];
  for (const rel of files) {
    if (CDS_BRIDGE_BASENAMES.has(path.posix.basename(rel))) continue;
    for (const chunk of scannable(rel)) {
      for (const m of chunk.matchAll(/--cds-[a-z0-9-]+/g)) {
        if (rel === BRIDGE_FILE && CDS_FONT_BRIDGE.has(m[0])) continue;
        offenders.push(`${rel}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `--cds-* must be consumed via --sp-* names:\n${offenders.join("\n")}`);
});

test("the font bridge re-points both Carbon font tokens at next/font's variables", () => {
  const css = stripCssComments(read(BRIDGE_FILE));
  assert.match(css, /--cds-font-sans:\s*var\(--font-sans\)/);
  assert.match(css, /--cds-font-mono:\s*var\(--font-mono\)/);
  const layout = read("app/layout.tsx");
  assert.match(layout, /variable:\s*"--font-sans"/);
  assert.match(layout, /variable:\s*"--font-mono"/);
  // The variables must be on <html> for :root to see them.
  assert.match(layout, /<html[^>]*className=\{`\$\{plexSans\.variable\} \$\{plexMono\.variable\}`\}/);
});

// ---------------------------------------------------------------------------
// The four design-system files land unchanged (PHASE3DS §7: "the CSS is the
// deliverable"). The only edit is the Google Fonts @import line leaving
// carbon-tokens.css (fonts are vendored via next/font/local).
// ---------------------------------------------------------------------------

const PHASE3 = "docs/redesign-v2/phase3";
const SHIPPED = {
  "app/styles/carbon-tokens.css": `${PHASE3}/tokens/carbon-tokens.css`,
  "app/styles/sp-tokens.css": `${PHASE3}/tokens/sp-tokens.css`,
  "app/styles/carbon-components.css": `${PHASE3}/components/carbon-components.css`,
  "app/styles/sp-components.css": `${PHASE3}/components/sp-components.css`,
};

test("the four design-system files are byte-identical to the Phase 3 deliverable (minus the @import line)", () => {
  for (const [shipped, source] of Object.entries(SHIPPED)) {
    const expected = read(source)
      .split("\n")
      .filter(line => !/^@import url\("https:\/\/fonts\.googleapis\.com/.test(line))
      .join("\n");
    assert.equal(read(shipped), expected, `${shipped} differs from ${source}`);
  }
  assert.doesNotMatch(read("app/styles/carbon-tokens.css"), /@import/, "no @import may remain in the shipped asset");
});

test("app/layout.tsx imports the stylesheets in the contracted order", () => {
  const layout = read("app/layout.tsx");
  const order = [
    "./globals.css",
    "./styles/carbon-tokens.css",
    "./styles/sp-tokens.css",
    "./styles/brand/megeredchian-law-tokens.css", // brand AFTER the token files, BEFORE components
    "./styles/carbon-components.css",
    "./styles/sp-components.css",
    "./styles/phase4-bridge.css",
  ];
  const positions = order.map(spec => layout.indexOf(`import "${spec}";`));
  for (let i = 0; i < order.length; i += 1) {
    assert.ok(positions[i] >= 0, `layout.tsx must import ${order[i]}`);
    if (i > 0) assert.ok(positions[i] > positions[i - 1], `${order[i]} must load after ${order[i - 1]}`);
  }
});

// ---------------------------------------------------------------------------
// The bridge: every retired alias references a defined --sp-* name (or a
// literal), and an alias whose group has been swept must be gone.
// ---------------------------------------------------------------------------

function definedSpNames() {
  const names = new Set();
  for (const m of stripCssComments(read("app/styles/sp-tokens.css")).matchAll(/^\s*(--sp-[a-z0-9-]+)\s*:/gm)) names.add(m[1]);
  return names;
}

test("every bridge alias resolves to a defined --sp-* name and none survives its sweep", () => {
  const defined = definedSpNames();
  const css = stripCssComments(read(BRIDGE_FILE));
  const problems = [];
  for (const m of css.matchAll(/^\s*(--sp-[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    const [, alias, value] = m;
    assert.ok(!defined.has(alias), `${alias} is defined in sp-tokens.css — it is not a retired name and does not belong in the bridge`);
    for (const ref of value.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
      if (!defined.has(ref[1])) problems.push(`${alias} → ${ref[1]} is not defined in sp-tokens.css`);
    }
    for (const group of SWEPT) {
      for (const re of RETIRED[group]) {
        if (new RegExp(re.source).test(alias)) problems.push(`${alias} was swept in PR ${group} and must leave the bridge`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

// ---------------------------------------------------------------------------
// Rule 3 — retired `--sp-*` names, by sweep PR (PHASE3DS §5 "Retired names").
// ---------------------------------------------------------------------------

// `(?![\w-])` ends the name: `--sp-duration-fast` is retired, its replacement
// `--sp-duration-fast-01` is not; `--sp-space-1` is retired, `--sp-space-10`
// is not.
const RETIRED = {
  1: [
    /--sp-space-[1-7](?![\w-])/g,
    /--sp-radius-(sm|md|lg|xl|full|sheet)(?![\w-])/g,
    /--sp-shadow-(floating|modal|raised|sheet)(?![\w-])/g,
    /--sp-elevation-(2|3|4|5|panel|rail)(?![\w-])/g,
    /--sp-duration-(fast|standard|deliberate)(?![\w-])/g,
    /--sp-focus-(offset-color|marker-ring|marker-offset)(?![\w-])/g,
    /--sp-border-(hairline|hairline-soft|soft)(?![\w-])/g,
    /--sp-text-on-brand(?![\w-])/g,
    /--sp-link-on-field(?![\w-])/g,
    /--sp-overlay-base(?![\w-])/g,
    /--sp-neutral-(strong|muted)(?![\w-])/g,
    /--sp-surface-disabled(?![\w-])/g,
    /--sp-brand(?![\w])/g, // --sp-brand and every --sp-brand-* — no brand orange in the system
    /--sp-accent(?![\w-])/g,
    /--sp-button-secondary-soft(?![\w-])/g,
    /--sp-status-(danger|pending|published)(?![\w])/g,
    /--sp-color-/g,
  ],
  2: [/--sp-chrome-/g],
  3: [
    /--sp-marker-/g,
    /--sp-legend-/g,
    /--sp-selection(?![\w])/g,
    /--sp-ai-(?!label-text|border-start|border-end)/g,
    /--sp-editor-/g,
    /--sp-publish-(ready|no-change|viewer-impact)(?![\w])/g,
    /--sp-trail(?![\w])/g,
    /--sp-wash-zone(?![\w-])/g,
  ],
  4: [
    /--sp-tag-(bg|text)(?![\w-])/g,
    /--sp-table-(header|row-border)(?![\w-])/g,
    /--sp-extension-/g,
    /--sp-identity-/g,
  ],
};

// Sweep PRs that have merged. PR 1 adds 1, PR 2 adds 2, PR 3 adds 3, PR 4
// adds 4. Until a group is swept its names are still the shipped vocabulary
// and the rule stays silent for them.
const SWEPT = new Set([1, 2]);

test("retired --sp-* names are gone once their sweep PR has merged", () => {
  const offenders = [];
  for (const rel of files) {
    const chunks = scannable(rel);
    for (const group of SWEPT) {
      for (const re of RETIRED[group]) {
        const n = countMatches(chunks, re);
        if (n > 0) offenders.push(`${rel}: ${n} × ${re.source} (retired in PR ${group})`);
      }
    }
  }
  assert.deepEqual(offenders, [], `retired names still in use:\n${offenders.join("\n")}`);
});

test("every retired-name group is a known sweep PR", () => {
  for (const group of SWEPT) assert.ok(RETIRED[group], `SWEPT names unknown group ${group}`);
  assert.deepEqual(Object.keys(RETIRED), ["1", "2", "3", "4"]);
});

// ---------------------------------------------------------------------------
// Carried rule — Tailwind v3 drops `shadow-[var(--…)]` silently (was
// tests/elevation-shadow-tokens-source.test.mjs, which retires in PR 1 with
// the elevation tokens; the build-correctness half lives on here).
// ---------------------------------------------------------------------------

test("no shadow-[var( arbitrary class (Tailwind v3 drops it silently)", () => {
  const offenders = [];
  for (const rel of files) {
    if (!/\.(ts|tsx)$/.test(rel)) continue;
    const n = countMatches(stringLiterals(read(rel)), /shadow-\[var\(/g);
    if (n > 0) offenders.push(`${rel}: ${n}`);
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});


// ---------------------------------------------------------------------------
// Brand layer (LOCKED — CLAUDE.md "Brand System"). The firm's terracotta is
// the primary-action colour in every theme state; IBM blue is never the
// primary; the logo orange never appears as a UI colour.
// ---------------------------------------------------------------------------
test("brand layer: terracotta is the primary in all three theme states, blue is not", () => {
  const css = stripCssComments(read(BRAND_FILE));
  const blocks = [
    /:root,\s*:root\[data-carbon-theme="white"\]\s*\{([^}]*)\}/, // light
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-carbon-theme="white"\]\)[^{]*\{([^}]*)\}/, // system-dark
    /:root\[data-carbon-theme="g100"\]\s*\{([^}]*)\}/, // forced dark
  ];
  for (const re of blocks) {
    const m = css.match(re);
    assert.ok(m, `brand block missing: ${re}`);
    assert.match(m[1], /--cds-button-primary:\s*#B85C2E/i);
    assert.match(m[1], /--cds-button-primary-hover:\s*#8F4521/i);
    assert.match(m[1], /--cds-focus:\s*#B85C2E/i);
    assert.match(m[1], /--cds-border-interactive:\s*#B85C2E/i);
  }
  assert.match(css.match(blocks[0])[1], /--cds-link-primary:\s*#8F4521/i, "light links are #8F4521");
  assert.match(css.match(blocks[2])[1], /--cds-link-primary:\s*#E8A07A/i, "dark links are #E8A07A");
  assert.doesNotMatch(css, /#0f62fe|#0353e9|#4589ff|#a6c8ff|#78a9ff/i, "no IBM blue in the brand layer");
  // The logo orange is declared once, as --brand-orange-logo, and assigned to nothing else.
  const logoUses = [...css.matchAll(/#EB7C35/gi)].length;
  assert.equal(logoUses, 1, "#EB7C35 is LOGO ONLY (2.81:1 on white) — declared once as --brand-orange-logo, never assigned to a UI role");
});

test("brand layer: the zone tokens that bypass --cds-* roles are re-pointed", () => {
  const css = stripCssComments(read(BRAND_FILE));
  assert.match(css, /--sp-shell-current-bar:\s*#B85C2E/i);
  assert.match(css, /--sp-panel-dark-link:\s*#E8A07A/i);
  assert.match(css, /--sp-ai-border-end:\s*#B85C2E/i);
});

test("logo orange #EB7C35 appears nowhere in app/ or components/ except the brand declaration", () => {
  const offenders = [];
  for (const rel of files) {
    if (rel === BRAND_FILE) continue;
    if (countMatches(scannable(rel), /#EB7C35/gi) > 0) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "#EB7C35 is the logo mark only — it fails AA (2.81:1) as a UI colour");
});
