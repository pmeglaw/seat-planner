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

test("the Account panel shows identity and hosts a no-JS sign-out form", async () => {
  const source = await readSource("../components/ui/ShellPanels.tsx");

  // Identity is displayed: the panel leads with the signed-in email and the
  // role tag (redesign-v2 PR 2 — the Account panel replaced the menu).
  assert.match(source, /\{email\} <span className="cds-tag">\{roleLabel\}<\/span>/);
  // The trigger is the header's labelled Account utility (aria-expanded +
  // aria-controls to this panel); the panel is a complementary landmark.
  assert.match(source, /<aside id=\{`shell-panel-\$\{open\}`\} className="sp-panel" aria-labelledby=/);
  // Sign-out submits a real form so it works before hydration / without JS.
  assert.match(source, /<form action="\/auth\/signout" method="post"/);
  assert.match(source, /Sign out/);
  // Panel close returns focus to the trigger — AppShell's closePanel does it.
  const appShell = await readSource("../components/ui/AppShell.tsx");
  assert.match(appShell, /focusTrigger\(`\[aria-controls="shell-panel-\$\{current\}"\]`\)/);
});

test("every signed-in surface mounts an identity + sign-out affordance", async () => {
  const shellLayout = await readSource("../app/(shell)/layout.tsx");
  const appShell = await readSource("../components/ui/AppShell.tsx");
  const topBar = await readSource("../components/ui/AppTopBar.tsx");
  const shellPanels = await readSource("../components/ui/ShellPanels.tsx");
  const mapPage = await readSource("../app/(shell)/admin/page.tsx");
  const managementPage = await readSource("../app/(shell)/admin/management/page.tsx");
  const settingsPage = await readSource("../app/(shell)/admin/settings/page.tsx");
  const receptionPage = await readSource("../app/(shell)/reception/page.tsx");
  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  // Nav-lag fix (persistent shell) + top-bar-first chrome (2026-08-14): the
  // chrome — AppTopBar carrying the shared AccountMenu (real
  // <form action="/auth/signout" method="post"> contract) plus the rail —
  // mounts ONCE in the (shell) layout's AppShell and covers every shell
  // surface: the map, both admin sub-pages, and reception. The semantic this
  // test has always guarded is unchanged: SOME identity + sign-out
  // affordance on every signed-in surface. The pages must NOT mount a second
  // rail or bar of their own (that per-page mounting was the blank-flash
  // bug), and the viewer surface still mounts the shared AccountMenu
  // directly.
  // Redesign-v2 PR 2: the Phase 3 shell — AppTopBar (Account utility) +
  // ShellPanels (the Account panel hosts the real POST sign-out form) —
  // mounts ONCE in AppShell. Pages and SeatMap must not mount a second
  // header or panel host of their own.
  assert.match(shellLayout, /<AppShell/);
  assert.match(appShell, /<AppTopBar/);
  assert.match(appShell, /<ShellPanels/);
  assert.match(topBar, /aria-label=\{utility\.label\}/);
  assert.match(shellPanels, /<form action="\/auth\/signout" method="post"/);
  for (const page of [mapPage, managementPage, settingsPage, receptionPage]) {
    assert.doesNotMatch(page, /<AppTopBar|<ShellPanels|<LeftPanel/);
  }
  assert.doesNotMatch(seatMap, /<AppTopBar|<ShellPanels|<LeftPanel/);
  // The viewer lives under the shell too now (route-group move, owner
  // confirmation 2026-09-03): no chrome of its own, it registers with the
  // shell instead.
  assert.doesNotMatch(viewer, /<AppTopBar|<ShellPanels|<LeftPanel|<AccountMenu|<ThemeToggle/);
  assert.match(viewer, /useAppShellFilters\(/);
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
  for (const route of ['"/"', '"/my-seat"', '"/admin/:path*"', '"/reception"', '"/login"', '"/auth/:path*"']) {
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
