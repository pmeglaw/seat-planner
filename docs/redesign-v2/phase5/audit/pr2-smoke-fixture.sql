-- Phase 5 · PR 2 smoke fixture — LOCAL Docker stack only (loaded by pr2-smoke.mjs after
-- `supabase db reset --no-seed` + scripts/seed-local-db.mjs; never pointed at a hosted project).
--
-- The seed gives every department at most ONE person with an extension, so no extension-holder
-- has a same-department fallback — and steps 5, 6, 7 and 11 need a locked person whose tail
-- carries BOTH the fallback roster and Show on map. One row moves: Anthony Cruz (Litigation,
-- no extension in the seed) gets 205, so Litigation holds two extensions (David Kim 203 and
-- his). F-1's no-extension-with-fallback people are untouched: Jessica Moore (Case Management →
-- Maria Lopez 202) and Victor Chen (Intake → Alex Shabazian 201) still read "No extension on file".
--
-- Writing public.published_employees directly is fine HERE and only here: this is the disposable
-- local stack, the table is a snapshot with no trigger, and the app never does this (the rule in
-- CLAUDE.md is about app code, not a local smoke fixture — PR 1's pr1-log-fixture.sql precedent).
update public.published_employees
   set phone_extension = '205'
 where full_name = 'Anthony Cruz' and department = 'Litigation' and coalesce(phone_extension, '') = '';
