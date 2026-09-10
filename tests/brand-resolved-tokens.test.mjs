import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// Resolved-value brand guard (docs/audits/2026-09-10/REVIEW.md, BR-1; widened
// to the component sheets' direct --cds-* consumers for BR-5).
//
// tests/phase4-token-layer-source.test.mjs reads the brand file's own TEXT —
// terracotta in every theme block, no blue literal. That cannot see the bug the
// audit found: `--sp-status-search-mark: var(--cds-support-info)` in
// sp-tokens.css aliases a Carbon role the brand file never re-pointed, so the
// roster's search-hit row (sp-components.css `.sp-roster-row[data-highlight]`)
// painted IBM blue 70 / 50 in both themes while every text check stayed green.
//
// SCOPE. Two sets of names are walked, and nothing else: every `--sp-*` token
// sp-tokens.css declares, and every `--cds-*` role that carbon-components.css
// or sp-components.css consumes DIRECTLY through var() (the errata's BR-5
// class — `.cds-notification` paints `--cds-support-info` with no `--sp-*`
// alias in between, so a walk over the aliases alone was a false pass there).
// Each name is resolved through its var() chain — the Carbon palette and theme
// roles (carbon-tokens.css), the status marks carbon-components.css adds, and
// the brand layer's overrides on top — in each of the app's three theme states,
// and the test fails if any lands on an IBM blue. A `--cds-*` role the brand
// layer forgets cannot paint blue again, through either route, without this
// file naming the token, the state and the resolved colour. A role consumed
// only from a component's inline style or a Tailwind utility is outside this
// walk (the phase4 token-layer test owns those files).
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
// The two component sheets whose direct `var(--cds-*)` reads are walked.
const COMPONENT_SHEETS = ["app/styles/carbon-components.css", "app/styles/sp-components.css"];

// Carbon's blue scale (the palette in carbon-tokens.css, plus its two hover
// blues) — what CLAUDE.md "Brand System" rule 1 bans from every role.
const IBM_BLUES = new Set([
  "#0f62fe", "#0353e9", "#0043ce", "#4589ff", "#78a9ff", "#a6c8ff", "#d0e2ff", "#edf5ff",
  "#001d6c", "#002d9c", "#001141", "#0050e6", "#0053ff",
]);

// ALLOWLIST — walked names that resolve to a blue in some state. Every row
// carries a `kind`, and the last test holds each kind to its own contract:
//
// - "unpainted": the audit's DS-5 class ("declared, consumed by no rule"). The
//   row must still resolve to a blue (stale — delete it) and must have NO
//   consumer: no `var(--name)` in app/ components/ lib/, and no Tailwind class
//   built on its tailwind.config.ts alias. Shrink-only: never add a row, re-
//   point the token in the brand layer instead, as BR-1 did for the
//   --sp-status-search-* pair.
// - "pending-ruling": a LIVE blue the audit has recorded and the owner has not
//   yet ruled a replacement for. The row must cite the finding id and date in
//   its `why`, and must still resolve to a blue (delete it once the brand layer
//   re-points the role); consumers are expected. A row of this kind is a
//   recorded debt, not an exemption — the audit record is the only way in.
//
// `--sp-status-info-text` is deliberately NOT here: it aliases
// --cds-text-primary and never resolves to a blue, so the shrink check would
// reject the row as dead.
const ALLOWLIST = {
  "--sp-status-info-mark": { kind: "unpainted", why: "Carbon info status, blue 70 light / blue 50 dark; tailwind.config.ts aliases it as `info`, no class uses it (DS-5)" },
  "--sp-status-info-surface": { kind: "unpainted", why: "Carbon info status surface, blue 10 in light (DS-5)" },
  "--sp-highlight": { kind: "unpainted", why: "Carbon's highlight role — blue 90 in both dark states (light is the O2 tint); the hit surfaces read --sp-pill-search-* / --sp-status-search-*, nothing reads this alias" },
  // BR-5: carbon-components.css paints these straight onto .cds-notification
  // (bar, icon, light fill) and .cds-status--info; `.cds-notification--info`
  // is live in SeatInspector, PublishReviewSheet and AskPlannerDrawer. The
  // replacement colour is the owner's call (terracotta family or a neutral).
  "--cds-support-info": { kind: "pending-ruling", why: "info notification bar + icon, blue 70 light / blue 50 dark (BR-5, 2026-09-10)" },
  "--cds-support-info-subtle": { kind: "pending-ruling", why: "info notification light fill, blue 10 (BR-5, 2026-09-10)" },
  "--cds-status-info-mark": { kind: "pending-ruling", why: ".cds-status--info glyph, aliases --cds-support-info (BR-5, 2026-09-10)" },
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
// ordered list of tiers — later tiers win, as higher specificity does. Both
// dark tiers match their selector exactly: a sheet that wrote a different
// `:not()` chain would be a different cascade, not a looser match.
const SYSTEM_DARK_SELECTOR = ':root:not([data-carbon-theme="white"]):not([data-carbon-theme="g10"])';
const ROOT_TIER = {
  at: atRule => atRule === null,
  sel: s => s === ":root" || s === ':root[data-carbon-theme="white"]',
};
const STATES = {
  'light (:root / [data-carbon-theme="white"])': [ROOT_TIER],
  "system-dark (@media prefers-color-scheme: dark, no forced theme)": [
    ROOT_TIER,
    { at: atRule => atRule !== null && /prefers-color-scheme:\s*dark/.test(atRule), sel: s => s === SYSTEM_DARK_SELECTOR },
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

// Every colour in a resolved value as a lower-case 6-digit hex: 3/4-digit hex
// expanded, 8-digit hex and rgba() stripped of their alpha, rgb() converted.
const hexOf = h => `#${h.length <= 4 ? h.slice(0, 3).replace(/./g, c => c + c) : h.slice(0, 6)}`;
const channelHex = c => Number(c).toString(16).padStart(2, "0");
const coloursIn = value => [
  ...[...value.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi)].map(m => hexOf(m[1].toLowerCase())),
  ...[...value.matchAll(/\brgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/][^)]*)?\)/gi)]
    .map(m => `#${channelHex(m[1])}${channelHex(m[2])}${channelHex(m[3])}`),
];

const resolvedIn = (vars, name) => resolve(vars[name] ?? "", vars);
const isBlue = value => coloursIn(value).some(h => IBM_BLUES.has(h));

const spTokenNames = [...new Set(parseBlocks(read(SP_TOKENS)).flatMap(b => Object.keys(b.decls)).filter(n => n.startsWith("--sp-")))];
// The --cds-* roles the component sheets read straight from the Carbon layer.
const cdsConsumedNames = [...new Set(COMPONENT_SHEETS.flatMap(rel =>
  [...read(rel).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/var\(\s*(--cds-[\w-]+)/g)].map(m => m[1])))];
const walkedNames = [...new Set([...spTokenNames, ...cdsConsumedNames])];

test("the model reads the real cascade: the shipped sheets, the brand layer applied, chains complete", () => {
  for (const rel of ["app/styles/carbon-tokens.css", SP_TOKENS, BRAND_FILE, ...COMPONENT_SHEETS]) {
    assert.ok(SHEETS.includes(rel), `app/layout.tsx must import ${rel}`);
  }
  assert.ok(SHEETS.indexOf(BRAND_FILE) > SHEETS.indexOf(SP_TOKENS), "the brand layer loads after sp-tokens.css, so its --sp-* overrides win");
  assert.ok(spTokenNames.length > 100, `sp-tokens.css declares the --sp-* layer (found ${spTokenNames.length})`);
  assert.ok(cdsConsumedNames.length > 20, `the component sheets consume --cds-* roles directly (found ${cdsConsumedNames.length})`);
  assert.ok(cdsConsumedNames.includes("--cds-support-info"), "the walk reaches .cds-notification's direct --cds-support-info read (BR-5)");

  // The blue detector recognises every written form the sheets could use.
  assert.ok(isBlue("#0f62fe") && isBlue("#0F62FE80") && isBlue("rgb(15, 98, 254)") && isBlue("rgba(15 98 254 / 0.5)"), "hex, 8-digit hex and rgb()/rgba() blues are all caught");
  assert.ok(!isBlue("#b85c2e") && !isBlue("rgb(184, 92, 46)"), "a non-blue is not flagged");

  // Known STRUCTURAL resolutions in each state — a parser or tier regression
  // cannot pass vacuously. Deliberately not the owner-ruled brand values
  // (tests/phase4-token-layer-source.test.mjs pins those, once): the page
  // background per theme is Carbon's, and the brand literal is read from the
  // brand file rather than restated here.
  const lightVars = variablesIn(Object.keys(STATES)[0]);
  const brandLiteral = lightVars["--brand-terracotta"];
  assert.match(brandLiteral ?? "", /^#[0-9a-f]{6}$/i, "the brand file declares --brand-terracotta as a hex literal on :root");
  for (const state of Object.keys(STATES)) {
    const vars = variablesIn(state);
    assert.equal(resolvedIn(vars, "--sp-background").toLowerCase(), state.startsWith("light") ? "#ffffff" : "#161616", `${state}: --sp-background`);
    assert.ok(
      spTokenNames.some(name => resolvedIn(vars, name).toLowerCase() === brandLiteral.toLowerCase()),
      `${state}: some --sp-* token resolves, through the --cds-* roles, to the brand file's --brand-terracotta literal`
    );
    // Every chain ends in a literal. next/font's --font-sans / --font-mono are
    // set on <html> at runtime (phase4-bridge.css), so they alone may dangle.
    const dangling = spTokenNames.flatMap(name =>
      [...resolvedIn(vars, name).matchAll(/UNRESOLVED\((--[\w-]+)\)/g)].map(m => m[1]).filter(n => !/^--font-(sans|mono)$/.test(n)).map(n => `${state}: ${name} → ${n}`));
    assert.deepEqual(dangling, [], "a --sp-* token points at a custom property no sheet declares");
    // And no var() survives resolution: a fallback nested deeper than the
    // resolver's regex reads would otherwise stop resolving silently and pass
    // the blue check with the blue still inside it.
    const unresolved = walkedNames.filter(name => resolvedIn(vars, name).includes("var(")).map(name => `${state}: ${name} → ${resolvedIn(vars, name)}`);
    assert.deepEqual(unresolved, [], "a resolved value still contains var()");
  }
});

test("no --sp-* token, and no --cds-* role the component sheets consume directly, resolves to an IBM blue in any theme state", () => {
  const offenders = [];
  for (const state of Object.keys(STATES)) {
    const vars = variablesIn(state);
    for (const name of walkedNames) {
      if (name in ALLOWLIST) continue;
      const resolved = resolvedIn(vars, name);
      if (isBlue(resolved)) offenders.push(`${state}: ${name} → ${resolved}`);
    }
  }
  assert.deepEqual(offenders, [], `IBM blue reaches a walked token — re-point it in ${BRAND_FILE}, in all three theme blocks:\n  ${offenders.join("\n  ")}`);
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

test("the allowlist holds: unpainted rows still resolve to a blue and are painted by nothing; pending-ruling rows cite their finding and are still blue", () => {
  const files = ["app", "components", "lib"].flatMap(root => collectFiles(root));
  const tailwind = read("tailwind.config.ts");
  for (const [name, { kind, why }] of Object.entries(ALLOWLIST)) {
    assert.ok(["unpainted", "pending-ruling"].includes(kind), `${name}: unknown allowlist kind "${kind}"`);
    assert.ok(walkedNames.includes(name), `${name} is neither declared in sp-tokens.css nor consumed by a component sheet — delete its allowlist row (${why})`);
    const blueSomewhere = Object.keys(STATES).some(state => isBlue(resolvedIn(variablesIn(state), name)));
    assert.ok(blueSomewhere, `${name} no longer resolves to a blue in any state — delete its allowlist row (${why})`);

    if (kind === "pending-ruling") {
      // The audit record is the only way in: the row names the finding and its date.
      assert.match(why, /\b[A-Z]{2,}-\d+\b, \d{4}-\d{2}-\d{2}/, `${name}: a pending-ruling row must cite the finding id and date (e.g. "BR-5, 2026-09-10")`);
      continue;
    }

    // Whitespace inside var() and a fallback after the name both still paint it.
    const consumerPattern = new RegExp("var\\(\\s*" + name + "(?![\\w-])");
    const consumers = files.filter(rel => consumerPattern.test(read(rel)));
    // A Tailwind colour key aliasing the token makes `text-sp-<key>` & co. paint it.
    const keys = [...tailwind.matchAll(/"?([\w-]+)"?:\s*"var\((--[\w-]+)\)"/g)].filter(m => m[2] === name).map(m => m[1]);
    for (const key of keys) {
      const utility = new RegExp(`(?<![\\w-])[\\w:-]*-sp-${key}(?![\\w-])`);
      consumers.push(...files.filter(rel => utility.test(read(rel))).map(rel => `${rel} (Tailwind sp-${key})`));
    }
    assert.deepEqual(consumers, [], `${name} resolves to IBM blue and is now painted — re-point it in ${BRAND_FILE} and delete its allowlist row`);
  }
});
