-- Draft-layer optimistic concurrency fence (advisor HIGH finding, 2026-07-07).
--
-- The draft seat map is one shared copy edited by every admin session. Each RPC
-- is atomic, but nothing detected that the database draft had advanced past the
-- state a client was looking at, so a stale session silently reverted another
-- admin's committed edits (last-write-wins) — worst through undo/redo and JSON
-- restore, which rewrite the WHOLE draft from a client-held snapshot.
--
-- This migration adds trailing fence parameters (all `default null` = fence
-- skipped, so already-deployed application code keeps working during rollout):
--
--   * restore_draft_snapshot(..., expected_draft_seat_count integer,
--     expected_draft_max_updated_at timestamptz) — whole-draft fence. The client
--     sends the (count, max(updated_at)) fingerprint of the draft it holds; the
--     RPC re-computes both AFTER taking its row locks and raises SQLSTATE
--     'MLS02' if the database draft has advanced.
--   * update_draft_seat(..., expected_updated_at timestamptz) — per-seat fence
--     checked after the seat row is locked. Two admins editing DIFFERENT seats
--     still proceed concurrently; editing the SAME seat is rejected.
--   * swap_draft_seat_assignments(..., source_expected_updated_at timestamptz,
--     target_expected_updated_at timestamptz) — per-seat fence for both ends of
--     the reviewed swap, so the swap that commits is the swap the admin saw in
--     the review dialog.
--
-- `updated_at` is maintained by the touch_seats_updated_at trigger (001), so any
-- committed draft write moves the fingerprint. The fences are checked after
-- `for update` locks: a writer that committed first flips updated_at and the
-- fence sees it; a writer blocked behind our locks re-reads after we commit.
-- Residual window: locking existing rows cannot block a concurrent INSERT of a
-- brand-new draft seat, so the whole-draft fence narrows that race to
-- milliseconds rather than eliminating it — an accepted trade-off against
-- table-level locks that would contend with publish.
--
-- Each new parameter changes its function signature, which would otherwise
-- leave the old overload callable (and make 2-arg PostgREST calls ambiguous),
-- so the old signatures are dropped before recreating and re-granting.

drop function if exists public.restore_draft_snapshot(jsonb, jsonb);
drop function if exists public.update_draft_seat(uuid, text, public.seat_status, uuid, text, text, boolean, text, boolean, text, text, text, boolean);
drop function if exists public.swap_draft_seat_assignments(uuid, uuid);

create or replace function public.restore_draft_snapshot(
  snapshot_seats jsonb,
  snapshot_employees jsonb,
  expected_draft_seat_count integer default null,
  expected_draft_max_updated_at timestamptz default null
)
returns integer
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  expected_seat_count integer;
  invalid_label text;
  missing_employee_id uuid;
  duplicate_employee_id uuid;
  missing_protected_labels text;
  expected_delete_count bigint := 0;
  affected_count integer;
  restore_row record;
  next_status public.seat_status;
  current_draft_seat_count bigint;
  current_draft_max_updated_at timestamptz;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if snapshot_seats is null or jsonb_typeof(snapshot_seats) <> 'array' then
    raise exception 'Draft snapshot seats must be a JSON array.';
  end if;

  if snapshot_employees is null or jsonb_typeof(snapshot_employees) <> 'array' then
    raise exception 'Draft snapshot employees must be a JSON array.';
  end if;

  expected_seat_count := jsonb_array_length(snapshot_seats);
  if expected_seat_count = 0 then
    raise exception 'Cannot restore an empty draft map snapshot.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(snapshot_seats) as source(
      id uuid,
      seat_key text,
      label text,
      x numeric,
      y numeric,
      status text,
      layer text
    )
    where source.id is null
      or trim(coalesce(source.seat_key, '')) = ''
      or trim(coalesce(source.label, '')) = ''
      or source.x is null
      or source.y is null
      or lower(trim(coalesce(source.status, ''))) not in ('available', 'assigned', 'reserved', 'unavailable')
  ) then
    raise exception 'Draft snapshot contains an invalid seat.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(snapshot_seats) as source(layer text)
    where lower(trim(coalesce(source.layer, ''))) <> 'draft'
  ) then
    raise exception 'Undo/redo can only restore draft seats.';
  end if;

  with snapshot_labels as (
    select
      trim(source.label) as label,
      lower(trim(source.label)) as label_key
    from jsonb_to_recordset(snapshot_seats) as source(label text)
    where trim(coalesce(source.label, '')) <> ''
  )
  select min(label)
  into invalid_label
  from snapshot_labels
  group by label_key
  having count(*) > 1
  limit 1;

  if invalid_label is not null then
    raise exception 'Cannot restore duplicate draft seat label ''%''.', invalid_label;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(snapshot_employees) as source(id uuid, full_name text)
    where source.id is null
      or trim(coalesce(source.full_name, '')) = ''
  ) then
    raise exception 'Draft snapshot contains an invalid employee.';
  end if;

  select source.employee_id
  into duplicate_employee_id
  from jsonb_to_recordset(snapshot_seats) as source(employee_id uuid)
  where source.employee_id is not null
  group by source.employee_id
  having count(*) > 1
  limit 1;

  if duplicate_employee_id is not null then
    raise exception 'Cannot restore draft history because an employee is assigned to multiple seats.';
  end if;

  select seat.employee_id
  into missing_employee_id
  from jsonb_to_recordset(snapshot_seats) as seat(employee_id uuid)
  where seat.employee_id is not null
    and not exists (
      select 1
      from jsonb_to_recordset(snapshot_employees) as employee(id uuid)
      where employee.id = seat.employee_id
    )
    and not exists (
      select 1
      from public.employees as employee
      where employee.id = seat.employee_id
    )
  limit 1;

  if missing_employee_id is not null then
    raise exception 'Cannot restore draft history because an assigned employee record is missing.';
  end if;

  for restore_row in
    select seat.id
    from public.seats as seat
    where seat.layer = 'draft'::public.seat_layer
    order by seat.id
    for update of seat
  loop
    -- Lock all draft seats in a stable order before validating delete/update work.
    null;
  end loop;

  -- Concurrency fence: with the draft rows locked, verify the database draft
  -- still matches the fingerprint the client computed from the data it was
  -- showing the admin. Any committed draft write since then (another admin,
  -- another tab) moved count or max(updated_at), and this restore would
  -- silently revert it — reject instead so the client can reload.
  if expected_draft_seat_count is not null or expected_draft_max_updated_at is not null then
    select count(*), max(seat.updated_at)
    into current_draft_seat_count, current_draft_max_updated_at
    from public.seats as seat
    where seat.layer = 'draft'::public.seat_layer;

    if current_draft_seat_count is distinct from expected_draft_seat_count
      or current_draft_max_updated_at is distinct from expected_draft_max_updated_at
    then
      raise exception 'The draft map changed in another session after this page loaded it. Reload to pick up the latest draft, then try again.'
        using errcode = 'MLS02';
    end if;
  end if;

  select source.label
  into invalid_label
  from jsonb_to_recordset(snapshot_seats) as source(id uuid, label text, is_custom boolean)
  where coalesce(source.is_custom, false) is not true
    and not exists (
      select 1
      from public.seats as seat
      where seat.id = source.id
        and seat.layer = 'draft'::public.seat_layer
    )
  limit 1;

  if invalid_label is not null then
    raise exception 'Cannot restore protected original seat % because it no longer exists.', invalid_label;
  end if;

  with snapshot_ids as (
    select source.id
    from jsonb_to_recordset(snapshot_seats) as source(id uuid)
  ),
  current_missing as (
    select
      seat.*,
      upper(trim(seat.label)) as label_key
    from public.seats as seat
    where seat.layer = 'draft'::public.seat_layer
      and not exists (
        select 1
        from snapshot_ids
        where snapshot_ids.id = seat.id
      )
  ),
  current_classified as (
    select
      current_missing.*,
      case
        when current_missing.label_key ~ '^[A-Z]+[0-9]+$' then
          case substring(current_missing.label_key from '^([A-Z]+)')
            when 'C' then substring(current_missing.label_key from '([0-9]+)$')::integer between 1 and 8
            when 'CW' then substring(current_missing.label_key from '([0-9]+)$')::integer between 1 and 8
            when 'E' then substring(current_missing.label_key from '([0-9]+)$')::integer between 1 and 8
            when 'N' then substring(current_missing.label_key from '([0-9]+)$')::integer between 1 and 12
            when 'NE' then substring(current_missing.label_key from '([0-9]+)$')::integer between 1 and 8
            when 'SE' then substring(current_missing.label_key from '([0-9]+)$')::integer between 1 and 4
            when 'W' then substring(current_missing.label_key from '([0-9]+)$')::integer between 1 and 12
            else false
          end
        else false
      end as protected_original_label
    from current_missing
  )
  select string_agg(label, ', ' order by label)
  into missing_protected_labels
  from current_classified
  where not (
    is_custom is true
    and employee_id is null
    and status = 'available'::public.seat_status
    and protected_original_label is not true
  );

  if missing_protected_labels is not null then
    raise exception 'Cannot restore draft history because protected or occupied seats are missing from the snapshot: %.', missing_protected_labels;
  end if;

  with snapshot_ids as (
    select source.id
    from jsonb_to_recordset(snapshot_seats) as source(id uuid)
  )
  select count(*)
  into expected_delete_count
  from public.seats as seat
  where seat.layer = 'draft'::public.seat_layer
    and seat.is_custom is true
    and seat.employee_id is null
    and seat.status = 'available'::public.seat_status
    and not exists (
      select 1
      from snapshot_ids
      where snapshot_ids.id = seat.id
    );

  with department_names as (
    select distinct nullif(trim(coalesce(source.department, '')), '') as name
    from jsonb_to_recordset(snapshot_employees) as source(department text)
  )
  insert into public.department_options (name, active)
  select name, true
  from department_names
  where name is not null
  on conflict (name) do update set active = true;

  insert into public.employees (
    id,
    full_name,
    position,
    department,
    phone_extension,
    avatar_url,
    active
  )
  select
    source.id,
    trim(source.full_name),
    nullif(trim(coalesce(source.position, '')), ''),
    nullif(trim(coalesce(source.department, '')), ''),
    nullif(trim(coalesce(source.phone_extension, '')), ''),
    nullif(trim(coalesce(source.avatar_url, '')), ''),
    coalesce(source.active, true)
  from jsonb_to_recordset(snapshot_employees) as source(
    id uuid,
    full_name text,
    position text,
    department text,
    phone_extension text,
    avatar_url text,
    active boolean
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    position = excluded.position,
    department = excluded.department,
    phone_extension = excluded.phone_extension,
    avatar_url = excluded.avatar_url,
    active = excluded.active;

  with zone_names as (
    select distinct nullif(trim(coalesce(source.zone, source.department, '')), '') as name
    from jsonb_to_recordset(snapshot_seats) as source(zone text, department text)
  )
  insert into public.zone_options (name, active)
  select name, true
  from zone_names
  where name is not null
  on conflict (name) do update set active = true;

  update public.seats
  set
    employee_id = null,
    status = 'available'::public.seat_status
  where layer = 'draft'::public.seat_layer
    and status = 'assigned'::public.seat_status;

  delete from public.seats as seat
  where seat.layer = 'draft'::public.seat_layer
    and seat.is_custom is true
    and seat.employee_id is null
    and seat.status = 'available'::public.seat_status
    and seat.id in (
      select current_seat.id
      from public.seats as current_seat
      where current_seat.layer = 'draft'::public.seat_layer
        and not exists (
          select 1
          from jsonb_to_recordset(snapshot_seats) as source(id uuid)
          where source.id = current_seat.id
        )
    );

  get diagnostics affected_count = row_count;
  if affected_count <> expected_delete_count then
    raise exception 'Could not remove every eligible custom draft seat missing from the snapshot.';
  end if;

  for restore_row in
    select
      source.id,
      trim(source.seat_key) as seat_key,
      trim(source.label) as label,
      source.x,
      source.y,
      lower(trim(source.status)) as status,
      source.employee_id,
      nullif(trim(coalesce(source.zone, '')), '') as zone,
      nullif(trim(coalesce(source.department, '')), '') as department,
      nullif(trim(coalesce(source.notes, '')), '') as notes,
      coalesce(source.is_custom, false) as is_custom
    from jsonb_to_recordset(snapshot_seats) as source(
      id uuid,
      seat_key text,
      label text,
      x numeric,
      y numeric,
      status text,
      employee_id uuid,
      zone text,
      department text,
      notes text,
      is_custom boolean
    )
    order by source.id
  loop
    next_status := case
      when restore_row.employee_id is not null then 'assigned'::public.seat_status
      when restore_row.status = 'assigned' then 'available'::public.seat_status
      else restore_row.status::public.seat_status
    end;

    if exists (
      select 1
      from public.seats as seat
      where seat.id = restore_row.id
        and seat.layer = 'draft'::public.seat_layer
    ) then
      update public.seats as seat
      set
        seat_key = restore_row.seat_key,
        label = restore_row.label,
        x = restore_row.x,
        y = restore_row.y,
        status = next_status,
        employee_id = restore_row.employee_id,
        zone = restore_row.zone,
        department = restore_row.department,
        notes = restore_row.notes,
        is_custom = restore_row.is_custom
      where seat.id = restore_row.id
        and seat.layer = 'draft'::public.seat_layer;

      get diagnostics affected_count = row_count;
      if affected_count <> 1 then
        raise exception 'Could not restore draft seat %.', restore_row.label;
      end if;
    else
      insert into public.seats (
        id,
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
      values (
        restore_row.id,
        restore_row.seat_key,
        restore_row.label,
        restore_row.x,
        restore_row.y,
        next_status,
        'draft'::public.seat_layer,
        restore_row.employee_id,
        restore_row.zone,
        restore_row.department,
        restore_row.notes,
        restore_row.is_custom
      );
    end if;
  end loop;

  return expected_seat_count;
end;
$$;

revoke all on function public.restore_draft_snapshot(jsonb, jsonb, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.restore_draft_snapshot(jsonb, jsonb, integer, timestamptz) to authenticated;

create or replace function public.update_draft_seat(
  draft_seat_id uuid,
  seat_label text,
  requested_status public.seat_status,
  selected_employee_id uuid,
  employee_name text,
  employee_position text,
  employee_position_provided boolean,
  employee_phone_extension text,
  employee_phone_extension_provided boolean,
  employee_department text,
  seat_zone text,
  seat_notes text,
  force_move boolean default false,
  expected_updated_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  target_seat public.seats%rowtype;
  normalized_label text := trim(coalesce(seat_label, ''));
  normalized_employee_name text := nullif(trim(coalesce(employee_name, '')), '');
  normalized_employee_key text := lower(nullif(trim(coalesce(employee_name, '')), ''));
  normalized_position text := nullif(trim(coalesce(employee_position, '')), '');
  normalized_phone_extension text := nullif(trim(coalesce(employee_phone_extension, '')), '');
  normalized_department text := nullif(trim(coalesce(employee_department, '')), '');
  normalized_zone text := nullif(trim(coalesce(seat_zone, '')), '');
  normalized_notes text := nullif(trim(coalesce(seat_notes, '')), '');
  resolved_employee_id uuid := selected_employee_id;
  employee_match_count bigint := 0;
  duplicate_label text;
  duplicate_assignment_label text;
  updated_count integer;
  next_status public.seat_status;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if draft_seat_id is null then
    raise exception 'Draft seat is required.';
  end if;

  if normalized_label = '' then
    raise exception 'Seat label is required.';
  end if;

  select *
  into target_seat
  from public.seats as seat
  where seat.id = draft_seat_id
    and seat.layer = 'draft'::public.seat_layer
  for update of seat;

  if target_seat.id is null then
    raise exception 'Draft seat not found.';
  end if;

  -- Concurrency fence: with the seat row locked, reject the write if the seat
  -- changed after the client rendered it, so one admin's save cannot silently
  -- overwrite another's. Edits to other seats are unaffected.
  if expected_updated_at is not null
    and target_seat.updated_at is distinct from expected_updated_at
  then
    raise exception 'Seat % changed in another session after it was loaded. Reload to pick up the latest draft, then try again.', target_seat.label
      using errcode = 'MLS02';
  end if;

  select seat.label
  into duplicate_label
  from public.seats as seat
  where seat.layer = 'draft'::public.seat_layer
    and lower(trim(seat.label)) = lower(normalized_label)
    and seat.id <> draft_seat_id
  limit 1;

  if duplicate_label is not null then
    raise exception 'Seat label % already exists.', normalized_label;
  end if;

  if selected_employee_id is null
    and requested_status = 'assigned'::public.seat_status
    and normalized_employee_name is null
  then
    raise exception 'Assigned seats require an employee name or selected employee.';
  end if;

  if resolved_employee_id is not null then
    perform 1
    from public.employees as employee
    where employee.id = resolved_employee_id
    for update of employee;

    if not found then
      raise exception 'Selected employee no longer exists.';
    end if;
  elsif normalized_employee_name is not null then
    select count(*)
    into employee_match_count
    from public.employees as employee
    where lower(trim(employee.full_name)) = normalized_employee_key;

    if employee_match_count > 1 then
      raise exception 'Employee name ''%'' matches multiple records. Rename or clean up duplicates before assigning.', normalized_employee_name;
    end if;

    if employee_match_count = 1 then
      select employee.id
      into resolved_employee_id
      from public.employees as employee
      where lower(trim(employee.full_name)) = normalized_employee_key
      for update of employee;
    end if;
  end if;

  if resolved_employee_id is not null then
    select seat.label
    into duplicate_assignment_label
    from public.seats as seat
    where seat.layer = 'draft'::public.seat_layer
      and seat.employee_id = resolved_employee_id
      and seat.id <> draft_seat_id
    limit 1;

    if duplicate_assignment_label is not null then
      if coalesce(force_move, false) then
        -- Atomically free the employee's other draft seat so the assignment below
        -- satisfies the one_draft_seat_per_employee invariant in one transaction.
        update public.seats as seat
        set
          employee_id = null,
          status = 'available'::public.seat_status
        where seat.layer = 'draft'::public.seat_layer
          and seat.employee_id = resolved_employee_id
          and seat.id <> draft_seat_id;
      else
        raise exception 'That employee is already assigned to %.', duplicate_assignment_label
          using errcode = 'MLS01', detail = duplicate_assignment_label;
      end if;
    end if;
  end if;

  if resolved_employee_id is null and normalized_employee_name is not null then
    if normalized_department is not null then
      insert into public.department_options (name, active)
      values (normalized_department, true)
      on conflict (name) do update set active = true;
    end if;

    insert into public.employees (
      full_name,
      position,
      department,
      phone_extension,
      avatar_url,
      active
    )
    values (
      normalized_employee_name,
      normalized_position,
      normalized_department,
      normalized_phone_extension,
      null,
      true
    )
    returning id into resolved_employee_id;
  elsif resolved_employee_id is not null then
    if normalized_department is not null then
      insert into public.department_options (name, active)
      values (normalized_department, true)
      on conflict (name) do update set active = true;
    end if;

    update public.employees as employee
    set
      active = true,
      full_name = case
        when normalized_employee_name is not null then normalized_employee_name
        else employee.full_name
      end,
      position = case
        when coalesce(employee_position_provided, false) then normalized_position
        else employee.position
      end,
      phone_extension = case
        when coalesce(employee_phone_extension_provided, false) then normalized_phone_extension
        else employee.phone_extension
      end,
      department = normalized_department
    where employee.id = resolved_employee_id;

    get diagnostics updated_count = row_count;
    if updated_count <> 1 then
      raise exception 'Selected employee no longer exists.';
    end if;
  end if;

  if normalized_zone is not null then
    insert into public.zone_options (name, active)
    values (normalized_zone, true)
    on conflict (name) do update set active = true;
  end if;

  next_status := case
    when resolved_employee_id is not null then 'assigned'::public.seat_status
    when requested_status in ('reserved'::public.seat_status, 'unavailable'::public.seat_status) then requested_status
    else 'available'::public.seat_status
  end;

  update public.seats as seat
  set
    label = normalized_label,
    status = next_status,
    employee_id = resolved_employee_id,
    zone = normalized_zone,
    notes = normalized_notes
  where seat.id = draft_seat_id
    and seat.layer = 'draft'::public.seat_layer;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Could not update draft seat.';
  end if;

  return draft_seat_id;
end;
$$;

revoke all on function public.update_draft_seat(uuid, text, public.seat_status, uuid, text, text, boolean, text, boolean, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.update_draft_seat(uuid, text, public.seat_status, uuid, text, text, boolean, text, boolean, text, text, text, boolean, timestamptz) to authenticated;

create or replace function public.swap_draft_seat_assignments(
  source_draft_seat_id uuid,
  target_draft_seat_id uuid,
  source_expected_updated_at timestamptz default null,
  target_expected_updated_at timestamptz default null
)
returns setof public.seats
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  locked_seat public.seats%rowtype;
  source_seat public.seats%rowtype;
  target_seat public.seats%rowtype;
  source_next_employee_id uuid;
  target_next_employee_id uuid;
  source_next_status public.seat_status;
  target_next_status public.seat_status;
  updated_count integer;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if source_draft_seat_id is null or target_draft_seat_id is null then
    raise exception 'Both seats must exist on the draft map before swapping.';
  end if;

  if source_draft_seat_id = target_draft_seat_id then
    raise exception 'Choose a different target seat to complete the swap.';
  end if;

  for locked_seat in
    select *
    from public.seats
    where id in (source_draft_seat_id, target_draft_seat_id)
    order by id
    for update
  loop
    if locked_seat.id = source_draft_seat_id then
      source_seat := locked_seat;
    elsif locked_seat.id = target_draft_seat_id then
      target_seat := locked_seat;
    end if;
  end loop;

  if source_seat.id is null or target_seat.id is null then
    raise exception 'Both seats must exist on the draft map before swapping.';
  end if;

  if source_seat.layer <> 'draft'::public.seat_layer or target_seat.layer <> 'draft'::public.seat_layer then
    raise exception 'Both seats must be draft seats before swapping.';
  end if;

  -- Concurrency fence: with both rows locked, reject the swap if either seat
  -- changed after the client rendered the review dialog, so the swap that
  -- commits is exactly the swap the admin confirmed.
  if source_expected_updated_at is not null
    and source_seat.updated_at is distinct from source_expected_updated_at
  then
    raise exception 'Seat % changed in another session after it was loaded. Reload to pick up the latest draft, then try again.', source_seat.label
      using errcode = 'MLS02';
  end if;

  if target_expected_updated_at is not null
    and target_seat.updated_at is distinct from target_expected_updated_at
  then
    raise exception 'Seat % changed in another session after it was loaded. Reload to pick up the latest draft, then try again.', target_seat.label
      using errcode = 'MLS02';
  end if;

  if source_seat.employee_id is null and target_seat.employee_id is null then
    raise exception 'Swap requires at least one assigned seat.';
  end if;

  source_next_employee_id := target_seat.employee_id;
  target_next_employee_id := source_seat.employee_id;

  source_next_status := case
    when source_next_employee_id is not null then 'assigned'::public.seat_status
    when target_seat.employee_id is not null then 'available'::public.seat_status
    when target_seat.status in ('reserved'::public.seat_status, 'unavailable'::public.seat_status) then target_seat.status
    else 'available'::public.seat_status
  end;

  target_next_status := case
    when target_next_employee_id is not null then 'assigned'::public.seat_status
    when source_seat.employee_id is not null then 'available'::public.seat_status
    when source_seat.status in ('reserved'::public.seat_status, 'unavailable'::public.seat_status) then source_seat.status
    else 'available'::public.seat_status
  end;

  update public.seats
  set
    employee_id = null,
    status = 'available'::public.seat_status
  where id in (source_draft_seat_id, target_draft_seat_id)
    and layer = 'draft'::public.seat_layer;

  update public.seats as seat
  set
    employee_id = case
      when seat.id = source_draft_seat_id then source_next_employee_id
      when seat.id = target_draft_seat_id then target_next_employee_id
      else seat.employee_id
    end,
    status = case
      when seat.id = source_draft_seat_id then source_next_status
      when seat.id = target_draft_seat_id then target_next_status
      else seat.status
    end
  where seat.id in (source_draft_seat_id, target_draft_seat_id)
    and seat.layer = 'draft'::public.seat_layer;

  get diagnostics updated_count = row_count;
  if updated_count <> 2 then
    raise exception 'Could not swap both draft seats.';
  end if;

  return query
  select *
  from public.seats
  where id in (source_draft_seat_id, target_draft_seat_id)
    and layer = 'draft'::public.seat_layer
  order by label;
end;
$$;

revoke all on function public.swap_draft_seat_assignments(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.swap_draft_seat_assignments(uuid, uuid, timestamptz, timestamptz) to authenticated;
