# Phase 4 · PR 4 captures — Management + Settings

Filled at Task 11 (evidence on the local Docker stack). Provenance rules as `../pr3b/README.md`: branch
`feat/phase4-pages`, `npm run build && npm run start` against the local Docker Supabase stack
(`npm run db:start` + `db:seed`; `.env.local` re-pointed for the run and restored after), signed in as the
seeded local admin — **sample data only, no production name, no production write**.

Planned set: `runtime/` (six routes × light / dark at 1920, the two PR routes also at 1280 and in the
system state light / dark, 1024 light; the undefined-`var()` audit line per route) and `states/`
(`audit/page-states.mjs`: tabs, table row hover + Edit tooltip, the 480 panel Add / Edit / dirty-close
modal / refused Deactivate, inline rename editing + duplicate-invalid, the three confirmation tearsheets,
both Settings reviews incl. blocked + done-state, the callout, the 403 card — both themes).
