import { test, expect, type Page } from "@playwright/test";
import { mountSeatMap } from "./harness";

// Undo/redo in a real browser, driven through the real SeatMap.
//
// Until this file existed, draft history was covered only by lib-level unit
// tests of lib/draftHistory.ts and by *-source.test.mjs regexes asserting the
// call sites exist. Nothing ever clicked Undo and watched a seat come back —
// which is why extracting the stacks into useDraftHistory (#346) bottomed out
// in a manual check. These specs close that tier gap: they exercise the whole
// seam (capture snapshot → record entry → restore through the server action →
// apply the payload back onto the map) rather than its spelling.
//
// Harness rules apply (see ./harness): no CSS ships with the bundle, so clicks
// are dispatchEvent and assertions are presence-based, not paint-visibility.

function seat(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    seat_key: "n01",
    label: "N01",
    x: 0.3,
    y: 0.2,
    status: "available",
    layer: "draft",
    employee_id: null,
    department: null,
    zone: "North Pod",
    notes: null,
    is_custom: false,
    created_at: "",
    updated_at: "2026-08-09T04:00:00.000000+00:00",
    employee: null,
    ...overrides
  };
}

// Distinct microsecond-precision timestamps: the MLS02 fence compares these
// verbatim, so the fence assertion below is only meaningful if each row
// carries its own value (see lib/draftConcurrency.ts on never re-parsing
// through Date).
const n02 = seat({ id: "s2", seat_key: "n02", label: "N02", x: 0.5, y: 0.4, updated_at: "2026-08-09T04:00:01.000002+00:00" });
// A legitimately deletable custom seat — S-zone label, so it is not a
// protected original (see lib/seatProtection.ts).
const custom = seat({ id: "s3", seat_key: "s01", label: "S01", x: 0.6, y: 0.5, is_custom: true, updated_at: "2026-08-09T04:00:02.000003+00:00" });

const markers = (page: Page, label: string) => page.locator(`button[aria-label^="${label}"]`);
const marker = (page: Page, label: string) => markers(page, label).first();
const clickMarker = (page: Page, label: string) => marker(page, label).dispatchEvent("click");

// The command-row controls, addressed by their stable aria-labels. The notice
// strip renders a SECOND undo affordance labelled "Undo <entry>"; these names
// never collide with it.
const undoButton = (page: Page) => page.getByRole("button", { name: "Undo last map change" });
const redoButton = (page: Page) => page.getByRole("button", { name: "Redo last undone change" });

// Delete S01 through the real flow — select, inspector delete, confirm — so a
// history entry is recorded exactly the way the product records one. Delete
// lives in the collapsed Seat actions section — expand it before reaching for it.
async function deleteCustomSeat(page: Page) {
  await clickMarker(page, "S01");
  const actionsHeader = page.locator('button[aria-controls="seat-inspector-actions"]');
  await expect(actionsHeader).toBeAttached();
  await actionsHeader.dispatchEvent("click");
  await page.locator('[aria-label^="Delete custom seat"]').dispatchEvent("click");
  await page.getByRole("button", { name: "Delete seat" }).dispatchEvent("click");
  await expect(markers(page, "S01")).toHaveCount(0);
}

const adminProps = { seats: [custom, n02], employees: [], canEdit: true, publishedSeats: [] };

test("a draft edit enables Undo, and Undo puts the seat back", async ({ page }) => {
  await mountSeatMap(page, adminProps, {
    responses: {
      "action:deleteSeatAction": () => ({ seatId: "s3" }),
      "action:restoreDraftSnapshotAction": () => ({ ok: true, seats: [custom, n02], employees: [] })
    }
  });

  // Nothing recorded yet, so both controls are inert.
  await expect(undoButton(page)).toBeDisabled();
  await expect(redoButton(page)).toBeDisabled();

  await deleteCustomSeat(page);

  await expect(undoButton(page)).toBeEnabled();
  // The entry label reaches the control's tooltip, not just the stack.
  await expect(undoButton(page)).toHaveAttribute("title", "Undo Delete S01");

  await undoButton(page).dispatchEvent("click");

  await expect(marker(page, "S01")).toBeAttached();
  await expect(page.getByText("Undid Delete S01.")).toBeAttached();
});

test("Undo fences on the draft the page holds now, not the snapshot it restores", async ({ page }) => {
  const { calls } = await mountSeatMap(page, adminProps, {
    responses: {
      "action:deleteSeatAction": () => ({ seatId: "s3" }),
      "action:restoreDraftSnapshotAction": () => ({ ok: true, seats: [custom, n02], employees: [] })
    }
  });

  await deleteCustomSeat(page);
  await undoButton(page).dispatchEvent("click");
  await expect(marker(page, "S01")).toBeAttached();

  const restore = calls.find(call => call.name === "action:restoreDraftSnapshotAction");
  expect(restore, "Undo must go through restoreDraftSnapshotAction").toBeTruthy();
  const [snapshot, expectations] = restore!.args as [
    { seats: { id: string }[] },
    { id: string; updated_at: string }[]
  ];

  // The snapshot being restored still contains S01 — that is what undo is for.
  expect(snapshot.seats.map(s => s.id).sort()).toEqual(["s2", "s3"]);

  // But the fence describes the LIVE draft, which no longer contains it.
  // Sending the snapshot's rows here instead would make a concurrent edit by
  // another admin invisible to MLS02 and silently revert their work — the
  // whole reason the fence reads localSeats rather than the snapshot.
  expect(expectations).toEqual([{ id: "s2", updated_at: n02.updated_at }]);
});

test("Redo becomes available after an Undo and re-applies the change", async ({ page }) => {
  let restores = 0;
  await mountSeatMap(page, adminProps, {
    responses: {
      "action:deleteSeatAction": () => ({ seatId: "s3" }),
      "action:restoreDraftSnapshotAction": () => {
        restores += 1;
        // Undo restores the pre-delete draft; redo re-applies the delete.
        return restores === 1
          ? { ok: true, seats: [custom, n02], employees: [] }
          : { ok: true, seats: [n02], employees: [] };
      }
    }
  });

  await deleteCustomSeat(page);
  await undoButton(page).dispatchEvent("click");
  await expect(marker(page, "S01")).toBeAttached();

  await expect(redoButton(page)).toBeEnabled();
  await expect(redoButton(page)).toHaveAttribute("title", "Redo Delete S01");

  await redoButton(page).dispatchEvent("click");

  await expect(markers(page, "S01")).toHaveCount(0);
  await expect(page.getByText("Redid Delete S01.")).toBeAttached();
});

test("a stale-draft rejection on Undo drops the history and explains why", async ({ page }) => {
  await mountSeatMap(page, adminProps, {
    responses: {
      "action:deleteSeatAction": () => ({ seatId: "s3" }),
      // What the action returns when the RPC raises MLS02: another session
      // advanced the draft after this page loaded it.
      "action:restoreDraftSnapshotAction": () => ({ ok: false, message: "Another admin changed the draft." })
    }
  });

  await deleteCustomSeat(page);
  await expect(undoButton(page)).toBeEnabled();

  await undoButton(page).dispatchEvent("click");

  // The explanation lives in its own notice, not in actionError — the
  // inspector's reset paths call onError(null) and would wipe it mid-render.
  await expect(page.getByText(/Another admin changed the draft\./)).toBeAttached();
  await expect(page.getByText(/refreshed with the latest draft/)).toBeAttached();

  // ...and the now-invalid baselines are dropped, so the rejected edit cannot
  // be re-armed into the same stale write.
  await expect(undoButton(page)).toBeDisabled();
  await expect(redoButton(page)).toBeDisabled();
});
