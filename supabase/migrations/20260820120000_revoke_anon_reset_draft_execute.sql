-- Close the anon EXECUTE grant left on reset_draft_seats_to_published.
--
-- In production the function's ACL carried explicit grants for
-- anon/authenticated/service_role: Supabase's default privileges add those
-- at CREATE time (the dashboard's "automatically expose" behavior, since
-- turned off), and 20260724150000's `revoke all ... from public` removed
-- only the PUBLIC pseudo-role entry — explicit role grants survive a
-- PUBLIC revoke. Every sibling mutation RPC revokes `from public, anon,
-- authenticated` and re-grants authenticated; this aligns the one outlier.
--
-- Not a live hole on its own — the function body raises 42501 unless
-- app_private.is_admin() — but the grant layer should not rely on that.
revoke all on function public.reset_draft_seats_to_published(jsonb) from public, anon, authenticated;
grant execute on function public.reset_draft_seats_to_published(jsonb) to authenticated;
