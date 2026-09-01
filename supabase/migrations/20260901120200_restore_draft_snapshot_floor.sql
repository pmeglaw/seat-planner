-- Multi-floor, step 3 of 4 (2026-09-01): snapshot restore carries
-- seats.floor.
--
-- Verbatim re-create of public.restore_draft_snapshot from
-- 20260807120000_restore_draft_snapshot_staged_writes.sql (which now holds
-- only history) with the floor threaded through:
--   * a new validation, before any mutation, refuses a snapshot seat whose
--     floor is present but not a registered floor (blank included);
--   * the restore loop reads coalesce(trim(source.floor), '3') — a snapshot
--     exported before the column existed, or a persisted undo entry from
--     before this deploy, restores as Floor 3 (every such seat IS Floor 3);
--   * the per-row UPDATE and the INSERT write the floor.
-- The protected_original_label CASE, the staged label/seat_key parking, the
-- single custom-seat delete and every other statement are byte-identical
-- (tests/restore-draft-snapshot-transaction-safety.test.mjs and
-- tests/seat-protection-sql-agreement.test.mjs pin them). Same signature, so
-- `create or replace` only; ACLs preserved, revoke/grant repeated by
-- convention.

create or replace function public.restore_draft_snapshot(
  snapshot_seats jsonb,
  snapshot_employees jsonb,
  expected_draft_seats jsonb default null
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

  -- seats.floor (20260901120000): absent or null means the snapshot predates
  -- the column, which is Floor 3 by definition; anything present must name a
  -- registered floor. Same rule as parseFloorId in lib/schemas.ts.
  if exists (
    select 1
    from jsonb_to_recordset(snapshot_seats) as source(floor text)
    where source.floor is not null and trim(source.floor) not in ('2', '3')
  ) then
    raise exception 'Draft snapshot contains a seat on an unknown floor.';
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

  -- Concurrency fence: with the draft rows locked, verify every draft row the
  -- database holds is exactly the row the client was showing the admin — same
  -- ids, same updated_at, no extras either way. Any committed draft write
  -- since the client loaded (another admin, another tab) fails the match, and
  -- this restore would silently revert it — reject instead so the client can
  -- reload.
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

  -- Stage: park label AND seat_key for every surviving draft row the snapshot
  -- will change. Both unique indexes (seats_unique_label_per_layer,
  -- seats_unique_key_per_layer) are non-deferrable, so a permuted snapshot
  -- would collide with a not-yet-updated row mid-loop. Parking on the row id
  -- is collision-free against real labels and against other parked rows.
  -- Joining on snapshot ids is complete coverage: by this point every
  -- surviving draft row is present in snapshot_seats — rows absent from the
  -- snapshot were either deleted just above (eligible custom seats) or
  -- already rejected by the missing-protected-seats validation.
  -- Mirrors 20260724150000_reset_draft_staged_writes.sql step 3.
  update public.seats as d
  set label = '~restore~' || d.id::text,
      seat_key = '~restore~' || d.id::text
  from jsonb_to_recordset(snapshot_seats) as source(id uuid, seat_key text, label text)
  where d.layer = 'draft'::public.seat_layer
    and d.id = source.id
    and (
      d.label is distinct from trim(source.label)
      or d.seat_key is distinct from trim(source.seat_key)
    );

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
      coalesce(source.is_custom, false) as is_custom,
      coalesce(trim(source.floor), '3') as floor
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
      is_custom boolean,
      floor text
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
        is_custom = restore_row.is_custom,
        floor = restore_row.floor
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
        is_custom,
        floor
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
        restore_row.is_custom,
        restore_row.floor
      );
    end if;
  end loop;

  return expected_seat_count;
end;
$$;

revoke all on function public.restore_draft_snapshot(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.restore_draft_snapshot(jsonb, jsonb, jsonb) to authenticated;
