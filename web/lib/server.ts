import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { db, roomTx, tx, rateLimit } from './db';
import {
  fail,
  hash,
  token,
  otp,
  otpHash,
  equal,
  validateEmail,
  validateUsername,
  validateText,
  validateUuid,
  dateOnly,
  pairKey,
  placeInput,
  scheduleTime,
  reminderTimes
} from './domain';
import { sendMail, processMailJobs } from './mail';
import type { Config, MeResponse, RoomResponse, User } from './types';

const secret = process.env.AUTH_SECRET || '';
const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
const secure = process.env.COOKIE_SECURE === 'true';
const production = process.env.APP_MODE === 'production';

export function makeSessionCookie(tokenValue: string, maxAge: number): string {
  return `pb_session=${tokenValue}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${
    secure ? '; Secure' : ''
  }`;
}

export function getSessionTokenFromCookie(cookieHeader: string | null | undefined): string {
  const m = (cookieHeader || '').match(/(?:^|;\s*)pb_session=([a-f0-9]{64})(?:;|$)/);
  return m?.[1] || '';
}

export async function getAuthUser(cookieHeader: string | null | undefined): Promise<User> {
  const raw = getSessionTokenFromCookie(cookieHeader);
  if (!raw) fail(401, 'Silakan masuk terlebih dahulu.');

  const { rows } = await db.query<{
    id: string;
    username: string;
    email: string;
    email_reminders: boolean;
  }>(
    'SELECT u.id, u.username, u.email, u.email_reminders FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
    [hash(raw)]
  );

  const u = rows[0];
  if (!u) fail(401, 'Sesi berakhir. Silakan masuk lagi.');

  return {
    id: u.id,
    username: u.username,
    email: u.email,
    emailReminders: u.email_reminders
  };
}

async function roomAccess(
  c: PoolClient,
  user: { id: string },
  roomId: unknown,
  write = false
) {
  const id = validateUuid(roomId);
  const { rows } = await c.query(
    "SELECT r.*, m.state FROM rooms r JOIN memberships m ON m.room_id=r.id WHERE r.id=$1 AND m.user_id=$2 AND m.state IN ('active','archived')",
    [id, user.id]
  );
  const room = rows[0];
  if (!room) fail(403, 'Kamu tidak punya akses ke ruang ini.');
  if (write && (room.status !== 'active' || room.state !== 'active')) {
    fail(403, 'Arsip hanya dapat dibaca.');
  }
  return room;
}

async function activeRoom(c: PoolClient, user: { id: string }): Promise<string | undefined> {
  const { rows } = await c.query<{ room_id: string }>(
    "SELECT room_id FROM memberships WHERE user_id=$1 AND state='active'",
    [user.id]
  );
  return rows[0]?.room_id;
}

async function cancelPlaceJobs(c: PoolClient, placeId: string) {
  await c.query("UPDATE mail_jobs SET status='cancelled' WHERE place_id=$1 AND status IN ('pending','failed')", [
    placeId
  ]);
}

async function queuePlace(c: PoolClient, p: { id: string; room_id: string; scheduled_at: string }) {
  await cancelPlaceJobs(c, p.id);
  const members = await c.query<{ user_id: string }>(
    "SELECT user_id FROM memberships WHERE room_id=$1 AND state='active'",
    [p.room_id]
  );
  for (const at of reminderTimes(p.scheduled_at)) {
    for (const m of members.rows) {
      await c.query(
        "INSERT INTO mail_jobs(id, room_id, place_id, user_id, kind, scheduled_at) VALUES($1, $2, $3, $4, 'reminder', $5)",
        [randomUUID(), p.room_id, p.id, m.user_id, at]
      );
    }
  }
}

export async function syncMissedPlaces(c: PoolClient, roomId?: string): Promise<number> {
  let query = "UPDATE places SET status='missed' WHERE status='planned' AND scheduled_at <= now()";
  const params: unknown[] = [];
  if (roomId) {
    query += ' AND room_id=$1';
    params.push(roomId);
  }
  const res = await c.query(query, params);
  if (res.rowCount && res.rowCount > 0) {
    await c.query(
      "UPDATE mail_jobs SET status='cancelled' WHERE place_id IN (SELECT id FROM places WHERE status='missed') AND status IN ('pending','failed')"
    );
  }
  return res.rowCount || 0;
}

// ----------------------------------------------------
// Handlers
// ----------------------------------------------------

export async function handleHealth() {
  await db.query('SELECT 1');
  return { ok: true };
}

export function handleConfig(): Config {
  return {
    mode: production ? 'production' : 'development',
    email: production ? 'SMTP' : 'Mailpit',
    whatsapp: false
  };
}

export async function handleAuthRequest(
  b: Record<string, unknown>,
  remoteIp: string
): Promise<{ requestId: string; message: string }> {
  const em = validateEmail(b.email);
  const intent = b.intent;
  if (intent !== 'login' && intent !== 'register') {
    fail(400, 'Pilih masuk atau daftar.');
  }
  const name = intent === 'register' ? validateUsername(b.username) : null;

  await rateLimit('email:' + hash(em), 4, 15);
  await rateLimit('ip:' + hash(remoteIp || ''), 20, 15);

  const id = randomUUID();
  const code = otp();
  const authSecret = secret || 'default-secret-for-development-mode-fallback';

  await tx(async c => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['otp:' + em]);
    await c.query('UPDATE otp_requests SET used=true WHERE email=$1 AND used=false', [em]);
    await c.query(
      "INSERT INTO otp_requests(id, email, username, intent, code_hash, expires_at) VALUES($1, $2, $3, $4, $5, now()+interval '10 minutes')",
      [id, em, name, intent, otpHash(authSecret, id, code)]
    );
  });

  try {
    await sendMail(
      em,
      'Kode masuk PergiBerdua',
      `Kode verifikasi kamu: ${code}\n\nBerlaku 10 menit. Jangan bagikan kode ini kepada siapa pun. Jika tidak meminta kode, abaikan email ini.\n\nPergiBerdua`
    );
  } catch (err) {
    console.error('Failed sending OTP email:', err);
    await db.query('UPDATE otp_requests SET used=true WHERE id=$1', [id]);
    fail(503, 'Email belum dapat dikirim. Coba lagi nanti.');
  }

  return { requestId: id, message: 'Kode dikirim. Periksa email kamu.' };
}

export async function handleAuthVerify(
  b: Record<string, unknown>,
  remoteIp: string
): Promise<{ user: User; setCookie: string }> {
  const id = validateUuid(b.requestId);
  const code = String(b.code || '');

  await rateLimit('verify:' + hash(remoteIp || ''), 40, 15);
  if (!/^\d{6}$/.test(code)) fail(400, 'Kode harus 6 angka.');

  const authSecret = secret || 'default-secret-for-development-mode-fallback';

  const result = await tx(async c => {
    const { rows } = await c.query<{
      id: string;
      email: string;
      username: string | null;
      intent: string;
      code_hash: string;
      attempts: number;
      expires_at: string;
      used: boolean;
    }>('SELECT * FROM otp_requests WHERE id=$1 FOR UPDATE', [id]);

    const r = rows[0];
    if (!r || r.used || r.attempts >= 5 || new Date(r.expires_at) < new Date()) {
      return { error: 'Kode kedaluwarsa atau tidak berlaku. Minta kode baru.' };
    }

    await c.query('UPDATE otp_requests SET attempts=attempts+1 WHERE id=$1', [id]);
    if (!equal(r.code_hash, otpHash(authSecret, id, code))) {
      return { error: 'Kode tidak cocok. Maksimal 5 percobaan per kode.' };
    }

    await c.query('UPDATE otp_requests SET used=true WHERE id=$1', [id]);

    let u = (
      await c.query<{ id: string; email: string; username: string; email_reminders: boolean }>(
        'SELECT * FROM users WHERE email=$1',
        [r.email]
      )
    ).rows[0];

    if (r.intent === 'register') {
      if (u) return { error: 'Email ini sudah terdaftar. Gunakan halaman masuk.' };
      const inserted = await c.query<{
        id: string;
        email: string;
        username: string;
        email_reminders: boolean;
      }>(
        'INSERT INTO users(id, email, username) VALUES($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *',
        [randomUUID(), r.email, r.username]
      );
      u = inserted.rows[0];
      if (!u) return { error: 'Email atau username telah dipakai. Ulangi pendaftaran.' };
    } else if (!u) {
      return { error: 'Akun belum terdaftar. Buat akun terlebih dahulu.' };
    }

    const raw = token();
    await c.query(
      "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES($1, $2, now()+interval '7 days')",
      [hash(raw), u.id]
    );

    return {
      raw,
      user: {
        id: u.id,
        username: u.username,
        email: u.email,
        emailReminders: u.email_reminders ?? true
      }
    };
  });

  if ('error' in result && result.error) {
    fail(400, result.error);
  }

  const { raw, user } = result as { raw: string; user: User };
  const setCookie = makeSessionCookie(raw, 7 * 86400);
  return { user, setCookie };
}

export async function handleAuthLogout(cookieHeader: string | null | undefined): Promise<{ ok: true; setCookie: string }> {
  const raw = getSessionTokenFromCookie(cookieHeader);
  if (raw) {
    await db.query('DELETE FROM sessions WHERE token_hash=$1', [hash(raw)]);
  }
  return { ok: true, setCookie: makeSessionCookie('', 0) };
}

export async function handleMe(cookieHeader: string | null | undefined): Promise<MeResponse> {
  const u = await getAuthUser(cookieHeader);
  const rooms = await db.query(
    "SELECT r.*, m.state FROM rooms r JOIN memberships m ON m.room_id=r.id WHERE m.user_id=$1 AND m.state IN ('active','archived') ORDER BY r.created_at DESC",
    [u.id]
  );
  const notices = await db.query(
    'SELECT id, message, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',
    [u.id]
  );
  const incoming = await db.query(
    `SELECT i.id, i.room_id, r.title AS room_title, u.username AS inviter_name, u.email AS inviter_email, i.created_at
     FROM invitations i
     JOIN rooms r ON r.id = i.room_id
     JOIN users u ON u.id = i.created_by
     WHERE (i.invitee_id = $1 OR lower(i.invitee_email) = lower($2))
       AND i.status = 'pending'
       AND i.used = false
       AND i.expires_at > now()
       AND r.status = 'active'
     ORDER BY i.created_at DESC
     LIMIT 1`,
    [u.id, u.email]
  );
  return {
    user: u,
    rooms: rooms.rows,
    notices: notices.rows,
    incomingInvite: (incoming.rows[0] as MeResponse['incomingInvite']) || null
  };
}

export async function handlePreferences(
  cookieHeader: string | null | undefined,
  b: Record<string, unknown>
): Promise<{ ok: true }> {
  const u = await getAuthUser(cookieHeader);
  if (typeof b.emailReminders !== 'boolean') fail(400, 'Preferensi tidak valid.');
  await db.query('UPDATE users SET email_reminders=$1 WHERE id=$2', [b.emailReminders, u.id]);
  return { ok: true };
}

export async function handleRoomCreate(
  cookieHeader: string | null | undefined,
  b: Record<string, unknown>
): Promise<{ id: string }> {
  const u = await getAuthUser(cookieHeader);
  const title = validateText(b.title, 60, true);
  const ann = dateOnly(b.anniversary);

  return roomTx(async c => {
    if (await activeRoom(c, u)) {
      fail(409, 'Kamu sudah punya ruang aktif. Keluar dahulu sebelum membuat ruang baru.');
    }
    const id = randomUUID();
    await c.query('INSERT INTO rooms(id, title, anniversary) VALUES($1, $2, $3)', [id, title, ann]);
    await c.query("INSERT INTO memberships VALUES($1, $2, 'active')", [id, u.id]);
    return { id };
  });
}

export async function handleRoomProfile(
  cookieHeader: string | null | undefined,
  b: Record<string, unknown>
): Promise<{ ok: true }> {
  const u = await getAuthUser(cookieHeader);
  return roomTx(async c => {
    await roomAccess(c, u, b.roomId, true);
    await c.query('UPDATE rooms SET title=$1, anniversary=$2 WHERE id=$3', [
      validateText(b.title, 60, true),
      dateOnly(b.anniversary),
      validateUuid(b.roomId)
    ]);
    return { ok: true };
  });
}

export async function handleRoomLeave(
  cookieHeader: string | null | undefined,
  b: Record<string, unknown>
): Promise<{ ok: true }> {
  const u = await getAuthUser(cookieHeader);
  if (b.confirm !== true) fail(400, 'Konfirmasi keluar diperlukan.');

  return roomTx(async c => {
    const roomId = validateUuid(b.roomId);
    await roomAccess(c, u, roomId, true);

    await c.query("UPDATE memberships SET state='left' WHERE room_id=$1 AND user_id=$2", [roomId, u.id]);
    await c.query("UPDATE memberships SET state='archived' WHERE room_id=$1 AND state='active'", [roomId]);
    await c.query("UPDATE rooms SET status='archived', archived_at=now() WHERE id=$1", [roomId]);
    await c.query("UPDATE invitations SET status='cancelled', used=true WHERE room_id=$1", [roomId]);
    await c.query("UPDATE mail_jobs SET status='cancelled' WHERE room_id=$1 AND status IN ('pending','failed')", [
      roomId
    ]);

    const left = (
      await c.query<{ user_id: string }>(
        "SELECT user_id FROM memberships WHERE room_id=$1 AND state='archived'",
        [roomId]
      )
    ).rows;

    for (const m of left) {
      await c.query('INSERT INTO notifications(id, user_id, message) VALUES($1, $2, $3)', [
        randomUUID(),
        m.user_id,
        'Pasangan telah keluar dari ruang bersama. Ruang ini kini menjadi arsip hanya-baca. Kamu dapat membuat ruang baru.'
      ]);
      await c.query(
        "INSERT INTO mail_jobs(id, room_id, user_id, kind, scheduled_at) VALUES($1, $2, $3, 'room_closed', now())",
        [randomUUID(), roomId, m.user_id]
      );
    }

    return { ok: true };
  });
}

export async function handleRoom(
  cookieHeader: string | null | undefined,
  id: string | null
): Promise<RoomResponse> {
  const u = await getAuthUser(cookieHeader);
  return roomTx(async c => {
    const room = await roomAccess(c, u, id);
    if (id) await syncMissedPlaces(c, id);
    const members = (
      await c.query(
        "SELECT u.id, u.username, m.state FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 AND m.state!='left'",
        [id]
      )
    ).rows;
    const places = (
      await c.query('SELECT * FROM places WHERE room_id=$1 ORDER BY created_at DESC', [id])
    ).rows;
    const jobs = (
      await c.query(
        'SELECT j.id, j.place_id, j.kind, j.status, j.scheduled_at, j.attempts FROM mail_jobs j WHERE j.room_id=$1 AND j.user_id=$2 ORDER BY scheduled_at DESC LIMIT 20',
        [id, u.id]
      )
    ).rows;
    const outgoing = id ? (
      await c.query(
        `SELECT i.id, i.invitee_email, u.username AS invitee_name, i.status, i.created_at
         FROM invitations i
         LEFT JOIN users u ON u.id = i.invitee_id
         WHERE i.room_id = $1 AND i.status = 'pending' AND i.used = false AND i.expires_at > now()
         ORDER BY i.created_at DESC LIMIT 1`,
        [id]
      )
    ).rows[0] || null : null;
    return { room, members, places, jobs, outgoingInvite: (outgoing as RoomResponse['outgoingInvite']) || null };
  });
}

export async function handleInviteCreate(
  cookieHeader: string | null | undefined,
  b: Record<string, unknown>
): Promise<{ url: string; code: string; expiresInHours: number; inviteId?: string; email?: string; username?: string }> {
  const u = await getAuthUser(cookieHeader);
  return roomTx(async c => {
    const roomId = validateUuid(b.roomId);
    const room = await roomAccess(c, u, roomId, true);

    const members = await c.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM memberships WHERE room_id=$1 AND state='active'",
      [roomId]
    );
    if ((members.rows[0]?.n ?? 0) >= 2) fail(409, 'Ruang sudah berisi dua anggota.');

    // Cancel existing pending invitations for this room
    await c.query("UPDATE invitations SET status='cancelled', used=true WHERE room_id=$1 AND status='pending'", [roomId]);
    const raw = token();
    const tokenHash = hash(raw);
    const inviteId = randomUUID();

    if (b.email) {
      await rateLimit('invite:' + hash(u.id), 15, 15);
      const email = String(b.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Format email tidak valid.');

      // 1. Hole: Mengundang email sendiri
      if (email === u.email.toLowerCase()) {
        fail(400, 'Tidak dapat mengundang email sendiri.');
      }

      // 2. Cari target user di database
      const targetUser = (
        await c.query<{ id: string; email: string; username: string }>(
          'SELECT id, email, username FROM users WHERE lower(email)=$1',
          [email]
        )
      ).rows[0];

      if (!targetUser) {
        fail(404, 'Email belum terdaftar sebagai pengguna PergiBerdua. Minta pasanganmu membuat akun terlebih dahulu.');
      }

      if (targetUser.id === u.id) {
        fail(400, 'Tidak dapat mengundang email sendiri.');
      }

      // 3. Hole: Target user sudah memiliki ruang aktif bersama pasangan lain
      const activeMem = await c.query(
        "SELECT 1 FROM memberships WHERE user_id=$1 AND state='active'",
        [targetUser.id]
      );
      if (activeMem.rows.length > 0) {
        fail(409, 'Pengguna ini sudah memiliki ruang aktif bersama pasangan lain.');
      }

      // 4. Hole: Pasangan sudah pernah memiliki riwayat ruang bersama
      const key = pairKey(u.username, targetUser.username);
      const existing = await c.query('SELECT id FROM rooms WHERE pair_key=$1', [key]);
      if (existing.rows.length) {
        fail(409, 'Pasangan username ini sudah pernah memiliki ruang. Pemulihan ruang lama belum tersedia.');
      }

      await c.query(
        `INSERT INTO invitations(token_hash, room_id, created_by, expires_at, id, invitee_id, invitee_email, status)
         VALUES($1, $2, $3, now()+interval '7 days', $4, $5, $6, 'pending')`,
        [tokenHash, roomId, u.id, inviteId, targetUser.id, targetUser.email]
      );

      // Notifikasi ke User B
      await c.query(
        'INSERT INTO notifications(id, user_id, message) VALUES($1, $2, $3)',
        [
          randomUUID(),
          targetUser.id,
          `${u.username} mengundangmu untuk bergabung ke ruang "${room.title}". Periksa beranda untuk menerima atau menolak.`
        ]
      );

      return {
        url: origin + '/#invite=' + raw,
        code: raw,
        expiresInHours: 168,
        inviteId,
        email: targetUser.email,
        username: targetUser.username
      };
    }

    // Token-only flow (backward compatibility)
    await c.query(
      "INSERT INTO invitations(token_hash, room_id, created_by, expires_at, id, status) VALUES($1, $2, $3, now()+interval '24 hours', $4, 'pending')",
      [tokenHash, roomId, u.id, inviteId]
    );

    return { url: origin + '/#invite=' + raw, code: raw, expiresInHours: 24, inviteId };
  });
}

export async function handleInviteAccept(
  cookieHeader: string | null | undefined,
  b: Record<string, unknown>
): Promise<{ id: string }> {
  const u = await getAuthUser(cookieHeader);
  const tokenStr = b.token ? String(b.token) : '';
  const inviteId = b.inviteId ? String(b.inviteId) : '';

  if (!tokenStr && !inviteId) fail(400, 'Undangan tidak valid.');
  if (tokenStr && !/^[a-f0-9]{64}$/.test(tokenStr)) fail(400, 'Kode undangan tidak valid.');

  return roomTx(async c => {
    if (await activeRoom(c, u)) fail(409, 'Kamu sudah memiliki ruang aktif. Keluar dari ruang tersebut sebelum menerima.');

    const inv = inviteId
      ? (
          await c.query<{ id: string; token_hash: string; room_id: string; created_by: string; invitee_id: string | null; invitee_email: string | null }>(
            "SELECT * FROM invitations WHERE id=$1 AND status='pending' AND used=false AND expires_at>now()",
            [validateUuid(inviteId)]
          )
        ).rows[0]
      : (
          await c.query<{ id: string; token_hash: string; room_id: string; created_by: string; invitee_id: string | null; invitee_email: string | null }>(
            "SELECT * FROM invitations WHERE token_hash=$1 AND status='pending' AND used=false AND expires_at>now()",
            [hash(tokenStr)]
          )
        ).rows[0];

    if (!inv) return fail(400, 'Undangan sudah dipakai, ditolak, dibatalkan, atau kedaluwarsa.');

    // Jika undangan ditujukan spesifik ke email tertentu, pastikan cocok dengan akun ini
    if (inv.invitee_id && inv.invitee_id !== u.id && inv.invitee_email?.toLowerCase() !== u.email.toLowerCase()) {
      fail(403, 'Undangan ini ditujukan untuk pengguna lain.');
    }

    const r = (await c.query<{ id: string; status: string; title: string }>('SELECT * FROM rooms WHERE id=$1', [inv.room_id]))
      .rows[0];
    const members = (
      await c.query<{ id: string; username: string }>(
        "SELECT u.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 AND m.state='active'",
        [r.id]
      )
    ).rows;

    if (r.status !== 'active' || members.length !== 1 || members[0].id === u.id) {
      fail(409, 'Undangan tidak dapat diterima (ruang sudah penuh, tidak aktif, atau milikmu sendiri).');
    }

    const key = pairKey(members[0].username, u.username);
    const existing = await c.query('SELECT id FROM rooms WHERE pair_key=$1', [key]);
    if (existing.rows.length) {
      fail(409, 'Pasangan username ini sudah pernah memiliki ruang. Pemulihan ruang lama belum tersedia.');
    }

    await c.query("INSERT INTO memberships VALUES($1, $2, 'active')", [r.id, u.id]);
    await c.query('UPDATE rooms SET pair_key=$1 WHERE id=$2', [key, r.id]);
    await c.query("UPDATE invitations SET status='accepted', used=true, responded_at=now(), invitee_id=$1 WHERE id=$2", [u.id, inv.id]);

    // Batalkan semua undangan lain untuk room ini
    await c.query("UPDATE invitations SET status='cancelled', used=true WHERE room_id=$1 AND id!=$2", [r.id, inv.id]);

    // Hole: Batalkan undangan pending lainnya yang melibatkan User B (baik sebagai pengirim atau penerima)
    await c.query(
      "UPDATE invitations SET status='cancelled', used=true WHERE (created_by=$1 OR invitee_id=$1 OR lower(invitee_email)=lower($2)) AND status='pending'",
      [u.id, u.email]
    );

    const planned = (
      await c.query<{ id: string; room_id: string; scheduled_at: string }>(
        "SELECT * FROM places WHERE room_id=$1 AND status='planned' AND scheduled_at>now()",
        [r.id]
      )
    ).rows;
    for (const p of planned) await queuePlace(c, p);

    // Kirim notifikasi sukses ke User A (pembuat ruang)
    await c.query('INSERT INTO notifications(id, user_id, message) VALUES($1, $2, $3)', [
      randomUUID(),
      members[0].id,
      `${u.username} telah menerima undanganmu! Kalian sekarang berada di ruang "${r.title}".`
    ]);

    return { id: r.id };
  });
}

export async function handleInviteReject(
  cookieHeader: string | null | undefined,
  b: Record<string, unknown>
): Promise<{ ok: true }> {
  const u = await getAuthUser(cookieHeader);
  const inviteId = b.inviteId ? String(b.inviteId) : '';
  const tokenStr = b.token ? String(b.token) : '';

  if (!inviteId && !tokenStr) fail(400, 'ID undangan diperlukan.');

  return roomTx(async c => {
    const inv = inviteId
      ? (
          await c.query<{ id: string; room_id: string; created_by: string; invitee_id: string | null; invitee_email: string | null }>(
            "SELECT * FROM invitations WHERE id=$1 AND status='pending' AND used=false AND expires_at>now()",
            [validateUuid(inviteId)]
          )
        ).rows[0]
      : (
          await c.query<{ id: string; room_id: string; created_by: string; invitee_id: string | null; invitee_email: string | null }>(
            "SELECT * FROM invitations WHERE token_hash=$1 AND status='pending' AND used=false AND expires_at>now()",
            [hash(tokenStr)]
          )
        ).rows[0];

    if (!inv) return fail(400, 'Undangan tidak ditemukan atau sudah tidak berlaku.');

    if (inv.invitee_id && inv.invitee_id !== u.id && inv.invitee_email?.toLowerCase() !== u.email.toLowerCase()) {
      fail(403, 'Undangan ini bukan untuk akunmu.');
    }

    // Tandai ditolak
    await c.query(
      "UPDATE invitations SET status='rejected', used=true, responded_at=now(), invitee_id=$1 WHERE id=$2",
      [u.id, inv.id]
    );

    const room = (await c.query<{ title: string }>('SELECT title FROM rooms WHERE id=$1', [inv.room_id])).rows[0];

    // Notifikasi penolakan ke User A (Kebutuhan #7: jika di tolak maka user A mendapatkan notif penolakan dari user B)
    await c.query('INSERT INTO notifications(id, user_id, message) VALUES($1, $2, $3)', [
      randomUUID(),
      inv.created_by,
      `${u.username} menolak undangan untuk bergabung ke ruang "${room?.title || 'kalian'}". Kamu dapat mengundang pengguna lain.`
    ]);

    return { ok: true };
  });
}

export async function handleInviteCancel(
  cookieHeader: string | null | undefined,
  b: Record<string, unknown>
): Promise<{ ok: true }> {
  const u = await getAuthUser(cookieHeader);
  const roomId = validateUuid(b.roomId);

  return roomTx(async c => {
    await roomAccess(c, u, roomId, true);
    await c.query(
      "UPDATE invitations SET status='cancelled', used=true, responded_at=now() WHERE room_id=$1 AND created_by=$2 AND status='pending'",
      [roomId, u.id]
    );
    return { ok: true };
  });
}

export async function handlePlaceSave(
  cookieHeader: string | null | undefined,
  b: Record<string, unknown>
): Promise<{ id: string }> {
  const u = await getAuthUser(cookieHeader);
  const v = placeInput(b);
  const roomId = validateUuid(b.roomId);

  return roomTx(async c => {
    await roomAccess(c, u, roomId, true);

    if (b.id) {
      const placeId = validateUuid(b.id);
      const res = await c.query(
        'UPDATE places SET name=$1, area=$2, category=$3, budget=$4, note=$5 WHERE id=$6 AND room_id=$7 RETURNING id',
        [v.name, v.area, v.category, v.budget, v.note, placeId, roomId]
      );
      if (!res.rowCount) fail(404, 'Tempat tidak ditemukan.');
      return { id: placeId };
    }

    const id = randomUUID();
    await c.query(
      'INSERT INTO places(id, room_id, name, area, category, budget, note, created_by) VALUES($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, roomId, v.name, v.area, v.category, v.budget, v.note, u.id]
    );
    return { id };
  });
}

export async function handlePlaceAction(
  cookieHeader: string | null | undefined,
  b: Record<string, unknown>
): Promise<{ ok: true }> {
  const u = await getAuthUser(cookieHeader);
  const roomId = validateUuid(b.roomId);
  const id = validateUuid(b.id);

  return roomTx(async c => {
    await roomAccess(c, u, roomId, true);
    const p = (
      await c.query<{ id: string; room_id: string; scheduled_at: string }>(
        'SELECT * FROM places WHERE id=$1 AND room_id=$2',
        [id, roomId]
      )
    ).rows[0];
    if (!p) fail(404, 'Tempat tidak ditemukan.');

    if (b.action === 'delete') {
      await c.query('DELETE FROM places WHERE id=$1', [p.id]);
    } else if (b.action === 'schedule' || b.action === 'reschedule') {
      const at = scheduleTime(b.at);
      await c.query("UPDATE places SET status='planned', scheduled_at=$1, visited_at=null WHERE id=$2", [
        at,
        p.id
      ]);
      await queuePlace(c, { ...p, scheduled_at: at });
    } else if (b.action === 'visited') {
      await c.query("UPDATE places SET status='visited', visited_at=now() WHERE id=$1", [p.id]);
      await cancelPlaceJobs(c, p.id);
    } else if (b.action === 'wish') {
      await c.query("UPDATE places SET status='wish', scheduled_at=null, visited_at=null WHERE id=$1", [p.id]);
      await cancelPlaceJobs(c, p.id);
    } else {
      fail(400, 'Aksi tidak valid.');
    }

    return { ok: true };
  });
}

export async function handleCronReminders(): Promise<{ ok: true; processed: number; errors: number; missedDetected: number }> {
  let missedDetected = 0;
  await roomTx(async c => {
    missedDetected = await syncMissedPlaces(c);
  });
  const res = await processMailJobs(20);
  // Periodic cleanup
  await db.query(
    "DELETE FROM rate_events WHERE created_at<now()-interval '1 day'; DELETE FROM otp_requests WHERE created_at<now()-interval '1 day'; DELETE FROM sessions WHERE expires_at<now()"
  ).catch(err => console.error('Cleanup failed:', err));
  return { ok: true, missedDetected, ...res };
}
