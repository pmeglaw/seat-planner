#!/usr/bin/env node
// Dangling custom-property audit over emitted CSS (PASS1 rename verification).
//
// Usage: node scripts/css-dangling-refs.mjs <file-or-dir> [...more]
//   e.g. after `npm run build`:  node scripts/css-dangling-refs.mjs .next/static/chunks
//
// Collects every custom property DEFINED (`--x:`) and every one REFERENCED
// (`var(--x`) across all given .css files, then reports references that have
// no definition anywhere in the set. A reference with a fallback
// (`var(--x, y)`) still counts as a reference — a fallback that is always
// taken usually means a renamed or deleted token was left behind.
//
// Exit code: 0 when no dangling references, 1 otherwise (or on bad input).

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/css-dangling-refs.mjs <file-or-dir> [...more]");
  process.exit(1);
}

function collectCssFiles(target) {
  const stats = statSync(target);
  if (stats.isFile()) return target.endsWith(".css") ? [target] : [];
  return readdirSync(target, { recursive: true })
    .map(name => path.join(target, String(name)))
    .filter(file => file.endsWith(".css") && statSync(file).isFile());
}

const files = args.flatMap(collectCssFiles);
if (files.length === 0) {
  console.error("no .css files found under: " + args.join(", "));
  process.exit(1);
}

const defined = new Set();
const referenced = new Map(); // name -> Set of files

// Tailwind-internal plumbing: `--tw-shadow-colored` definitions reference
// `--tw-shadow-color`, which Tailwind only defines when a shadow-color
// utility is used. Framework artifact, not an app token — ignored.
const isFrameworkInternal = name => name.startsWith("--tw-");

for (const file of files) {
  const css = readFileSync(file, "utf8");
  for (const match of css.matchAll(/--[a-zA-Z0-9_-]+(?=\s*:)/g)) {
    defined.add(match[0]);
  }
  for (const match of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
    if (!referenced.has(match[1])) referenced.set(match[1], new Set());
    referenced.get(match[1]).add(path.basename(file));
  }
}

const dangling = [...referenced.keys()]
  .filter(name => !defined.has(name) && !isFrameworkInternal(name))
  .sort();

console.log(`files scanned: ${files.length}`);
console.log(`properties defined: ${defined.size}`);
console.log(`properties referenced: ${referenced.size}`);
console.log(`dangling references: ${dangling.length}`);
for (const name of dangling) {
  console.log(`  ${name}  (referenced in: ${[...referenced.get(name)].join(", ")})`);
}
process.exit(dangling.length === 0 ? 0 : 1);
