// Shared loader for behavior tests that need to execute the REAL `lib/*.ts`
// source (not a hand-written copy). It transpiles a TypeScript file in memory
// and imports it as an ES module.
//
// Most `lib/` modules only import types (erased by transpilation), so the
// classic single-file loader used across the older tests is enough. This one
// adds the missing capability: it resolves runtime `@/...` imports by inlining
// each dependency as its own data-URL module, so modules like `lib/validators`,
// `lib/csv`, and `lib/mapLayoutTransform` — which import runtime values such as
// `SEAT_STATUSES` and `normalizePoint` — run against their real dependencies.

import { readFile } from "node:fs/promises";
import ts from "typescript";

// Repo root, two levels up from tests/helpers/.
const ROOT = new URL("../../", import.meta.url);

const COMPILER_OPTIONS = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022
};

// Extensions tried when resolving a bare `@/...` specifier to a file on disk.
const RESOLVE_ORDER = [".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

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

async function transpileToDataUrl(fileUrl, cache) {
  const cached = cache.get(fileUrl.href);
  if (cached) return cached;

  const source = await readFile(fileUrl, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: COMPILER_OPTIONS });

  // Collect runtime `@/...` specifiers from `import ... from "@/..."` and
  // `export ... from "@/..."` statements (type-only imports are already gone).
  const specifiers = new Set();
  for (const match of outputText.matchAll(/\bfrom\s*["'](@\/[^"']+)["']/g)) {
    specifiers.add(match[1]);
  }

  let rewritten = outputText;
  for (const specifier of specifiers) {
    const depUrl = await resolveAlias(specifier);
    const depDataUrl = await transpileToDataUrl(depUrl, cache);
    rewritten = rewritten.split(`"${specifier}"`).join(`"${depDataUrl}"`);
    rewritten = rewritten.split(`'${specifier}'`).join(`'${depDataUrl}'`);
  }

  const dataUrl = `data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`;
  cache.set(fileUrl.href, dataUrl);
  return dataUrl;
}

// Transpile a repo-relative TypeScript module (e.g. "lib/validators.ts") and
// import it, returning its live module namespace.
export async function importTsModule(relativePath) {
  const fileUrl = new URL(relativePath, ROOT);
  const dataUrl = await transpileToDataUrl(fileUrl, new Map());
  return import(dataUrl);
}
