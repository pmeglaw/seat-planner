import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createSeatPlannerDb } from './helpers/pgHarness.mjs';
const MIGRATION = '20260910214506_sec1_private_note_baseline.sql';
let db;
before(async () => { db = await createSeatPlannerDb(); });
beforeEach(async () => { await db.reset(); });
after(async () => { await db?.close(); });
const publish = () => db.asRole('authenticated', () => db.query('select public.publish_seat_map()'));
const discard = () => db.asRole('authenticated', () => db.query('select public.reset_draft_seats_to_published()'));
const note = async (id, value) => db.query('update public.seats set notes = $2 where id = $1', [id, value]);
const baseline = async () => (await db.query('select s.seat_key, n.notes from public.seats s join public.published_seat_notes n on n.seat_id = s.id order by s.seat_key')).rows;

test('upgrade preserves distinct published/draft notes and timestamps, reproducing viewer exposure first', async () => {
  let beforeRows;
  const upgraded = await createSeatPlannerDb({ beforeMigration: async (old, file) => {
    if (file !== MIGRATION) return;
    await old.reset();
    await old.seedSeat({ label: 'N01' });
    await old.query("update public.seats set notes = 'synthetic baseline' where layer = 'draft'");
    await old.query('select public.publish_seat_map()');
    await old.query("update public.seats set notes = 'distinct current draft' where layer = 'draft'");
    beforeRows = (await old.query('select id, layer, notes, created_at, updated_at from public.seats order by layer')).rows;
    await old.actAsViewer();
    await old.asRole('authenticated', async () => {
      assert.deepEqual((await old.query('select notes from public.seats')).rows, [{ notes: 'synthetic baseline' }]);
    });
    await old.actAs(old.adminId);
    // Hosted Supabase may bootstrap broad defaults. The migration must revoke
    // these itself; the harness must not repair or mask its actual ACLs.
    await old.exec('alter default privileges in schema public grant all on tables to anon, authenticated;');
  }});
  try {
    const rows = (await upgraded.query('select id, layer, notes, created_at, updated_at from public.seats order by layer')).rows;
    assert.deepEqual(rows, beforeRows.map(r => ({ ...r, notes: r.layer === 'published' ? null : r.notes })));
    assert.deepEqual((await upgraded.query('select notes from public.published_seat_notes')).rows, [{ notes: 'synthetic baseline' }]);
    const privileges = (await upgraded.query(`select
      has_table_privilege('anon', 'public.published_seat_notes', 'SELECT') anon_read,
      has_table_privilege('authenticated', 'public.published_seat_notes', 'INSERT, UPDATE, DELETE, TRUNCATE') client_write,
      has_table_privilege('authenticated', 'public.published_seat_notes', 'SELECT') admin_read`)).rows[0];
    assert.deepEqual(privileges, { anon_read: false, client_write: false, admin_read: true });
  } finally { await upgraded.close(); }
});

test('real authenticated role: admin reads baseline; viewers see no baseline or draft; anon denied', async () => {
  const seat = await db.seedSeat({ label: 'N01' }); await note(seat.id, 'synthetic private'); await publish();
  await db.asRole('authenticated', async () => {
    assert.deepEqual((await db.query('select notes from public.published_seat_notes')).rows, [{ notes: 'synthetic private' }]);
    for (const sql of ["insert into public.published_seat_notes select id, 'x' from public.seats where layer = 'published'", "update public.published_seat_notes set notes = 'x' where true", 'delete from public.published_seat_notes where true', 'truncate public.published_seat_notes']) {
      await assert.rejects(db.query(sql), { code: '42501' });
    }
  });
  await db.actAsViewer();
  await db.asRole('authenticated', async () => {
    assert.deepEqual((await db.query('select notes from public.published_seat_notes')).rows, []);
    assert.deepEqual((await db.query('select notes from public.seats')).rows, [{ notes: null }]);
    assert.deepEqual((await db.query('select n.notes from public.seats s left join public.published_seat_notes n on n.seat_id = s.id')).rows, [{ notes: null }]);
    await assert.rejects(db.query('select public.publish_seat_map()'), /Admin permission/);
    await assert.rejects(db.query('select public.reset_draft_seats_to_published()'), /Admin permission/);
  });
  await db.actAs(null);
  await db.asRole('anon', () => assert.rejects(db.query('select * from public.published_seat_notes'), { code: '42501' }));
});

test('published inserts and updates reject notes by the named constraint, including privileged writes', async () => {
  await db.seedSeat({ label: 'N01' }); await publish();
  for (const role of [null, 'authenticated']) {
    const checks = async () => {
      for (const sql of ["insert into public.seats(seat_key,label,x,y,layer,notes) values ('custom-bad','BAD',0.5,0.5,'published','secret')", "update public.seats set notes = 'secret' where layer = 'published'"]) {
        await assert.rejects(db.query(sql), e => e.code === '23514' && e.constraint === 'published_seats_no_private_notes');
      }
    };
    if (role) await db.asRole(role, checks); else await checks();
  }
});

test('notes-only publish updates baseline and audit; repeated publish has no phantom note changes', async () => {
  const s = await db.seedSeat({ label: 'N01' }); await publish(); await note(s.id, 'new private note'); await publish();
  assert.deepEqual(await baseline(), [{ seat_key: 'n01', notes: 'new private note' }]);
  assert.equal((await db.query('select change_summary from public.publish_events order by created_at desc limit 1')).rows[0].change_summary.seat_detail_changes, 1);
  await publish();
  assert.equal((await db.query('select change_summary from public.publish_events order by created_at desc limit 1')).rows[0].change_summary.seat_detail_changes, 0);
  assert.deepEqual((await db.query("select notes from public.seats where layer = 'published'")).rows, [{ notes: null }]);
});

test('Discard restores changed notes, null notes and reinserted custom notes, preserving surviving identities', async () => {
  const a = await db.seedSeat({ label: 'N01' }); const b = await db.seedSeat({ label: 'N02' }); const c = await db.seedSeat({ label: 'CX01', isCustom: true });
  await note(a.id, 'baseline'); await note(c.id, 'custom baseline'); await publish();
  await note(a.id, 'changed'); await note(b.id, 'new'); await db.query('delete from public.seats where id = $1', [c.id]);
  await discard();
  const rows = (await db.query("select id, seat_key, notes from public.seats where layer = 'draft' order by seat_key")).rows;
  assert.deepEqual(rows.map(r => [r.seat_key, r.notes]), [['cx01','custom baseline'],['n01','baseline'],['n02',null]]);
  assert.equal(rows[1].id, a.id); assert.equal(rows[2].id, b.id);
});

test('failed publish rolls back seats, private baseline, employee snapshot and audit together', async () => {
  const s = await db.seedSeat({ label: 'N01' }); await note(s.id, 'old'); await publish();
  const snapshot = async () => (await db.query('select (select jsonb_agg(s) from public.seats s) seats, (select jsonb_agg(n) from public.published_seat_notes n) notes, (select jsonb_agg(e) from public.published_employees e) employees, (select jsonb_agg(p) from public.publish_events p) events')).rows;
  await note(s.id, 'new'); const before = await snapshot();
  await db.exec("create function public.sec1_fail_publish() returns trigger language plpgsql as $$ begin raise exception 'synthetic publish failure'; end $$; create trigger sec1_fail before insert on public.publish_events for each row execute function public.sec1_fail_publish();");
  try { await assert.rejects(publish(), /synthetic publish failure/); assert.deepEqual(await snapshot(), before); }
  finally { await db.exec('drop trigger sec1_fail on public.publish_events; drop function public.sec1_fail_publish();'); }
});

test('stale Publish and Discard reject notes edits under authenticated role', async () => {
  const s = await db.seedSeat({ label: 'N01' }); await publish();
  const expected = JSON.stringify((await db.query("select id, updated_at from public.seats where layer = 'draft'")).rows);
  await note(s.id, 'another admin');
  for (const fn of ['publish_seat_map','reset_draft_seats_to_published']) {
    await db.asRole('authenticated', () => assert.rejects(db.query(`select public.${fn}($1::jsonb)`, [expected]), { code: 'MLS02' }));
  }
  assert.deepEqual(await baseline(), [{ seat_key: 'n01', notes: null }]);
});

test('missing required baseline fails Publish and Discard clearly', async () => {
  await db.seedSeat({ label: 'N01' }); await publish(); await db.query('delete from public.published_seat_notes where true');
  await assert.rejects(publish(), /baseline is missing/); await assert.rejects(discard(), /baseline is missing/);
});
