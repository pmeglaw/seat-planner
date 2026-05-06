-- Harden helper function exposure while preserving RLS behavior.
--
-- The app's RLS policies need admin helper functions, but those helpers do not
-- need to be exposed as public RPC endpoints. Move policy helpers into a
-- non-exposed schema, update policies to call those helpers, and remove direct
-- execute privileges from the legacy public helper functions.

create schema if not exists app_private;
revoke all on schema app_private from public;

grant usage on schema app_private to authenticated;

create or replace function app_private.current_user_role()
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

create or replace function app_private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select app_private.current_user_role() = 'admin'::public.user_role;
$$;

revoke all on function app_private.current_user_role() from public, anon, authenticated;
revoke all on function app_private.is_admin() from public, anon, authenticated;
grant execute on function app_private.current_user_role() to authenticated;
grant execute on function app_private.is_admin() to authenticated;

create or replace function public.publish_seat_map()
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

revoke all on function public.current_user_role() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.publish_seat_map() from public, anon, authenticated;
grant execute on function public.publish_seat_map() to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or app_private.is_admin());

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only"
on public.profiles
for update
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists "employees_select_authenticated" on public.employees;
create policy "employees_select_authenticated"
on public.employees
for select
to authenticated
using (active = true or app_private.is_admin());

drop policy if exists "employees_insert_admin_only" on public.employees;
create policy "employees_insert_admin_only"
on public.employees
for insert
to authenticated
with check (app_private.is_admin());

drop policy if exists "employees_update_admin_only" on public.employees;
create policy "employees_update_admin_only"
on public.employees
for update
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists "employees_delete_admin_only" on public.employees;
create policy "employees_delete_admin_only"
on public.employees
for delete
to authenticated
using (app_private.is_admin());

drop policy if exists "seats_select_published_or_admin" on public.seats;
create policy "seats_select_published_or_admin"
on public.seats
for select
to authenticated
using (layer = 'published' or app_private.is_admin());

drop policy if exists "seats_insert_admin_only" on public.seats;
create policy "seats_insert_admin_only"
on public.seats
for insert
to authenticated
with check (app_private.is_admin());

drop policy if exists "seats_update_admin_only" on public.seats;
create policy "seats_update_admin_only"
on public.seats
for update
to authenticated
using (app_private.is_admin())
with check (app_private.is_admin());

drop policy if exists "seats_delete_admin_only" on public.seats;
create policy "seats_delete_admin_only"
on public.seats
for delete
to authenticated
using (app_private.is_admin());
