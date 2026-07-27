-- Declare the table privileges the app depends on.
--
-- WHY THIS EXISTS
--
-- Until now no migration granted DML on public tables to anon/authenticated/
-- service_role. Production works anyway because Supabase Cloud runs
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated, service_role` when a project is created — so every table a
-- migration made inherited those grants from the platform, not from this repo.
--
-- The consequence is invisible until you try to rebuild. A project created from
-- supabase/migrations/* alone (disaster recovery, a second environment, or the
-- local Docker stack the authenticated e2e tier uses) gets tables with only
-- TRIGGER/REFERENCES/TRUNCATE for `authenticated`. Every query returns 42501,
-- and the seat map renders a generic server-error page. Found while standing up
-- the local stack; the tier compensated in its seed file, which fixed the tests
-- and left the real gap in place. This closes it.
--
-- SAFETY ON PRODUCTION
--
-- This is a verified no-op there. Production already holds every privilege
-- granted below (checked against information_schema.role_table_grants before
-- writing this). GRANT only adds; nothing here revokes, drops or alters a
-- policy, so the live security posture cannot narrow or widen as a result.
--
-- WHY NOT `anon`
--
-- Production also grants `anon` broadly, and that is deliberately NOT
-- reproduced here. Every RLS policy in this schema targets `authenticated`
-- only — not one admits `anon` — so those grants convey no access at all: RLS
-- denies anon whatever the grant says. Declaring them would enshrine dead
-- privileges that read as a hole to the next security reviewer. Narrowing the
-- live ones would need REVOKE, which is a real change to production and
-- belongs in its own reviewed migration, not smuggled into a no-op.
--
-- ROW ACCESS IS STILL RLS
--
-- Broad grants plus restrictive policies is the Supabase model. These grants
-- make the tables reachable; `seats_select_published_or_admin`,
-- `profiles_select_own_or_admin` and the rest decide which rows come back.
--
-- ADDING A TABLE LATER
--
-- New tables do NOT inherit anything from this migration. Grant explicitly in
-- the migration that creates the table, or a fresh rebuild will 42501 on it
-- while production quietly keeps working — the exact asymmetry this file fixes.

grant usage on schema public to authenticated, service_role;

grant all privileges on table public.department_options to authenticated, service_role;
grant all privileges on table public.employees to authenticated, service_role;
grant all privileges on table public.profiles to authenticated, service_role;
grant all privileges on table public.publish_events to authenticated, service_role;
grant all privileges on table public.published_employees to authenticated, service_role;
grant all privileges on table public.seats to authenticated, service_role;
grant all privileges on table public.zone_options to authenticated, service_role;
