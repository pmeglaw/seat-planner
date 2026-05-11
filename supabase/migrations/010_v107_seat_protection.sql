-- v1.0.7 seat protection + advanced utilities cleanup
-- Distinguishes original seeded seats from admin-added custom seats and
-- blocks deletion of protected original draft seats at the database layer.

alter table public.seats
  add column if not exists is_custom boolean;

-- Existing seeded seats have matching seat_key/label. Existing manually-added
-- seats created by the app have generated seat_key values that differ from label.
update public.seats
set is_custom = (coalesce(seat_key, '') <> coalesce(label, ''))
where is_custom is null;

alter table public.seats
  alter column is_custom set default false;

alter table public.seats
  alter column is_custom set not null;

create index if not exists seats_layer_custom_idx on public.seats(layer, is_custom);

create or replace function app_private.prevent_original_draft_seat_delete()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if old.layer = 'draft'::public.seat_layer and old.is_custom is not true then
    raise exception 'Original seeded seats are protected and cannot be deleted.';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_original_draft_seat_delete on public.seats;
create trigger prevent_original_draft_seat_delete
before delete on public.seats
for each row
execute function app_private.prevent_original_draft_seat_delete();

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
