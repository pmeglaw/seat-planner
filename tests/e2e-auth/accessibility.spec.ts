import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expectNoAxeViolations, formatAxeViolations, waitForColorSettle, WCAG_A_AA_TAGS } from "../e2e/axe-helpers";
import { retryUntilVisible, SEEDED_ADMIN_EMAIL, SEEDED_VIEWER_EMAIL, signIn } from "./auth-helpers";

// Runtime accessibility assertions for the ADMIN surfaces.
//
// Why here and not in tests/e2e: that tier is deliberately backend-free, so
// /admin* only ever redirects to /login and the admin surfaces were invisible
// to every automated check. They were audited by hand during the v12 a11y pass
// (slice 9) — which is exactly how a serious colour-contrast violation reached
// main in the first place, and how it would have stayed there if nobody had
// thought to run axe manually that week. This tier already has a real session
// against a disposable local stack, so the scan belongs here.
//
// Read-only on purpose. The tier runs workers: 1 against one shared database
// alongside the mutating specs, so these specs open dialogs but never confirm
// anything — no seat is edited, nothing is published, nothing is reset. The
// dialogs that CANNOT exist without a mutation (publish review, discard
// confirm, reset review, the seat-verb confirms — all gated on a draft delta
// or an occupied seat) are scanned in draft-dialogs.spec.ts, which owns its
// service-role setup and runs after this file (alphabetical order, one worker).
//
// These specs are also deliberately agnostic about shared-database state: a
// long-lived local stack may or may not carry a draft delta or seat
// assignments from earlier runs, so nothing here asserts on the publish pill,
// on a specific seat's occupancy, or on any marker's accessible name beyond
// its stable label prefix.

test.describe("admin surfaces have no WCAG A/AA violations", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_ADMIN_EMAIL);
  });

  test("Management", async ({ page }) => {
    await page.goto("/admin/management");
    await expect(page.getByRole("heading", { name: "Management", level: 1 })).toBeVisible();
    // The directory is windowed and measures itself from the live table, so
    // scanning before rows paint would scan an empty tbody.
    await expect(page.locator("[data-directory-row]").first()).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
    expect(formatAxeViolations(violations)).toEqual([]);
  });

  // Dialogs are where modal semantics actually fail: a labelledby pointing at
  // an id that no longer renders, a trap with nothing focusable, contrast on a
  // surface no static scan reaches. Opening is client-only — this saves nothing.
  test("Management with the employee form open", async ({ page }) => {
    await page.goto("/admin/management");
    // The windowed directory only paints client-side, so its first row doubles
    // as the hydration proof — clicking before React attaches listeners would
    // silently drop the click.
    await expect(page.locator("[data-directory-row]").first()).toBeVisible();
    await page.getByRole("button", { name: /Add employee/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add employee" })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
    expect(formatAxeViolations(violations)).toEqual([]);
  });

  test("Management with the edit form and the deactivate confirm open", async ({ page }) => {
    await page.goto("/admin/management");
    await expect(page.locator("[data-directory-row]").first()).toBeVisible();

    // The per-row kebab is icon-only; its accessible name is `Edit <name>`.
    await page.getByRole("button", { name: /^Edit / }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Edit employee" })).toBeVisible();
    // Edit mode renders content the add-mode scan never sees: the Deactivate
    // danger button and the deactivation-impact notice.
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
    await expectNoAxeViolations(page);

    // Deactivate hands off to the shared confirm dialog WITHOUT mutating —
    // deleteEmployeeAction only runs on the confirm button this test never
    // clicks. Note the handoff closes the employee form first (one dialog at
    // a time, so the focus trap moves cleanly).
    await dialog.getByRole("button", { name: "Deactivate", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Deactivate .+\?$/ })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
    await expectNoAxeViolations(page);

    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Management with the delete-department confirm open", async ({ page }) => {
    await page.goto("/admin/management");
    await expect(page.locator("[data-directory-row]").first()).toBeVisible();

    await page.getByRole("button", { name: "Departments", exact: true }).click();
    // Trash buttons are icon-only (`Delete <name>`) and opacity-0 until the
    // row is hovered; they stay in the accessibility tree and clickable.
    await page.getByRole("button", { name: /^Delete / }).first().click();
    await expect(page.getByRole("heading", { name: /^Delete department/ })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
    await expectNoAxeViolations(page);

    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    // The zone variant reuses this exact confirm surface (same chrome, same
    // ids, same button set) with different strings — scanning it again would
    // re-test the same DOM shape, so it is deliberately left out.
  });

  test("Settings", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
    expect(formatAxeViolations(violations)).toEqual([]);
  });

  // The three Settings review dialogs were originally left unscanned as
  // timing-flaky. The mechanics, pinned down while closing that gap:
  //
  // - setInputFiles races hydration — an onChange React has not attached yet
  //   silently swallows the file (same race signIn works around) — hence the
  //   retry loop around each open.
  // - The file-input dialogs open inside the panel's shared useTransition, so
  //   their buttons MOUNT disabled and flip enabled when the parse resolves.
  //   Awaiting the close button ENABLED proves the flip happened; the
  //   waitForColorSettle that follows covers the ~150ms transition-colors
  //   animation the flip starts — axe sampling mid-animation reads blend
  //   colors below AA even though both endpoint palettes pass (its header
  //   comment has the measured numbers).
  // - Natively disabled controls (the errors-state "Fix CSV first") are exempt
  //   from axe's color-contrast rule, so a control that legitimately STAYS
  //   disabled needs no special handling.
  //
  // The reset review needs a draft delta to open at all, so it lives in
  // draft-dialogs.spec.ts with the other mutation-gated dialogs.
  test("Settings with the CSV import review open", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    const header = "seat_label,employee_name,employee_email,position,department,zone,status,notes\n";
    await expect(async () => {
      await page
        .locator('input[accept=".csv,text/csv"]')
        .setInputFiles({ name: "template.csv", mimeType: "text/csv", buffer: Buffer.from(header) });
      await expect(page.getByRole("heading", { name: "Review CSV import" })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await expect(page.getByRole("button", { name: "Close CSV import review" })).toBeEnabled();
    await waitForColorSettle(page.getByRole("button", { name: "Close CSV import review" }));
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Close CSV import review" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Settings with the CSV review in its blocking-errors state", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // An empty file parses to the "CSV is empty." blocking issue — the dialog
    // still opens, but retitled, with the error list rendered and the confirm
    // permanently disabled ("Fix CSV first"). That is a distinct surface from
    // the happy path: danger-toned counts, the issues list, and a disabled
    // primary that must still satisfy non-contrast rules.
    await expect(async () => {
      await page
        .locator('input[accept=".csv,text/csv"]')
        .setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.from("") });
      await expect(page.getByRole("heading", { name: "CSV import has blocking errors" })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await expect(page.getByRole("button", { name: "Close CSV import review" })).toBeEnabled();
    await waitForColorSettle(page.getByRole("button", { name: "Close CSV import review" }));
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Close CSV import review" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Settings with the snapshot restore review open", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    // Shape-only validation at open: any {seats: [], employees: []} object
    // reaches the review. Deep row validation is the server action's job and
    // only runs on the confirm this test never clicks.
    await expect(async () => {
      await page
        .locator('input[accept=".json,application/json"]')
        .setInputFiles({
          name: "snapshot.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify({ seats: [], employees: [] }))
        });
      await expect(page.getByRole("heading", { name: "Review draft snapshot restore" })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await expect(page.getByRole("button", { name: "Close draft snapshot restore review" })).toBeEnabled();
    await waitForColorSettle(page.getByRole("button", { name: "Close draft snapshot restore review" }));
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Close draft snapshot restore review" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

// The map editor is the surface admins actually live in, and none of it was
// scanned before: the chrome bar, the inspector, the drawer, the menus. All of
// these open client-side without touching the database.
//
// Two mechanics specific to this surface, both discovered the hard way:
// - Marker COORDINATE clicks are unreliable at this data density — thousands
//   of seats overlap at default zoom and a neighbouring marker routinely
//   "intercepts pointer events". The real-browser SeatMap tier hit the same
//   wall; like it, these tests dispatch the click event straight to the
//   marker, which reaches its handler regardless of stacking.
// - A full-page axe pass over ~4k markers runs ~15 seconds, so multi-scan
//   tests carry explicit timeouts.
test.describe("admin map editor has no WCAG A/AA violations", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEEDED_ADMIN_EMAIL);
    await page.goto("/admin");
    // Markers are in the initial server HTML (the page awaits all data before
    // rendering), but their presence also proves this is the editor and not
    // the "Admin access required" fallback — which renders no markers and
    // would otherwise pass a vacuous scan.
    await expect(page.locator("button[data-seat-id]").first()).toBeVisible();
  });

  test("the map editor", async ({ page }) => {
    test.setTimeout(60_000);
    await expect(page).toHaveURL(/\/admin$/);

    // Inline liveness, mirroring the Management guard below: prove the scan
    // examined a real page and that the one structurally invisible defect
    // class (contrast) was actually evaluated here.
    const results = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
    expect(formatAxeViolations(results.violations)).toEqual([]);
    expect(results.passes.length).toBeGreaterThan(0);
    expect(results.passes.map(rule => rule.id)).toContain("color-contrast");
  });

  test("with the seat inspector open, on both tabs", async ({ page }) => {
    test.setTimeout(120_000);
    const inspector = page.locator("#seat-inspector-panel");
    await retryUntilVisible(
      () => page.locator("button[data-seat-id]").first().dispatchEvent("click"),
      inspector
    );
    // The footer CTA only renders once the inspector is out of any pending
    // state; its label depends on the seat's occupancy, which this spec must
    // not assume.
    await expect(inspector.getByRole("button", { name: /Assign an employee to|Edit assignment for/ })).toBeEnabled();
    await expectNoAxeViolations(page);

    // The Notes tabpanel (and its textarea) is unmounted while inactive — the
    // Overview scan never sees it.
    await inspector.getByRole("tab", { name: "Notes" }).click();
    await expect(inspector.locator("textarea")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("with the unsaved-edits guard dialog open", async ({ page }) => {
    test.setTimeout(90_000);
    // Pin both seat ids BEFORE selecting: selection re-renders the marker
    // list and can reorder it, so a positional nth(1) taken later may resolve
    // to the already-selected seat — and re-clicking the selected seat is a
    // no-op that never triggers the guard.
    const [firstSeatId, secondSeatId] = await page
      .locator("button[data-seat-id]")
      .evaluateAll(elements => elements.slice(0, 2).map(el => el.getAttribute("data-seat-id")));
    expect(secondSeatId).toBeTruthy();
    const inspector = page.locator("#seat-inspector-panel");
    await retryUntilVisible(
      () => page.locator(`button[data-seat-id="${firstSeatId}"]`).dispatchEvent("click"),
      inspector
    );

    // Dirty the draft locally (notes live in client state until saved), then
    // trigger the guard by selecting another seat. Nothing reaches the server:
    // "Discard" below only resets the local form.
    //
    // The dirty flag propagates child → parent through an effect, so a click
    // racing that propagation is treated as a plain selection: no guard, and
    // the selection change RESETS the form — the race's losing branch eats
    // the dirty state it needed. Each retry therefore re-dirties whichever
    // seat is now selected and clicks the OTHER pinned seat.
    const guardHeading = page.getByRole("heading", { name: "Unsaved seat edits" });
    await expect(async () => {
      if (await guardHeading.isVisible()) return;
      const commitBar = inspector.getByRole("button", { name: /^Save draft changes/ });
      if (!(await commitBar.isVisible())) {
        await inspector.getByRole("tab", { name: "Notes" }).click();
        await inspector.locator("textarea").fill("a11y probe — never saved");
        await expect(commitBar).toBeVisible({ timeout: 2_000 });
      }
      const pressedId = await page.evaluate(
        () => document.querySelector('button[data-seat-id][aria-pressed="true"]')?.getAttribute("data-seat-id")
      );
      const otherId = pressedId === secondSeatId ? firstSeatId : secondSeatId;
      await page.locator(`button[data-seat-id="${otherId}"]`).dispatchEvent("click");
      await expect(guardHeading).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    await expect(guardHeading).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep editing", exact: true })).toBeEnabled();
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("with the Ask Planner drawer open", async ({ page }) => {
    test.setTimeout(90_000);
    // Opening performs no server call and no OpenAI call — askPlannerAction
    // only fires on an explicit submit, which never happens here. The drawer
    // renders identically with or without OPENAI_API_KEY configured.
    const drawer = page.locator("#ask-planner-drawer");
    await retryUntilVisible(
      () => page.getByRole("button", { name: /Open Ask Planner/ }).click({ timeout: 2_000 }),
      drawer
    );
    await expect(drawer.getByRole("textbox", { name: "Ask Planner question" })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Close Ask Planner", exact: true }).click();
    await expect(drawer).toBeHidden();
  });

  test("with the chrome menus open", async ({ page }) => {
    test.setTimeout(120_000);
    // Kebab first. Its "Discard draft changes" item renders disabled here
    // (this file never seeds a draft delta, and full runs end converged);
    // draft-dialogs.spec.ts scans the same menu in its ENABLED state.
    // Probe the menu GROUP, not the "Show occupant names" item: since the
    // canvas-chrome redesign the legend footer carries an always-visible
    // button with that same name (and the kebab's copy is md:hidden), so an
    // item-name probe reads "open" while the menu is still closed — the
    // open/close click pairing then inverts and the close-click opens it.
    await retryUntilVisible(
      () => page.getByRole("button", { name: "More tools", exact: true }).click({ timeout: 2_000 }),
      page.getByRole("group", { name: "More tools" })
    );
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "More tools", exact: true }).click();
    // The toggle-close is a React state flip; clicking the floor trigger
    // before the kebab unmounts can be swallowed by the still-open menu's
    // dismissal handling instead of opening the floor menu. (The group IS the
    // menu container — the trigger button shares the label but not the role.)
    await expect(page.getByRole("group", { name: "More tools" })).toBeHidden();

    await page.getByRole("button", { name: /^Change floor\./ }).click();
    await expect(page.getByRole("menu", { name: "Floors" })).toBeVisible();
    await expect(page.getByRole("menuitemradio").first()).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

// The viewer map had no runtime scan either — the backend-free tier only ever
// sees /login, and the real-browser SeatMap harness ships without the app's
// CSS, so its axe pass structurally cannot evaluate contrast. This is the page
// every non-admin lands on.
test("the viewer map and its seat inspector have no WCAG A/AA violations", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, SEEDED_VIEWER_EMAIL);
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(page.locator("button[data-seat-id]").first()).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(formatAxeViolations(results.violations)).toEqual([]);
  expect(results.passes.length).toBeGreaterThan(0);
  expect(results.passes.map(rule => rule.id)).toContain("color-contrast");

  // The Find palette is the viewer's primary surface — the only route to
  // people, seats and zones since the docked directory was retired — and it is
  // the part of this page a source guardrail structurally cannot check for
  // contrast. Scanned in BOTH modes: they share one slot but render entirely
  // different content, and only one of them can be on screen at a time.
  //
  // This scan is also what catches dangling id references on the field:
  // aria-controls points at the palette, which is UNMOUNTED when closed, and a
  // reference that resolves to nothing is a critical aria-valid-attr-value
  // violation rather than a harmless one.
  await retryUntilVisible(
    () => page.locator("#viewer-seat-search").click(),
    page.locator("#viewer-find-palette")
  );
  await expect(page.getByRole("list", { name: "People directory" })).toBeVisible();
  await expectNoAxeViolations(page);

  // Query mode. Asserted by the BROWSE list going away rather than by the
  // results list arriving: a query with no matches is a legitimate state with
  // its own copy, and it deserves the scan just as much as a hit does.
  await page.locator("#viewer-seat-search").fill("a");
  await expect(page.getByRole("list", { name: "People directory" })).toBeHidden();
  await expect(page.locator("#viewer-find-palette")).toBeVisible();
  await expectNoAxeViolations(page);

  // Esc peels the palette first, the query second (contract #7).
  await page.keyboard.press("Escape");
  await expect(page.locator("#viewer-find-palette")).toBeHidden();
  await expect(page.locator("#viewer-seat-search")).toHaveValue("a");
  await page.keyboard.press("Escape");
  await expect(page.locator("#viewer-seat-search")).toHaveValue("");

  // The viewer inspector is a non-modal panel, not a dialog; the "Published
  // seat" pill is unique to the viewer variant, so it doubles as proof this
  // is the read-only branch with no admin affordances.
  await retryUntilVisible(
    () => page.locator("button[data-seat-id]").first().dispatchEvent("click"),
    page.locator("#seat-inspector-panel")
  );
  await expect(page.getByText("Published seat", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Close inspector", exact: true }).click();
  await expect(page.locator("#seat-inspector-panel")).toBeHidden();
});

// Liveness guard, mirroring the one in tests/e2e/accessibility.spec.ts. "No
// violations" is also what a scan that examined nothing reports (docs/RISKS.md
// R-04), and an admin route that silently redirected to /login would report
// exactly that while proving nothing about the admin surface.
test("the admin scan actually inspects an admin page", async ({ page }) => {
  await signIn(page, SEEDED_ADMIN_EMAIL);
  await page.goto("/admin/management");
  await expect(page.getByRole("heading", { name: "Management", level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(results.passes.length).toBeGreaterThan(0);
  // The one class of defect the source guardrails structurally cannot see.
  expect(results.passes.map(rule => rule.id)).toContain("color-contrast");
  // And prove we are on the admin surface, not a redirect to the login form.
  await expect(page).toHaveURL(/\/admin\/management/);
});
