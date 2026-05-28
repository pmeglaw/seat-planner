-- v1.2.8: make draft seat assignment swaps atomic at the database level.
--
-- The app still performs an admin check before calling this RPC. The function
-- repeats that check and uses one PostgreSQL statement transaction so any
-- failure rolls back the clear-then-set sequence required by the draft
-- employee uniqueness index.

create or replace function public.swap_draft_seat_assignments(
  source_draft_seat_id uuid,
  target_draft_seat_id uuid
)
returns setof public.seats
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  locked_seat public.seats%rowtype;
  source_seat public.seats%rowtype;
  target_seat public.seats%rowtype;
  source_next_employee_id uuid;
  target_next_employee_id uuid;
  source_next_status public.seat_status;
  target_next_status public.seat_status;
  updated_count integer;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if source_draft_seat_id is null or target_draft_seat_id is null then
    raise exception 'Both seats must exist on the draft map before swapping.';
  end if;

  if source_draft_seat_id = target_draft_seat_id then
    raise exception 'Choose a different target seat to complete the swap.';
  end if;

  for locked_seat in
    select *
    from public.seats
    where id in (source_draft_seat_id, target_draft_seat_id)
    order by id
    for update
  loop
    if locked_seat.id = source_draft_seat_id then
      source_seat := locked_seat;
    elsif locked_seat.id = target_draft_seat_id then
      target_seat := locked_seat;
    end if;
  end loop;

  if source_seat.id is null or target_seat.id is null then
    raise exception 'Both seats must exist on the draft map before swapping.';
  end if;

  if source_seat.layer <> 'draft'::public.seat_layer or target_seat.layer <> 'draft'::public.seat_layer then
    raise exception 'Both seats must be draft seats before swapping.';
  end if;

  if source_seat.employee_id is null and target_seat.employee_id is null then
    raise exception 'Swap requires at least one assigned seat.';
  end if;

  source_next_employee_id := target_seat.employee_id;
  target_next_employee_id := source_seat.employee_id;

  source_next_status := case
    when source_next_employee_id is not null then 'assigned'::public.seat_status
    when target_seat.employee_id is not null then 'available'::public.seat_status
    when target_seat.status in ('reserved'::public.seat_status, 'unavailable'::public.seat_status) then target_seat.status
    else 'available'::public.seat_status
  end;

  target_next_status := case
    when target_next_employee_id is not null then 'assigned'::public.seat_status
    when source_seat.employee_id is not null then 'available'::public.seat_status
    when source_seat.status in ('reserved'::public.seat_status, 'unavailable'::public.seat_status) then source_seat.status
    else 'available'::public.seat_status
  end;

  update public.seats
  set
    employee_id = null,
    status = 'available'::public.seat_status
  where id in (source_draft_seat_id, target_draft_seat_id)
    and layer = 'draft'::public.seat_layer;

  update public.seats as seat
  set
    employee_id = case
      when seat.id = source_draft_seat_id then source_next_employee_id
      when seat.id = target_draft_seat_id then target_next_employee_id
      else seat.employee_id
    end,
    status = case
      when seat.id = source_draft_seat_id then source_next_status
      when seat.id = target_draft_seat_id then target_next_status
      else seat.status
    end
  where seat.id in (source_draft_seat_id, target_draft_seat_id)
    and seat.layer = 'draft'::public.seat_layer;

  get diagnostics updated_count = row_count;
  if updated_count <> 2 then
    raise exception 'Could not swap both draft seats.';
  end if;

  return query
  select *
  from public.seats
  where id in (source_draft_seat_id, target_draft_seat_id)
    and layer = 'draft'::public.seat_layer
  order by label;
end;
$$;

revoke all on function public.swap_draft_seat_assignments(uuid, uuid) from public, anon, authenticated;
grant execute on function public.swap_draft_seat_assignments(uuid, uuid) to authenticated;
