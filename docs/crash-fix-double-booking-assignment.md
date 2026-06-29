# Crash fix spec — assigning an already‑seated employee

**Severity:** Critical (P1). Blocks the most natural "move someone" action and shows a raw framework error to a non‑technical admin.
**Status:** Diagnosed in code, ready to implement.
**Owner:** _tbd_  **Target:** next patch release.

---

## 1. Summary

Assigning an employee who **already occupies a draft seat** to a **second** seat fails with a scary, generic error banner:

> "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance…"

…and the inspector mislabels it as a field‑validation problem ("Review inspector fields"), even though nothing is fillable. Assigning a brand‑new name works fine — the failure is specific to re‑assigning a person who is already seated.

**The important nuance:** the database layer is *already correct*. The `update_draft_seat` RPC detects the conflict and raises a clean, human‑readable message — **"That employee is already assigned to W11."** The bug is that this friendly message never reaches the user, because the server action **throws** it and Next.js production mode replaces thrown Server‑Action messages with the generic digest text.

So this is **not** a missing‑validation bug. It is an **error‑propagation** bug. The fix is to *return* the conflict as data instead of throwing it — and, as the real UX win, offer to move the person.

---

## 2. Reproduction (100% deterministic)

1. `/admin` → click an **open** seat (e.g. `C01`).
2. In the inspector's **Employee name** field, type `alex` and select **ALEX "SHABAZ"** (already seated at `W11`).
3. Click **Assign employee**.
4. ❌ Red "Server Components render" banner + `ERROR` badge + mislabeled "Review inspector fields".

Control: assigning a **new** name (e.g. "Jordan Lee") to `C01` succeeds. ✅

---

## 3. Root cause (with code references)

### 3a. The data model forbids two draft seats per person — correctly
`supabase/migrations/001_initial_schema.sql`
```sql
create unique index if not exists one_draft_seat_per_employee
  on public.seats(employee_id)
  where employee_id is not null and layer = 'draft';
```
(plus the published twin, and `assigned_status_requires_employee`). This is the right invariant — keep it.

### 3b. The RPC already guards the conflict with a friendly message
`supabase/migrations/20260616000200_update_draft_seat_rpc.sql` (lines ~114‑126)
```sql
if resolved_employee_id is not null then
  select seat.label into duplicate_assignment_label
  from public.seats as seat
  where seat.layer = 'draft'
    and seat.employee_id = resolved_employee_id
    and seat.id <> draft_seat_id
  limit 1;

  if duplicate_assignment_label is not null then
    raise exception 'That employee is already assigned to %.', duplicate_assignment_label;
  end if;
end if;
```
So the unique index never even fires — the RPC raises its own clear message first. Good.

### 3c. …but the action throws it, and Next.js eats the message
`app/actions.ts` → `updateSeatAction` (line ~319):
```ts
const { error } = await supabase.rpc("update_draft_seat", { /* … */ });
if (error) throw new Error(error.message);   // <-- the problem
```
When a **Server Action throws** in a **production** build, Next.js deliberately discards `error.message` (to avoid leaking internals) and surfaces the generic *"Server Components render … digest"* string instead. So the client never sees "already assigned to W11."

### 3d. The client then mislabels the generic text as a field error
`components/seat-map/SeatInspector.tsx` (lines ~600‑608):
```ts
} catch (error) {
  const message = error instanceof Error ? error.message : "Could not update assignment.";
  const serverFieldErrors = fieldErrorFromServerMessage(message);   // can't match a digest string
  setLocalError(message);
  setFieldErrors(serverFieldErrors);   // renders the "Review inspector fields" box
  …
}
```
`fieldErrorFromServerMessage` is designed to map known RPC messages to fields, but in production it receives the digest string, matches nothing useful, and the generic text lands in the "Review inspector fields" panel.

> ⚠️ **This affects every other RPC message too.** "Seat label X already exists", "Employee name matches multiple records", "Selected employee no longer exists" — all are `raise exception` messages that get stripped to the generic digest in production. Fixing the propagation pattern fixes the whole class, not just double‑booking.

---

## 4. The fix

Two phases. Phase 1 stops the scary crash with minimal change; Phase 2 delivers the real UX (offer to move the person).

### Phase 1 — Return conflicts as data (≈ half a day) — *stops the crash*

**Goal:** the friendly message survives to the client; no more digest, no more mislabeled field box.

**4.1 Give the RPC conflict a stable, machine‑readable code.**
`update_draft_seat` — in the conflict branch, raise with a custom SQLSTATE and put the seat label in `detail` so the action can read it without string‑parsing:
```sql
if duplicate_assignment_label is not null then
  raise exception 'That employee is already assigned to %.', duplicate_assignment_label
    using errcode = 'MLS01', detail = duplicate_assignment_label;
end if;
```
(`MLS01` = any custom 5‑char SQLSTATE not used by Postgres. PostgREST/Supabase passes it through as `error.code`, and `detail` as `error.details`.)

**4.2 Make `updateSeatAction` RETURN a discriminated result instead of throwing.**
`app/actions.ts`:
```ts
export type UpdateSeatResult =
  | { ok: true; seat: SeatWithEmployee }
  | { ok: false; code: "EMPLOYEE_ALREADY_ASSIGNED"; message: string; currentSeatLabel: string }
  | { ok: false; code: "VALIDATION"; message: string };

export async function updateSeatAction(input: { /* …unchanged… */ }): Promise<UpdateSeatResult> {
  const supabase = await requireAdmin();
  // …unchanged normalization…
  const { error } = await supabase.rpc("update_draft_seat", { /* …unchanged… */ });

  if (error) {
    if (error.code === "MLS01") {
      return {
        ok: false,
        code: "EMPLOYEE_ALREADY_ASSIGNED",
        currentSeatLabel: error.details ?? "another seat",
        message: error.message, // "That employee is already assigned to W11."
      };
    }
    // Other known validation messages from the RPC are safe to surface verbatim:
    return { ok: false, code: "VALIDATION", message: error.message };
  }

  revalidatePath("/admin");
  const seat = await getDraftSeatById(supabase, input.seatId);
  return { ok: true, seat };
}
```
Because we now **return** (not throw), Next.js no longer strips the message.

**4.3 Update the inspector to read the result.**
`components/seat-map/SeatInspector.tsx` — replace the `await updateSeatAction(...)` + `try/catch` with result handling:
```ts
const result = await updateSeatAction({ /* …unchanged args… */ });
if (result.ok) {
  /* existing success path with result.seat */
} else if (result.code === "EMPLOYEE_ALREADY_ASSIGNED") {
  setConflict({ employeeName, currentSeatLabel: result.currentSeatLabel }); // Phase 2 dialog
} else {
  setLocalError(result.message);            // friendly validation text, no digest
  setFieldErrors(fieldErrorFromServerMessage(result.message));
}
```
Keep a `try/catch` only for genuinely unexpected/network errors (show "Couldn't reach the server, try again").

**After Phase 1 alone:** instead of the digest, the admin sees the real message — *"That employee is already assigned to W11."* — in a normal inline notice. The crash and the mislabel are gone.

### Phase 2 — Offer to move the person (≈ 1–2 days) — *the real win*

**4.4 Add an atomic `force_move` to the RPC.** Add a trailing param `force_move boolean default false`. In the conflict branch, when `force_move` is true, **vacate the employee's other draft seat in the same transaction** instead of raising:
```sql
if duplicate_assignment_label is not null then
  if coalesce(force_move, false) then
    update public.seats
      set employee_id = null, status = 'available'
      where layer = 'draft' and employee_id = resolved_employee_id and id <> draft_seat_id;
  else
    raise exception 'That employee is already assigned to %.', duplicate_assignment_label
      using errcode = 'MLS01', detail = duplicate_assignment_label;
  end if;
end if;
```
The whole function is already one transaction, so the vacate + assign is atomic and safe (mirrors `swap_draft_seat_assignments`). Remember to drop/recreate with the new signature and re‑grant `execute`.

**4.5 Thread `forceMove` through the action** (`updateSeatAction(input: { …, forceMove?: boolean })` → pass `force_move: input.forceMove ?? false` to the RPC).

**4.6 Client confirm dialog.** On `EMPLOYEE_ALREADY_ASSIGNED`, show a confirm consistent with the existing Vacate/Swap dialogs:
> **Move ALEX "SHABAZ" to C01?**
> They currently sit at **W11**. Moving frees W11 (it becomes Open). Viewers won't see this until you publish.
> **[ Move them ]   [ Cancel ]**

**[Move them]** re‑calls `updateSeatAction({ …same…, forceMove: true })`; on `ok`, run the normal success path and toast *"Moved ALEX to C01 (W11 is now open)."* with the existing per‑action Undo.

> Note: "Keep both" is intentionally **not** offered — the `one_*_seat_per_employee` invariant forbids it. Good.

---

## 5. Acceptance criteria

- [ ] Assigning an already‑seated employee **never** shows the "Server Components render"/digest text.
- [ ] Phase 1: the admin sees the plain message naming the current seat ("…already assigned to W11.") in a normal notice, not in the "Review inspector fields" box.
- [ ] Phase 2: a **Move them / Cancel** dialog appears; **Move** vacates the old seat and assigns the new one atomically; **Cancel** leaves both seats unchanged.
- [ ] After a move: old seat is **Open**, new seat shows the employee, assigned count is unchanged, and per‑action **Undo** restores the prior state.
- [ ] No partial writes on failure (transaction rolls back).
- [ ] The same change makes other RPC validation messages (duplicate label, multiple‑match) display verbatim in production.
- [ ] Published map is untouched until publish.

## 6. Test cases

**SQL/RPC (add to `supabase` test set):**
1. Assign employee already on `W11` to open `C01`, `force_move=false` → raises `SQLSTATE MLS01`, `detail='W11'`, no rows changed.
2. Same with `force_move=true` → `C01.employee_id = emp`, `W11.employee_id = null` & `status='available'`, exactly two seat rows changed, one transaction.
3. Assign brand‑new name → creates employee + assigns (unchanged behaviour).
4. Concurrent double‑assign of the same employee → second call still blocked by `one_draft_seat_per_employee` (the `for update` lock + index hold).

**Unit (`tests/`):** `updateSeatAction` returns `{ok:false, code:'EMPLOYEE_ALREADY_ASSIGNED', currentSeatLabel:'W11'}` when the RPC returns `code==='MLS01'`; returns `{ok:true}` on success; maps unknown error codes to `{ok:false, code:'VALIDATION'}`.

**Manual:** the repro in §2 now shows the Move dialog; Move works; Undo restores; screen‑reader announces the dialog (tie in with the `aria-live` quick‑win).

## 7. Rollout & risk

- DB change is additive (new optional param, new errcode, no schema/data migration). Deploy the migration, then the app — old app calling new RPC still works (param defaults to false).
- Low blast radius: only `update_draft_seat`, `updateSeatAction`, and the inspector's submit handler change.
- Roll back by reverting the app; the RPC's extra param is harmless if unused.

## 8. Recommended follow‑up (separate ticket)

Adopt the **"return, don't throw, for expected errors"** pattern across `app/actions.ts` (create/move/swap/vacate/delete, department/zone ops). Today every `throw new Error(rpcMessage)` becomes a generic digest in production. Converting them to discriminated results (or a shared `actionResult()` helper) makes all the carefully‑written RPC messages actually reach users, and lets the client stop trying to reverse‑engineer field errors from prose. This is the single highest‑leverage reliability change in the codebase.
