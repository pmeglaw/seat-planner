#!/usr/bin/env node
// Weigh the client JavaScript this app ships, per route.
//
// Why this exists: Next 16's Turbopack build prints a route table with NO
// "First Load JS" column, so the number everyone reaches for is simply not
// there any more. The data still is — it just has to be read out of the build
// artifacts. This does that, and reports gzip alongside raw because gzip is
// what actually crosses the wire.
//
// Two numbers, and they answer different questions:
//   - shared baseline: framework + runtime every route pays before its own code
//   - per-route client modules: what that route's "use client" tree drags in
// Neither is a browser measurement. Chunks can be prefetched, cached, or split
// across navigations, so treat this as "what the build produced" and use
// measure-runtime.mjs when the question is "what did the user wait for".
//
// Usage:
//   node .claude/skills/web-app-performance/scripts/measure-bundle.mjs
//   node .../measure-bundle.mjs --json > before.json     # then diff after a change
//   node .../measure-bundle.mjs --top 15                 # more chunk detail

import { readFileSync, existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const topN = Number(args[args.indexOf("--top") + 1]) || 8;
const root = process.cwd();
const nextDir = path.join(root, ".next");

if (!existsSync(nextDir)) {
  console.error(
    `No .next/ in ${root}. Build first — the app needs Supabase env vars present, but not real ones:\n\n` +
      `  NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co \\\n` +
      `  NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon-key \\\n` +
      `  npm run build\n`
  );
  process.exit(1);
}

const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`;

/** Walk a directory tree, returning absolute paths of files matching `ext`. */
async function walk(dir, ext, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, ext, out);
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

const sizeCache = new Map();
/** Raw + gzip bytes for a file, memoized — chunks are shared across routes. */
function sizeOf(file) {
  if (sizeCache.has(file)) return sizeCache.get(file);
  let entry = { raw: 0, gzip: 0 };
  try {
    entry = { raw: statSync(file).size, gzip: gzipSync(readFileSync(file)).length };
  } catch {
    /* a manifest can name a chunk that isn't on disk; count it as zero */
  }
  sizeCache.set(file, entry);
  return entry;
}

/** Manifest chunk paths look like "/_next/static/chunks/x.js"; map to disk. */
function chunkToFile(chunk) {
  const rel = chunk.replace(/^\/?_next\//, "").replace(/^\//, "");
  return path.join(nextDir, rel);
}

function totalOf(chunks) {
  let raw = 0;
  let gzip = 0;
  for (const chunk of chunks) {
    const { raw: r, gzip: g } = sizeOf(chunkToFile(chunk));
    raw += r;
    gzip += g;
  }
  return { raw, gzip };
}

// --- shared baseline: what every route pays before its own code -------------
// build-manifest.json survives across Next versions even as the route table
// comes and goes, so this part is the most durable thing here.
let shared = { raw: 0, gzip: 0, chunks: [] };
const buildManifestPath = path.join(nextDir, "build-manifest.json");
if (existsSync(buildManifestPath)) {
  const manifest = JSON.parse(readFileSync(buildManifestPath, "utf8"));
  const chunks = [
    ...(manifest.rootMainFiles ?? []),
    ...(manifest.polyfillFiles ?? [])
  ].filter(chunk => chunk.endsWith(".js"));
  shared = { ...totalOf(chunks), chunks };
}
const sharedChunkSet = new Set(shared.chunks.map(chunk => chunk.replace(/^\/?_next\//, "")));

// --- per-route client modules ----------------------------------------------
// Each route's *_client-reference-manifest.js assigns `globalThis.__RSC_MANIFEST[route]`
// an object whose clientModules[].chunks list the JS that route's client tree
// needs. Parsing the assignment is more stable than importing the file, which
// expects a browser-ish global to exist.
const routes = [];
for (const file of await walk(path.join(nextDir, "server", "app"), "_client-reference-manifest.js")) {
  const source = readFileSync(file, "utf8");
  const match = source.match(/globalThis\.__RSC_MANIFEST\[(?:"|')(.*?)(?:"|')\]\s*=\s*(\{[\s\S]*?\});?\s*$/);
  if (!match) continue;
  let manifest;
  try {
    manifest = JSON.parse(match[2]);
  } catch {
    continue; // format drifted — the shared baseline above is still valid
  }
  const chunks = new Set();
  for (const mod of Object.values(manifest.clientModules ?? {})) {
    for (const chunk of mod.chunks ?? []) if (chunk.endsWith(".js")) chunks.add(chunk);
  }
  if (chunks.size === 0) continue; // a route handler ships no client JS
  // Turbopack currently emits route chunks disjoint from rootMainFiles, so a
  // route's first load is shared + route. Subtracting the intersection instead
  // of assuming it's empty keeps the total honest if that ever changes.
  const own = [...chunks].filter(chunk => !sharedChunkSet.has(chunk.replace(/^\/?_next\//, "")));
  const ownSize = totalOf(own);
  routes.push({
    route: match[1],
    chunkCount: own.length,
    ...ownSize,
    firstLoad: { raw: ownSize.raw + shared.raw, gzip: ownSize.gzip + shared.gzip }
  });
}
routes.sort((a, b) => b.firstLoad.gzip - a.firstLoad.gzip);

// --- everything on disk: the floor nothing can hide under -------------------
const allChunks = await walk(path.join(nextDir, "static"), ".js");
const chunkSizes = allChunks
  .map(file => ({ file: path.relative(nextDir, file), ...sizeOf(file) }))
  .sort((a, b) => b.gzip - a.gzip);
const diskTotal = chunkSizes.reduce(
  (acc, chunk) => ({ raw: acc.raw + chunk.raw, gzip: acc.gzip + chunk.gzip }),
  { raw: 0, gzip: 0 }
);

if (asJson) {
  console.log(
    JSON.stringify(
      { buildId: readFileSync(path.join(nextDir, "BUILD_ID"), "utf8").trim(), shared, routes, diskTotal, chunks: chunkSizes },
      null,
      2
    )
  );
  process.exit(0);
}

const routeWidth = Math.max(24, ...routes.map(r => r.route.length));
console.log(`\nClient JS — build ${readFileSync(path.join(nextDir, "BUILD_ID"), "utf8").trim()}\n`);
console.log(`Shared baseline (every route pays this first): ${kb(shared.gzip)} gzip / ${kb(shared.raw)} raw`);
console.log(`All of .next/static:                           ${kb(diskTotal.gzip)} gzip / ${kb(diskTotal.raw)} raw across ${chunkSizes.length} files\n`);

console.log(`Per route, gzip. "first load" = shared baseline + that route's own chunks.`);
console.log(`Routes also share chunks with EACH OTHER, so these columns do not sum to the disk total.`);
console.log(`${"route".padEnd(routeWidth)}   ${"first load".padStart(10)} ${"own".padStart(9)}  chunks`);
console.log("-".repeat(routeWidth + 34));
for (const r of routes) {
  console.log(
    `${r.route.padEnd(routeWidth)}   ${kb(r.firstLoad.gzip).padStart(10)} ${kb(r.gzip).padStart(9)}  ${r.chunkCount}`
  );
}

console.log(`\nLargest chunks (top ${topN})`);
for (const chunk of chunkSizes.slice(0, topN)) {
  console.log(`  ${kb(chunk.gzip).padStart(8)} gzip  ${kb(chunk.raw).padStart(8)} raw  ${chunk.file}`);
}
console.log(
  `\nA chunk you can't identify: grep it for a distinctive string from the component you suspect,\n` +
    `e.g. rg -l "computeCodePillNudges" .next/static/chunks — that tells you which route pulled it in.\n`
);
