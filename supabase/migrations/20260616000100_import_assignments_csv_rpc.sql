-- Make CSV assignment imports atomic at the database level.
--
-- The app still parses CSV text and performs an admin check before calling this
-- RPC. The function repeats the admin check, validates direct RPC calls before
-- any write, and then performs employee/option/seat mutations in one PostgreSQL
-- function transaction so partial imports roll back on failure.

create or replace function public.import_assignments_csv(assignment_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  invalid_row_number bigint;
  invalid_value text;
  locked_seat_id uuid;
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

  for locked_seat_id in
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
    select seat.id
    from public.seats as seat
    join incoming on incoming.seat_key = lower(trim(seat.label))
    where seat.layer = 'draft'::public.seat_layer
    order by seat.id
    for update of seat
  loop
    locked_seat_count := locked_seat_count + 1;
  end loop;

  if locked_seat_count <> expected_row_count then
    raise exception 'Could not lock every draft seat targeted by the CSV import.';
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

revoke all on function public.import_assignments_csv(jsonb) from public, anon, authenticated;
grant execute on function public.import_assignments_csv(jsonb) to authenticated;
