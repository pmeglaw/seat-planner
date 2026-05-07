-- Mirror the live security cleanup applied to Supabase.
-- This migration is safe for fresh Seat Planner installs and for databases
-- that still contain older messaging/publish helper objects.

do $$
begin
  if to_regprocedure('public.publish_draft_seats()') is not null then
    execute 'revoke all on function public.publish_draft_seats() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke all on function public.handle_new_user() from public, anon, authenticated';
  end if;

  if to_regprocedure('public.get_or_create_dm_thread(uuid)') is not null then
    execute 'revoke execute on function public.get_or_create_dm_thread(uuid) from anon';
  end if;
end
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.publish_events') is not null then
    execute 'create index if not exists publish_events_published_by_idx on public.publish_events (published_by)';
  end if;
end
$$;
