#!/usr/bin/env node
// Zone completeness check: every custom property the dark THEME re-declares
// (`:root[data-theme="dark"]`) is surface-dependent by definition — so inside
// the permanently dark chrome zone (`.sp-zone-chrome`, which re-declares role
// VALUES the same way the dark theme does) each of those tokens must either
// be re-declared by the zone or be deliberately allowlisted here. A token in
// neither place resolves to its light `:root` value inside the chrome — the
// exact mechanism behind the disabled-Button island (light
// --sp-surface-disabled under zone-dark --sp-text-helper, ~1.6:1).
//
// Second check — class/marker pairing over JSX: `.sp-zone-chrome` re-values
// the surface roles, `data-chrome="dark"` re-anchors the focus tokens (#435).
// A region root normally carries BOTH; an element with one and not the other
// is either a documented exception (PAIRING_ALLOWLIST) or a gap. The scan
// walks every .tsx under app/ and components/ (portaled JSX included — a
// portal tenant's tags are scanned where they are written), locates the JSX
// opening tag around each occurrence, and checks the counterpart is in the
// same tag. Occurrences outside any tag (class strings built in helpers)
// cannot be paired textually and must be allowlisted.
//
// Usage: node scripts/zone-completeness.mjs
// Exits 1 on: a dark-theme token missing from both the zone and the
// allowlist; an allowlist entry with an empty reason; a stale allowlist entry
// (token no longer in the dark block, or now zone-declared); an unpaired
// sp-zone-chrome / data-chrome="dark" element not in PAIRING_ALLOWLIST.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Tokens intentionally NOT re-declared by .sp-zone-chrome. Every entry needs
// a real one-line reason — the script fails on empty ones, and on entries
// that have gone stale (fixed in the zone, or retired from the dark block).
const ALLOWLIST = {
  "--sp-focus":
    "#435 ruling: focus re-anchoring belongs to [data-chrome=\"dark\"] only — chrome-zoned error/404 screens must keep the light ring for their white sp-zone-base cards",
  "--sp-shadow-raised":
    "elevation, not a fg/bg pair — no contrast coupling with zone roles; chrome popovers use the --sp-elevation-* utilities instead",
  "--sp-shadow-floating":
    "elevation, not a fg/bg pair — no contrast coupling with zone roles; chrome popovers use the --sp-elevation-* utilities instead",
  "--sp-shadow-sheet":
    "elevation, not a fg/bg pair — no contrast coupling with zone roles; chrome popovers use the --sp-elevation-* utilities instead",
  "--sp-shadow-modal":
    "elevation, not a fg/bg pair — no contrast coupling with zone roles; chrome popovers use the --sp-elevation-* utilities instead",
  "--sp-layer-accent":
    "quiet/secondary control ladder for light panels (design-system Button hover/disabled); no chrome subtree mounts those variants (audit 2026-08-24)",
  "--sp-neutral-strong":
    "quiet-Button active fill on light panels; no chrome consumer (audit 2026-08-24)",
  "--sp-neutral-muted":
    "quiet-Button disabled text on light panels; no chrome consumer (audit 2026-08-24)",
  "--sp-status-success-strong":
    "light-surface status anchor; chrome success reads --sp-status-success-text, which the zone declares (kebab checkmark contrast note in SeatMap)",
  "--sp-status-success-surface":
    "status wash for light panels; chrome washes derive via color-mix on zone-declared text tokens (AskPlannerDrawer pattern)",
  "--sp-status-success-border":
    "status outline for light panels; chrome outlines derive via color-mix on zone-declared text tokens (AskPlannerDrawer pattern)",
  "--sp-status-pending-strong":
    "light-surface status anchor; chrome pending reads --sp-status-pending-text, which the zone declares",
  "--sp-status-pending-surface":
    "status wash for light panels; chrome washes derive via color-mix (AskPlannerDrawer warning banner)",
  "--sp-status-pending-border":
    "status outline for light panels; chrome outlines derive via color-mix (AskPlannerDrawer warning banner)",
  "--sp-status-danger-surface":
    "danger wash for light panels/dialogs; chrome danger washes derive via color-mix on --sp-status-danger-strong, which the zone declares",
  "--sp-status-danger-border":
    "danger outline for light panels/dialogs; no chrome consumer — chrome danger is text + strong only, both zone-declared",
  "--sp-status-danger-hover":
    "destructive design-system Button hover; destructive buttons render in light dialogs only, never in chrome",
  "--sp-status-danger-pressed":
    "destructive design-system Button pressed; destructive buttons render in light dialogs only, never in chrome",
  "--sp-status-neutral-strong":
    "neutral status pill vocabulary for light panels (palette kind badges, inspector); no chrome consumer",
  "--sp-status-neutral-surface":
    "neutral status pill wash for light panels; no chrome consumer",
  "--sp-status-neutral-border":
    "neutral status pill outline for light panels; no chrome consumer",
  "--sp-status-neutral-text":
    "neutral status pill text for light panels; no chrome consumer",
  "--sp-status-search-text":
    "search-highlight vocabulary for the map canvas and light result panels; the chrome bar never paints search state",
  "--sp-status-search-surface":
    "search-highlight wash for the map canvas; no chrome consumer",
  "--sp-status-search-border":
    "search-highlight outline for the map canvas; no chrome consumer",
  "--sp-selection":
    "seat-selection vocabulary for the map canvas (markers/legend); the chrome never paints selection state",
  "--sp-selection-surface":
    "seat-selection wash for the map canvas; no chrome consumer",
  "--sp-selection-border":
    "seat-selection outline for the map canvas; no chrome consumer"
};

const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "globals.css");
const css = readFileSync(cssPath, "utf8");

// Flat brace walk (same approach as css-resolved-map.mjs): innermost blocks.
function parseBlocks(source) {
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  const stack = [];
  let cursor = 0;
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (ch === "{") {
      stack.push(noComments.slice(cursor, i).trim().split(/;|\n{2,}/).pop().trim());
      cursor = i + 1;
    } else if (ch === "}") {
      const selector = stack.pop();
      const body = noComments.slice(cursor, i);
      if (selector) {
        const vars = {};
        for (const m of body.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g)) {
          vars[m[1]] = m[2].trim();
        }
        if (Object.keys(vars).length) blocks.push({ selector, vars });
      }
      cursor = i + 1;
    }
  }
  return blocks;
}

const blocks = parseBlocks(css);

function collect(predicate) {
  const vars = {};
  for (const block of blocks) {
    const selectors = block.selector.split(",").map(s => s.trim());
    if (selectors.some(predicate)) Object.assign(vars, block.vars);
  }
  return vars;
}

const baseRoot = collect(s => s === ":root");
const darkRoot = collect(s => s === ':root[data-theme="dark"]');
// A token counts as zone-declared if either the base zone block or its
// dark-theme refinement declares it. The login-scoped zone blocks are
// deliberately excluded: they refine the generic zone, they don't complete it.
const zone = collect(
  s => s === ".sp-zone-chrome" || s === ':root[data-theme="dark"] .sp-zone-chrome'
);

// Resolve var() chains through the base :root map so the report shows the
// literal a chrome-zone element would actually paint in light theme.
function resolveLight(value, depth = 0) {
  if (depth > 16) return value;
  return value.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (whole, name, fallback) => {
    if (name in zone) return resolveLight(zone[name], depth + 1);
    if (name in baseRoot) return resolveLight(baseRoot[name], depth + 1);
    if (fallback !== undefined) return resolveLight(fallback.trim(), depth + 1);
    return `UNRESOLVED(${name})`;
  });
}

const problems = [];
const missing = [];

for (const token of Object.keys(darkRoot)) {
  if (token in zone) continue;
  if (token in ALLOWLIST) continue;
  const lightRaw = baseRoot[token];
  const light = lightRaw === undefined ? "(no :root declaration — inherits/initial)" : resolveLight(lightRaw);
  missing.push({ token, light });
}

for (const [token, reason] of Object.entries(ALLOWLIST)) {
  if (typeof reason !== "string" || reason.trim() === "") {
    problems.push(`allowlist entry ${token} has an empty reason — every entry must say why it is safe`);
  }
  if (!(token in darkRoot)) {
    problems.push(`stale allowlist entry ${token}: no longer declared in the dark-theme :root block`);
  } else if (token in zone) {
    problems.push(`stale allowlist entry ${token}: now declared in .sp-zone-chrome — remove it from the allowlist`);
  }
}

if (missing.length) {
  console.error("Dark-theme tokens NOT re-declared by .sp-zone-chrome and not allowlisted:");
  for (const { token, light } of missing) {
    console.error(`  ${token}  → resolves inside a chrome zone (light theme) to: ${light}`);
  }
  console.error("\nEither declare each in the .sp-zone-chrome block or add an allowlist entry with a reason.");
}

// --- Pairing scan: sp-zone-chrome ⟷ data-chrome="dark" over JSX -------------

// Elements deliberately carrying ONE marker. Key: `${file}|${tag}|${missing}`
// with repo-relative forward-slash paths; `(string)` as the tag for
// occurrences that live in a helper string rather than a JSX opening tag.
// Every reason must be non-empty; stale entries (no longer matched) fail.
const PAIRING_ALLOWLIST = {
  'app/error.tsx|main|data-chrome="dark"':
    "#435 ruling: chrome-zoned error screen keeps the LIGHT focus ring — every focusable sits on its white sp-zone-base card, where #FF8A5C would be 2.32:1",
  'app/not-found.tsx|main|data-chrome="dark"':
    "#435 ruling: chrome-zoned 404 keeps the light focus ring for the same white-card reason as app/error.tsx",
  'app/loading.tsx|div|data-chrome="dark"':
    "aria-hidden skeleton chrome strip with zero focusable descendants — focus tokens can never apply",
  'app/(shell)/admin/page.tsx|div|data-chrome="dark"':
    "access-denied brand banner: text + decorative mark only, no focusable descendants; the card's focusables sit on the light surface below it",
  'app/login/page.tsx|section|data-chrome="dark"':
    "login brand panel is decorative (img/headline/status line, no focusable descendants); .login-theme .sp-zone-chrome owns its palette refinements",
  'app/concepts/login-v12/LoginV12Preview.tsx|div|data-chrome="dark"':
    "static concept picture — divs, not buttons; nothing focusable ever mounts inside",
  'components/seat-map/SeatInspector.tsx|span|data-chrome="dark"':
    "aria-hidden monogram chip island, no focusable descendants — focus tokens moot",
  'components/seat-map/ViewerFindPalette.tsx|(string)|data-chrome="dark"':
    "resultKindClass seat-badge string: a non-interactive pill (dark chip inside the light palette), no focusable descendants"
};

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function collectTsx(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectTsx(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// The JSX opening tag around `index`, or null when the occurrence is not
// inside one (e.g. a class string in a helper). Walks back to the nearest
// `<name` start, then forward with a quote/brace-aware scan to the tag's own
// `>`; the occurrence must fall before that end.
function enclosingTag(source, index) {
  let start = -1;
  for (let i = index; i >= 0; i--) {
    if (source[i] === "<" && /[A-Za-z]/.test(source[i + 1] ?? "")) {
      start = i;
      break;
    }
    if (source[i] === ">" && source[i - 1] !== "=") break; // left a tag already
  }
  if (start === -1) return null;
  let brace = 0;
  let quote = null;
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === ">" && brace === 0) {
      if (i < index) return null; // tag closed before the occurrence
      const text = source.slice(start, i + 1);
      return { text, tag: /^<([A-Za-z][A-Za-z0-9.]*)/.exec(text)[1] };
    }
  }
  return null;
}

const pairingFindings = [];
const matchedAllowlistKeys = new Set();
const MARKERS = [
  { needle: "sp-zone-chrome", counterpart: 'data-chrome="dark"' },
  { needle: 'data-chrome="dark"', counterpart: "sp-zone-chrome" }
];

for (const file of [path.join(repoRoot, "app"), path.join(repoRoot, "components")].flatMap(collectTsx)) {
  const source = readFileSync(file, "utf8");
  const rel = path.relative(repoRoot, file).replaceAll("\\", "/");
  for (const { needle, counterpart } of MARKERS) {
    for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + needle.length)) {
      const tag = enclosingTag(source, at);
      const line = source.slice(0, at).split("\n").length;
      if (tag && tag.text.includes(counterpart)) continue; // paired
      const key = `${rel}|${tag ? tag.tag : "(string)"}|${counterpart}`;
      if (key in PAIRING_ALLOWLIST) {
        matchedAllowlistKeys.add(key);
        continue;
      }
      pairingFindings.push(
        `${rel}:${line} ${tag ? `<${tag.tag}>` : "(class string outside a JSX tag)"} carries ${needle} without ${counterpart}`
      );
    }
  }
}

for (const [key, reason] of Object.entries(PAIRING_ALLOWLIST)) {
  if (typeof reason !== "string" || reason.trim() === "") {
    problems.push(`pairing allowlist entry ${key} has an empty reason`);
  }
  if (!matchedAllowlistKeys.has(key)) {
    problems.push(`stale pairing allowlist entry ${key}: no unpaired occurrence matches it any more`);
  }
}

if (pairingFindings.length) {
  console.error("Unpaired chrome markers (sp-zone-chrome and data-chrome=\"dark\" must travel together):");
  for (const finding of pairingFindings) console.error(`  ${finding}`);
}
for (const problem of problems) console.error(problem);

if (missing.length || problems.length || pairingFindings.length) process.exit(1);
console.log(
  `zone-completeness OK: ${Object.keys(darkRoot).length} dark-theme tokens — ` +
    `${Object.keys(darkRoot).filter(t => t in zone).length} zone-declared, ${Object.keys(ALLOWLIST).length} allowlisted; ` +
    `pairing scan clean (${Object.keys(PAIRING_ALLOWLIST).length} sanctioned single-marker elements).`
);
