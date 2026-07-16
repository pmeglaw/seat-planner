import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Session-layer guardrails (2026-07-16 detail critique, action 1): once a
// sign-out affordance exists, it must stay reachable from every signed-in
// surface, work without JavaScript, and never linger on a page that already
// knows the user is signed in. These pin the SHAPE of the session layer —
// visual styling of the menu/chips is free to evolve.

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("sign-out is a real POST route that ends the Supabase session", async () => {
  const source = await readSource("../app/auth/signout/route.ts");

  // POST-only: sign-out mutates auth state, so it must not be reachable via
  // simple GET links/prefetches.
  assert.match(source, /export async function POST/);
  assert.doesNotMatch(source, /export async function GET/);
  assert.match(source, /supabase\.auth\.signOut\(\)/);
  // 303 turns the form POST into a GET of /login after the session ends.
  assert.match(source, /\/login/);
  assert.match(source, /303/);
});

test("the account menu shows identity and hosts a no-JS sign-out form", async () => {
  const source = await readSource("../components/ui/AccountMenu.tsx");

  // Identity is finally displayed somewhere: the menu leads with the signed-in
  // email and role label.
  assert.match(source, /\{email\}/);
  assert.match(source, /\{roleLabel\}/);
  // The trigger is a labeled menu button, not a decorative avatar.
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /role="menu"/);
  assert.match(source, /role="menuitem"/);
  // Sign-out submits a real form so it works before hydration / without JS.
  assert.match(source, /<form action="\/auth\/signout" method="post"/);
  assert.match(source, /Sign out/);
  // Menu close restores focus to the trigger (same contract as the map menus).
  assert.match(source, /returnFocusAfterClose/);
});

test("every signed-in chrome bar mounts the account menu", async () => {
  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  const shellBar = await readSource("../components/ui/AdminShellBar.tsx");
  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  assert.match(seatMap, /<AccountMenu/);
  assert.match(shellBar, /<AccountMenu/);
  assert.match(viewer, /<AccountMenu/);
});

test("the login page recognizes an existing session instead of re-asking for credentials", async () => {
  const source = await readSource("../app/login/page.tsx");

  assert.match(source, /supabase\.auth\.getUser\(\)/);
  // Signed-in visitors get a continue/sign-out card, not the credential form.
  assert.match(source, /Continue to seat map/);
  assert.match(source, /<form action="\/auth\/signout" method="post"/);
});
