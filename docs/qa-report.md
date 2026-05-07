# QA Report – Seat Planner Current Baseline

Date: 2026-05-05

## Scope

Reviewed the uploaded current Next.js + Supabase Seat Planner project, including:

- Supabase auth/session helpers
- Admin and viewer routes
- Seat map UI components
- Seat inspector and marker behavior
- Show Names / Hide Names toggle
- Supabase server actions
- TypeScript configuration
- ESLint configuration
- Existing unit tests
- Production build behavior

## Commands run

```bash
npm install
npm run test
npm run typecheck
npm run lint
npx next build --experimental-build-mode=compile
npx next build --experimental-build-mode=generate
```

## Results

| Check | Result | Notes |
|---|---:|---|
| `npm run test` | Passed | Existing coordinate tests pass. |
| `npm run typecheck` | Passed | Fixed nullable seat references and Supabase cookie helper typing. |
| `npm run lint` | Passed | Replaced deprecated `next lint` script with `eslint .` and fixed flat config. |
| `next build --experimental-build-mode=compile` | Passed | Production compile succeeded. |
| `next build --experimental-build-mode=generate` | Passed | Static generation and route output succeeded. |
| `npm audit` | Warning | 2 moderate transitive advisories via Next/PostCSS; no high or critical issues. |

## Fixes applied

1. Fixed strict TypeScript errors in `SeatInspector.tsx` by preserving a non-null `selectedSeat` reference after the null guard.
2. Added explicit `CookieToSet` typing in Supabase server and middleware helpers.
3. Updated the lint script from `next lint` to `eslint .`.
4. Replaced the ESLint config with a Next-compatible flat config and ignored generated `next-env.d.ts`.
5. Added `dynamic = "force-dynamic"`, `revalidate = 0`, and `await connection()` to authenticated server pages to avoid accidental build-time Supabase work.
6. Kept the current product behavior intact: admin/viewer routing, markers, inspector, Add Seat, Move Seat, Publish, and Show/Hide Names toggle.

## Remaining concerns

### Security

- The production security model depends on Supabase RLS and the `profiles.role` value. Keep the service role key out of `.env.local` and out of the browser.
- Admin-only server actions correctly call `requireAdmin()`, but continue to test RLS directly before wider rollout.

### Audit warning

`npm audit` reports 2 moderate transitive advisories involving Next/PostCSS. `npm audit fix` does not currently resolve this without a breaking/incorrect downgrade suggestion. There are no high or critical advisories in this pass.

### Test coverage still thin

Current tests cover coordinate math only. Add tests for:

- `normalizeSeatStatus()`
- duplicate employee assignment rules
- admin-only action gating
- draft-to-published publish behavior
- marker display states: names visible/hidden, selected/unselected

## Manual QA checklist

Run these locally against your Supabase project:

1. Login with magic link.
2. Open `/admin` as admin.
3. Confirm all 60 draft seats display.
4. Toggle Hide Names / Show Names.
5. Select a seat and save employee name + position.
6. Refresh and confirm assignment persists.
7. Move a selected seat using Move Seat mode.
8. Refresh and confirm position persists.
9. Add a new seat from Advanced → Add Seat.
10. Publish Draft Map.
11. Open `/` and confirm the viewer map reflects published changes.
12. Login as/view as non-admin and confirm edit controls are unavailable.
