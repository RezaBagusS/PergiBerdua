import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = process.env.TEST_ORIGIN || 'http://localhost:3000';
const mailpit = process.env.TEST_MAILPIT || 'http://localhost:8025';

function client() {
  let cookie = '';
  return async (path, body, method = 'POST') => {
    const isGet = method === 'GET';
    const res = await fetch(base + '/api' + path, {
      method: isGet ? 'GET' : 'POST',
      headers: {
        Origin: base,
        ...(body && !isGet ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {})
      },
      ...(!isGet && body ? { body: JSON.stringify(body) } : {})
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

test('email-based invitation flow with accept, reject, notice, and hole protections', { timeout: 60000 }, async () => {
  const id = randomBytes(4).toString('hex');
  const a = client();
  const b = client();
  const c = client();

  const userA = await register(a, 'user_a_' + id);
  const userB = await register(b, 'user_b_' + id);

  // 1. User A creates room
  const roomRes = await a('/rooms/create', { title: 'Ruang Cinta ' + id, anniversary: '2025-05-10' });
  assert.equal(roomRes.status, 200);
  const roomId = roomRes.id;

  // Hole Check 1: User A invites non-registered email -> 404
  const invNonExistent = await a('/invites/create', { roomId, email: 'ghost_' + id + '@example.com' });
  assert.equal(invNonExistent.status, 404);
  assert.match(invNonExistent.error, /Email belum terdaftar/);

  // Hole Check 2: User A invites own email -> 400
  const invSelf = await a('/invites/create', { roomId, email: userA.email });
  assert.equal(invSelf.status, 400);
  assert.match(invSelf.error, /Tidak dapat mengundang email sendiri/);

  // 2. User A invites User B by email -> 200
  const invRes = await a('/invites/create', { roomId, email: userB.email });
  assert.equal(invRes.status, 200);
  assert.equal(invRes.email, userB.email);

  // User A checks room -> outgoing invite is present
  const roomA = await a(`/room?id=${roomId}`, null, 'GET');
  assert.equal(roomA.status, 200);
  assert.equal(roomA.outgoingInvite?.invitee_email, userB.email);

  // 3. User B calls /api/me -> incoming invite is present
  const meB1 = await b('/me', null, 'GET');
  assert.equal(meB1.status, 200);
  assert.ok(meB1.incomingInvite);
  assert.equal(meB1.incomingInvite.room_id, roomId);
  assert.equal(meB1.incomingInvite.inviter_email, userA.email);

  // 4. User B REJECTS the invite
  const rejectRes = await b('/invites/reject', { inviteId: meB1.incomingInvite.id });
  assert.equal(rejectRes.status, 200);

  // User B's incoming invite should now be cleared
  const meBAfterReject = await b('/me', null, 'GET');
  assert.equal(meBAfterReject.incomingInvite, null);

  // Requirement 7: User A sees notification about the rejection!
  const meAAfterReject = await a('/me', null, 'GET');
  assert.ok(meAAfterReject.notices.some(n => n.message.includes('menolak undangan')));

  // 5. User A re-invites User B
  const reInv = await a('/invites/create', { roomId, email: userB.email });
  assert.equal(reInv.status, 200);

  // 6. User B accepts the invite
  const meB2 = await b('/me', null, 'GET');
  assert.ok(meB2.incomingInvite);
  const acceptRes = await b('/invites/accept', { inviteId: meB2.incomingInvite.id });
  assert.equal(acceptRes.status, 200);
  assert.equal(acceptRes.id, roomId);

  // 7. Both users are now active members (2/2 members) in the same room!
  const finalRoomA = await a(`/room?id=${roomId}`, null, 'GET');
  assert.equal(finalRoomA.members.length, 2);
  const memberUsernames = finalRoomA.members.map(m => m.username);
  assert.ok(memberUsernames.includes(userA.username));
  assert.ok(memberUsernames.includes(userB.username));

  // Requirement check: User A receives notification that User B accepted!
  const meAFinal = await a('/me', null, 'GET');
  assert.ok(meAFinal.notices.some(n => n.message.includes('telah menerima undanganmu')));

  // Hole Check 3: Room is full (2 members), attempting to invite User C fails with 409
  await register(c, 'user_c_' + id);
  const invFull = await a('/invites/create', { roomId, email: `user_c_${id}@example.com` });
  assert.equal(invFull.status, 409);
  assert.match(invFull.error, /Ruang sudah berisi dua anggota/);
});
