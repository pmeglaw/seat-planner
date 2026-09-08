-- Phase 4 close-out, PR 6 row 2 (owner ruling 2026-09-08; PHASE4BUILD §1.48).
--
-- deactivate_employee's published-map refusal gains a distinct SQLSTATE,
-- 'MLS03' (the MLS02 stale-draft fence is the precedent —
-- lib/draftConcurrency.ts). The action used to return EVERY RPC error as the
-- panel's "refused" arm, matched by nothing (finding F-2): a transport
-- failure rendered in the danger zone as if the database had refused. With a
-- code the action returns only the guard as REFUSED (lib/actionRefusals.ts)
-- and throws anything else, like its sibling management actions.
--
-- Verbatim re-create of public.deactivate_employee from
-- 20260702100000_department_integrity_normalization.sql: same signature, same
-- body, same message — the ONE change is `using errcode = 'MLS03'` on the
-- published-map raise. `create or replace` only; the revoke / grant pair is
-- restated so the function's exposure reads in one place.

create or replace function public.deactivate_employee(employee_to_deactivate uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  published_label text;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if employee_to_deactivate is null then
    raise exception 'Employee is required.';
  end if;

  select seat.label
  into published_label
  from public.seats as seat
  where seat.layer = 'published'::public.seat_layer
    and seat.employee_id = employee_to_deactivate
  limit 1;

  if published_label is not null then
    raise exception 'This employee is still on the published map at %. Remove them from draft and publish before deleting.', published_label
      using errcode = 'MLS03';
  end if;

  update public.seats as seat
  set
    employee_id = null,
    status = 'available'::public.seat_status
  where seat.layer = 'draft'::public.seat_layer
    and seat.employee_id = employee_to_deactivate;

  update public.employees as employee
  set active = false
  where employee.id = employee_to_deactivate;

  return employee_to_deactivate;
end;
$$;

revoke all on function public.deactivate_employee(uuid) from public, anon, authenticated;
grant execute on function public.deactivate_employee(uuid) to authenticated;
