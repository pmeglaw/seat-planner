-- Widen the CSV-import concurrency fence from CSV-targeted seats to the whole
-- draft.
--
-- 20260805120000 locked and fence-checked only the seats the CSV targets, but
-- the import's mutation footprint is wider: when a CSV row assigns an employee,
-- the loop below also vacates that employee's OTHER draft seat (the
-- unassign-elsewhere update), and that collateral seat was neither locked nor
-- checked. Admin B assigns X to seat B-12 while admin A's import review is
-- open; A confirms a CSV assigning X to A-03; the old fence passed (B-12 is
-- not a CSV row) and the import silently vacated B-12 — exactly the stale
-- overwrite class the fence exists to reject. The client already sends the
-- (id, updated_at) of EVERY draft seat it held at parse time
-- (lib/draftConcurrency.ts listDraftSeatExpectations via DataUtilitiesPanel);
-- the old SQL silently ignored the non-targeted entries.
--
-- This migration re-creates the function to:
--   * lock EVERY draft row in a stable order (id) — same footprint as
--     publish_seat_map and restore_draft_snapshot, so all whole-draft RPCs
--     share one lock order. PERFORM runs the query to completion and takes
--     the same row locks as a cursor loop
--     (20260629000100_update_draft_seat_force_move.sql uses the same idiom);
--   * keep the targeted-seat count check (every CSV row must match exactly
--     one draft seat) as a plain count over the already-locked rows;
--   * fence EVERY draft row, row by row with `is distinct from` — never an
--     aggregate (see 20260708120000_draft_concurrency_fence.sql) — naming the
--     first mismatched seat; a draft row with no matching expectation entry
--     fails the same comparison against the null subselect, and a count check
--     catches rows deleted since the review (absent rows escape the per-row
--     scan).
--
-- The signature is unchanged (assignment_rows jsonb, expected_seats jsonb
-- default null), so already-deployed application code keeps working and no
-- overload ambiguity is possible; the old 1-arg drop is repeated defensively
-- so the single-signature invariant survives even if migration history is
-- replayed out of order. Everything after the fence is copied verbatim from
-- 20260805120000.

drop function if exists public.import_assignments_csv(jsonb);

create or replace function public.import_assignments_csv(
  assignment_rows jsonb,
  expected_seats jsonb default null
)
returns integer
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  invalid_row_number bigint;
  invalid_value text;
  locked_seat_count integer := 0;
  expected_row_count integer;
  import_row record;
  target_seat_id uuid;
  target_employee_id uuid;
  employee_match_count bigint;
  normalized_employee_name text;
  normalized_employee_key text;
  normalized_position text;
  normalized_department text;
  normalized_zone text;
  normalized_notes text;
  normalized_status text;
  next_status public.seat_status;
  affected_count integer;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if assignment_rows is null or jsonb_typeof(assignment_rows) <> 'array' then
    raise exception 'CSV import rows must be a JSON array.';
  end if;

  expected_row_count := jsonb_array_length(assignment_rows);
  if expected_row_count = 0 then
    raise exception 'Row 1: CSV is empty.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(assignment_rows) as source(row_number integer)
    where source.row_number is null or source.row_number < 2
  ) then
    raise exception 'CSV import rows must include valid row_number values.';
  end if;

  select source.row_number, coalesce(source.seat_label, '')
  into invalid_row_number, invalid_value
  from jsonb_to_recordset(assignment_rows) as source(
    seat_label text,
    employee_name text,
    employee_email text,
    position text,
    department text,
    zone text,
    status text,
    notes text,
    row_number integer
  )
  where trim(coalesce(source.seat_label, '')) = ''
  limit 1;

  if invalid_row_number is not null then
    raise exception 'Row %: Seat label is required.', invalid_row_number;
  end if;

  invalid_row_number := null;
  invalid_value := null;

  with incoming as (
    select
      source.row_number,
      source.seat_label,
      lower(trim(coalesce(source.seat_label, ''))) as seat_key
    from jsonb_to_recordset(assignment_rows) as source(
      seat_label text,
      employee_name text,
      employee_email text,
      position text,
      department text,
      zone text,
      status text,
      notes text,
      row_number integer
    )
  )
  select min(row_number), min(seat_label)
  into invalid_row_number, invalid_value
  from incoming
  where seat_key <> ''
  group by seat_key
  having count(*) > 1
  limit 1;

  if invalid_row_number is not null then
    raise exception 'Row %: Duplicate seat row ''%''.', invalid_row_number, invalid_value;
  end if;

  invalid_row_number := null;
  invalid_value := null;

  select source.row_number, coalesce(source.status, '')
  into invalid_row_number, invalid_value
  from jsonb_to_recordset(assignment_rows) as source(
    seat_label text,
    employee_name text,
    employee_email text,
    position text,
    department text,
    zone text,
    status text,
    notes text,
    row_number integer
  )
  where lower(trim(coalesce(source.status, ''))) <> ''
    and lower(trim(coalesce(source.status, ''))) not in ('available', 'assigned', 'reserved', 'unavailable')
  limit 1;

  if invalid_row_number is not null then
    raise exception 'Row %: Invalid status ''%''.', invalid_row_number, invalid_value;
  end if;

  invalid_row_number := null;
  invalid_value := null;

  select source.row_number, lower(trim(coalesce(source.status, '')))
  into invalid_row_number, invalid_value
  from jsonb_to_recordset(assignment_rows) as source(
    seat_label text,
    employee_name text,
    employee_email text,
    position text,
    department text,
    zone text,
    status text,
    notes text,
    row_number integer
  )
  where lower(trim(coalesce(source.status, ''))) in ('reserved', 'unavailable')
    and trim(coalesce(source.employee_name, '')) <> ''
  limit 1;

  if invalid_row_number is not null then
    raise exception 'Row %: Rows with employee_name cannot be %.', invalid_row_number, invalid_value;
  end if;

  invalid_row_number := null;
  invalid_value := null;

  select source.row_number, coalesce(source.status, '')
  into invalid_row_number, invalid_value
  from jsonb_to_recordset(assignment_rows) as source(
    seat_label text,
    employee_name text,
    employee_email text,
    position text,
    department text,
    zone text,
    status text,
    notes text,
    row_number integer
  )
  where lower(trim(coalesce(source.status, ''))) = 'assigned'
    and trim(coalesce(source.employee_name, '')) = ''
  limit 1;

  if invalid_row_number is not null then
    raise exception 'Row %: Assigned rows require employee_name.', invalid_row_number;
  end if;

  invalid_row_number := null;
  invalid_value := null;

  select source.row_number, coalesce(source.employee_email, '')
  into invalid_row_number, invalid_value
  from jsonb_to_recordset(assignment_rows) as source(
    seat_label text,
    employee_name text,
    employee_email text,
    position text,
    department text,
    zone text,
    status text,
    notes text,
    row_number integer
  )
  where trim(coalesce(source.employee_email, '')) <> ''
    and trim(coalesce(source.employee_name, '')) = ''
  limit 1;

  if invalid_row_number is not null then
    raise exception 'Row %: employee_email requires employee_name.', invalid_row_number;
  end if;

  invalid_row_number := null;
  invalid_value := null;

  with incoming as (
    select
      source.row_number,
      source.seat_label,
      lower(trim(coalesce(source.seat_label, ''))) as seat_key
    from jsonb_to_recordset(assignment_rows) as source(
      seat_label text,
      employee_name text,
      employee_email text,
      position text,
      department text,
      zone text,
      status text,
      notes text,
      row_number integer
    )
  )
  select incoming.row_number, incoming.seat_label
  into invalid_row_number, invalid_value
  from incoming
  where not exists (
    select 1
    from public.seats as seat
    where seat.layer = 'draft'::public.seat_layer
      and lower(trim(seat.label)) = incoming.seat_key
  )
  limit 1;

  if invalid_row_number is not null then
    raise exception 'Row %: Unknown seat label ''%''.', invalid_row_number, invalid_value;
  end if;

  invalid_row_number := null;
  invalid_value := null;

  with incoming as (
    select
      source.row_number,
      source.employee_name,
      lower(trim(coalesce(source.employee_name, ''))) as employee_key,
      lower(trim(coalesce(source.status, ''))) as status_key
    from jsonb_to_recordset(assignment_rows) as source(
      seat_label text,
      employee_name text,
      employee_email text,
      position text,
      department text,
      zone text,
      status text,
      notes text,
      row_number integer
    )
  )
  select min(row_number), min(employee_name)
  into invalid_row_number, invalid_value
  from incoming
  where employee_key <> ''
    and status_key not in ('reserved', 'unavailable')
  group by employee_key
  having count(*) > 1
  limit 1;

  if invalid_row_number is not null then
    raise exception 'Row %: Employee ''%'' appears as assigned more than once.', invalid_row_number, invalid_value;
  end if;

  invalid_row_number := null;
  invalid_value := null;

  with incoming as (
    select
      source.row_number,
      source.employee_name,
      lower(trim(coalesce(source.employee_name, ''))) as employee_key
    from jsonb_to_recordset(assignment_rows) as source(
      seat_label text,
      employee_name text,
      employee_email text,
      position text,
      department text,
      zone text,
      status text,
      notes text,
      row_number integer
    )
  )
  select incoming.row_number, incoming.employee_name
  into invalid_row_number, invalid_value
  from incoming
  where incoming.employee_key <> ''
    and (
      select count(*)
      from public.employees as employee
      where lower(trim(employee.full_name)) = incoming.employee_key
    ) > 1
  limit 1;

  if invalid_row_number is not null then
    raise exception 'Row %: Employee name ''%'' matches multiple records. Rename or clean up duplicates before importing.', invalid_row_number, invalid_value;
  end if;

  -- Lock EVERY draft row (not just CSV-targeted ones) in a stable order
  -- before checking the fence: the assign loop's unassign-elsewhere update
  -- can vacate any draft seat holding a re-assigned employee, so the whole
  -- draft is the mutation footprint. Same lock order (id) as publish_seat_map
  -- and restore_draft_snapshot. PERFORM executes the query to completion and
  -- takes the same locks as a cursor loop would.
  perform seat.id
  from public.seats as seat
  where seat.layer = 'draft'::public.seat_layer
  order by seat.id
  for update of seat;

  -- Every CSV row must still match exactly one (now-locked) draft seat; a
  -- count drift here means a label collision or a seat that vanished between
  -- validation and locking.
  with incoming as (
    select lower(trim(coalesce(source.seat_label, ''))) as seat_key
    from jsonb_to_recordset(assignment_rows) as source(
      seat_label text,
      employee_name text,
      employee_email text,
      position text,
      department text,
      zone text,
      status text,
      notes text,
      row_number integer
    )
  )
  select count(*)
  into locked_seat_count
  from public.seats as seat
  join incoming on incoming.seat_key = lower(trim(seat.label))
  where seat.layer = 'draft'::public.seat_layer;

  if locked_seat_count <> expected_row_count then
    raise exception 'Could not lock every draft seat targeted by the CSV import.';
  end if;

  -- Concurrency fence: with the whole draft locked, verify EVERY draft row
  -- still carries the updated_at the client rendered when the admin reviewed
  -- this import — non-targeted rows included, because the unassign-elsewhere
  -- update can mutate them. Checked row by row with `is distinct from` —
  -- never an aggregate (see 20260708120000_draft_concurrency_fence.sql) — and
  -- a draft row with no matching expectation entry fails the same comparison
  -- against the null subselect: a seat the client never saw is exactly the
  -- stale case the fence exists to reject. The count check closes the one
  -- hole the per-row scan cannot see: a draft row DELETED since the review is
  -- absent from the scan, but leaves the client holding more expectations
  -- than the draft has rows.
  if expected_seats is not null then
    if jsonb_typeof(expected_seats) <> 'array' then
      raise exception 'Draft concurrency expectations must be a JSON array.';
    end if;

    invalid_value := null;

    select seat.label
    into invalid_value
    from public.seats as seat
    where seat.layer = 'draft'::public.seat_layer
      and seat.updated_at is distinct from (
        select expected.updated_at
        from jsonb_to_recordset(expected_seats) as expected(id uuid, updated_at timestamptz)
        where expected.id = seat.id
      )
    limit 1;

    if invalid_value is not null then
      raise exception 'Seat % changed in another session after it was loaded. Reload to pick up the latest draft, then try again.', invalid_value
        using errcode = 'MLS02';
    end if;

    if (
      select count(*)
      from public.seats as seat
      where seat.layer = 'draft'::public.seat_layer
    ) <> jsonb_array_length(expected_seats) then
      raise exception 'The draft map changed in another session after it was loaded. Reload to pick up the latest draft, then try again.'
        using errcode = 'MLS02';
    end if;
  end if;

  for import_row in
    select
      source.row_number,
      source.seat_label,
      source.employee_name,
      source.position,
      source.department,
      source.zone,
      source.status,
      source.notes
    from jsonb_to_recordset(assignment_rows) as source(
      seat_label text,
      employee_name text,
      employee_email text,
      position text,
      department text,
      zone text,
      status text,
      notes text,
      row_number integer
    )
    order by source.row_number
  loop
    normalized_employee_name := trim(coalesce(import_row.employee_name, ''));
    normalized_employee_key := lower(normalized_employee_name);
    normalized_position := nullif(trim(coalesce(import_row.position, '')), '');
    normalized_department := nullif(trim(coalesce(import_row.department, '')), '');
    normalized_zone := nullif(trim(coalesce(import_row.zone, '')), '');
    normalized_notes := nullif(trim(coalesce(import_row.notes, '')), '');
    normalized_status := lower(trim(coalesce(import_row.status, '')));
    target_employee_id := null;

    -- The FOR UPDATE here is a defensive no-op: every draft row is already
    -- locked by the whole-draft lock above. Kept so this lookup stays safe on
    -- its own terms if the upfront lock is ever narrowed.
    select seat.id
    into target_seat_id
    from public.seats as seat
    where seat.layer = 'draft'::public.seat_layer
      and lower(trim(seat.label)) = lower(trim(import_row.seat_label))
    for update;

    if target_seat_id is null then
      raise exception 'Row %: Unknown seat label ''%''.', import_row.row_number, import_row.seat_label;
    end if;

    if normalized_employee_name <> '' then
      if normalized_department is not null then
        insert into public.department_options (name, active)
        values (normalized_department, true)
        on conflict (name) do update set active = true;
      end if;

      select count(*)
      into employee_match_count
      from public.employees as employee
      where lower(trim(employee.full_name)) = normalized_employee_key;

      if employee_match_count > 1 then
        raise exception 'Row %: Employee name ''%'' matches multiple records. Rename or clean up duplicates before importing.', import_row.row_number, normalized_employee_name;
      end if;

      if employee_match_count = 1 then
        select employee.id
        into target_employee_id
        from public.employees as employee
        where lower(trim(employee.full_name)) = normalized_employee_key
        limit 1;

        update public.employees
        set
          full_name = normalized_employee_name,
          position = normalized_position,
          department = normalized_department,
          active = true
        where id = target_employee_id;
      else
        insert into public.employees (
          full_name,
          position,
          department,
          active
        )
        values (
          normalized_employee_name,
          normalized_position,
          normalized_department,
          true
        )
        returning id into target_employee_id;
      end if;
    end if;

    if normalized_zone is not null then
      insert into public.zone_options (name, active)
      values (normalized_zone, true)
      on conflict (name) do update set active = true;
    end if;

    next_status := case
      when target_employee_id is not null then 'assigned'::public.seat_status
      when normalized_status in ('reserved', 'unavailable') then normalized_status::public.seat_status
      else 'available'::public.seat_status
    end;

    if target_employee_id is not null then
      update public.seats
      set
        employee_id = null,
        status = 'available'::public.seat_status
      where layer = 'draft'::public.seat_layer
        and employee_id = target_employee_id
        and id <> target_seat_id;
    end if;

    update public.seats
    set
      employee_id = target_employee_id,
      status = next_status,
      zone = normalized_zone,
      notes = normalized_notes
    where id = target_seat_id
      and layer = 'draft'::public.seat_layer;

    get diagnostics affected_count = row_count;
    if affected_count <> 1 then
      raise exception 'Row %: Could not update draft seat ''%''.', import_row.row_number, import_row.seat_label;
    end if;
  end loop;

  return expected_row_count;
end;
$$;

revoke all on function public.import_assignments_csv(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_assignments_csv(jsonb, jsonb) to authenticated;
