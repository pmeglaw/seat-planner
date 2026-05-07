-- Keep the Seat Planner RLS model intact while avoiding per-row RLS helper
-- evaluation warnings from Supabase advisors.

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or (select app_private.is_admin()));

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only"
on public.profiles
for update
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists "employees_select_authenticated" on public.employees;
create policy "employees_select_authenticated"
on public.employees
for select
to authenticated
using (active = true or (select app_private.is_admin()));

drop policy if exists "employees_insert_admin_only" on public.employees;
create policy "employees_insert_admin_only"
on public.employees
for insert
to authenticated
with check ((select app_private.is_admin()));

drop policy if exists "employees_update_admin_only" on public.employees;
create policy "employees_update_admin_only"
on public.employees
for update
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists "employees_delete_admin_only" on public.employees;
create policy "employees_delete_admin_only"
on public.employees
for delete
to authenticated
using ((select app_private.is_admin()));

drop policy if exists "seats_select_published_or_admin" on public.seats;
create policy "seats_select_published_or_admin"
on public.seats
for select
to authenticated
using (layer = 'published'::public.seat_layer or (select app_private.is_admin()));

drop policy if exists "seats_insert_admin_only" on public.seats;
create policy "seats_insert_admin_only"
on public.seats
for insert
to authenticated
with check ((select app_private.is_admin()));

drop policy if exists "seats_update_admin_only" on public.seats;
create policy "seats_update_admin_only"
on public.seats
for update
to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists "seats_delete_admin_only" on public.seats;
create policy "seats_delete_admin_only"
on public.seats
for delete
to authenticated
using ((select app_private.is_admin()));

do $$
begin
  if to_regclass('public.publish_events') is not null then
    execute 'drop policy if exists "publish_events_select_admin_only" on public.publish_events';
    execute 'create policy "publish_events_select_admin_only" on public.publish_events for select to authenticated using ((select app_private.is_admin()))';
    execute 'drop policy if exists "publish_events_insert_admin_only" on public.publish_events';
    execute 'create policy "publish_events_insert_admin_only" on public.publish_events for insert to authenticated with check ((select app_private.is_admin()))';
  end if;
end
$$;
