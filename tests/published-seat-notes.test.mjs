import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTsModule } from './helpers/tsModuleLoader.mjs';
const { hydratePublishedSeatNotes } = await importTsModule('lib/publishedSeatNotes.ts');
test('private baseline hydration distinguishes null baseline from missing data and removes embed', () => {
  assert.deepEqual(hydratePublishedSeatNotes([{ id: 'a', notes: null, private_note: { notes: 'private' } }, { id: 'b', private_note: { notes: null } }]), [{ id: 'a', notes: 'private' }, { id: 'b', notes: null }]);
  for (const private_note of [null, undefined, [], {}, { notes: 5 }]) assert.throws(() => hydratePublishedSeatNotes([{ private_note }]), /baseline is missing or invalid/);
  assert.deepEqual(hydratePublishedSeatNotes([]), []);
});
