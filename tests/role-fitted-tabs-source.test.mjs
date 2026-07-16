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
  const source = await readFile(new URL("../components/ui/AdminShellBar.tsx", import.meta.url), "utf8");

  // The Viewer exit stays; the redundant active Admin tab is gone.
  assert.match(source, /aria-label="Open viewer surface"/);
  assert.doesNotMatch(source, /aria-current="true"/);
  // The account menu gains no navigation as part of this change.
  assert.doesNotMatch(source, /onSelectSettings/);
});
