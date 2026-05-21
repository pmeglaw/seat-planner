-- v1.1.5 Supabase stale object cleanup.
-- Guarded cleanup for legacy messaging objects that are not used by the Seat Planner app.
-- The migration intentionally refuses to proceed if any legacy messaging rows exist.

-- Drop stale legacy RPCs that are no longer called by app code.
drop function if exists public.get_or_create_dm_thread(uuid);
drop function if exists public.publish_draft_seats();

-- Refuse destructive cleanup if legacy messaging data appears.
do $$
declare
  legacy_thread_count bigint := 0;
  legacy_member_count bigint := 0;
  legacy_message_count bigint := 0;
begin
  if to_regclass('public.threads') is not null then
    execute 'select count(*) from public.threads' into legacy_thread_count;
  end if;

  if to_regclass('public.thread_members') is not null then
    execute 'select count(*) from public.thread_members' into legacy_member_count;
  end if;

  if to_regclass('public.messages') is not null then
    execute 'select count(*) from public.messages' into legacy_message_count;
  end if;

  if legacy_thread_count > 0 or legacy_member_count > 0 or legacy_message_count > 0 then
    raise exception 'Refusing stale messaging cleanup because legacy data exists: threads=%, thread_members=%, messages=%',
      legacy_thread_count,
      legacy_member_count,
      legacy_message_count;
  end if;
end
$$;

-- Drop dependent child tables before parent table.
drop table if exists public.messages;
drop table if exists public.thread_members;
drop table if exists public.threads;
