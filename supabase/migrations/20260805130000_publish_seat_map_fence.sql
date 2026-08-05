-- Draft-concurrency fence for publish.
--
-- publish_seat_map copies the ENTIRE draft over the published layer, but had
-- no MLS02 fence (20260708120000_draft_concurrency_fence.sql): an admin
-- approving a publish review rendered from stale data shipped whatever the
-- draft had become — including another admin's in-progress edits the reviewer
-- never saw. This migration adds a trailing `expected_draft_seats jsonb
-- default null` parameter to both app_private.publish_seat_map() and its
-- public wrapper (default null = fence skipped, so already-deployed
-- application code keeps working during rollout).
--
-- The admin check stays first, unchanged. The draft rows are then locked
-- `for update` in a stable order, and the whole-draft fence applies the same
-- exact-match pattern as restore_draft_snapshot: every current draft row must
-- match an expectation entry (same id, same updated_at) AND the row counts
-- must match — never an aggregate like (count, max) — raising SQLSTATE
-- 'MLS02' on any divergence. The rest of the body (change-summary compute,
-- published copy, employee snapshot, audit event) is copied verbatim from
-- 20260724160000_publish_change_summary_parity.sql.
--
-- Each new parameter changes its function signature; the old zero-arg
-- overloads would otherwise stay callable and make zero-arg calls ambiguous,
-- so both old signatures are dropped (wrapper first) before recreating and
-- re-granting.

drop function if exists public.publish_seat_map();
drop function if exists app_private.publish_seat_map();

create or replace function app_private.publish_seat_map(
  expected_draft_seats jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  copied_count integer;
  change_summary jsonb;
  locked_row record;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.';
  end if;

  -- Lock every draft row in a stable order before checking the fence, so a
  -- concurrent draft write either committed first (and flips updated_at,
  -- which the fence sees) or blocks behind these locks until publish commits.
  for locked_row in
    select seat.id
    from public.seats as seat
    where seat.layer = 'draft'::public.seat_layer
    order by seat.id
    for update of seat
  loop
    null;
  end loop;

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

revoke all on function app_private.publish_seat_map(jsonb) from public, anon, authenticated;
grant execute on function app_private.publish_seat_map(jsonb) to authenticated;

-- App-facing wrapper stays security invoker (011_publish_seat_map_rpc_security);
-- the security-definer implementation remains in app_private.
create or replace function public.publish_seat_map(
  expected_draft_seats jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform app_private.publish_seat_map(expected_draft_seats);
end;
$$;

revoke all on function public.publish_seat_map(jsonb) from public, anon, authenticated;
grant execute on function public.publish_seat_map(jsonb) to authenticated;
