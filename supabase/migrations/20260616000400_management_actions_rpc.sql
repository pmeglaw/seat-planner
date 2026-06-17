-- Make management cleanup actions atomic at the database level.
--
-- The app still performs an admin check before calling these RPCs. Each
-- function repeats that check, preserves draft/published separation, and keeps
-- dependent option/employee/seat mutations in one PostgreSQL transaction.

create or replace function public.deactivate_employee(employee_to_deactivate uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  published_label text;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if employee_to_deactivate is null then
    raise exception 'Employee is required.';
  end if;

  select seat.label
  into published_label
  from public.seats as seat
  where seat.layer = 'published'::public.seat_layer
    and seat.employee_id = employee_to_deactivate
  limit 1;

  if published_label is not null then
    raise exception 'This employee is still on the published map at %. Remove them from draft and publish before deleting.', published_label;
  end if;

  update public.seats as seat
  set
    employee_id = null,
    status = 'available'::public.seat_status
  where seat.layer = 'draft'::public.seat_layer
    and seat.employee_id = employee_to_deactivate;

  update public.employees as employee
  set active = false
  where employee.id = employee_to_deactivate;

  return employee_to_deactivate;
end;
$$;

create or replace function public.rename_department(department_from text, department_to text)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  normalized_from text := nullif(trim(coalesce(department_from, '')), '');
  normalized_to text := nullif(trim(coalesce(department_to, '')), '');
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if normalized_from is null then
    raise exception 'Department to rename is required.';
  end if;

  if normalized_to is null then
    raise exception 'New department name is required.';
  end if;

  insert into public.department_options (name, active)
  values (normalized_to, true)
  on conflict (name) do update
  set active = true;

  update public.employees as employee
  set department = normalized_to
  where employee.department = normalized_from;

  update public.department_options as department_option
  set active = false
  where department_option.name = normalized_from;
end;
$$;

create or replace function public.delete_department(department_name text)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  normalized_name text := nullif(trim(coalesce(department_name, '')), '');
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if normalized_name is null then
    raise exception 'Department is required.';
  end if;

  update public.employees as employee
  set department = null
  where employee.department = normalized_name;

  update public.department_options as department_option
  set active = false
  where department_option.name = normalized_name;
end;
$$;

create or replace function public.rename_zone(zone_from text, zone_to text)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  normalized_from text := nullif(trim(coalesce(zone_from, '')), '');
  normalized_to text := nullif(trim(coalesce(zone_to, '')), '');
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if normalized_from is null then
    raise exception 'Zone to rename is required.';
  end if;

  if normalized_to is null then
    raise exception 'New zone name is required.';
  end if;

  insert into public.zone_options (name, active)
  values (normalized_to, true)
  on conflict (name) do update
  set active = true;

  update public.seats as seat
  set zone = normalized_to
  where seat.layer = 'draft'::public.seat_layer
    and seat.zone = normalized_from;

  update public.zone_options as zone_option
  set active = false
  where zone_option.name = normalized_from;
end;
$$;

create or replace function public.delete_zone(zone_name text)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  normalized_name text := nullif(trim(coalesce(zone_name, '')), '');
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if normalized_name is null then
    raise exception 'Zone is required.';
  end if;

  update public.seats as seat
  set zone = null
  where seat.layer = 'draft'::public.seat_layer
    and seat.zone = normalized_name;

  update public.zone_options as zone_option
  set active = false
  where zone_option.name = normalized_name;
end;
$$;

revoke all on function public.deactivate_employee(uuid) from public, anon, authenticated;
revoke all on function public.rename_department(text, text) from public, anon, authenticated;
revoke all on function public.delete_department(text) from public, anon, authenticated;
revoke all on function public.rename_zone(text, text) from public, anon, authenticated;
revoke all on function public.delete_zone(text) from public, anon, authenticated;

grant execute on function public.deactivate_employee(uuid) to authenticated;
grant execute on function public.rename_department(text, text) to authenticated;
grant execute on function public.delete_department(text) to authenticated;
grant execute on function public.rename_zone(text, text) to authenticated;
grant execute on function public.delete_zone(text) to authenticated;
