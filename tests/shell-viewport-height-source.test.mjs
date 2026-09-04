import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Every route in app/(shell) renders inside the persistent shell's content
// pane (redesign-v2 PR 2): the 48px header is position:fixed and the pane —
// a flex column padded by the header height, viewport-height at lg — is what
// sizes the page. A page root sized min-h-screen (100vh) therefore overflows
// the document by exactly the chrome height, showing a permanent scrollbar
// even when the content fits — the /admin map page shipped that way once
// already. Shell page roots that want a full-height pane fill the flex pane
// (`flex min-h-0 flex-1`), never size themselves from the viewport.
// Root-level app/error.tsx, app/loading.tsx and app/not-found.tsx render
// outside the shell layout and are deliberately NOT scanned here.

const shellDir = fileURLToPath(new URL("../app/(shell)", import.meta.url));

async function collectTsx(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectTsx(full)));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

test("no shell-group file sizes a pane with min-h-screen (overflows past the 40px chrome bar)", async () => {
  const files = await collectTsx(shellDir);
  assert.ok(files.length >= 5, `expected the shell route group's tsx files, found ${files.length}`);
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/min-h-screen/.test(source)) {
      offenders.push(path.relative(shellDir, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these shell files use min-h-screen under the fixed shell header (fill the pane with flex min-h-0 flex-1): ${offenders.join(", ")}`
  );
});

test("the /admin map wrapper fills the shell pane instead of sizing from the viewport", async () => {
  const source = await readFile(path.join(shellDir, "admin", "page.tsx"), "utf8");
  assert.match(source, /className="flex min-h-0 flex-1 flex-col bg-\[var\(--sp-background\)\]/);
  assert.doesNotMatch(source, /100svh|100vh|--sp-chrome-height/);
});

// The document itself must never scroll on desktop shell routes — the viewer
// map is the reference (no window scrollbar even at 200% zoom). Long content
// scrolls inside a focusable region instead (MapStatusBand precedent:
// tabIndex={0} + aria-label, or the region is unreachable by keyboard —
// axe scrollable-region-must-be-focusable).
const SCROLL_PAGES = [
  ["admin/management/page.tsx", path.join(shellDir, "admin", "management", "page.tsx")],
  ["admin/settings/page.tsx", path.join(shellDir, "admin", "settings", "page.tsx")],
  ["reception/page.tsx", path.join(shellDir, "reception", "page.tsx")]
];

for (const [label, file] of SCROLL_PAGES) {
  test(`${label} pins its pane to the viewport at lg and scrolls internally`, async () => {
    const source = await readFile(file, "utf8");
    assert.match(source, /className="flex min-h-0 flex-1 flex-col [^"]*lg:overflow-hidden"/, "root pane must fill the shell's viewport-height flex pane at lg");
    assert.doesNotMatch(source, /--sp-chrome-height/, "retired group-2 token");
    assert.match(source, /lg:overflow-hidden/, "root pane must clip — the document never scrolls at lg");
    assert.match(source, /lg:overflow-y-auto/, "content must scroll in an internal region at lg");
    const scroller = source.match(/<div[^>]*lg:overflow-y-auto[^>]*>/s) ?? source.match(/<div[^>]*tabIndex=\{0\}[^>]*>/s);
    assert.ok(scroller, "internal scroll region present");
    assert.match(scroller[0], /tabIndex=\{0\}/, "scroll region must be keyboard-focusable");
    assert.match(scroller[0], /aria-label=/, "focusable scroll region needs an accessible name");
  });
}
