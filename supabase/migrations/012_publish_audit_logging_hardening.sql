-- Add audit logging to the active Seat Planner publish RPC.
-- The app calls public.publish_seat_map(), which delegates to app_private.publish_seat_map().
-- This keeps the existing publish behavior and records every successful publish in public.publish_events.

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

  insert into public.publish_events (published_by, seat_count)
  values (auth.uid(), copied_count);
end;
$$;
