-- Reset draft seats to the published map (owner request 2026-07-23): the
-- publish flow gains a "discard everything" counterpart. SEATS ONLY — the
-- employee directory is deliberately untouched, matching the owner-confirmed
-- contract that undo/restore flows never remove or revert people; pending
-- people edits keep and ship on the next publish.
--
-- Draft identity is preserved: rows are matched on coalesce(seat_key, label)
-- (the same key publish_seat_map and lib/publishSummary use), surviving draft
-- rows are UPDATEd in place (ids stable for the client), draft-only rows are
-- deleted, published-only rows are re-inserted as draft.
--
-- Carries the same draft concurrency fence as restore_draft_snapshot: the
-- client passes the exact (id, updated_at) set it rendered, and any committed
-- draft write since then rejects with SQLSTATE 'MLS02' instead of being
-- silently discarded.

create or replace function public.reset_draft_seats_to_published(
  expected_draft_seats jsonb default null
)
returns integer
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  lock_row record;
  updated_count integer := 0;
  deleted_count integer := 0;
  inserted_count integer := 0;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.seats where layer = 'published'::public.seat_layer) then
    raise exception 'No published map exists to reset to.';
  end if;

  for lock_row in
    select seat.id
    from public.seats as seat
    where seat.layer = 'draft'::public.seat_layer
    order by seat.id
    for update of seat
  loop
    -- Lock all draft seats in a stable order before validating the fence.
    null;
  end loop;

  if expected_draft_seats is not null then
    if jsonb_typeof(expected_draft_seats) <> 'array' then
      raise exception 'Draft concurrency expectations must be a JSON array.';
    end if;

    if exists (
      select 1
      from public.seats as seat
      where seat.layer = 'draft'::public.seat_layer
        and not exists (
          select 1
          from jsonb_to_recordset(expected_draft_seats) as expected(id uuid, updated_at timestamptz)
          where expected.id = seat.id
            and expected.updated_at = seat.updated_at
        )
    ) or (
      select count(*)
      from public.seats as seat
      where seat.layer = 'draft'::public.seat_layer
    ) <> jsonb_array_length(expected_draft_seats)
    then
      raise exception 'The draft map changed in another session after this page loaded it. Reload to pick up the latest draft, then try again.'
        using errcode = 'MLS02';
    end if;
  end if;

  update public.seats as d
  set
    seat_key = p.seat_key,
    label = p.label,
    x = p.x,
    y = p.y,
    status = p.status,
    employee_id = p.employee_id,
    zone = p.zone,
    department = p.department,
    notes = p.notes,
    is_custom = p.is_custom
  from public.seats as p
  where d.layer = 'draft'::public.seat_layer
    and p.layer = 'published'::public.seat_layer
    and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
    and (
      d.label is distinct from p.label
      or d.x is distinct from p.x
      or d.y is distinct from p.y
      or d.status is distinct from p.status
      or d.employee_id is distinct from p.employee_id
      or d.zone is distinct from p.zone
      or d.department is distinct from p.department
      or d.notes is distinct from p.notes
      or d.is_custom is distinct from p.is_custom
    );
  get diagnostics updated_count = row_count;

  delete from public.seats as d
  where d.layer = 'draft'::public.seat_layer
    and not exists (
      select 1
      from public.seats as p
      where p.layer = 'published'::public.seat_layer
        and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
    );
  get diagnostics deleted_count = row_count;

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
    p.seat_key,
    p.label,
    p.x,
    p.y,
    p.status,
    'draft'::public.seat_layer,
    p.employee_id,
    p.zone,
    p.department,
    p.notes,
    p.is_custom
  from public.seats as p
  where p.layer = 'published'::public.seat_layer
    and not exists (
      select 1
      from public.seats as d
      where d.layer = 'draft'::public.seat_layer
        and coalesce(d.seat_key, d.label) = coalesce(p.seat_key, p.label)
    );
  get diagnostics inserted_count = row_count;

  return updated_count + deleted_count + inserted_count;
end;
$$;

revoke all on function public.reset_draft_seats_to_published(jsonb) from public;
grant execute on function public.reset_draft_seats_to_published(jsonb) to authenticated;
