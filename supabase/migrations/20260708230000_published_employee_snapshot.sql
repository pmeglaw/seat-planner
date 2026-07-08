-- Employee-data layering (advisor MED finding, 2026-07-07).
--
-- The draft/published two-layer model covered `seats` only: the viewer joined
-- the live `employees` table into published seats and loaded the live active
-- list for search, so employee edits (rename, title, extension, department —
-- including rename_department, which writes public.employees directly) reached
-- viewers instantly with no publish step, unlike every seat edit.
--
-- Decision (owner, 2026-07-08): employee master data follows the same publish
-- gate as seats. `public.published_employees` is a snapshot of the ACTIVE
-- employees, replaced wholesale inside the publish transaction; the viewer
-- reads only the snapshot. Admin surfaces keep reading live `employees` —
-- that IS the draft-side working set.
--
-- The snapshot mirrors the employees columns (timestamps copied verbatim) so
-- rows satisfy the client Employee type unchanged.

create table if not exists public.published_employees (
  id uuid primary key,
  full_name text not null,
  position text,
  department text,
  phone_extension text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.published_employees enable row level security;

-- Read-only for signed-in users (viewers included), matching published seats.
-- No insert/update/delete policies: the only writers are the SECURITY DEFINER
-- publish RPC below and migrations.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'published_employees'
      and policyname = 'published_employees_select_authenticated'
  ) then
    create policy published_employees_select_authenticated
      on public.published_employees
      for select
      to authenticated
      using (true);
  end if;
end
$$;

revoke all on table public.published_employees from anon;
grant select on table public.published_employees to authenticated;

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

  -- Snapshot the active employee directory in the same transaction, so the
  -- viewer's people data changes atomically with the viewer's seat map and
  -- employee edits never reach viewers before an explicit publish.
  -- `where true` is required: Supabase loads pg-safeupdate on API connections,
  -- which rejects DELETE without a WHERE clause even inside SECURITY DEFINER
  -- functions (verified live on the PR #100 preview).
  delete from public.published_employees where true;

  insert into public.published_employees (
    id,
    full_name,
    position,
    department,
    phone_extension,
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
    avatar_url,
    active,
    created_at,
    updated_at
  from public.employees
  where active
  order by full_name;

  insert into public.publish_events (published_by, seat_count)
  values (auth.uid(), copied_count);
end;
$$;

-- Seed the snapshot immediately so viewers are not left without people data
-- between this migration applying and the first post-deploy publish. Current
-- live behavior showed viewers the live table, so the current state is by
-- definition what they already see.
insert into public.published_employees (
  id,
  full_name,
  position,
  department,
  phone_extension,
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
  avatar_url,
  active,
  created_at,
  updated_at
from public.employees
where active
on conflict (id) do nothing;
