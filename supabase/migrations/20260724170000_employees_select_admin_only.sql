-- Security fix (Plan 008): the employees table is the admins' live draft-side
-- directory; viewers must read people only through the published_employees
-- snapshot (app/page.tsx). The prior policy allowed any authenticated user to
-- read every ACTIVE employee directly via PostgREST (active = true OR is_admin),
-- leaking unpublished renames/edits/additions — a hole in the two-layer model
-- that CLAUDE.md says RLS enforces. Narrow SELECT to admins only. Viewers are
-- unaffected: they never query employees (guarded by
-- tests/published-employee-snapshot.test.mjs) and keep reading
-- published_employees, whose own policy is untouched.
drop policy if exists "employees_select_authenticated" on public.employees;
create policy "employees_select_authenticated"
on public.employees
for select
to authenticated
using ((select app_private.is_admin()));
