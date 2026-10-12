// Requires the real stack with Mailpit and a database.
// Tests the full API integration against the unified Next.js route handlers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = process.env.TEST_ORIGIN || 'http://localhost:3000';
const mailpit = process.env.TEST_MAILPIT || 'http://localhost:8025';

function client() {
  let cookie = '';
  return async (path, body) => {
    const res = await fetch(base + '/api' + path, {
      headers: {
        Origin: base,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {})
      },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {})
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, ...(await res.json()) };
  };
}

async function getCode(email) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(mailpit + '/api/v1/messages')).json();
    const m = list.messages?.find(m => m.To?.some(t => t.Address === email));
    if (m) {
      const full = await (await fetch(mailpit + '/api/v1/message/' + m.ID)).json();
      const code = (full.Text || '').match(/\b\d{6}\b/);
      if (code) return code[0];
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error('OTP not found in Mailpit for ' + email);
}

async function register(api, name) {
  const em = name + '@example.com';
  const r = await api('/auth/request', { email: em, username: name, intent: 'register' });
  assert.equal(r.status, 200);
  const code = await getCode(em);
  const result = await api('/auth/verify', { requestId: r.requestId, code });
  assert.equal(result.status, 200);
  return result.user;
}

test('real API: OTP, max two members, independent sessions, leave revocation and archive isolation', { timeout: 60000 }, async () => {
  const id = randomBytes(4).toString('hex'),
    a = client(),
    b = client(),
    c = client();
  await register(a, 'a_' + id);
  await register(b, 'b_' + id);
  await register(c, 'c_' + id);
  const r = await a('/rooms/create', { title: 'Integration ' + id, anniversary: '2024-01-01' });
  assert.equal(r.status, 200);
  const inv = await a('/invites/create', { roomId: r.id });
  assert.equal(inv.status, 200);

  // Concurrent acceptance must admit one person, not both.
  const results = await Promise.all([
    b('/invites/accept', { token: inv.code }),
    c('/invites/accept', { token: inv.code })
  ]);
  assert.equal(results.filter(x => x.status === 200).length, 1);
  const partner = results[0].status === 200 ? b : c,
    outsider = partner === b ? c : b;
  const room = await a('/room?id=' + r.id);
  assert.equal(room.members.length, 2);
  assert.equal((await outsider('/room?id=' + r.id)).status, 403);
  assert.equal((await a('/invites/create', { roomId: r.id })).status, 409);
  const p = await a('/places/save', {
    roomId: r.id,
    name: 'Taman test',
    area: 'Bogor',
    category: 'Alam',
    budget: 123000,
    note: 'Integration'
  });
  assert.equal(p.status, 200);
  const at = new Date(Date.now() + 48 * 3600000).toISOString();
  assert.equal(
    (await partner('/places/action', { roomId: r.id, id: p.id, action: 'schedule', at })).status,
    200
  );
  assert.equal((await a('/room?id=' + r.id)).jobs.length, 2);
  assert.equal((await a('/rooms/leave', { roomId: r.id, confirm: true })).status, 200);
  assert.equal((await a('/room?id=' + r.id)).status, 403);
  assert.equal((await a('/places/action', { roomId: r.id, id: p.id, action: 'delete' })).status, 403);
  const archived = await partner('/room?id=' + r.id);
  assert.equal(archived.room.status, 'archived');
  assert.ok(archived.jobs.filter(j => j.kind === 'reminder').every(j => j.status === 'cancelled'));
  assert.equal((await partner('/places/action', { roomId: r.id, id: p.id, action: 'wish' })).status, 403);
  const fresh = await a('/rooms/create', { title: 'Ruang baru' });
  assert.equal(fresh.status, 200);
  assert.equal((await a('/room?id=' + fresh.id)).places.length, 0);
  assert.equal((await partner('/rooms/create', { title: 'Juga baru' })).status, 200);

  // Logout invalidates just this account's current session.
  await a('/auth/logout', {});
  assert.equal((await a('/me')).status, 401);
  assert.equal((await partner('/me')).status, 200);
});
