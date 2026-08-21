#!/usr/bin/env node
// Resolved custom-property value map over emitted CSS (PASS1 rename
// verification: a rename-only pass must not move any resolved value).
//
// Usage:
//   node scripts/css-resolved-map.mjs <file-or-dir>            print the map
//   node scripts/css-resolved-map.mjs <file-or-dir> <file-or-dir>
//                                                    diff two maps (A vs B)
//
// For every custom property declared in the CSS, the script resolves var()
// chains to a final literal value — following indirection through the
// cascade of a set of evaluation CONTEXTS that mirror this app's theme/zone
// structure (base light/dark, admin/shell light/dark, chrome zone, base
// re-entry, reception, login, login panel). Colour notation is normalised
// (hex case/short-form, rgb vs rgba, "R G B / a" slash syntax) so the same
// colour spelled differently compares equal.
//
// Map mode prints lines sorted by resolved value:
//   <resolved value> \t <context>:<--name>
//
// Diff mode compares the SET of resolved values on each side (names are
// expected to differ across a rename pass; values must not) and reports any
// value present on only one side, with the declarations that carried it.
// Framework-internal properties (--tw-*, --font-*) are ignored.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function collectCssFiles(target) {
  const stats = statSync(target);
  if (stats.isFile()) return target.endsWith(".css") ? [target] : [];
  return readdirSync(target, { recursive: true })
    .map(name => path.join(target, String(name)))
    .filter(file => file.endsWith(".css") && statSync(file).isFile());
}

// --- CSS block parsing (flat: at-rule bodies are walked into) ---------------
function parseBlocks(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  // Tolerant brace walk: record (selector, body) for every innermost block.
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
      if (selector && body.includes("--")) {
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

// --- Evaluation contexts ----------------------------------------------------
// Each context is an ordered list of selector predicates; later entries win.
// A predicate receives one selector from a (possibly comma-separated) rule.
const has = token => s => s.includes(token);
const root = s => s.trim() === ":root" || s.trim() === "html" || s.trim() === ":root, html";
const darkRoot = s => /:root\[data-theme="dark"\]\s*$/.test(s.trim());
const lightShell = s => /\.(admin|shell)-theme\s*$/.test(s) && !s.includes("data-theme");
const darkShell = s => s.includes('[data-theme="dark"]') && /\.(admin|shell)-theme\s*$/.test(s);
const dataChrome = s => s.includes('[data-chrome="dark"]');
const zoneChrome = s => /\.sp-zone-chrome\s*$/.test(s) && !s.includes("data-theme") && !s.includes("login");
const zoneChromeDark = s => s.includes('[data-theme="dark"]') && /\.sp-zone-chrome\s*$/.test(s) && !s.includes("login");
const zoneBase = s => /\.sp-zone-base\s*$/.test(s) && !s.includes("data-theme");
const zoneBaseDark = s => s.includes('[data-theme="dark"]') && /\.sp-zone-base\s*$/.test(s);
const reception = s => /\.reception-theme\s*$/.test(s) && !s.includes("data-theme");
const receptionDark = s => s.includes('[data-theme="dark"]') && /\.reception-theme\s*$/.test(s);
const login = s => /\.login-theme\s*$/.test(s) && !s.includes("data-theme");
const loginDark = s => s.includes('[data-theme="dark"]') && /\.login-theme\s*$/.test(s);
const loginPanel = s => s.includes(".login-theme") && s.includes(".sp-zone-chrome") && !s.includes("data-theme");
const loginPanelDark = s => s.includes('[data-theme="dark"]') && s.includes(".login-theme") && s.includes(".sp-zone-chrome");

const CONTEXTS = {
  "light": [root],
  "dark": [root, darkRoot],
  "light.shell": [root, lightShell],
  "dark.shell": [root, darkRoot, lightShell, darkShell],
  "light.shell.chrome": [root, lightShell, dataChrome, zoneChrome],
  "dark.shell.chrome": [root, darkRoot, lightShell, darkShell, dataChrome, zoneChrome, zoneChromeDark],
  "light.shell.base-island": [root, lightShell, zoneChrome, zoneBase],
  "dark.shell.base-island": [root, darkRoot, lightShell, darkShell, zoneChrome, zoneChromeDark, zoneBase, zoneBaseDark],
  "light.reception": [root, reception],
  "dark.reception": [root, darkRoot, reception, receptionDark],
  "light.login": [root, login],
  "dark.login": [root, darkRoot, login, loginDark],
  "light.login.panel": [root, login, zoneChrome, loginPanel],
  "dark.login.panel": [root, darkRoot, login, loginDark, zoneChrome, zoneChromeDark, loginPanel, loginPanelDark]
};

function buildContextMaps(blocks) {
  const maps = {};
  for (const [name, predicates] of Object.entries(CONTEXTS)) {
    const vars = {};
    for (const predicate of predicates) {
      for (const block of blocks) {
        const selectors = block.selector.split(",").map(s => s.trim());
        if (selectors.some(predicate)) Object.assign(vars, block.vars);
      }
    }
    maps[name] = vars;
  }
  return maps;
}

// --- Resolution and normalisation ------------------------------------------
function resolveValue(value, vars, depth = 0) {
  if (depth > 16 || typeof value !== "string") return value;
  return value.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (whole, name, fallback) => {
    if (name in vars) return resolveValue(vars[name], vars, depth + 1);
    if (fallback !== undefined) return resolveValue(fallback.trim(), vars, depth + 1);
    return `UNRESOLVED(${name})`;
  });
}

function normaliseColours(value) {
  let out = value;
  // #abc / #abcdef -> lowercase rgba
  out = out.replace(/#([0-9a-fA-F]{3})\b/g, (_, h) =>
    `#${h.split("").map(c => c + c).join("")}`);
  out = out.replace(/#([0-9a-fA-F]{6})\b/g, (_, h) => {
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},1)`;
  });
  // rgb()/rgba(), comma or space syntax, optional slash alpha
  out = out.replace(/rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*(?:[,/]\s*([0-9.%]+)\s*)?\)/g,
    (_, r, g, b, a) => {
      let alpha = a === undefined ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
      return `rgba(${Math.round(+r)},${Math.round(+g)},${Math.round(+b)},${+alpha.toFixed(4)})`;
    });
  return out.replace(/\s+/g, " ").trim();
}

function buildMap(target) {
  const files = collectCssFiles(target);
  if (!files.length) {
    console.error("no .css files under " + target);
    process.exit(1);
  }
  const blocks = files.flatMap(file => parseBlocks(readFileSync(file, "utf8")));
  const contexts = buildContextMaps(blocks);
  // entries: normalised resolved value -> Set of "context:--name"
  const entries = new Map();
  for (const [context, vars] of Object.entries(contexts)) {
    for (const [name, raw] of Object.entries(vars)) {
      if (name.startsWith("--tw-") || name.startsWith("--font-")) continue;
      const value = normaliseColours(resolveValue(raw, vars));
      if (!entries.has(value)) entries.set(value, new Set());
      entries.get(value).add(`${context}:${name}`);
    }
  }
  return entries;
}

const args = process.argv.slice(2);
if (args.length === 0 || args.length > 2) {
  console.error("usage: node scripts/css-resolved-map.mjs <file-or-dir> [<file-or-dir-to-diff-against>]");
  process.exit(1);
}

if (args.length === 1) {
  const entries = buildMap(args[0]);
  for (const value of [...entries.keys()].sort()) {
    for (const carrier of [...entries.get(value)].sort()) {
      console.log(`${value}\t${carrier}`);
    }
  }
  process.exit(0);
}

const [mapA, mapB] = args.map(buildMap);
const onlyA = [...mapA.keys()].filter(v => !mapB.has(v)).sort();
const onlyB = [...mapB.keys()].filter(v => !mapA.has(v)).sort();

console.log(`side A (${args[0]}): ${mapA.size} distinct resolved values`);
console.log(`side B (${args[1]}): ${mapB.size} distinct resolved values`);
console.log(`values only on side A: ${onlyA.length}`);
for (const value of onlyA) {
  console.log(`  A-only: ${value}`);
  for (const carrier of [...mapA.get(value)].sort()) console.log(`          ${carrier}`);
}
console.log(`values only on side B: ${onlyB.length}`);
for (const value of onlyB) {
  console.log(`  B-only: ${value}`);
  for (const carrier of [...mapB.get(value)].sort()) console.log(`          ${carrier}`);
}
process.exit(onlyA.length + onlyB.length === 0 ? 0 : 1);
