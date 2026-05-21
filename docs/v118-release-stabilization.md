# v1.1.8 — Release Stabilization + Tagging Pass

## Release baseline

This release stabilization pass captures the current stable production state after the v1.1.7 viewer/mobile polish pass.

## Stable commit

- Stable merge commit: `3cd6bdf7d027ac88758dd51dfd088442f980535f`
- Source PR: `#18 — Add v1.1.7 viewer map mobile polish`
- Production deployment: Vercel check passed on the stable merge commit.

## Verified production state

- Viewer route remains published-map focused.
- Admin route remains draft-map focused.
- Admin Management and Publish History are available.
- Publish audit logging is active.
- Legacy messaging tables have been removed from live Supabase.
- No Supabase schema change is introduced by v1.1.8.
- No app behavior change is introduced by v1.1.8.

## Live Supabase public tables

Expected live public tables after cleanup:

- `public.publish_events`
- `public.profiles`
- `public.employees`
- `public.seats`
- `public.department_options`
- `public.zone_options`

## Recommended tag

Create a Git tag after this documentation-only PR is merged:

```bash
git checkout main
git pull
git tag v1.1.8
git push origin v1.1.8
```

Optional annotated tag:

```bash
git tag -a v1.1.8 -m "v1.1.8 release stabilization"
git push origin v1.1.8
```

## Post-merge validation

Run or confirm:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Then verify the latest production Vercel deployment is on `main` and Ready.
