-- v1.0.5 planner management cleanup
-- Adds persistent department/zone options, hardens employee deletion behavior,
-- and ensures publish copies separated seat zones.

create table if not exists public.department_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zone_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.department_options enable row level security;
alter table public.zone_options enable row level security;

insert into public.department_options (name, active)
select distinct trim(department), true
from public.employees
where department is not null and trim(department) <> ''
on conflict (name) do update set active = true;

insert into public.zone_options (name, active)
select distinct trim(coalesce(zone, department)), true
from public.seats
where coalesce(zone, department) is not null and trim(coalesce(zone, department)) <> ''
on conflict (name) do update set active = true;

create index if not exists department_options_active_idx on public.department_options(active);
create index if not exists zone_options_active_idx on public.zone_options(active);

drop trigger if exists touch_department_options_updated_at on public.department_options;
create trigger touch_department_options_updated_at
before update on public.department_options
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_zone_options_updated_at on public.zone_options;
create trigger touch_zone_options_updated_at
before update on public.zone_options
for each row
execute function public.touch_updated_at();

drop policy if exists "department_options_select_authenticated" on public.department_options;
create policy "department_options_select_authenticated"
on public.department_options
for select
to authenticated
using (active = true or app_private.is_admin());

drop policy if exists "department_options_insert_admin_only" on public.department_options;
create policy "department_options_insert_admin_only"
on public.department_options
for insert
to authenticated
with check (app_private.is_admin());

drop policy if exists "department_options_update_admin_only" on public.department_options;
create policy "department_options_update_admin_only"
on public.department_options
for update
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists "department_options_delete_admin_only" on public.department_options;
create policy "department_options_delete_admin_only"
on public.department_options
for delete
to authenticated
using (app_private.is_admin());

drop policy if exists "zone_options_select_authenticated" on public.zone_options;
create policy "zone_options_select_authenticated"
on public.zone_options
for select
to authenticated
using (active = true or app_private.is_admin());

drop policy if exists "zone_options_insert_admin_only" on public.zone_options;
create policy "zone_options_insert_admin_only"
on public.zone_options
for insert
to authenticated
with check (app_private.is_admin());

drop policy if exists "zone_options_update_admin_only" on public.zone_options;
create policy "zone_options_update_admin_only"
on public.zone_options
for update
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists "zone_options_delete_admin_only" on public.zone_options;
create policy "zone_options_delete_admin_only"
on public.zone_options
for delete
to authenticated
using (app_private.is_admin());

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

create or replace function public.publish_seat_map()
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.publish_seat_map();
end;
$$;

revoke all on function public.publish_seat_map() from public, anon, authenticated;
grant execute on function public.publish_seat_map() to authenticated;
