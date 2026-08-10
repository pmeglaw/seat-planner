import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { assignLocation } = await importTsModule("lib/fullNavigation.ts");

// lib/fullNavigation.ts is the sanctioned full-document-navigation escape
// hatch. The jsdom component tests swap the whole module at bundle time, so
// nothing there executes the real implementation — this does.

test("assignLocation performs a full document load via window.location.assign", (t) => {
  const assigned = [];
  const hadWindow = "window" in globalThis;
  const savedWindow = globalThis.window;
  globalThis.window = { location: { assign: (href) => assigned.push(href) } };
  t.after(() => {
    if (hadWindow) globalThis.window = savedWindow;
    else delete globalThis.window;
  });

  assignLocation("/admin?next=1");

  assert.deepEqual(assigned, ["/admin?next=1"]);
});

// Whole-source matcher for a runtime dependency on the module: any static
// `from "@/lib/fullNavigation"` (either quote style, newlines or block
// comments between `from` and the specifier) or a dynamic
// `import("@/lib/fullNavigation")`. \s spans newlines, so multiline import
// layouts cannot slip past a line-based scan.
//
// The comment arm is the unrolled `/* ... */` form, not the obvious
// `(?:\/\*[\s\S]*?\*\/\s*)*`. A lazy `[\s\S]*?` inside an outer `*` lets one
// run of comments be split many ways, so a near-miss input like `/*//*//*…`
// backtracks exponentially before failing (CodeQL js/redos, alert #7). Here
// each comment has exactly one parse: body chars, then stars, then any
// `non-slash + more stars` continuation, then the closing `/`. Unbounded
// repetition of whole comments is kept — that is what the two-comment fixture
// below pins.
const FULL_NAVIGATION_IMPORT = /\bfrom\s*(?:\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/\s*)*(['"])@\/lib\/fullNavigation\1|\bimport\s*\(\s*(['"])@\/lib\/fullNavigation\2\s*\)/;

test("the import matcher catches every formatting a caller could use", () => {
  const fixtures = [
    'import { assignLocation } from "@/lib/fullNavigation";',
    "import { assignLocation } from '@/lib/fullNavigation';",
    'import {\n  assignLocation\n} from "@/lib/fullNavigation";',
    'import { assignLocation }\n  from\n  "@/lib/fullNavigation";',
    'import { assignLocation } from /* legacy seam */ "@/lib/fullNavigation";',
    'import { assignLocation } from /* one */ /* two */ "@/lib/fullNavigation";',
    'import { assignLocation } from /* star * inside */ "@/lib/fullNavigation";',
    'export { assignLocation } from "@/lib/fullNavigation";',
    'const nav = await import("@/lib/fullNavigation");'
  ];
  for (const fixture of fixtures) {
    assert.match(fixture, FULL_NAVIGATION_IMPORT, `matcher must catch: ${JSON.stringify(fixture)}`);
  }
  // Prose mentions of the path are not imports and must not count.
  assert.doesNotMatch('// see @/lib/fullNavigation for the contract', FULL_NAVIGATION_IMPORT);
});

test("the sanctioned-caller list stays accurate: only the documented modules import assignLocation", async () => {
  // The module comment names the sanctioned callers (auth landings + AppRail's
  // skew fallback and stalled-nav watchdog). A new importer is a new
  // full-document navigation — the #333 blank-flash class — and must be a
  // deliberate decision, so this enumerates the real import sites by scanning
  // whole file contents (not lines) with the matcher proven above.
  const { readdir } = await import("node:fs/promises");
  const ROOT = new URL("../", import.meta.url);
  const importers = [];
  for (const dir of ["app", "components", "lib"]) {
    const entries = await readdir(new URL(dir, ROOT), { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) continue;
      const relativeDir = entry.parentPath.slice(new URL(dir, ROOT).pathname.length).replace(/^\//, "");
      const relativePath = [dir, relativeDir, entry.name].filter(Boolean).join("/");
      const source = await readFile(new URL(relativePath, ROOT), "utf8");
      if (FULL_NAVIGATION_IMPORT.test(source)) importers.push(relativePath);
    }
  }
  assert.deepEqual(importers.sort(), [
    "components/auth/LoginForm.tsx",
    "components/auth/UpdatePasswordForm.tsx",
    "components/seat-map/SeatMap.tsx",
    "components/ui/AppRail.tsx"
  ]);
});

test("copy contract: the shared publish-impact note reassures about the draft/published split", async () => {
  // lib/copy.ts is the one shared user-facing sentence for pure-generic
  // publish-impact reassurance; dialogs with action-specific warnings keep
  // their own wording (pinned by the destructive-action safety tests).
  const { PUBLISH_IMPACT_NOTE } = await importTsModule("lib/copy.ts");
  // The exact approved sentence: this constant IS the single shared phrasing
  // (its whole reason to exist), so the test pins it verbatim — substring
  // checks would accept copy that loses the two-layer reassurance (e.g.
  // "unpublished" satisfying /published/). Changing the copy is a deliberate
  // decision that updates this line with it.
  assert.equal(PUBLISH_IMPACT_NOTE, "Viewers keep seeing the published map until you publish this draft.");
  const source = await readFile(new URL("../lib/copy.ts", import.meta.url), "utf8");
  assert.match(source, /export const PUBLISH_IMPACT_NOTE/);
});
