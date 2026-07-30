import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const { vacateOtherSeatsForEmployee } = await importTsModule("lib/seatDraftActions.ts");

test("vacateOtherSeatsForEmployee clears the employee's previous seat", () => {
  const updated = { id: "b", employee_id: "e1", employee: { id: "e1", full_name: "Alice" }, status: "assigned", label: "B01" };
  const seats = [
    { id: "a", employee_id: "e1", employee: { id: "e1", full_name: "Alice" }, status: "assigned", label: "A01" },
    { id: "c", employee_id: "e2", employee: { id: "e2", full_name: "Bo" }, status: "assigned", label: "C01" },
    updated
  ];
  const result = vacateOtherSeatsForEmployee(seats, updated);
  const byId = Object.fromEntries(result.map(seat => [seat.id, seat]));
  assert.equal(byId.a.employee_id, null);
  assert.equal(byId.a.employee, null);
  assert.equal(byId.a.status, "available");
  assert.equal(byId.c.employee_id, "e2", "other people's seats untouched");
  assert.equal(byId.b.employee_id, "e1", "the updated seat itself untouched");
});

test("vacateOtherSeatsForEmployee is a no-op when the updated seat is open", () => {
  const updated = { id: "b", employee_id: null, employee: null, status: "available", label: "B01" };
  const seats = [{ id: "a", employee_id: "e1", employee: { id: "e1", full_name: "Alice" }, status: "assigned", label: "A01" }, updated];
  assert.deepEqual(vacateOtherSeatsForEmployee(seats, updated), seats);
});
