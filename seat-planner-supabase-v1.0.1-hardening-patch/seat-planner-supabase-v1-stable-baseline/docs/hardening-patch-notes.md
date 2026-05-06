# v1.0.1 Hardening Patch Notes

This patch intentionally keeps the v1 product behavior and visual design intact.

## Fixed

- Seat Inspector now uses controlled form state keyed by `seat.id`.
- Switching seats, closing the inspector, clearing selection, or starting Add Seat now prompts before discarding unsaved inspector edits.
- Saving an `assigned` status without a selected employee or employee name is blocked client-side before it can silently normalize to available.
- Mobile layout now becomes single-column below the desktop breakpoint.
- Mobile map keeps a readable internal width inside the map scroll container without creating page-level horizontal overflow.
- Shared button component now prevents label wrapping.
- Added a Supabase security migration that moves admin helper functions into a non-exposed schema for RLS use and revokes direct execution of legacy public helpers.

## Verification

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Then manually smoke test:

1. Edit a selected seat, do not save, then click another marker. Confirm the discard prompt appears.
2. Cancel the prompt and confirm the inspector edits remain.
3. Save the edits and refresh. Confirm the saved data persists.
4. Use a mobile-width browser or responsive mode. Confirm the page does not horizontally overflow while the map itself can scroll.
5. Run the Supabase migration, then verify admin save/move/publish still works.
