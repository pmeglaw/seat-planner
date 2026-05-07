-- Keep the public RPC name used by the app, but move the security-definer
-- implementation into the private schema so it is not exposed through public RPC.

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

revoke all on function app_private.publish_seat_map() from public, anon, authenticated;
grant execute on function app_private.publish_seat_map() to authenticated;

create or replace function public.publish_seat_map()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform app_private.publish_seat_map();
end;
$$;

revoke all on function public.publish_seat_map() from public, anon, authenticated;
grant execute on function public.publish_seat_map() to authenticated;

do $$
begin
  if to_regprocedure('public.get_or_create_dm_thread(uuid)') is not null then
    execute 'revoke execute on function public.get_or_create_dm_thread(uuid) from authenticated';
  end if;

  if to_regclass('public.messages') is not null then
    execute 'create index if not exists messages_sender_id_idx on public.messages (sender_id)';
  end if;

  if to_regclass('public.threads') is not null then
    execute 'create index if not exists threads_created_by_idx on public.threads (created_by)';
  end if;
end
$$;
