-- Local-stack seed. Runs after supabase/migrations/* on `supabase db reset`
-- and `supabase start` (wired by [db.seed] in config.toml).
--
-- Scope: AUTH ONLY. Employees and the 60 draft seats already come from
-- 002_seed_initial_data.sql, so duplicating them here would fight that
-- migration's empty-table guards. What no migration can create is a signed-in
-- user, and that is the single thing the authenticated e2e tier needs.
--
-- These credentials are throwaway and local-only: this database lives in a
-- Docker container that `supabase stop` destroys. They are never valid against
-- the production project, which is why they can sit in the repo in plain text.
-- Do NOT copy this pattern to anything hosted.

-- Fixed UUIDs so tests can assert on a known admin without a lookup round-trip.
-- The on_auth_user_created trigger turns each auth.users row into a viewer
-- profile automatically; the admin is promoted afterwards.
do $$
declare
  admin_id constant uuid := '00000000-0000-0000-0000-0000000000a1';
  viewer_id constant uuid := '00000000-0000-0000-0000-0000000000a2';
  seeded_password constant text := 'e2e-local-seed-r2-2026';
begin
  -- email_confirmed_at must be set, or GoTrue rejects the sign-in as an
  -- unconfirmed address and every authenticated spec fails at the login step.
  -- The token columns must be '' and NOT null. They are nullable in the schema,
  -- but GoTrue scans them into non-nullable Go strings, so a NULL makes every
  -- password grant fail with a 500 "Database error querying schema" — an error
  -- that names the schema and says nothing about the row that caused it. The
  -- app surfaces it as an empty "{}" alert on the login form. Cost an hour once.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  )
  values
    ('00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
     'e2e-admin@example.test', extensions.crypt(seeded_password, extensions.gen_salt('bf')), now(),
     now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', viewer_id, 'authenticated', 'authenticated',
     'e2e-viewer@example.test', extensions.crypt(seeded_password, extensions.gen_salt('bf')), now(),
     now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     '', '', '', '', '', '', '', '')
  -- DO UPDATE, not DO NOTHING: reseeding an already-provisioned local stack
  -- (fixed UUIDs mean the conflict always hits) must refresh the password
  -- hash, or a rotation here leaves the OLD hash live on any stack that
  -- wasn't torn down first, and the e2e tier fails login against a stack
  -- that otherwise looks freshly seeded.
  on conflict (id) do update
    set encrypted_password = excluded.encrypted_password;

  -- GoTrue looks the account up through auth.identities; without a matching
  -- row the password grant reports "Invalid login credentials" even though
  -- auth.users holds a correct hash.
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  )
  values
    (admin_id, admin_id,
     jsonb_build_object('sub', admin_id::text, 'email', 'e2e-admin@example.test'),
     'email', admin_id::text, now(), now()),
    (viewer_id, viewer_id,
     jsonb_build_object('sub', viewer_id::text, 'email', 'e2e-viewer@example.test'),
     'email', viewer_id::text, now(), now())
  on conflict (id) do nothing;

  update public.profiles set role = 'admin' where id = admin_id;
end $$;

-- No table grants here. They lived in this file only to compensate for
-- supabase/migrations/* never declaring them; 20260727190000_declare_table_grants.sql
-- now does that properly, so the migrations alone stand up a working project.
--
-- If a fresh stack starts returning 42501 again, the fix belongs in the
-- migration that created the offending table — putting grants back here would
-- make the tests pass while leaving a rebuilt project broken, which is exactly
-- the gap that hid here the first time.

-- Occupancy. 002_seed_initial_data.sql seeds 60 seats and 12 employees whose
-- id sets do not intersect: every seeded seat is 'available' with a null
-- employee_id, in BOTH layers. That is a legitimate state, but it is the
-- emptiest one the app has, and it was the only one CI ever rendered — so the
-- e2e-auth axe scan of the Find palette (tests/e2e-auth/accessibility.spec.ts)
-- saw twelve DISABLED browse rows reading "No seat", and axe skips disabled
-- elements for contrast. The enabled browse row and the person-result row with
-- a seat — the most important row on the find path — had never been scanned by
-- anything (read-path follow-on assessment P13, 2026-08-25).
--
-- Assigning here rather than in 002: that migration is already applied to
-- production, and this file is local-only by construction (db:seed execs into
-- the Docker container, never a connection string). Four people across four
-- zones is enough to render every row variant the palette has; keep it small
-- so the "mostly empty office" case stays the default the specs see.
--
-- Both layers get the SAME assignment, which is what a publish produces. A
-- draft/published divergence here would show up as phantom pending changes in
-- the admin publish review and fight publish-flow.spec.ts.
-- Position and extension are null for every seeded employee, so a result row's
-- meta line would render as department alone and the palette's phone-extension
-- match path would never fire. Fill them for the seated four only. This runs
-- BEFORE the published_employees copy below, so the snapshot picks them up
-- without a second write.
update public.employees as e
   set position = v.position,
       phone_extension = v.phone_extension
  from (values
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Intake Coordinator', '201'),
    ('00000000-0000-0000-0000-000000000002'::uuid, 'Case Manager',       '202'),
    ('00000000-0000-0000-0000-000000000003'::uuid, 'Associate',          '203'),
    ('00000000-0000-0000-0000-000000000004'::uuid, 'Staff Accountant',   '204')
  ) as v(id, position, phone_extension)
 where e.id = v.id;

-- ...and mirror them onto the snapshot, which is NOT reachable from the copy
-- at the bottom of this file. 20260708230000_published_employee_snapshot.sql
-- backfills published_employees at migration time (":144"), so by the time
-- this file runs the table already holds all 12 rows and that copy's
-- `on conflict (id) do nothing` inserts nothing — it is a safety net for a
-- stack that somehow lacks the snapshot, not the thing that builds it.
-- Editing public.employees alone therefore leaves the viewer reading the
-- pre-edit values, which is the layered-employee-data rule doing exactly what
-- it says: people edits reach viewers only at the next publish. Writing both
-- is what a publish does, and this is the one place allowed to imitate one
-- (local container only; the guard test scans supabase/migrations, and the
-- production rule that only publish_seat_map() writes this table stands).
update public.published_employees as pe
   set position = e.position,
       phone_extension = e.phone_extension
  from public.employees as e
 where e.id = pe.id
   and e.position is not null;

-- No layer predicate: the update is deliberately BOTH layers. The seats CHECK
-- pairs the two columns (001_initial_schema.sql:54) — 'assigned' requires a
-- non-null employee_id and every other status requires null — so they move
-- together. The unique indexes on employee_id are partial per layer, so one
-- person holding the same seat in draft and published is legal, and is exactly
-- what publish_seat_map() leaves behind.
update public.seats as s
   set employee_id = v.employee_id,
       status = 'assigned'::public.seat_status
  from (values
    ('CW01', '00000000-0000-0000-0000-000000000001'::uuid),  -- Alex Shabazian · Center West
    ('N03',  '00000000-0000-0000-0000-000000000002'::uuid),  -- Maria Lopez    · North Pod
    ('W04',  '00000000-0000-0000-0000-000000000003'::uuid),  -- David Kim      · West Pod
    ('SE01', '00000000-0000-0000-0000-000000000004'::uuid)   -- Nina Patel     · Southeast Office
  ) as v(seat_key, employee_id)
 where s.seat_key = v.seat_key;

-- Viewers read published seats joined against the published_employees
-- snapshot, which only publish_seat_map() ever writes. Without a snapshot the
-- viewer map renders every published seat as unoccupied, so the authenticated
-- viewer spec would assert against an empty directory and pass for the wrong
-- reason. Seed it to match the active directory, exactly as a publish would.
insert into public.published_employees (
  id, full_name, position, department, phone_extension, email, avatar_url, active, created_at, updated_at
)
select id, full_name, position, department, phone_extension, email, avatar_url, active, created_at, updated_at
from public.employees
where active is true
on conflict (id) do nothing;

-- Phase 4 PR 3b (owner ruling Q4, 2026-09-05): one reserved and one unavailable
-- seat, BOTH layers, so the invalid-target measure (lib/seatTargets, O4 —
-- reserved / unavailable seats refuse a move or swap) and the legend's non-zero
-- counts are real in the local rig and the PR screenshots. Two north-east pod
-- seats the seed leaves empty (the private offices NE09/NE10 exist only on prod);
-- the status CHECK wants a null employee_id for both.
-- Local container only (this file is never applied to a hosted project).
update public.seats set status = 'reserved'::public.seat_status    where seat_key = 'NE07' and employee_id is null;
update public.seats set status = 'unavailable'::public.seat_status where seat_key = 'NE08' and employee_id is null;
