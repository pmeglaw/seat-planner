# v1.0.9 Security / Dependency Cleanup

## Summary

This pass addresses the npm/GitHub dependency warnings without changing application behavior or database schema.

## Changes

- Updated `next` to `^15.5.18` to resolve current Next.js security advisories reported by `npm audit`.
- Updated direct `postcss` dev dependency to `^8.5.10`.
- Added an npm `overrides` entry so nested PostCSS usage is resolved to the patched direct dependency.
- Refreshed `package-lock.json`.

## Validation

Validated locally in the patch environment:

- `npm audit` reported 0 vulnerabilities after the dependency updates.
- `npm test` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` compiled successfully and reached final build-trace collection. In the sandbox, the command timed out during the final trace collection step, so run the full build locally before pushing.

## Supabase

No Supabase migration is required for this pass.

## QA Notes

Because this pass changes framework/dependency versions, QA should focus on confirming that existing flows still work:

1. Login with email/password.
2. Magic link fallback still sends.
3. `/admin` loads after login.
4. Viewer map loads.
5. Seat selection and inspector still work.
6. Advanced drawer still opens.
7. Publish confirmation still appears.
