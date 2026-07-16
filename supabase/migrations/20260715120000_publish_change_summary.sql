-- Per-publish change summary (audit trail enrichment, Task 5.1).
--
-- publish_events already records WHO published and HOW MANY seats were copied.
-- This migration adds WHAT changed: a nullable jsonb `change_summary` computed
-- inside the publish transaction by diffing the draft layer against the still-
-- current published layer (and live employees against the viewer snapshot)
-- BEFORE the published rows are replaced. Old audit rows keep a null summary.
--
-- The counts mirror lib/publishSummary.ts semantics:
--   seats_added        draft seat with no published counterpart
--   seats_removed      published seat with no draft counterpart
--   assignments_changed matched seat whose employee_id differs
--   seats_moved        matched seat whose x/y moved beyond the 0.0005 epsilon
--   status_changes     matched seat whose status differs
--   employee_edits     active employee whose snapshot detail fields differ
--
-- Seats are matched on coalesce(seat_key, label): seat_key is NOT NULL today,
-- but the coalesce keeps the join robust for any row lacking one and mirrors
-- getPublishSeatKey() in lib/publishSummary.ts (seat_key, else label).

alter table public.publish_events
  add column if not exists change_summary jsonb;

create or replace function app_private.publish_seat_map()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  copied_count integer;
  change_summary jsonb;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.';
  end if;

  -- Compute the change summary BEFORE mutating the published layer, so the
  -- diff compares the incoming draft against the seats/employees viewers see
  -- right now. Coordinate moves use the same 0.0005 epsilon as the client-side
  -- summary (lib/publishSummary.ts COORDINATE_EPSILON).
  select jsonb_build_object(
    'seats_added', (
      select count(*)
      from public.seats d
      where d.layer = 'draft'
        and not exists (
          select 1 from public.seats p
          where p.layer = 'published'
            and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
        )
    ),
    'seats_removed', (
      select count(*)
      from public.seats p
      where p.layer = 'published'
        and not exists (
          select 1 from public.seats d
          where d.layer = 'draft'
            and coalesce(d.seat_key, d.label) = coalesce(p.seat_key, p.label)
        )
    ),
    'assignments_changed', (
      select count(*)
      from public.seats d
      join public.seats p
        on p.layer = 'published'
       and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
      where d.layer = 'draft'
        and coalesce(d.employee_id::text, '') is distinct from coalesce(p.employee_id::text, '')
    ),
    'seats_moved', (
      select count(*)
      from public.seats d
      join public.seats p
        on p.layer = 'published'
       and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
      where d.layer = 'draft'
        and (abs(d.x - p.x) > 0.0005 or abs(d.y - p.y) > 0.0005)
    ),
    'status_changes', (
      select count(*)
      from public.seats d
      join public.seats p
        on p.layer = 'published'
       and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
      where d.layer = 'draft'
        and d.status is distinct from p.status
    ),
    'employee_edits', (
      select count(*)
      from public.employees e
      join public.published_employees pe on pe.id = e.id
      where e.active
        and (
          e.full_name is distinct from pe.full_name
          or e.position is distinct from pe.position
          or e.department is distinct from pe.department
          or e.phone_extension is distinct from pe.phone_extension
          or e.email is distinct from pe.email
        )
    )
  ) into change_summary;

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

  insert into public.publish_events (published_by, seat_count, change_summary)
  values (auth.uid(), copied_count, change_summary);
end;
$$;
