# Known Regressions

These Seat Planner behaviors should stay visible during every QA pass:

- Viewer route must not show admin controls.
- Viewer route must read published seats only.
- Admin routes must read draft seats.
- `/admin` and `/admin/management` must require auth.
- Public viewer copy should say: "Select a seat to view assignment details."
- Admin assignment copy must not leak into viewer route.
- Publish workflow must not accidentally change draft/published separation.
- Vacate confirmation must preserve assignment when cancelled.
- Search must continue to find expected assigned users.
- Mobile map must remain usable and readable.
- No removed legacy tables should be referenced by app/runtime code.
- No schema drift or stale Supabase object references should be introduced.
