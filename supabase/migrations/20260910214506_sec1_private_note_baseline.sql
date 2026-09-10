-- SEC-1: owner-approved private published-note baseline. Keep draft notes and
-- Publish/Discard semantics; viewer-readable published rows never store notes.
-- Transaction and table lock also fence old in-flight publishers during upgrade.
begin;
lock table public.seats in access exclusive mode;

create table public.published_seat_notes (
  seat_id uuid primary key references public.seats(id) on delete cascade,
  notes text
);
alter table public.published_seat_notes enable row level security;
revoke all on public.published_seat_notes from public, anon, authenticated;
grant select on public.published_seat_notes to authenticated;
create policy published_seat_notes_admin_read on public.published_seat_notes
  for select to authenticated using ((select app_private.is_admin()));
comment on table public.published_seat_notes is
  'Admin-only published note baseline. Client writes forbidden; publish RPC owns replacement.';

insert into public.published_seat_notes (seat_id, notes)
select id, notes from public.seats where layer = 'published';

-- The exclusive lock makes this trigger suspension local to the upgrade; no
-- draft writes can race it. Preserve both created_at and updated_at exactly.
alter table public.seats disable trigger touch_seats_updated_at;
update public.seats set notes = null where layer = 'published' and notes is not null;
alter table public.seats enable trigger touch_seats_updated_at;
alter table public.seats add constraint published_seats_no_private_notes
  check (layer <> 'published' or notes is null);

-- Publish/reset acquire the same table lock before row fences. The public
-- publish wrapper and its signature/ACL remain unchanged.
create or replace function app_private.publish_seat_map(
  expected_draft_seats jsonb default null,
  expected_employees jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  copied_count integer;
  change_summary jsonb;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.';
  end if;

  lock table public.seats in share row exclusive mode;

  if exists (select 1 from public.seats p left join public.published_seat_notes n on n.seat_id = p.id
    where p.layer = 'published' and n.seat_id is null) then
    raise exception 'Published note baseline is missing. Contact an administrator.';
  end if;

  -- Lock every draft row in a stable order before checking the fence, so a
  -- concurrent draft write either committed first (and flips updated_at,
  -- which the fence sees) or blocks behind these locks until publish commits.
  perform seat.id
  from public.seats as seat
  where seat.layer = 'draft'::public.seat_layer
  order by seat.id
  for update of seat;

  -- Concurrency fence: with the draft rows locked, verify every draft row the
  -- database holds is exactly the row the publish review showed the admin —
  -- same ids, same updated_at, no extras either way (the restore_draft_snapshot
  -- pattern). Any committed draft write since the review opened fails the
  -- match; publishing it would ship changes the reviewer never approved.
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

  -- Publish also replaces the published_employees snapshot from the live
  -- ACTIVE directory (below), so active employee rows are part of the
  -- mutation footprint. Lock them the same way before checking their fence.
  --
  -- Known residual, shared with the seat fences (see 20260708120000): row
  -- locks cannot block a concurrent INSERT — or a reactivation of an inactive
  -- row, which these active-only locks never held — that commits between this
  -- fence statement and the snapshot copy below (READ COMMITTED gives each
  -- statement a fresh snapshot). Accepted here for the same reason it is
  -- accepted there; closing it would require a table or advisory lock
  -- serializing every employee writer, a deliberate cross-fence change.
  perform employee.id
  from public.employees as employee
  where employee.active
  order by employee.id
  for update of employee;

  -- Employee-directory fence: the publish review diffs live employees against
  -- the viewer snapshot, so the reviewed state includes people data. Verify
  -- the ACTIVE directory — the exact set the snapshot below ships — still
  -- matches what the review rendered. An edited or newly activated/created
  -- row fails the per-row match; a row deactivated since the review leaves
  -- the client holding more expectations than the directory has active rows,
  -- which the count check catches.
  if expected_employees is not null then
    if jsonb_typeof(expected_employees) <> 'array' then
      raise exception 'Employee concurrency expectations must be a JSON array.';
    end if;

    if exists (
      select 1
      from public.employees as employee
      where employee.active
        and not exists (
          select 1
          from jsonb_to_recordset(expected_employees) as expected(id uuid, updated_at timestamptz)
          where expected.id = employee.id
            and expected.updated_at = employee.updated_at
        )
    ) or (
      select count(*)
      from public.employees as employee
      where employee.active
    ) <> jsonb_array_length(expected_employees)
    then
      raise exception 'The employee directory changed in another session after this review opened. Reload to pick up the latest directory, then try again.'
        using errcode = 'MLS02';
    end if;
  end if;

  -- Compute the change summary BEFORE mutating the published layer, so the
  -- diff compares the incoming draft against the seats/employees viewers see
  -- right now. Coordinate moves use the same 0.0005 epsilon as the client-side
  -- summary (lib/publishSummary.ts COORDINATE_EPSILON).
  select jsonb_build_object(
    'seats_added', (
      select count(*)
      from public.seats d
      where d.layer = 'draft'
        and not exists (
          select 1 from public.seats p
          where p.layer = 'published'
            and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
        )
    ),
    'seats_removed', (
      select count(*)
      from public.seats p
      where p.layer = 'published'
        and not exists (
          select 1 from public.seats d
          where d.layer = 'draft'
            and coalesce(d.seat_key, d.label) = coalesce(p.seat_key, p.label)
        )
    ),
    'assignments_changed', (
      select count(*)
      from public.seats d
      join public.seats p
        on p.layer = 'published'
       and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
      where d.layer = 'draft'
        and coalesce(d.employee_id::text, '') is distinct from coalesce(p.employee_id::text, '')
    ),
    'seats_moved', (
      select count(*)
      from public.seats d
      join public.seats p
        on p.layer = 'published'
       and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
      where d.layer = 'draft'
        and (abs(d.x - p.x) > 0.0005 or abs(d.y - p.y) > 0.0005)
    ),
    'status_changes', (
      select count(*)
      from public.seats d
      join public.seats p
        on p.layer = 'published'
       and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
      where d.layer = 'draft'
        and d.status is distinct from p.status
    ),
    'seat_detail_changes', (
      select count(*)
      from public.seats d
      join public.seats p
        on p.layer = 'published'
       and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
      where d.layer = 'draft'
        and (
          d.label is distinct from p.label
          or d.zone is distinct from p.zone
          or d.department is distinct from p.department
          or d.notes is distinct from (select n.notes from public.published_seat_notes n where n.seat_id = p.id)
          or d.is_custom is distinct from p.is_custom
          or d.floor is distinct from p.floor
        )
    ),
    'employee_edits', (
      select count(*)
      from public.employees e
      join public.published_employees pe on pe.id = e.id
      where e.active
        and (
          e.full_name is distinct from pe.full_name
          or e.position is distinct from pe.position
          or e.department is distinct from pe.department
          or e.phone_extension is distinct from pe.phone_extension
          or e.email is distinct from pe.email
        )
    ),
    'employees_added', (
      select count(*)
      from public.employees e
      where e.active
        and not exists (
          select 1 from public.published_employees pe where pe.id = e.id
        )
    ),
    'employees_removed', (
      select count(*)
      from public.published_employees pe
      where not exists (
        select 1 from public.employees e where e.id = pe.id and e.active
      )
    )
  ) into change_summary;

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
    is_custom,
    floor
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
    null,
    is_custom,
    floor
  from public.seats
  where layer = 'draft'
  order by label;

  get diagnostics copied_count = row_count;

  -- The cascade removed the previous baseline. Save even NULL notes so a
  -- missing baseline is distinguishable from a deliberately empty note.
  insert into public.published_seat_notes (seat_id, notes)
  select p.id, d.notes
  from public.seats p join public.seats d on d.seat_key = p.seat_key and d.layer = 'draft'
  where p.layer = 'published';

  -- Snapshot the active employee directory in the same transaction (see
  -- 20260708230000_published_employee_snapshot.sql). `where true` is required:
  -- Supabase loads pg-safeupdate on API connections, which rejects DELETE
  -- without a WHERE clause even inside SECURITY DEFINER functions.
  delete from public.published_employees where true;

  insert into public.published_employees (
    id,
    full_name,
    position,
    department,
    phone_extension,
    email,
    avatar_url,
    active,
    created_at,
    updated_at
  )
  select
    id,
    full_name,
    position,
    department,
    phone_extension,
    email,
    avatar_url,
    active,
    created_at,
    updated_at
  from public.employees
  where active
  order by full_name;

  insert into public.publish_events (published_by, seat_count, change_summary)
  values (auth.uid(), copied_count, change_summary);
end;
$$;

revoke all on function app_private.publish_seat_map(jsonb, jsonb) from public, anon, authenticated;
grant execute on function app_private.publish_seat_map(jsonb, jsonb) to authenticated;

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
  vacated_count integer := 0;
  deleted_count integer := 0;
  inserted_count integer := 0;
begin
  if not app_private.is_admin() then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;

  lock table public.seats in share row exclusive mode;

  if exists (select 1 from public.seats p left join public.published_seat_notes n on n.seat_id = p.id
    where p.layer = 'published' and n.seat_id is null) then
    raise exception 'Published note baseline is missing. Contact an administrator.';
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
      or d.notes is distinct from (select n.notes from public.published_seat_notes n where n.seat_id = p.id)
      or d.is_custom is distinct from p.is_custom
      or d.floor is distinct from p.floor
    );

  -- 1) Delete draft-only CUSTOM rows FIRST so a draft-only custom seat can
  --    never hold a label the update leg is about to give back to a surviving
  --    row. Only custom seats: a draft-only ORIGINAL (is_custom=false) is a
  --    seeded seat awaiting its first publish — the seat-protection trigger
  --    refuses to delete it, and aborting the whole reset on it would be
  --    wrong; it stays as a pending addition the publish review shows as +1
  --    (labels are building-unique, so it cannot squat on a published label).
  delete from public.seats as d
  where d.layer = 'draft'::public.seat_layer
    and d.is_custom is true
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

  -- 2b) Stage: vacate every surviving draft-only row too. A draft-only
  --    ORIGINAL kept by step 1 may hold an employee whose published seat
  --    step 4 is about to give back, and one_draft_seat_per_employee is
  --    non-deferrable. Its assignment IS a draft change, so discarding it is
  --    exactly what a reset does; each vacated row is one logical change.
  update public.seats as d
  set employee_id = null,
      status = 'available'::public.seat_status
  where d.layer = 'draft'::public.seat_layer
    and d.employee_id is not null
    and not exists (
      select 1 from public.seats as p
      where p.layer = 'published'::public.seat_layer
        and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
    );
  get diagnostics vacated_count = row_count;
  updated_count := updated_count + vacated_count;

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
    notes = (select n.notes from public.published_seat_notes n where n.seat_id = p.id),
    is_custom = p.is_custom,
    floor = p.floor
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
      or d.notes is distinct from (select n.notes from public.published_seat_notes n where n.seat_id = p.id)
      or d.is_custom is distinct from p.is_custom
      or d.floor is distinct from p.floor
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
    is_custom,
    floor
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
    (select n.notes from public.published_seat_notes n where n.seat_id = p.id),
    p.is_custom,
    p.floor
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

revoke all on function public.reset_draft_seats_to_published(jsonb) from public, anon, authenticated;
grant execute on function public.reset_draft_seats_to_published(jsonb) to authenticated;

commit;
