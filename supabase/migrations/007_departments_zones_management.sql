-- Split physical seat zones from employee departments and add admin helpers
-- used by the v1.0.4 planner management UI.

alter table public.seats
add column if not exists zone text;

update public.seats
set zone = coalesce(nullif(zone, ''), nullif(department, ''))
where zone is null or zone = '';

update public.seats
set department = null
where department is not null;

create index if not exists seats_zone_idx on public.seats(zone);
create index if not exists employees_department_idx on public.employees(department);

create or replace function app_private.publish_seat_map()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.';
  end if;

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
    notes
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
    notes
  from public.seats
  where layer = 'draft';
end;
$$;

revoke all on function app_private.publish_seat_map() from public, anon, authenticated;
grant execute on function app_private.publish_seat_map() to authenticated;
