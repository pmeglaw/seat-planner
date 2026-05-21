# v1.1.9 Admin Management Polish

## Summary

This patch refreshes the admin management polish work against the current v1.1.8 release baseline. It is a UI and regression-safety pass only.

## Changes

- Admin Management summary metrics now include draft seats, active employees, assigned seats, unassigned employees, and active zones.
- Management tabs have clearer active state treatment.
- Employee search, department, and zone lists now include clearer empty states.
- Publish History now includes a Latest Publish summary and marks the newest history row.
- Publish History loading, empty, and error states were tightened for production readability.
- The management panel supports optional initial tab and history state for deterministic component rendering and testing.

## Supabase

No schema changes. No publish behavior changes. No Supabase objects are removed in this pass.

## QA

1. Confirm `/` still queries `layer = 'published'`.
2. Confirm `/admin` still queries `layer = 'draft'`.
3. Confirm `/admin/management` loads employees, departments, zones, and Publish History.
4. Confirm Publish History shows the newest publish as the Latest Publish summary and first table row.
5. Confirm removed legacy messaging-table references remain absent.
6. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
