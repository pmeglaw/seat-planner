import { test, expect } from "@playwright/test";
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
  // navigation happens.
  await retryUntilVisible(
    () => page.locator('#app-rail button[aria-label="Expand navigation"]').click(),
    page.locator('#app-rail[data-expanded="true"]')
  );

  // Tag the rail node and start the document-request recorder.
  await page.evaluate(() => {
    (document.getElementById("app-rail") as HTMLElement & { __persistTag?: string }).__persistTag = "rail-1";
  });
  const documentRequests: string[] = [];
  page.on("request", request => {
    if (request.resourceType() === "document") documentRequests.push(request.url());
  });

  // First transition happens with the drawer open (invariant 3).
  await page.locator('#app-rail a[title="Management"]').click();
  await page.waitForURL(url => url.pathname === "/admin/management");
  await page.waitForSelector("#admin-subpage-main", { state: "attached" });
  await expect(page.locator("#app-rail")).toHaveAttribute("data-expanded", "false");
  await expect(page.locator("[data-rail-scrim]")).toHaveCount(0);

  // Remaining sections; each probe is the page's skip-link landing marker
  // (zero-height, hence attached rather than visible).
  const remaining = [
    { title: "Settings", path: "/admin/settings", probe: "#admin-subpage-main" },
    { title: "Reception", path: "/reception", probe: "#reception-main" },
    { title: "Seat map", path: "/admin", probe: "#planning-canvas" }
  ];
  for (const section of remaining) {
    await page.locator(`#app-rail a[title="${section.title}"]`).click();
    await page.waitForURL(url => url.pathname === section.path);
    await page.waitForSelector(section.probe, { state: "attached" });
  }

  // Invariant 2: same mounted node the whole way through.
  const railTag = await page.evaluate(
    () => (document.getElementById("app-rail") as HTMLElement & { __persistTag?: string })?.__persistTag ?? null
  );
  expect(railTag, "the rail must be the SAME mounted DOM node across all navigations").toBe("rail-1");

  // Invariant 1: nothing above was a document load.
  expect(documentRequests, "rail navigation must never issue a full-document request").toEqual([]);
});
