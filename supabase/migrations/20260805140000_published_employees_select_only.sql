-- Narrow published_employees to SELECT-only for authenticated clients.
--
-- WHY REDUCE 20260727190000's BROAD GRANT FOR THIS ONE TABLE
--
-- 20260727190000_declare_table_grants.sql declared `grant all privileges` for
-- `authenticated` on every app table, mirroring the Supabase Cloud bootstrap:
-- broad grants + restrictive RLS is the platform model, and that migration was
-- deliberately a no-op against production. For published_employees the write
-- half of that grant is dead weight with a cost: this table is the viewer
-- snapshot whose ONLY legitimate writers are the SECURITY DEFINER publish RPC
-- (app_private.publish_seat_map, which runs as the function owner and does not
-- depend on `authenticated` grants) and migrations. RLS already exposes no
-- write policy (20260708230000), so today the grant conveys nothing — but it
-- means a single future `create policy ... for insert/update/delete` on this
-- table would silently open a client write path to the data viewers trust.
-- Dropping the table-level write grants makes the snapshot contract
-- declarative at BOTH layers: a stray policy alone can no longer open writes,
-- and the posture reads correctly in information_schema.role_table_grants.
--
-- service_role keeps its privileges (server-side tooling / migrations), and
-- the publish RPC is unaffected: SECURITY DEFINER executes with the owner's
-- rights, not the caller's.
--
-- tests/rls-execution.test.mjs asserts insert/update/delete stay denied for
-- `authenticated`; tests/published-employee-snapshot.test.mjs pins the RPC as
-- the sole writer.

revoke all on table public.published_employees from authenticated;
grant select on table public.published_employees to authenticated;
