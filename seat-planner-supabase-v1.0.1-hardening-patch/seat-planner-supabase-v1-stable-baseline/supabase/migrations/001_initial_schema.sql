create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum ('admin', 'viewer');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.seat_status as enum ('available', 'assigned', 'reserved', 'unavailable');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.seat_layer as enum ('draft', 'published');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role public.user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) > 0),
  position text,
  department text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seats (
  id uuid primary key default gen_random_uuid(),
  seat_key text not null check (char_length(trim(seat_key)) > 0),
  label text not null check (char_length(trim(label)) > 0),
  x numeric(8,6) not null check (x >= 0 and x <= 1),
  y numeric(8,6) not null check (y >= 0 and y <= 1),
  status public.seat_status not null default 'available',
  layer public.seat_layer not null default 'draft',
  employee_id uuid references public.employees(id) on delete set null,
  department text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assigned_status_requires_employee
    check (
      (status = 'assigned' and employee_id is not null)
      or
      (status <> 'assigned' and employee_id is null)
    )
);

create unique index if not exists seats_unique_key_per_layer
  on public.seats(layer, seat_key);

create unique index if not exists one_draft_seat_per_employee
  on public.seats(employee_id)
  where employee_id is not null and layer = 'draft';

create unique index if not exists one_published_seat_per_employee
  on public.seats(employee_id)
  where employee_id is not null and layer = 'published';

create index if not exists seats_layer_idx on public.seats(layer);
create index if not exists seats_employee_id_idx on public.seats(employee_id);
create index if not exists employees_active_idx on public.employees(active);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_employees_updated_at on public.employees;
create trigger touch_employees_updated_at
before update on public.employees
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_seats_updated_at on public.seats;
create trigger touch_seats_updated_at
before update on public.seats
for each row
execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    coalesce(new.email, ''),
    'viewer'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'viewer'::public.user_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_role() = 'admin'::public.user_role;
$$;

create or replace function public.publish_seat_map()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
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
    department,
    notes
  from public.seats
  where layer = 'draft';
end;
$$;

revoke all on function public.publish_seat_map() from public;
grant execute on function public.publish_seat_map() to authenticated;

alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.seats enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "employees_select_authenticated" on public.employees;
create policy "employees_select_authenticated"
on public.employees
for select
to authenticated
using (active = true or public.is_admin());

drop policy if exists "employees_insert_admin_only" on public.employees;
create policy "employees_insert_admin_only"
on public.employees
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "employees_update_admin_only" on public.employees;
create policy "employees_update_admin_only"
on public.employees
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "employees_delete_admin_only" on public.employees;
create policy "employees_delete_admin_only"
on public.employees
for delete
to authenticated
using (public.is_admin());

drop policy if exists "seats_select_published_or_admin" on public.seats;
create policy "seats_select_published_or_admin"
on public.seats
for select
to authenticated
using (layer = 'published' or public.is_admin());

drop policy if exists "seats_insert_admin_only" on public.seats;
create policy "seats_insert_admin_only"
on public.seats
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "seats_update_admin_only" on public.seats;
create policy "seats_update_admin_only"
on public.seats
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "seats_delete_admin_only" on public.seats;
create policy "seats_delete_admin_only"
on public.seats
for delete
to authenticated
using (public.is_admin());
