-- Employee email (Shell redesign flagged item, owner-approved 2026-07-10).
--
-- The redesigned inspector's Occupant section surfaces Email; the column did
-- not exist. Nullable on both the live directory (admin working set) and the
-- viewer snapshot, and copied by the publish RPC so email follows the same
-- publish gate as every other employee detail.

alter table public.employees
  add column if not exists email text;

alter table public.published_employees
  add column if not exists email text;

create or replace function app_private.publish_seat_map()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  copied_count integer;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.';
  end if;

  delete from public.seats where layer = 'published';

  insert into public.seats (
    seat_key,
    label,
    x,
    y,
    status,
    layer,
    employee_id,
    zone,
    department,
    notes,
    is_custom
  )
  select
    seat_key,
    label,
    x,
    y,
    status,
    'published'::public.seat_layer,
    employee_id,
    zone,
    department,
    notes,
    is_custom
  from public.seats
  where layer = 'draft'
  order by label;

  get diagnostics copied_count = row_count;

  -- Snapshot the active employee directory in the same transaction (see
  -- 20260708230000_published_employee_snapshot.sql). `where true` is required:
  -- Supabase loads pg-safeupdate on API connections, which rejects DELETE
  -- without a WHERE clause even inside SECURITY DEFINER functions.
  delete from public.published_employees where true;

  insert into public.published_employees (
    id,
    full_name,
    position,
    department,
    phone_extension,
    email,
    avatar_url,
    active,
    created_at,
    updated_at
  )
  select
    id,
    full_name,
    position,
    department,
    phone_extension,
    email,
    avatar_url,
    active,
    created_at,
    updated_at
  from public.employees
  where active
  order by full_name;

  insert into public.publish_events (published_by, seat_count)
  values (auth.uid(), copied_count);
end;
$$;

-- Keep the existing snapshot rows in step with the live table for the new
-- column (both are null today; this guards a backfilled live table too).
update public.published_employees as snapshot
set email = live.email
from public.employees as live
where snapshot.id = live.id
  and snapshot.email is distinct from live.email;
