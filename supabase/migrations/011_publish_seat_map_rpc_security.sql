-- Restore the app-facing publish RPC wrapper as security invoker.
-- Later publish migrations must keep the security-definer implementation in app_private.

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
