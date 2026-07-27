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
  seeded_password constant text := 'e2e-local-password';
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
  on conflict (id) do nothing;

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

-- Replicate the hosted platform's bootstrap grants.
--
-- FINDING, worth fixing properly: supabase/migrations/* never grants DML on
-- public tables to anon/authenticated/service_role. It gets away with it in
-- production because Supabase Cloud sets `alter default privileges ... grant
-- all on tables to anon, authenticated, service_role` when a project is
-- created. The local stack has no such history, so `authenticated` arrives
-- holding only TRIGGER/REFERENCES/TRUNCATE and every viewer query 403s —
-- the seat map renders Next's generic server-error page.
--
-- The consequence outside this file: a project rebuilt from these migrations
-- alone (disaster recovery, a second environment) would be completely
-- non-functional, and nothing in the repo says so. The durable fix is a
-- migration declaring these grants; that touches production, so it is raised
-- rather than done here.
--
-- Broad grants with restrictive RLS IS the Supabase model — row access is still
-- decided by the policies the migrations do declare — so applying them here
-- makes the local stack behave like production rather than diverge from it.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

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
