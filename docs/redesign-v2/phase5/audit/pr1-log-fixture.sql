-- Phase 5 PR 1 smoke/capture fixture — LOCAL DOCKER STACK ONLY.
--
-- The seeded stack ships one publish event, which exercises neither sorting nor
-- paging. This writes 30 synthetic rows so the rig can drive the real thing:
--   * 30 rows  -> pagination at the default page size of 25 (two pages)
--   * g = 11   -> a 41-change publish, twelve days back, so a Changes sort has
--                 to rank EVERY page to bring it to the top
--   * g = 29   -> no change_summary at all: the "—" cell and the one row whose
--                 sentence carries seat_count ("Initial publish · 60 seats")
--   * g % 9    -> published_by null: the "an admin" actor fallback
-- The two account ids are the seeded local test accounts. Nothing here is real
-- firm data and nothing here may ever run against production.
delete from public.publish_events;

insert into public.publish_events (published_by, seat_count, created_at, change_summary)
select
  case
    when g % 9 = 0 then null
    when g % 3 = 0 then '00000000-0000-0000-0000-0000000000a2'::uuid
    else '00000000-0000-0000-0000-0000000000a1'::uuid
  end,
  60,
  timestamptz '2026-09-08 14:12:00-07:00' - (g || ' days')::interval - ((g * 37) || ' minutes')::interval,
  case
    when g = 29 then null
    when g = 11 then jsonb_build_object(
      'seats_moved', 18, 'assignments_changed', 14, 'employee_edits', 6,
      'seats_added', 2, 'status_changes', 1
    )
    else jsonb_build_object(
      'assignments_changed', (g % 5),
      'seats_moved', (g % 3),
      'employee_edits', (g % 4),
      'status_changes', case when g % 6 = 0 then 1 else 0 end
    )
  end
from generate_series(0, 29) as g;
