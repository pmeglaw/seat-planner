# Supabase Live Cleanup

Date: 2026-05-06

Live project checked: `wujsniclwzefvufavama`

## Applied database migrations

- `20260506222834_seat_planner_live_security_cleanup`
- `20260506222924_seat_planner_policy_advisor_cleanup`
- `20260506223948_seat_planner_remaining_advisor_cleanup`

The same changes are mirrored locally as:

- `supabase/migrations/004_live_security_cleanup.sql`
- `supabase/migrations/005_policy_advisor_cleanup.sql`
- `supabase/migrations/006_remaining_advisor_cleanup.sql`

## Verified live behavior

- Admin can see `60` draft seats and `60` published seats.
- Non-admin can see `0` draft seats and `60` published seats.
- Non-admin draft seat updates affect `0` rows.
- `public.publish_seat_map()` still works through the app-facing RPC name.
- `public.publish_seat_map()` is now a `security invoker` wrapper.
- The security-definer implementation lives in `app_private.publish_seat_map()`.
- `public.get_or_create_dm_thread(uuid)` no longer has direct `anon` or `authenticated` execute privileges.
- Seat data checks are clean: no out-of-bounds coordinates, blank labels, assigned seats without employees, duplicate seat keys, or duplicate draft employee assignments.

## Remaining advisor notes

- The Auth leaked password protection warning remains because that setting is not available on Supabase free projects.
- Unused-index INFO advisories may remain on low-traffic/cold tables. Do not drop useful indexes solely to silence those warnings.
