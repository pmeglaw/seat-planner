import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expectNoAxeViolations, waitForColorSettle, WCAG_A_AA_TAGS } from "../e2e/axe-helpers";
import { retryUntilVisible, SEEDED_ADMIN_EMAIL, signIn } from "./auth-helpers";
import { db } from "./db-helpers";

// Axe scans for the admin dialogs that CANNOT be reached read-only: they only
// exist once the draft diverges from published (publish review, discard
// confirm, reset review) or once a seat is occupied (vacate / swap / move /
// move-conflict — the seed leaves every seat unassigned, and swap explicitly
// rejects two empty seats: "Swap requires at least one assigned seat").
//
// accessibility.spec.ts stays read-only by contract, so the mutating setup
// lives here instead: a service-role assignment plus a position nudge on draft
// N01, and a throwaway custom seat X99. File order matters and is free:
// Playwright runs this tier's files alphabetically under workers:1, so this
// file lands between accessibility.spec.ts (read-only, state-agnostic) and
// publish-flow.spec.ts — whose real publish then converges the deltas seeded
// here. Every dialog below is opened, scanned, and CANCELLED; the only
// committed mutation is deleting X99, which is this file cleaning up after
// itself.

// SeatMap's swap/move mode card (SeatMap.tsx: role="status", aria-label
// "<Mode> mode"). Named by its label suffix rather than a fixed string so one
// locator serves both modes; the notice strip is also role="status", which is
// why the accessible name is part of the query rather than the role alone.
const modeCard = (page: Page) => page.getByRole("status", { name: /\bmode$/ });

// Captured by beforeAll. The local dataset is LARGE (thousands of seats, most
// employees pre-assigned), so nothing here may assume a given seat is empty —
// the move/assign target is picked from the database instead of hardcoded.
let n01Id: string;
let x99Id: string;
let targetId: string;
let targetLabel: string;

// Markers overlap heavily at this data density and default zoom, so a
// coordinate click on a specific seat routinely lands on a neighbour that
// "intercepts pointer events". The real-browser SeatMap tier hit the same
// wall and settled on dispatchEvent — the click reaches the marker's own
// handler regardless of what is stacked above it.
function clickSeat(page: import("@playwright/test").Page, seatId: string) {
  return page.locator(`button[data-seat-id="${seatId}"]`).dispatchEvent("click");
}

test.beforeAll(async () => {
  // Leftover X99 from a crashed prior run would 409 the insert below (unique
  // seat_key per layer) — and if publish-flow ran after the crash, a published
  // copy could exist too. Clear both layers.
  await db("seats?seat_key=eq.X99", { method: "DELETE" });

  const [alex] = await db(`employees?full_name=eq.${encodeURIComponent("Alex Shabazian")}&select=id,full_name`);
  expect(alex, "seed should provide employee Alex Shabazian").toBeTruthy();

  const [n01] = await db("seats?layer=eq.draft&label=eq.N01&select=id,x,y,zone,department");
  expect(n01, "seed should provide draft seat N01").toBeTruthy();
  n01Id = n01.id;

  const [publishedN01] = await db("seats?layer=eq.published&label=eq.N01&select=x");
  expect(publishedN01, "seed should provide published seat N01").toBeTruthy();

  // If the dataset already seats Alex somewhere else, assigning them to N01
  // would trip the one-draft-seat-per-employee unique index. Vacate that seat
  // first (status and employee_id must change together — check constraint).
  await db(`seats?layer=eq.draft&employee_id=eq.${alex.id}&id=neq.${n01.id}`, {
    method: "PATCH",
    body: JSON.stringify({ employee_id: null, status: "available" })
  });

  // Occupying N01 unlocks vacate/swap/move and is itself a publishable delta
  // (an "assigned" diff chip). The x nudge is anchored to the PUBLISHED row,
  // not the current draft: that guarantees draft.x differs from published.x
  // by a full 0.02 (far beyond publishSummary's 0.0005 move epsilon) in every
  // starting state a persistent stack can be in — fresh, converged by a prior
  // publish, or mid-crash — and the < 0.5 flip keeps repeated runs bounded
  // inside the [0,1] check constraint instead of walking x off the map.
  // (A draft-anchored nudge once cancelled publish-flow's +0.02 exactly on
  // the 7th full run and wedged the tier with "publish pill missing".)
  const nudgedX = Number((publishedN01.x < 0.5 ? publishedN01.x + 0.02 : publishedN01.x - 0.02).toFixed(4));
  await db(`seats?id=eq.${n01.id}`, {
    method: "PATCH",
    body: JSON.stringify({ employee_id: alex.id, status: "assigned", x: nudgedX })
  });

  // The swap/move/assign target must be genuinely OPEN, and in N01's zone so
  // it lives on the same floor as N01 (floors group by zone). Ordered for
  // cross-run determinism.
  const [target] = await db(
    `seats?layer=eq.draft&status=eq.available&zone=eq.${encodeURIComponent(n01.zone)}&seat_key=neq.X99&select=id,label&order=label&limit=1`
  );
  expect(target, "N01's zone should contain at least one open seat").toBeTruthy();
  targetId = target.id;
  targetLabel = target.label;

  // A custom seat is deletable (seatProtection allows is_custom + available
  // only); placing it beside N01 with N01's zone keeps it inside the same
  // calibration area so it renders where a real added seat would.
  const [x99] = await db("seats", {
    method: "POST",
    body: JSON.stringify({
      seat_key: "X99",
      label: "X99",
      x: Math.min(0.98, n01.x + 0.015),
      y: Math.min(0.98, n01.y + 0.015),
      status: "available",
      layer: "draft",
      zone: n01.zone,
      department: n01.department,
      is_custom: true
    })
  });
  x99Id = x99.id;
});

test.beforeEach(async ({ page }) => {
  await signIn(page, SEEDED_ADMIN_EMAIL);
});

test("publish review, enabled chrome menu, and discard-draft confirm dialogs", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/admin");

  // The entry point only renders when the draft diverges — which beforeAll
  // guaranteed. Its absence here would mean the setup delta silently vanished.
  const dialog = page.getByRole("dialog");
  await retryUntilVisible(
    () => page.getByRole("button", { name: /^Publish \d+ change/ }).click({ timeout: 2_000 }),
    page.getByRole("heading", { name: "Review draft before publishing" })
  );
  // The publish CTA is also disabled when there is nothing to publish, so the
  // unambiguous "transition settled" probe is Cancel.
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
  await expectNoAxeViolations(page);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();

  // Scan the kebab with its "Discard draft changes" item ENABLED — the
  // read-only accessibility spec only ever sees this menu in a converged
  // database where the item renders disabled, and disabled controls are
  // exempt from axe's contrast rule, so this is the item's only contrast
  // coverage.
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Discard draft changes" })).toBeEnabled();
  await expectNoAxeViolations(page);

  await page.getByRole("menuitem", { name: "Discard draft changes" }).click();
  await expect(page.getByRole("heading", { name: "Discard all draft changes?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep draft changes" })).toBeEnabled();
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Keep draft changes" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("vacate, swap, and move confirm dialogs", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/admin");

  const inspector = page.locator("#seat-inspector-panel");
  await retryUntilVisible(() => clickSeat(page, n01Id), inspector);

  // Vacate/Swap/Move sit in the always-mounted Seat management section
  // (flat sections, 2026-08-19 Carbon handoff) — no expand step.
  await page.getByRole("button", { name: "Vacate N01" }).click();
  await expect(page.getByRole("heading", { name: "Vacate N01?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vacate seat" })).toBeEnabled();
  await expectNoAxeViolations(page);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(inspector).toBeVisible();
  await page.getByRole("button", { name: "Swap N01" }).click();
  await clickSeat(page, targetId);
  await expect(page.getByRole("heading", { name: "Confirm seat swap" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm swap" })).toBeEnabled();
  // Arming swap MODE mounts SeatMap's mode card alongside the dialog, and it
  // fades in over 200ms (sp-panel-in). The dialog assertions above say nothing
  // about that card, so an unsettled scan here reports blend colors for its
  // label and "Esc exits" chip — both of which pass at rest.
  await waitForColorSettle(modeCard(page));
  await expectNoAxeViolations(page);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  // Cancelling the dialog deliberately keeps swap MODE armed; Escape exits it.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Swap canceled — no changes made.")).toBeVisible();

  await page.getByRole("button", { name: "Move Alex Shabazian to another seat" }).click();
  await clickSeat(page, targetId);
  await expect(page.getByRole("heading", { name: `Move Alex Shabazian to ${targetLabel}?` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move them" })).toBeEnabled();
  // Move mode mounts the same fading card as swap above.
  await waitForColorSettle(modeCard(page));
  await expectNoAxeViolations(page);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.keyboard.press("Escape");
});

test("move-conflict dialog when assigning an already-seated employee", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/admin");

  await retryUntilVisible(() => clickSeat(page, targetId), page.locator("#seat-inspector-panel"));
  await page.getByRole("button", { name: `Assign an employee to ${targetLabel}` }).click();
  // Scoped by name: the editing form renders TWO combobox roles — the
  // employee-name input and the native Department <select>.
  const combobox = page.getByRole("combobox", { name: "Employee name" });
  await combobox.fill("Alex");
  await page.getByRole("option", { name: /Alex Shabazian/ }).click();
  // Submitting runs updateSeatAction for real; the server answers with
  // EMPLOYEE_ALREADY_ASSIGNED as data — no row changes until "Move them",
  // which this test never clicks.
  await page.getByRole("button", { name: `Assign employee for ${targetLabel}` }).click();
  await expect(page.getByRole("heading", { name: `Move Alex Shabazian to ${targetLabel}?` })).toBeVisible();

  // This dialog interposes MID-SUBMIT: it mounts inside the rejected
  // updateSeatAction's still-running transition, so its footer renders
  // disabled first and can flip (or re-flip) around any single settled-state
  // probe — a one-shot scan was observed catching the full disabled palette
  // (4.40:1, which axe flags because the attribute is off again by the time
  // it checks exemptions). Retry the enabled-check + scan as a UNIT until axe
  // measured the state the checks saw; a genuine defect still fails every
  // iteration and reports the computed fg/bg/ratio below.
  //
  // Also the one scan scoped to the dialog subtree: it is the only dialog
  // that coexists with the mid-edit inspector, and its deliberate 95%-alpha
  // glass surface makes axe blend the obscured commit bar behind it into
  // sub-AA readings on text nobody can read or operate while the modal is up.
  // The page around the inspector is covered by the other scans; app-side
  // inert on background content while dialogs are open would retire this.
  await expect(async () => {
    await expect(page.getByRole("button", { name: "Move them" })).toBeEnabled({ timeout: 2_000 });
    await waitForColorSettle(page.getByRole("button", { name: "Move them" }));
    const { violations } = await new AxeBuilder({ page })
      .include('section[aria-labelledby="move-employee-confirm-title"]')
      .withTags(WCAG_A_AA_TAGS)
      .analyze();
    expect(
      violations.flatMap(violation =>
        violation.nodes.map(
          node => `${violation.id}: ${node.target.join(" ")} ${JSON.stringify(node.any.map(check => check.data))}`
        )
      )
    ).toEqual([]);
    // The state axe measured must still be the state the pre-checks saw.
    await expect(page.getByRole("button", { name: "Move them" })).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  await page.getByRole("button", { name: "Cancel moving employee" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

// (PR 4: the Settings Reset-draft review retired with ruling 22 — the map's
// Discard confirm above is the one reset surface.)

// LAST in the file on purpose: a CI retry of any test in this file spawns a
// fresh worker whose beforeAll re-creates X99, and only this test deletes it.
// Were it not last, a later test's retry would resurrect X99 with nothing left
// to clean it up, and publish-flow would publish the throwaway seat.
test("delete-custom-seat confirm dialog, then the real delete as cleanup", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/admin");

  await retryUntilVisible(() => clickSeat(page, x99Id), page.locator("#seat-inspector-panel"));
  // Delete sits in the always-mounted Seat management section (flat sections).
  await page.getByRole("button", { name: "Delete custom seat X99" }).click();
  await expect(page.getByRole("heading", { name: "Delete custom seat X99?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete seat" })).toBeEnabled();
  await expectNoAxeViolations(page);

  // Confirming here is the cleanup: it removes the throwaway seat before
  // publish-flow publishes, and exercises the protected-delete path for real
  // (the seatProtection trigger would have blocked a non-custom seat).
  await page.getByRole("button", { name: "Delete seat" }).click();
  await expect(page.getByRole("button", { name: /^X99 / })).toBeHidden({ timeout: 15_000 });
  await expect
    .poll(async () => (await db("seats?seat_key=eq.X99&select=id")).length, { timeout: 15_000 })
    .toBe(0);
});

test("the status band's scroll region is keyboard-scrollable when it overflows", async ({ page }) => {
  // The CSS-free harness tiers can only pin the tabindex; whether a focused
  // horizontal scroller actually MOVES on keys is real-CSS behavior, so it
  // lives in this tier (CodeRabbit on #408). At 640px — the band's floor —
  // the local seed's four-digit counts guarantee the informational region
  // overflows past the fixed controls cluster. ArrowRight, deliberately NOT
  // End: measured in Chromium, End does not scroll a horizontal-only
  // scroller (scrollLeft stays 0) while each ArrowRight moves it 40px.
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/admin");

  const region = page.locator("[data-band-scroll-region]");
  await expect(region).toBeVisible();
  expect(await region.evaluate(el => el.scrollWidth > el.clientWidth), "expected the 640px band to overflow").toBe(true);

  await region.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
});
