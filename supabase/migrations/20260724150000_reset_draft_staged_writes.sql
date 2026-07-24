-- Supersedes 20260723230000_reset_draft_to_published.sql: that migration's
-- single bulk UPDATE rewrote employee_id and label for every diverged draft
-- row in one statement. one_draft_seat_per_employee and
-- seats_unique_label_per_layer are both non-deferrable unique indexes, and
-- Postgres checks non-deferrable indexes PER ROW, MID-STATEMENT — so any
-- draft that PERMUTES assignments or labels relative to published (an admin
-- swapped two people, or moved a person from seat A to seat B) made the
-- bulk UPDATE collide with itself and abort with a raw duplicate-key error.
-- A two-seat swap failed deterministically.
--
-- Writes are now staged inside the same transaction, mirroring the
-- discipline already used elsewhere in this codebase: update_draft_seat's
-- force-move path frees the employee's other seat before reassigning
-- (20260708120000_draft_concurrency_fence.sql:608), and restore_draft_snapshot
-- vacates every assigned draft seat before restoring (20260708120000:352-357).
--
-- Everything else about the RPC (seats only, never employees; the draft
-- concurrency fence; stable draft ids for surviving rows) is unchanged from
-- 20260723230000 — only the mutation section differs.

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

  -- Count the logical changes BEFORE mutating, so the return value stays
  -- truthful even though the staged writes below touch some rows twice.
  select count(*) into updated_count
  from public.seats as d
  join public.seats as p
    on p.layer = 'published'::public.seat_layer
   and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
  where d.layer = 'draft'::public.seat_layer
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

  -- 1) Delete draft-only rows FIRST so a draft-only seat can never hold a
  --    label the update leg is about to give back to a surviving row.
  delete from public.seats as d
  where d.layer = 'draft'::public.seat_layer
    and not exists (
      select 1 from public.seats as p
      where p.layer = 'published'::public.seat_layer
        and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
    );
  get diagnostics deleted_count = row_count;

  -- 2) Stage: vacate every assignment that will change. one_draft_seat_per_
  --    employee is non-deferrable; a permuted draft would collide mid-statement
  --    in the final update. The paired status write keeps the CHECK satisfied.
  update public.seats as d
  set employee_id = null,
      status = 'available'::public.seat_status
  from public.seats as p
  where d.layer = 'draft'::public.seat_layer
    and p.layer = 'published'::public.seat_layer
    and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
    and d.employee_id is not null
    and d.employee_id is distinct from p.employee_id;

  -- 3) Stage: park labels that will change on a collision-free temporary value
  --    (seats_unique_label_per_layer is also non-deferrable). Only rows matched
  --    by seat_key are parked: for a null-seat_key row the label IS the join
  --    key, so a changed label already meant "no counterpart" (delete/insert).
  update public.seats as d
  set label = '~reset~' || d.id::text
  from public.seats as p
  where d.layer = 'draft'::public.seat_layer
    and p.layer = 'published'::public.seat_layer
    and d.seat_key is not null
    and p.seat_key = d.seat_key
    and d.label is distinct from p.label;

  -- 4) Converge surviving rows onto the published values (unchanged statement;
  --    row_count no longer reported — updated_count was precomputed above).
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

  -- 5) Re-insert published-only rows as draft (unchanged statement from
  --    20260723230000, including get diagnostics inserted_count).
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
