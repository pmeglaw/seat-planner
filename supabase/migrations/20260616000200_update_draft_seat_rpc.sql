-- Make draft seat inspector updates atomic at the database level.
--
-- The app still performs an admin check before calling this RPC. The function
-- repeats that check, validates direct RPC calls, and then performs
-- employee/option/seat mutations in one PostgreSQL function transaction so
-- partial inspector edits roll back on failure.

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
  seat_notes text
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
      raise exception 'That employee is already assigned to %.', duplicate_assignment_label;
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

revoke all on function public.update_draft_seat(uuid, text, public.seat_status, uuid, text, text, boolean, text, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.update_draft_seat(uuid, text, public.seat_status, uuid, text, text, boolean, text, boolean, text, text, text) to authenticated;
