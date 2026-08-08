// Shared loader for behavior tests that need to execute the REAL `lib/*.ts`
// source (not a hand-written copy). It transpiles a TypeScript file in memory,
// writes it to a temp .mjs file with an inline source map, and imports it.
//
// Three capabilities beyond a naive transpile-and-import:
//   1. Runtime `@/...` imports are resolved by transpiling each dependency and
//      rewriting the specifier to the dependency's temp-file URL, so modules
//      like `lib/validators`, `lib/csv`, and `lib/mapLayoutTransform` — which
//      import runtime values such as `SEAT_STATUSES` and `normalizePoint` — run
//      against their real dependencies.
//   2. Each module is a real `file://` URL carrying an inline source map that
//      points back at the original `lib/*.ts`, so `c8` (npm run coverage) can
//      attribute V8 coverage to the source file instead of an opaque data: URL.
//      c8 calls fileURLToPath on the executed script's own URL, so it must be a
//      file URL — hence temp files rather than data: URLs.
//   3. Callers can swap framework boundaries ("react", "next/server",
//      "@/lib/supabase/server", ...) for stub module source via
//      `importTsModule(path, { stubs })`, and force a fresh module instance
//      (fresh module-scope state) via `{ fresh: true }` — see importTsModule.

import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

// Repo root, two levels up from tests/helpers/.
const ROOT = new URL("../../", import.meta.url);

const COMPILER_OPTIONS = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  // Emit a source map so c8 can remap coverage back onto the real lib/*.ts file.
  sourceMap: true
};

// Extensions tried when resolving a bare `@/...` specifier to a file on disk.
const RESOLVE_ORDER = [".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

// "abs source path :: stub-config key" -> Promise<file:// URL of the emitted
// temp module>. Process-level so a shared dependency (e.g. lib/types.ts) is
// emitted once per stub configuration and every importer resolves to the same
// module instance and the same coverage source.
const moduleCache = new Map();

// stub source text hash -> Promise<file:// URL>, so identical stub modules
// across tests share one temp file (and one module instance per test file).
const stubFileCache = new Map();

let freshInstanceCounter = 0;

let tempDirPromise;
function getTempDir() {
  if (!tempDirPromise) {
    tempDirPromise = mkdtemp(join(tmpdir(), "sp-tsloader-")).then(dir => {
      process.once("exit", () => {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup; the OS reclaims tmp anyway.
        }
      });
      return dir;
    });
  }
  return tempDirPromise;
}

async function resolveAlias(specifier) {
  const relative = specifier.replace(/^@\//, "");
  for (const suffix of RESOLVE_ORDER) {
    const candidate = new URL(relative + suffix, ROOT);
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Try the next candidate extension.
    }
  }
  throw new Error(`Cannot resolve alias import "${specifier}" under ${ROOT.pathname}`);
}

// Replace TS's file-based `//# sourceMappingURL=...js.map` footer with an inline
// map whose single source is the real .ts path and whose sourcesContent is the
// untouched original. The specifier rewriting only edits columns on import lines
// (no line-count changes), so line-level mappings stay accurate.
function attachInlineSourceMap(code, sourceMapText, absolutePath, originalSource) {
  const withoutFooter = code.replace(/\n?\/\/# sourceMappingURL=.*\s*$/, "\n");
  const map = JSON.parse(sourceMapText);
  map.sources = [absolutePath];
  map.sourcesContent = [originalSource];
  const inlineMap = Buffer.from(JSON.stringify(map)).toString("base64");
  return `${withoutFooter}//# sourceMappingURL=data:application/json;base64,${inlineMap}\n`;
}

async function emitStubModule(stubSource) {
  const hash = createHash("sha1").update(stubSource).digest("hex").slice(0, 12);
  let pending = stubFileCache.get(hash);
  if (!pending) {
    pending = (async () => {
      const dir = await getTempDir();
      const outPath = join(dir, `stub_${hash}.mjs`);
      await writeFile(outPath, stubSource, "utf8");
      return pathToFileURL(outPath).href;
    })();
    stubFileCache.set(hash, pending);
  }
  return pending;
}

async function emitModule(fileUrl, absolutePath, context) {
  const source = await readFile(fileUrl, "utf8");
  const { outputText, sourceMapText } = ts.transpileModule(source, {
    compilerOptions: COMPILER_OPTIONS,
    fileName: absolutePath
  });

  // Collect runtime specifiers from `import ... from "..."` and
  // `export ... from "..."` statements (type-only imports are already gone).
  // Only `@/...` aliases and stubbed specifiers are rewritten; other bare
  // module names are left for Node's own resolution.
  const specifiers = new Set();
  for (const match of outputText.matchAll(/\bfrom\s*["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (context.stubs.has(specifier) || specifier.startsWith("@/")) specifiers.add(specifier);
  }

  let rewritten = outputText;
  for (const specifier of specifiers) {
    let depModuleUrl;
    if (context.stubs.has(specifier)) {
      depModuleUrl = await emitStubModule(context.stubs.get(specifier));
    } else {
      const depUrl = await resolveAlias(specifier);
      depModuleUrl = await transpileToFileUrl(depUrl, context);
    }
    rewritten = rewritten.split(`"${specifier}"`).join(`"${depModuleUrl}"`);
    rewritten = rewritten.split(`'${specifier}'`).join(`'${depModuleUrl}'`);
  }

  const withMap = attachInlineSourceMap(rewritten, sourceMapText, absolutePath, source);
  const dir = await getTempDir();
  const keySuffix = context.key ? `_${context.key}` : "";
  const safeName = `${absolutePath.replace(/[^a-zA-Z0-9]+/g, "_")}${keySuffix}.mjs`;
  const outPath = join(dir, safeName);
  await writeFile(outPath, withMap, "utf8");
  return pathToFileURL(outPath).href;
}

function transpileToFileUrl(fileUrl, context) {
  const absolutePath = fileURLToPath(fileUrl);
  const cacheKey = `${absolutePath}::${context.key}`;
  let pending = moduleCache.get(cacheKey);
  if (!pending) {
    pending = emitModule(fileUrl, absolutePath, context);
    moduleCache.set(cacheKey, pending);
  }
  return pending;
}

function buildContext(options = {}) {
  const stubs = new Map(Object.entries(options.stubs ?? {}));
  const parts = [];
  if (stubs.size > 0) {
    const stubDigest = createHash("sha1")
      .update(JSON.stringify([...stubs.entries()].sort(([a], [b]) => a.localeCompare(b))))
      .digest("hex")
      .slice(0, 12);
    parts.push(stubDigest);
  }
  // fresh: true bypasses the module cache so the import gets its OWN module
  // instance — needed to reset module-scope state (e.g. the session
  // middleware's JWKS memo) between tests. Coverage still merges: every
  // instance's inline source map points at the same lib/*.ts file.
  if (options.fresh) parts.push(`fresh${freshInstanceCounter++}`);
  return { stubs, key: parts.join("_") };
}

// Transpile a repo-relative TypeScript module (e.g. "lib/validators.ts") and
// import it, returning its live module namespace.
//
// options.stubs maps import specifiers — bare ("react", "next/server") or
// aliased ("@/lib/supabase/server") — to replacement ESM source text, so
// framework-coupled server modules can run with their boundaries swapped for
// controllable doubles (the node-tier analogue of renderComponent.mjs's
// bundle-time swaps). Stubs apply through the whole `@/` dependency chain.
export async function importTsModule(relativePath, options = {}) {
  const moduleUrl = await transpileToFileUrl(new URL(relativePath, ROOT), buildContext(options));
  return import(moduleUrl);
}
