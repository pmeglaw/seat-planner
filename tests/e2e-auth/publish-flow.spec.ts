import { test, expect } from "@playwright/test";
import { signIn, SEEDED_ADMIN_EMAIL, SEEDED_VIEWER_EMAIL } from "./auth-helpers";

// The coverage the backend-free smoke tier structurally cannot reach: a real
// session, the admin role gate, and a real publish. Publish had ZERO automated
// coverage before this file — it was verified by hand on production, which is
// the one place nobody wants to be experimenting.
//
// Everything runs against the disposable local stack, so these specs are free
// to mutate seats and to publish for real.

const supabaseUrl = process.env.E2E_SUPABASE_URL!;
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Service-role REST call against the local stack.
 *
 * Used for setup and for assertions the UI cannot show (publish_events rows,
 * the published layer). Deliberately raw fetch rather than a Supabase client:
 * this tier should not depend on the same library the app uses, or a client
 * bug could make the app and its own test agree with each other and both be
 * wrong.
 */
async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${path}: ${await response.text()}`);
  return response.status === 204 ? null : await response.json();
}

test("a viewer signs in and sees the published map with its occupants", async ({ page }) => {
  await signIn(page, SEEDED_VIEWER_EMAIL);

  await expect(page).toHaveURL(/localhost:\d+\/$/);
  // Seats come from the published layer; names come from the
  // published_employees snapshot. Both rendering proves the viewer's
  // seat -> snapshot join in app/page.tsx stitched correctly.
  await expect(page.locator('button[aria-label*="N01"]').first()).toBeVisible();
});

test("a viewer is refused the admin editor", async ({ page }) => {
  await signIn(page, SEEDED_VIEWER_EMAIL);
  await page.goto("/admin");

  // Signed in, so no redirect to /login — the profiles.role gate is what stops
  // them. This is the UX layer; RLS and requireAdmin() are the real boundary.
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();
});

test("an admin publishes a draft change and it reaches the published layer", async ({ page }) => {
  // Seed the draft delta directly rather than driving a drag: this spec is
  // about the PUBLISH transaction, and a UI-authored change would fail for
  // unrelated reasons (zone detection, pointer coordinates).
  //
  // A POSITION delta specifically — it is the change the publish diff in
  // lib/publishSummary.ts is known to count (verified by hand on the real
  // editor: moving a seat flips the pill to "Publish 1"). A notes-only edit
  // may not register, which would make this spec fail for the wrong reason.
  const [draftSeat] = await db("seats?layer=eq.draft&label=eq.N01&select=id,label,x,y");
  expect(draftSeat, "seed should provide draft seat N01").toBeTruthy();
  const movedX = Number((draftSeat.x + 0.02).toFixed(4));
  await db(`seats?id=eq.${draftSeat.id}`, {
    method: "PATCH",
    body: JSON.stringify({ x: movedX })
  });

  const publishesBefore = (await db("publish_events?select=created_at")).length;

  await signIn(page, SEEDED_ADMIN_EMAIL);
  await page.goto("/admin");

  // The pill flips to a review entry point once the draft diverges.
  const reviewEntry = page.getByRole("button", { name: /unpublished change/ });
  await expect(reviewEntry).toBeVisible();
  await reviewEntry.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^Publish/ }).click();

  // Do NOT trust the pill: it has been observed lagging a committed publish
  // (run-seat-planner skill). Confirm in the database instead.
  await expect
    .poll(async () => (await db("publish_events?select=created_at")).length, { timeout: 20_000 })
    .toBe(publishesBefore + 1);

  const publishedSeat = await db("seats?layer=eq.published&label=eq.N01&select=x");
  expect(Number(publishedSeat[0].x)).toBeCloseTo(movedX, 4);

  // publish_seat_map() replaces the employee snapshot in the same transaction,
  // so a publish that copied seats but skipped the snapshot would leave viewers
  // with a map full of unnamed seats. Assert the snapshot survived.
  const snapshot = await db("published_employees?select=id");
  expect(snapshot.length).toBeGreaterThan(0);
});
