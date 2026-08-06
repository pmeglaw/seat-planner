-- Extend the publish concurrency fence to the employee directory.
--
-- 20260805130000 fenced the draft SEAT rows, but publish_seat_map also
-- atomically replaces the public.published_employees snapshot from the live
-- ACTIVE directory — and the publish review dialog explicitly diffs employee
-- details (lib/publishSummary.ts employeeDetailChanges), so people data is
-- part of what the admin reviews. A rename, phone edit, deactivation, or new
-- hire committed by another admin after the review opened shipped to viewers
-- with no MLS02, because no seat row changed. This migration adds a trailing
-- `expected_employees jsonb default null` parameter to both
-- app_private.publish_seat_map and its public wrapper: the client sends the
-- (id, updated_at) of every ACTIVE employee as the review rendered it, and
-- the fence requires the active directory to still match exactly — same ids,
-- same updated_at, no extras either way. Inactive rows are deliberately not
-- fenced: they are not copied into the snapshot, so they cannot ship
-- unreviewed changes. employees.updated_at is maintained by the
-- touch_employees_updated_at trigger (001_initial_schema.sql).
--
-- Both row locks now use PERFORM ... FOR UPDATE (the empty cursor loop it
-- replaces took identical locks; 20260629000100_update_draft_seat_force_move
-- established the PERFORM idiom). Lock order is seats before employees, and
-- rows within each set by id — the same order the other whole-draft RPCs use.
--
-- default null = fence skipped, so already-deployed application code calling
-- with only expected_draft_seats keeps working during rollout. As with
-- 20260805130000, the protection is one-directional: NEW application code
-- naming expected_employees cannot resolve against the OLD signature, so this
-- migration must land in the same merge as the client change (it does — the
-- Supabase GitHub integration applies migrations on merge to main). The old
-- 1-arg signatures are dropped (wrapper first) before recreating and
-- re-granting, or zero-/one-arg PostgREST calls would turn ambiguous. The
-- change-summary compute, published copy, employee snapshot, and audit event
-- below are copied verbatim from 20260805130000.

drop function if exists public.publish_seat_map(jsonb);
drop function if exists app_private.publish_seat_map(jsonb);

create or replace function app_private.publish_seat_map(
  expected_draft_seats jsonb default null,
  expected_employees jsonb default null
)
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

  -- Lock every draft row in a stable order before checking the fence, so a
  -- concurrent draft write either committed first (and flips updated_at,
  -- which the fence sees) or blocks behind these locks until publish commits.
  perform seat.id
  from public.seats as seat
  where seat.layer = 'draft'::public.seat_layer
  order by seat.id
  for update of seat;

  -- Concurrency fence: with the draft rows locked, verify every draft row the
  -- database holds is exactly the row the publish review showed the admin —
  -- same ids, same updated_at, no extras either way (the restore_draft_snapshot
  -- pattern). Any committed draft write since the review opened fails the
  -- match; publishing it would ship changes the reviewer never approved.
  if expected_draft_seats is not null then
    if jsonb_typeof(expected_draft_seats) <> 'array' then
      raise exception 'Draft concurrency expectations must be a JSON array.';
    end if;

    if exists (
      select 1
      from public.seats as seat
      where seat.layer = 'draft'::public.seat_layer
        and not exists (
          select 1
          from jsonb_to_recordset(expected_draft_seats) as expected(id uuid, updated_at timestamptz)
          where expected.id = seat.id
            and expected.updated_at = seat.updated_at
        )
    ) or (
      select count(*)
      from public.seats as seat
      where seat.layer = 'draft'::public.seat_layer
    ) <> jsonb_array_length(expected_draft_seats)
    then
      raise exception 'The draft map changed in another session after this page loaded it. Reload to pick up the latest draft, then try again.'
        using errcode = 'MLS02';
    end if;
  end if;

  -- Publish also replaces the published_employees snapshot from the live
  -- ACTIVE directory (below), so active employee rows are part of the
  -- mutation footprint. Lock them the same way before checking their fence.
  perform employee.id
  from public.employees as employee
  where employee.active
  order by employee.id
  for update of employee;

  -- Employee-directory fence: the publish review diffs live employees against
  -- the viewer snapshot, so the reviewed state includes people data. Verify
  -- the ACTIVE directory — the exact set the snapshot below ships — still
  -- matches what the review rendered. An edited or newly activated/created
  -- row fails the per-row match; a row deactivated since the review leaves
  -- the client holding more expectations than the directory has active rows,
  -- which the count check catches.
  if expected_employees is not null then
    if jsonb_typeof(expected_employees) <> 'array' then
      raise exception 'Employee concurrency expectations must be a JSON array.';
    end if;

    if exists (
      select 1
      from public.employees as employee
      where employee.active
        and not exists (
          select 1
          from jsonb_to_recordset(expected_employees) as expected(id uuid, updated_at timestamptz)
          where expected.id = employee.id
            and expected.updated_at = employee.updated_at
        )
    ) or (
      select count(*)
      from public.employees as employee
      where employee.active
    ) <> jsonb_array_length(expected_employees)
    then
      raise exception 'The employee directory changed in another session after this review opened. Reload to pick up the latest directory, then try again.'
        using errcode = 'MLS02';
    end if;
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

revoke all on function app_private.publish_seat_map(jsonb, jsonb) from public, anon, authenticated;
grant execute on function app_private.publish_seat_map(jsonb, jsonb) to authenticated;

-- App-facing wrapper stays security invoker (011_publish_seat_map_rpc_security);
-- the security-definer implementation remains in app_private.
create or replace function public.publish_seat_map(
  expected_draft_seats jsonb default null,
  expected_employees jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform app_private.publish_seat_map(expected_draft_seats, expected_employees);
end;
$$;

revoke all on function public.publish_seat_map(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.publish_seat_map(jsonb, jsonb) to authenticated;
