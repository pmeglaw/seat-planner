# SEC-1 — private published seat notes

Branch: `codex/sec1-private-note-baseline`, based on current `main`
`b4d162dcf8188fbc05de37e80e35f18b18d1ed56` (#531 and #532 merged).

## Owner decision and scope

The approved owner decision preserves Publish/Discard: notes are editable in
admin draft, Publish privately saves their baseline, and Discard restores it.
Notes-only changes remain part of the admin review and pending-change count.
Viewer seating, employee snapshots, and map behavior remain unchanged.

The pre-fix publish RPC copied notes into published `seats` rows. Authenticated
viewer RLS admitted those rows, so application projections were insufficient.
The upgrade regression reproduces this exposure using synthetic notes and the
actual `authenticated` database role. No live private notes were read.

## Migration and permissions

`20260910214506_sec1_private_note_baseline.sql` is an additive migration; historical
migrations are unchanged. One transaction locks `seats` exclusively, copies every
published note (including nulls) into `published_seat_notes`, scrubs public notes,
and installs `published_seats_no_private_notes`. The timestamp trigger is disabled
only under that transaction's exclusive table lock, then re-enabled, preserving
seat IDs, draft notes, and both published timestamps. A concurrent old publisher
must finish before the lock or wait; it cannot commit non-null public notes after
the constraint is installed. Any migration failure rolls the entire upgrade back.

The baseline's PK is also a foreign key to the published seat's ID, with cascading
deletes. `authenticated` receives SELECT only; RLS admits administrators only.
PUBLIC/anon have no baseline privileges. INSERT, UPDATE, DELETE and TRUNCATE are
revoked from authenticated clients, including administrators. Privileged database
operators remain privileged. The gated SECURITY DEFINER publish RPC replaces the
baseline; reset remains SECURITY INVOKER and reads it through admin RLS.

Publish and Discard acquire SHARE ROW EXCLUSIVE on seats before their existing
row/fence checks. This serializes map replacement and baseline consumption and
blocks direct seat writers during these short transactions. Existing employee
fences and snapshot/audit logic remain. The pre-existing concurrent employee
insertion/reactivation limitation is unchanged. All map/baseline/audit writes roll
back together if publication fails.

A missing baseline is an error, distinct from a row containing a null note.
Admin map and draft status embed `private_note:published_seat_notes(notes)` in each
published-seat read. The PK/FK relationship is one-to-one (object or null), verified
through the real local PostgREST API. Hydration removes the embedded field and
supplies private notes only to admin comparisons. Viewer routes never hydrate it.
Pagination still has its existing cross-page snapshot limitation; the baseline
and its seat cannot drift within an individual embedded request.

## Deployment order and rollback limits

1. Review and merge only when release authorization is given. This task does not
   merge, deploy, or manually apply production migrations.
2. The database migration must complete before the new application release serves
   admin routes. The existing integrations own migration/application delivery;
   verify their ordering. If application delivery wins the race, admin reads fail
   clearly until the relationship exists. Old application code against the new
   schema protects viewers but can show phantom pending note changes, so avoid
   leaving the versions mismatched. Coordinate the release or pause admin work.
3. After deployment, verify constraint, table grants, RLS, baseline completeness
   using counts (not note contents), and viewer/admin behavior. Confirm published
   rows contain zero non-null notes. Use authorized production verification only;
   do not run the synthetic mutation suites against hosted environments.
4. SEC-1 remains open in production until migration deployment and production
   verification are complete.

Do not undo this migration by copying private notes back into public rows. An app
rollback alone loses correct private-baseline comparisons. Keep the constraint,
RLS, private baseline and compatible Publish/Discard functions; use a forward fix.
A full database restore from a pre-fix backup reintroduces exposure unless this
migration is reapplied before API access resumes. Previously retrieved notes
cannot be recalled by scrubbing database rows.

## Verification

Synthetic PGlite and disposable localhost Supabase only. Evidence and results
are recorded below after the final checks. SQL harness post-migration blanket
grants were removed: real migrations now determine test-role permissions.

- Upgrade preserves distinct draft/published notes and timestamps; reproduces
  viewer access before the fix and verifies public scrubbing afterward.
- Real authenticated admin/viewer permissions, anonymous denial, forbidden direct
  baseline writes, named constraint checks with valid INSERT `seat_key` fixtures.
- Notes-only publish/audit, null baseline, custom-seat reinsertion, Discard identity,
  transaction rollback and stale Publish/Discard fences.
- Local PostgREST direct/embedded access, actual object/null relationship shape,
  notes-only admin review and Management draft-status count, both themes at
  1920×1080. SQL and HTTP tests supplement each other.

The authenticated admin visual work tracked for #532 remains a separate audit
item in `PR531-VERIFICATION.md`; SEC-1 screenshots do not close that broader gate.

### Final local results (2026-09-10, Node 24.19.0)

- `npm run test:db`: **152 passed**, 0 failed/skipped.
- `npm run coverage:check`: **1,521 passed**, 0 failed/skipped; lines/statements
  **98.55%**, branches **92.86%**, functions **98.58%**. Includes the full Node suite.
- `npm run lint`: **0 errors**, 84 existing warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed as the authenticated harness's mandatory fresh build
  with localhost Supabase settings (no reuse of a production-configured bundle).
- `npm run test:e2e:auth`: **65 passed**, including both new SEC-1 API/UI tests.
- `npx supabase db advisors --local --type security --level warn`: no issues.
- Both 1920×1080 notes-only review screenshots visually inspected:
  `output/sec1/notes-review-light.png` and `notes-review-dark.png`.
- Fresh independent Codex review found no actionable implementation findings;
  final committed SHA review is recorded in the PR.

Initial fixture-only failures were corrected: loader import, native Fetch's
boolean `ok`, script registration, and the anonymous embedded empty-result
assertion. The named published-notes constraint assertion was retained, including
its required `seat_key`. A stale disposable database backup initially blocked
seeding; rebuilding it from migrations cleared that local-only obstacle.

No required local coverage remains unavailable. Hosted deployment, hosted
production verification, and #532's broader authenticated visual audit remain
separate and incomplete. Local logs are in ignored `output/sec1/`; no local keys
or private/live data are committed.
