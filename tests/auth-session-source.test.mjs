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

test("every signed-in surface mounts an identity + sign-out affordance", async () => {
  const shellLayout = await readSource("../app/(shell)/layout.tsx");
  const appShell = await readSource("../components/ui/AppShell.tsx");
  const rail = await readSource("../components/ui/AppRail.tsx");
  const mapPage = await readSource("../app/(shell)/admin/page.tsx");
  const managementPage = await readSource("../app/(shell)/admin/management/page.tsx");
  const settingsPage = await readSource("../app/(shell)/admin/settings/page.tsx");
  const receptionPage = await readSource("../app/(shell)/reception/page.tsx");
  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  // Nav-lag fix (persistent shell): the rail — which carries the identity +
  // sign-out cell (same real <form action="/auth/signout" method="post">
  // contract as the old shared AccountMenu; tests/app-rail.test.mjs is the
  // source of truth for the cell's shape) — mounts ONCE in the (shell)
  // layout's AppShell and covers every railed surface: the map, both admin
  // sub-pages, and reception. The semantic this test has always guarded is
  // unchanged: SOME identity + sign-out affordance on every signed-in
  // surface. The pages must NOT mount a second rail of their own (that
  // per-page mounting was the blank-flash bug), and the viewer surface still
  // mounts the shared AccountMenu directly.
  assert.match(shellLayout, /<AppShell/);
  assert.match(appShell, /<AppRail/);
  assert.match(rail, /<form action="\/auth\/signout" method="post"/);
  for (const page of [mapPage, managementPage, settingsPage, receptionPage]) {
    assert.doesNotMatch(page, /<AppRail/);
  }
  assert.doesNotMatch(seatMap, /<AppRail/);
  assert.match(viewer, /<AccountMenu/);
});

test("the proxy matcher covers every auth-bearing route", async () => {
  const source = await readSource("../proxy.ts");

  // Next 16 renamed the root `middleware.ts` convention to `proxy.ts`; the
  // export is `proxy` and the old name only survives as a deprecation
  // warning, so pin both or a half-done rename boots with no session layer
  // at all (the file would simply never run).
  assert.match(source, /export async function proxy\(/);

  // The matcher is an explicit allowlist now (nav-lag fix): dropping a route
  // from it silently stops session-cookie refresh there — sessions would
  // quietly expire mid-use with no other failing test. Pin each surface the
  // session layer serves. (/api/build-id and static assets are deliberately
  // NOT matched — the deploy-skew probe is unauthenticated and data-free.)
  const matcherArray = source.match(/matcher: \[([^\]]*)\]/)?.[1] ?? "";
  for (const route of ['"/"', '"/admin/:path*"', '"/reception"', '"/login"', '"/auth/:path*"']) {
    assert.ok(matcherArray.includes(route), `proxy matcher must include ${route}`);
  }
  // The deploy-skew probe stays out: auth work on /api/build-id was pure
  // latency on a data-free, unauthenticated endpoint.
  assert.ok(!matcherArray.includes("build-id"), "matcher must not cover /api/build-id");
});

test("the login page recognizes an existing session instead of re-asking for credentials", async () => {
  const source = await readSource("../app/login/page.tsx");

  assert.match(source, /supabase\.auth\.getUser\(\)/);
  // Signed-in visitors get a continue/sign-out card, not the credential form.
  assert.match(source, /Continue to seat map/);
  assert.match(source, /<form action="\/auth\/signout" method="post"/);
});
