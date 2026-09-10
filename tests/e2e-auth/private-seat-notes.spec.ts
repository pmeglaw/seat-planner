import { test, expect } from '@playwright/test';
import { signIn, retryUntilVisible, SEEDED_ADMIN_EMAIL, SEEDED_VIEWER_EMAIL, SEEDED_PASSWORD } from './auth-helpers';

function localEnv() {
  const url = process.env.E2E_SUPABASE_URL!;
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('SEC-1 tests require disposable localhost Supabase');
  return { url, key: process.env.E2E_SUPABASE_ANON_KEY! };
}
async function token(email: string) {
  const { url, key } = localEnv();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: SEEDED_PASSWORD }) });
  expect(response.ok).toBeTruthy();
  return (await response.json()).access_token as string;
}
async function api(accessToken: string | null, path: string, method = 'GET', body?: unknown) {
  const { url, key } = localEnv();
  return fetch(`${url}/rest/v1/${path}`, { method, headers: { apikey: key, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function json(accessToken: string, path: string, method = 'GET', body?: unknown) {
  const response = await api(accessToken, path, method, body);
  expect(response.ok, `${method} ${path}: ${response.status}`).toBeTruthy();
  return response.status === 204 ? null : response.json();
}

test('SEC-1 real API permissions and one-to-one embedded baseline', async () => {
  const admin = await token(SEEDED_ADMIN_EMAIL); const viewer = await token(SEEDED_VIEWER_EMAIL);
  const [draft] = await json(admin, 'seats?layer=eq.draft&label=eq.N01&select=id');
  await json(admin, `seats?id=eq.${draft.id}`, 'PATCH', { notes: 'SEC1 synthetic private baseline' });
  await json(admin, 'rpc/publish_seat_map', 'POST', {});
  const [published] = await json(admin, 'seats?layer=eq.published&label=eq.N01&select=id,notes,private_note:published_seat_notes(notes)');
  expect(published.notes).toBeNull();
  expect(published.private_note).toEqual({ notes: 'SEC1 synthetic private baseline' });
  expect(Array.isArray(published.private_note)).toBe(false);
  expect(await json(admin, `published_seat_notes?seat_id=eq.${published.id}&select=notes`)).toEqual([{ notes: 'SEC1 synthetic private baseline' }]);
  for (const [method, body] of [['POST', { seat_id: published.id, notes: 'forbidden' }], ['PATCH', { notes: 'forbidden' }], ['DELETE', undefined]] as const) {
    const response = await api(admin, `published_seat_notes?seat_id=eq.${published.id}`, method, body);
    expect(response.status).toBe(403); expect((await response.json()).code).toBe('42501');
  }
  for (const path of ['published_seat_notes?select=*', 'seats?select=*,private_note:published_seat_notes(*)']) {
    const anonymous = await api(null, path);
    // PostgREST can short-circuit an embedded read when RLS removes every
    // parent seat. Either denial or an empty outer result reveals no notes.
    if (path.startsWith('seats') && anonymous.ok) expect(await anonymous.json()).toEqual([]);
    else expect([401,403]).toContain(anonymous.status);
    const response = await api(viewer, path); expect(response.ok).toBeTruthy();
    const data = await response.json(); expect(JSON.stringify(data)).not.toContain('SEC1 synthetic');
    if (path.startsWith('published')) expect(data).toEqual([]);
    else { expect(data.length).toBeGreaterThan(0); for (const row of data) { expect(row.layer).toBe('published'); expect(row.notes).toBeNull(); expect(row.private_note).toBeNull(); } }
  }
  const direct = await json(viewer, 'seats?select=*');
  expect(direct.length).toBeGreaterThan(0); expect(direct.every((s: { notes: unknown }) => s.notes === null)).toBe(true);
  const anonSeats = await api(null, 'seats?select=*');
  if (anonSeats.ok) expect(await anonSeats.json()).toEqual([]); else expect([401,403]).toContain(anonSeats.status);
  for (const [method, path, body] of [
    ['POST', 'seats', { seat_key: 'sec1-invalid', label: 'SEC1INVALID', x: 0.5, y: 0.5, layer: 'published', notes: 'secret' }],
    ['PATCH', `seats?id=eq.${published.id}`, { notes: 'secret' }]
  ] as const) {
    const response = await api(admin, path, method, body); expect(response.ok).toBe(false);
    const error = await response.json(); expect(error.code).toBe('23514'); expect(error.message).toContain('published_seats_no_private_notes');
  }
});

test('SEC-1 notes-only review and draft status converge after Publish in both themes', async ({ page }) => {
  test.setTimeout(90_000);
  const admin = await token(SEEDED_ADMIN_EMAIL);
  await json(admin, 'rpc/publish_seat_map', 'POST', {});
  const [seat] = await json(admin, 'seats?layer=eq.draft&label=eq.N01&select=id,notes');
  await json(admin, `seats?id=eq.${seat.id}`, 'PATCH', { notes: `${seat.notes ?? ''} notes-only change` });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signIn(page, SEEDED_ADMIN_EMAIL);
  await page.goto('/admin/management');
  await expect(page.getByText('Draft — 1 change', { exact: true })).toBeVisible();
  await page.goto('/admin');
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    const dialog = page.getByRole('dialog');
    await retryUntilVisible(() => page.getByRole('button', { name: /^Publish 1 change/ }).click(), dialog);
    await expect(dialog.getByText('Total changes 1', { exact: false })).toBeVisible();
    await expect(dialog.getByText(/notes changed/i)).toBeVisible();
    await page.screenshot({ path: `output/sec1/notes-review-${theme}.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  const dialog = page.getByRole('dialog');
  await retryUntilVisible(() => page.getByRole('button', { name: /^Publish 1 change/ }).click(), dialog);
  await dialog.getByRole('button', { name: /^Publish/ }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByText('Draft — no changes', { exact: true })).toBeVisible();
  await page.goto('/admin/management');
  await expect(page.getByText('Draft — no changes', { exact: true })).toBeVisible();
  const [published] = await json(admin, 'seats?layer=eq.published&label=eq.N01&select=notes,private_note:published_seat_notes(notes)');
  expect(published.notes).toBeNull(); expect(published.private_note.notes).toBe(`${seat.notes ?? ''} notes-only change`);
});
