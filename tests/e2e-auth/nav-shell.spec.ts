import { test, expect, type Page } from "@playwright/test";
import { retryUntilVisible, SEEDED_ADMIN_EMAIL, signIn } from "./auth-helpers";

// Regression guard for the nav-lag fix (#333): rail navigation must be
// client-side inside the persistent shell. The bug this pins against: every
// page mounted its own rail, so each section change unmounted the whole
// chrome into a full-screen loading wash (and one guard path issued a real
// window.location.assign) — reading as a 0.5–2s blank "reload" per click.
//
// Three invariants, asserted against the real built app with a real session:
//   1. ZERO full-document requests while navigating between all four rail
//      sections — every transition rides the client router (RSC fetches
//      only). A document request here means a hard reload crept back in
//      (watchdog misfire, skew false-positive, or a bare <a>/location.assign
//      on the normal path).
//   2. The rail is ONE persistent DOM node across every transition — an
//      expando property survives re-renders but not a remount or document
//      load, so it distinguishes "the same mounted rail updated" from "a new
//      rail that merely looks the same".
//   3. The expanded overlay drawer closes on navigation instead of lingering
//      over the incoming page (the pre-shell rail got this for free by
//      unmounting; the persistent rail must do it deliberately).
//
// Deliberately NOT asserted: router-cache revisit counts (staleTimes) — cache
// hits are timing-dependent and belong to next.config.js, not to the shell
// contract — and skew behavior, which is driven through the injected detector
// seam in tests/app-rail.test.mjs / tests/app-shell.test.mjs.
// Every rail section, in the order both laps walk them. Each probe is the
// page's skip-link landing marker (zero-height, hence attached rather than
// visible). The lap ends on "Seat map" so it returns to /admin, leaving the
// measured pass starting from the same place the warm lap did.
//
// `heading` exists because the probe alone cannot fence a route commit on the
// two admin subpages: BOTH render id="admin-subpage-main" (management/page.tsx,
// settings/page.tsx), so waiting for it attached on the Management -> Settings
// hop can be satisfied by the page being navigated AWAY from, and the loop then
// races ahead of a navigation that has not committed. Their <h1> is
// route-unique and only exists once the target page is on screen. Reception and
// Seat map need no heading — their probes are already unique to one route.
const SECTIONS = [
  { title: "Management", path: "/admin/management", probe: "#admin-subpage-main", heading: "Management" },
  { title: "Settings", path: "/admin/settings", probe: "#admin-subpage-main", heading: "Settings" },
  { title: "Reception", path: "/reception", probe: "#reception-main", heading: null },
  { title: "Seat map", path: "/admin", probe: "#planning-canvas", heading: null }
];

// Click a rail section and wait until it has actually COMMITTED — URL, then the
// landing marker, then (where the marker is ambiguous) route-unique content.
async function navigateToSection(page: Page, section: (typeof SECTIONS)[number]) {
  await page.locator(`#app-rail a[title="${section.title}"]`).click();
  await page.waitForURL(url => url.pathname === section.path);
  await page.waitForSelector(section.probe, { state: "attached" });
  if (section.heading) {
    await expect(page.getByRole("heading", { level: 1, name: section.heading })).toBeVisible();
  }
}

test("rail navigation is client-side: zero document loads, one persistent rail", async ({ page }) => {
  test.setTimeout(120_000);

  // signIn lands on "/" (the login form's default next path); the hop to
  // /admin is ordinary setup navigation — recording starts after it.
  await signIn(page, SEEDED_ADMIN_EMAIL);
  await page.goto("/admin");
  await expect(page.locator("#app-rail")).toBeVisible();

  // Expanding the drawer through the hamburger is the hydration gate: the
  // button only works once React has attached listeners (first clicks on a
  // fresh page are silently dropped before that — see auth-helpers), and a
  // pre-hydration click on a rail <Link> would navigate natively as a full
  // document, failing invariant 1 for harness reasons rather than product
  // reasons. It also stages invariant 3: the drawer is open when the first
  // navigation happens. The toggle lives in AppTopBar's corner cell
  // (top-bar-first chrome, 2026-08-14), not inside #app-rail — it still
  // controls the rail via aria-controls, which is what the selector rides.
  await retryUntilVisible(
    () => page.locator('button[aria-controls="app-rail"][aria-label="Expand navigation"]').click(),
    page.locator('#app-rail[data-expanded="true"]')
  );

  // Warm lap. The measured pass below must not be the FIRST client-side visit
  // to each route. Every rail click arms a 4s stalled-navigation watchdog
  // (AppRail.tsx: armNavWatchdog) that deliberately falls back to a full
  // document load if the soft nav has not committed — correct product behavior
  // (#316), but an uncached RSC fetch on a runner that is also hosting a Docker
  // Supabase stack can lose that race, replacing the rail node and failing
  // invariants 1 and 2 for LATENCY reasons rather than product ones.
  //
  // In-document (rail clicks), NOT page.goto, and that distinction is the whole
  // point: what makes a repeat navigation fast is the Client Router Cache,
  // which is per-DOCUMENT. A page.goto lap warms the server and then discards
  // the cache it just filled, so the measured pass is still cold — which is
  // exactly why the first attempt at this fix (#349, page.goto lap) did not
  // change the outcome. Do not "simplify" this back into page.goto calls.
  //
  // The recorder starts BEFORE this lap on purpose. The lap can itself trip the
  // watchdog, and if it does, the replacement document drops the Client Router
  // Cache entries the lap had already filled — leaving the measured pass cold
  // for routes it believes are warm. Recording across both phases turns that
  // into something the failure message can show instead of a silent hole.
  const documentRequests: string[] = [];
  page.on("request", request => {
    if (request.resourceType() === "document") documentRequests.push(request.url());
  });

  for (const section of SECTIONS) {
    await navigateToSection(page, section);
  }

  // Everything recorded so far belongs to the warm lap, not the measured pass.
  // Keep it for diagnostics, then reset so invariant 1 measures only the pass.
  const warmLapDocumentRequests = [...documentRequests];
  documentRequests.length = 0;

  // The warm lap collapsed the drawer on its first click; re-open it so the
  // measured pass still stages invariant 3 (drawer open at first transition).
  await retryUntilVisible(
    () => page.locator('button[aria-controls="app-rail"][aria-label="Expand navigation"]').click(),
    page.locator('#app-rail[data-expanded="true"]')
  );

  // Tag the rail node. The recorder is already running — it was started before
  // the warm lap and reset just above, so from here it measures only this pass.
  await page.evaluate(() => {
    (document.getElementById("app-rail") as HTMLElement & { __persistTag?: string }).__persistTag = "rail-1";
  });

  // First transition happens with the drawer open (invariant 3).
  await navigateToSection(page, SECTIONS[0]);
  await expect(page.locator("#app-rail")).toHaveAttribute("data-expanded", "false");
  await expect(page.locator("[data-rail-scrim]")).toHaveCount(0);

  // Remaining sections (Management was the drawer-open transition above).
  for (const section of SECTIONS.slice(1)) {
    await navigateToSection(page, section);
  }

  // Invariant 2: same mounted node the whole way through.
  const railTag = await page.evaluate(
    () => (document.getElementById("app-rail") as HTMLElement & { __persistTag?: string })?.__persistTag ?? null
  );
  // The recorded document requests ride along in the message on purpose. This
  // assertion fires BEFORE invariant 1 below, so a bare "expected rail-1,
  // received null" used to say only that the rail was replaced, never why —
  // and the two causes need opposite fixes. A non-empty list means a real
  // full-document navigation happened (the watchdog above, or the deploy-skew
  // fallback); an EMPTY list means the rail node was remounted with no document
  // load at all, which would be a genuine persistent-shell regression.
  expect(
    railTag,
    `the rail must be the SAME mounted DOM node across all navigations` +
      ` (measured-pass document requests: ${JSON.stringify(documentRequests)};` +
      ` warm-lap document requests: ${JSON.stringify(warmLapDocumentRequests)})`
  ).toBe("rail-1");

  // Invariant 1: nothing above was a document load.
  expect(documentRequests, "rail navigation must never issue a full-document request").toEqual([]);
});
