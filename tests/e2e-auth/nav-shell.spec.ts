import { test, expect, type Page } from "@playwright/test";
import { retryUntilVisible, SEEDED_ADMIN_EMAIL, signIn } from "./auth-helpers";

// Regression guard for the nav-lag fix (#333), re-homed on the Phase 3 shell
// (redesign-v2 PR 2): section navigation must be client-side inside the
// persistent shell. The bug this pins against: every page mounted its own
// chrome, so each section change unmounted the whole chrome into a
// full-screen loading wash (and one guard path issued a real
// window.location.assign) — reading as a 0.5–2s blank "reload" per click.
//
// Three invariants, asserted against the real built app with a real session:
//   1. ZERO full-document requests while navigating between every shell
//      section — the viewer (/) included now that it lives under the shell —
//      every transition rides the client router (RSC fetches only). A
//      document request here means a hard reload crept back in (watchdog
//      misfire, skew false-positive, or a bare <a>/location.assign on the
//      normal path).
//   2. The header is ONE persistent DOM node across every transition — an
//      expando property survives re-renders but not a remount or document
//      load, so it distinguishes "the same mounted header updated" from "a
//      new header that merely looks the same".
//   3. The open left panel closes on navigation instead of lingering over
//      the incoming page (the pre-shell chrome got this for free by
//      unmounting; the persistent shell must do it deliberately).
//
// Deliberately NOT asserted: router-cache revisit counts (staleTimes) — cache
// hits are timing-dependent and belong to next.config.js, not to the shell
// contract — and skew behavior, which is driven through the injected detector
// seam in tests/app-top-bar.test.mjs / tests/app-shell.test.mjs.

// Every shell section, in the order both laps walk them. Each probe is the
// page's skip-link landing marker (zero-height, hence attached rather than
// visible). The lap ends on "Seat map" so it returns to /admin.
//
// `heading` exists because the probe alone cannot fence a route commit on the
// two admin subpages: BOTH render id="admin-subpage-main", so waiting for it
// attached on the Management -> Settings hop can be satisfied by the page
// being navigated AWAY from. Their <h1> is route-unique.
//
// The admin's "Seat map" link lands on /admin (role-fitted), so the viewer
// map is reached through the History panel's mode switch ("Published") —
// the shell's one cross-mode exit — and left again through the switch
// ("Draft"). Both go through the same client-router path as a link click.
type Section = { title: string; path: string; probe: string; heading: string | null; via: "link" | "switch" };
const SECTIONS: Section[] = [
  { title: "Management", path: "/admin/management", probe: "#admin-subpage-main", heading: "Management", via: "link" },
  { title: "Settings", path: "/admin/settings", probe: "#admin-subpage-main", heading: "Settings", via: "link" },
  { title: "Reception", path: "/reception", probe: "#reception-main", heading: null, via: "link" },
  { title: "Published", path: "/", probe: "#viewer-seat-map", heading: null, via: "switch" },
  { title: "Draft", path: "/admin", probe: "#planning-canvas", heading: null, via: "switch" }
];

const hamburger = (page: Page) => page.locator('#shell-header button[aria-controls="shell-left-panel"]');

async function navigateToSection(page: Page, section: Section) {
  if (section.via === "link") {
    await page.locator(`#shell-header nav a[title="${section.title}"]`).click();
  } else {
    await page.locator('#shell-header button[aria-label="History"]').click();
    await page.locator('#shell-panel-history [role="group"][aria-label="Mode"] button', { hasText: section.title }).click();
  }
  await page.waitForURL(url => url.pathname === section.path);
  await page.waitForSelector(section.probe, { state: "attached" });
  if (section.heading) {
    await expect(page.getByRole("heading", { level: 1, name: section.heading })).toBeVisible();
  }
}

test("shell navigation is client-side: zero document loads, one persistent header", async ({ page }) => {
  test.setTimeout(120_000);

  // signIn lands on "/" (the login form's default next path) — under the
  // shell now. Open the left panel through the hamburger: the button only
  // works once React has attached listeners (a pre-hydration click on a
  // section <Link> would navigate natively as a full document, failing
  // invariant 1 for harness reasons), and it stages invariant 3: the panel
  // is open when the first navigation happens. The viewer registers its
  // filter groups, so the hamburger exists there at every width.
  await signIn(page, SEEDED_ADMIN_EMAIL);
  await page.goto("/");
  await expect(page.locator("#shell-header")).toBeVisible();
  await retryUntilVisible(() => hamburger(page).click(), page.locator('#shell-left-panel[data-open="true"]'));

  // Warm lap. The measured pass below must not be the FIRST client-side visit
  // to each route. Every section click arms a 4s stalled-navigation watchdog
  // (useShellNavigation) that deliberately falls back to a full document load
  // if the soft nav has not committed — correct product behavior (#316), but
  // an uncached RSC fetch on a runner that is also hosting a Docker Supabase
  // stack can lose that race, replacing the header node and failing
  // invariants 1 and 2 for LATENCY reasons rather than product ones.
  //
  // In-document (shell clicks), NOT page.goto: what makes a repeat navigation
  // fast is the Client Router Cache, which is per-DOCUMENT. Do not "simplify"
  // this back into page.goto calls (#349).
  //
  // The recorder starts BEFORE this lap on purpose so a watchdog trip during
  // the lap shows up in the failure message instead of a silent hole.
  const documentRequests: string[] = [];
  page.on("request", request => {
    if (request.resourceType() === "document") documentRequests.push(request.url());
  });

  // First hop from / is the switch to Draft (the admin's map link points at
  // /admin, so from / the link would be a same-route no-op).
  await navigateToSection(page, SECTIONS[4]);
  for (const section of SECTIONS) {
    await navigateToSection(page, section);
  }

  const warmLapDocumentRequests = [...documentRequests];
  documentRequests.length = 0;

  // The lap ends on /admin; open the left panel? Not there — /admin registers
  // no filters until PR 3 (D0-h reserved slot), so stage invariant 3 from the
  // viewer instead: switch to Published, open the panel, then measure.
  await navigateToSection(page, SECTIONS[3]);
  await retryUntilVisible(() => hamburger(page).click(), page.locator('#shell-left-panel[data-open="true"]'));
  documentRequests.length = 0;

  // Tag the header node. The recorder is running; from here it measures
  // only this pass.
  await page.evaluate(() => {
    (document.getElementById("shell-header") as HTMLElement & { __persistTag?: string }).__persistTag = "header-1";
  });

  // First transition happens with the left panel open (invariant 3).
  await navigateToSection(page, SECTIONS[4]);
  await expect(page.locator("#shell-left-panel")).not.toHaveAttribute("data-open", "true");

  for (const section of SECTIONS) {
    await navigateToSection(page, section);
  }

  // Invariant 2: same mounted node the whole way through.
  const headerTag = await page.evaluate(
    () => (document.getElementById("shell-header") as HTMLElement & { __persistTag?: string })?.__persistTag ?? null
  );
  expect(
    headerTag,
    `the header must be the SAME mounted DOM node across all navigations` +
      ` (measured-pass document requests: ${JSON.stringify(documentRequests)};` +
      ` warm-lap document requests: ${JSON.stringify(warmLapDocumentRequests)})`
  ).toBe("header-1");

  // Invariant 1: nothing above was a document load.
  expect(documentRequests, "shell navigation must never issue a full-document request").toEqual([]);
});
