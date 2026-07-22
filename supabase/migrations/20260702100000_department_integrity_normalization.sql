-- Department data integrity (audit finding E1) — normalization pass.
--
-- Root causes addressed here:
--   1. rename_department / delete_department matched employees.department with
--      exact case-sensitive string equality, silently leaving case/whitespace
--      variants behind ("Accounting" vs "accounting ").
--   2. Nothing guaranteed an active department_options row for every department
--      string employees actually carry, so unmanaged departments ("Social
--      Media", "HR") existed invisibly.
--
-- This migration re-issues the four management RPCs (department matchers become
-- case-insensitive + trim-safe; zone functions are re-issued verbatim so this
-- file holds the live definitions), then runs a one-time data cleanup:
-- whitespace-normalize employee departments, reactivate options that match a
-- live employee department, and register orphan department strings as managed
-- options. The relational FK model remains a Phase 3 follow-up
-- (docs/RISKS.md appendix A-5; formerly docs/redesign-architecture.md §5,
--  retired in the 2026-07-22 docs sweep).

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
  where lower(trim(employee.department)) = lower(normalized_from);

  update public.department_options as department_option
  set active = false
  where lower(department_option.name) = lower(normalized_from)
    and department_option.name <> normalized_to;
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
  where lower(trim(employee.department)) = lower(normalized_name);

  update public.department_options as department_option
  set active = false
  where lower(department_option.name) = lower(normalized_name);
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

-- One-time data cleanup ------------------------------------------------------

-- 0. Adopt departments recorded in the position field. Production data carries
--    department names in employees.position ("Accounting", "IT") with a null
--    department column — the visible half of finding E1. Only exact
--    (case-insensitive) matches against an ACTIVE managed option are adopted;
--    job titles like "Sr. Intake Specialist" are untouched.
update public.employees as employee
set department = department_option.name
from public.department_options as department_option
where employee.department is null
  and employee.active
  and department_option.active
  and lower(trim(coalesce(employee.position, ''))) = lower(department_option.name);

-- 1. Whitespace-normalize employee department strings (trim + collapse runs).
update public.employees
set department = nullif(regexp_replace(trim(department), '\s+', ' ', 'g'), '')
where department is not null
  and department is distinct from nullif(regexp_replace(trim(department), '\s+', ' ', 'g'), '');

-- 2. Reactivate managed options that match a live employee department
--    (case-insensitively) — deactivated options must not hide real departments.
update public.department_options as department_option
set active = true
where department_option.active = false
  and exists (
    select 1
    from public.employees as employee
    where employee.active
      and lower(trim(employee.department)) = lower(department_option.name)
  );

-- 3. Register orphan employee departments as managed options so nothing an
--    employee carries is invisible to Management ("Social Media", "HR").
insert into public.department_options (name, active)
select distinct on (lower(employee.department)) employee.department, true
from public.employees as employee
where employee.active
  and employee.department is not null
  and not exists (
    select 1
    from public.department_options as department_option
    where lower(department_option.name) = lower(employee.department)
  )
order by lower(employee.department), employee.department
on conflict (name) do update
set active = true;
