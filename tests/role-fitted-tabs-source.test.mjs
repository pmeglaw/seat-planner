import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Role-fitted surface tabs (2026-07-16 regrade, review 2): the Viewer/Admin
// tab pair is admin equipment. Non-admin staff must never see a lone dead
// "Viewer" tab, the sub-page bar carries exactly one orange underline, and
// the account menu stays a session layer with no navigation items.

test("the viewer's surface tabs render only for admins", async () => {
  const source = await readFile(new URL("../components/seat-map/ViewerSeatFinder.tsx", import.meta.url), "utf8");

  // The whole tab group (including the active Viewer span) is gated.
  assert.match(source, /\{showAdminShortcut && \(\s*\r?\n\s*<div className="flex h-full items-center">\s*\r?\n\s*<span\s*\r?\n\s*aria-current="page"/);
});

test("the sub-page bar keeps one underline and one cross-surface exit", async () => {
  const railSource = await readFile(new URL("../components/ui/AppRail.tsx", import.meta.url), "utf8");
  const shellBarSource = await readFile(new URL("../components/ui/AdminShellBar.tsx", import.meta.url), "utf8");

  // v12 (2026-07-31 rail shell, Task 3): the "one cross-surface exit"
  // semantic now lives in the rail, not the sub-page bar — AppRail's Viewer
  // item is the one cross-surface exit on every admin surface.
  assert.match(railSource, /aria-label="Open viewer surface"/);

  // The one-underline hazard (a redundant active Admin tab fighting a section
  // nav's underline) is structurally gone: AdminShellBar carries no section
  // nav, no Viewer link, and no account menu at all anymore — navigation and
  // account controls live in the rail exclusively. Assert their absence.
  assert.doesNotMatch(shellBarSource, /<nav/);
  assert.doesNotMatch(shellBarSource, /aria-label="Open viewer surface"/);
  assert.doesNotMatch(shellBarSource, /aria-current="true"/);
  assert.doesNotMatch(shellBarSource, /<AccountMenu/);
  assert.doesNotMatch(shellBarSource, /onSelectSettings/);
});
