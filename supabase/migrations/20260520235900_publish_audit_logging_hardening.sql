-- Add audit logging to the active Seat Planner publish RPC.
-- The app calls public.publish_seat_map(), which delegates to app_private.publish_seat_map().
-- This migration is safe for fresh environments and existing live databases.

create table if not exists public.publish_events (
  id uuid primary key default gen_random_uuid(),
  published_by uuid references auth.users(id) on delete set null,
  seat_count integer not null check (seat_count >= 0),
  created_at timestamp with time zone not null default now()
);

alter table public.publish_events enable row level security;

create index if not exists publish_events_published_by_idx
  on public.publish_events (published_by);

create index if not exists publish_events_created_at_idx
  on public.publish_events (created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'publish_events'
      and policyname = 'publish_events_insert_admin_only'
  ) then
    create policy publish_events_insert_admin_only
      on public.publish_events
      for insert
      to authenticated
      with check ((select app_private.is_admin() as is_admin));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'publish_events'
      and policyname = 'publish_events_select_admin_only'
  ) then
    create policy publish_events_select_admin_only
      on public.publish_events
      for select
      to authenticated
      using ((select app_private.is_admin() as is_admin));
  end if;
end
$$;

create or replace function app_private.publish_seat_map()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  copied_count integer;
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
    notes,
    is_custom
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
    notes,
    is_custom
  from public.seats
  where layer = 'draft'
  order by label;

  get diagnostics copied_count = row_count;

  insert into public.publish_events (published_by, seat_count)
  values (auth.uid(), copied_count);
end;
$$;