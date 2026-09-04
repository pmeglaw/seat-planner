import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Role-fitted surface tabs (2026-07-16 regrade, review 2): the Viewer/Admin
// tab pair is admin equipment. Non-admin staff must never see a lone dead
// "Viewer" tab, the top bar carries no competing section nav, and the
// account menu stays a session layer with no navigation items.

test("the viewer carries no surface tabs of its own — the shell's role-fitted links replaced them", async () => {
  const source = await readFile(new URL("../components/seat-map/ViewerSeatFinder.tsx", import.meta.url), "utf8");

  // Redesign-v2 PR 2: the Viewer/Admin tab pair (admin equipment) retired
  // with the viewer's header; the shell header's Seat map link is role-fitted
  // (shellNavConfig), so a viewer never sees a dead "Admin" destination.
  assert.doesNotMatch(source, /showAdminShortcut/);
  assert.doesNotMatch(source, /aria-label="Open admin surface"/);
});

test("the shell header's section links are role-fitted: admin-only sections never render for viewers", async () => {
  const navConfigSource = await readFile(new URL("../components/ui/shellNavConfig.ts", import.meta.url), "utf8");
  const shellBarSource = await readFile(new URL("../components/ui/AppTopBar.tsx", import.meta.url), "utf8");

  // Redesign-v2 PR 2: ONE section nav in the header (Seat map · Reception ·
  // Management · Settings), filtered by role in shellNavConfig — Management
  // and Settings are adminOnly, and the map link lands admins on the draft
  // and everyone else on the published map. The Account panel stays a
  // session layer with no promoted Settings entry.
  assert.match(navConfigSource, /id: "management"[^\n]*adminOnly: true/);
  assert.match(navConfigSource, /id: "settings"[^\n]*adminOnly: true/);
  assert.match(navConfigSource, /id: "map", label: "Seat map", href: isAdmin => \(isAdmin \? "\/admin" : "\/"\)/);
  assert.match(navConfigSource, /filter\(link => isAdmin \|\| !link\.adminOnly\)/);
  assert.match(shellBarSource, /<nav className="cds-header-nav" aria-label="Sections">/);
  assert.match(shellBarSource, /aria-current=\{link\.id === active \? "page" : undefined\}/);
  assert.doesNotMatch(shellBarSource, /onSelectSettings/);
});
