-- Publish change_summary parity with lib/publishSummary.ts (bug fix, Plan 005).
--
-- Supersedes 20260715120000_publish_change_summary.sql, which introduced
-- publish_events.change_summary but only computed six of the eight change
-- kinds the client review dialog (lib/publishSummary.ts) shows the admin
-- before they approve a publish. Two kinds were silently dropped:
--
--   1. PEOPLE ADDED/REMOVED — the old employee_edits count is an INNER JOIN
--      `employees e JOIN published_employees pe ON pe.id = e.id`, so it only
--      ever counted edits to people present in BOTH sides. A newly-added
--      person (active, no snapshot row yet) or a removed person (snapshot row
--      whose live employee is gone or deactivated) contributed nothing, even
--      though buildEmployeeDetailChanges() in lib/publishSummary.ts explicitly
--      surfaces "New in the viewer directory" / "Removed from the viewer
--      directory" for exactly these cases.
--   2. SEAT DETAIL EDITS — buildOtherChangeDetail() in lib/publishSummary.ts
--      flags label/zone/department/notes/is_custom changes on a matched seat
--      (the `otherChanges` bucket), but the SQL had no counterpart among its
--      six counts.
--
-- Net effect being fixed: a publish whose only change was "added two new
-- people" or "renamed a seat / changed its zone" wrote an ALL-ZERO
-- change_summary, so the permanent audit row read "No changes recorded" for
-- a publish that did change what viewers see — contradicting the review
-- dialog the admin had just approved.
--
-- This migration re-creates app_private.publish_seat_map(), copying the
-- entire existing body verbatim and changing only the jsonb_build_object:
--   - employee_edits keeps its existing (correct) matched-and-edited join.
--   - employees_added / employees_removed are new.
--   - seat_detail_changes is new, mirroring buildOtherChangeDetail's field
--     list (label, zone, department, notes, is_custom) with `is distinct
--     from`, the same comparison style already used by employee_edits below.
--
-- "Removed from the viewer directory" semantics (owner-reconciled): the
-- client (buildEmployeeDetailChanges) computes liveIds from LIVE-ACTIVE
-- employees only, so a published_employees row counts as removed whenever
-- its person is either deleted entirely OR merely deactivated. employees_removed
-- mirrors that exactly: a published_employees row with no matching ACTIVE
-- employees row (not just no matching row at all).
--
-- seats_added, seats_removed, assignments_changed, seats_moved, and
-- status_changes are unchanged from 20260715120000 — those already match
-- lib/publishSummary.ts.

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
    'seat_detail_changes', (
      select count(*)
      from public.seats d
      join public.seats p
        on p.layer = 'published'
       and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
      where d.layer = 'draft'
        and (
          d.label is distinct from p.label
          or d.zone is distinct from p.zone
          or d.department is distinct from p.department
          or d.notes is distinct from p.notes
          or d.is_custom is distinct from p.is_custom
        )
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
    ),
    'employees_added', (
      select count(*)
      from public.employees e
      where e.active
        and not exists (
          select 1 from public.published_employees pe where pe.id = e.id
        )
    ),
    'employees_removed', (
      select count(*)
      from public.published_employees pe
      where not exists (
        select 1 from public.employees e where e.id = pe.id and e.active
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
