import { db } from './db';
import { hash, fail } from './domain';
import { processMailJobs } from './mail';
import { randomBytes } from 'node:crypto';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin12345';
const secure = process.env.COOKIE_SECURE === 'true';

// Token hash cache for admin session
function adminTokenHash(tokenValue: string): string {
  return hash('pb_admin:' + tokenValue + ':' + ADMIN_SECRET);
}

// In-memory active tokens (valid for server lifecycle / 24 hours)
const activeAdminTokens = new Set<string>();

export function makeAdminCookie(tokenValue: string, maxAge: number): string {
  return `pb_admin_session=${tokenValue}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${
    secure ? '; Secure' : ''
  }`;
}

export function getAdminToken(cookieHeader: string | null | undefined): string {
  const m = (cookieHeader || '').match(/(?:^|;\s*)pb_admin_session=([a-f0-9]{64})(?:;|$)/);
  return m?.[1] || '';
}

export function verifyAdmin(cookieHeader: string | null | undefined): void {
  const token = getAdminToken(cookieHeader);
  if (!token) {
    fail(401, 'Sesi admin tidak ditemukan. Silakan masuk terlebih dahulu.');
  }

  const tokenHashed = adminTokenHash(token);
  if (!activeAdminTokens.has(tokenHashed)) {
    fail(401, 'Sesi admin telah berakhir atau tidak sah.');
  }
}

export async function handleAdminLogin(secret: string): Promise<{ ok: boolean; setCookie: string }> {
  if (!secret || secret.trim() !== ADMIN_SECRET) {
    fail(401, 'Kunci rahasia admin salah.');
  }

  const rawToken = randomBytes(32).toString('hex');
  const tokenHashed = adminTokenHash(rawToken);
  activeAdminTokens.add(tokenHashed);

  return {
    ok: true,
    setCookie: makeAdminCookie(rawToken, 86400) // 24 jam
  };
}

export function handleAdminLogout(): { ok: boolean; setCookie: string } {
  return {
    ok: true,
    setCookie: makeAdminCookie('', 0)
  };
}

export interface AdminStats {
  users: {
    total: number;
    withReminders: number;
    newToday: number;
  };
  rooms: {
    total: number;
    active: number;
    archived: number;
  };
  places: {
    total: number;
    wish: number;
    planned: number;
    visited: number;
    missed: number;
  };
  mailJobs: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
  };
  system: {
    nodeVersion: string;
    uptimeSeconds: number;
    memoryMb: number;
    dbConnected: boolean;
  };
}

export async function getAdminStats(): Promise<AdminStats> {
  const [userStats, roomStats, placeStats, jobStats] = await Promise.all([
    db.query<{ total: number; with_reminders: number; new_today: number }>(`
      SELECT 
        count(*)::int AS total,
        count(*) FILTER (WHERE email_reminders = true)::int AS with_reminders,
        count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS new_today
      FROM users
    `),
    db.query<{ total: number; active: number; archived: number }>(`
      SELECT 
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'active')::int AS active,
        count(*) FILTER (WHERE status = 'archived')::int AS archived
      FROM rooms
    `),
    db.query<{ total: number; wish: number; planned: number; visited: number; missed: number }>(`
      SELECT 
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'wish')::int AS wish,
        count(*) FILTER (WHERE status = 'planned')::int AS planned,
        count(*) FILTER (WHERE status = 'visited')::int AS visited,
        count(*) FILTER (WHERE status = 'missed')::int AS missed
      FROM places
    `),
    db.query<{ total: number; pending: number; sent: number; failed: number; cancelled: number }>(`
      SELECT 
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'pending')::int AS pending,
        count(*) FILTER (WHERE status = 'sent')::int AS sent,
        count(*) FILTER (WHERE status = 'failed')::int AS failed,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
      FROM mail_jobs
    `)
  ]);

  const mem = process.memoryUsage();

  return {
    users: {
      total: userStats.rows[0]?.total || 0,
      withReminders: userStats.rows[0]?.with_reminders || 0,
      newToday: userStats.rows[0]?.new_today || 0
    },
    rooms: {
      total: roomStats.rows[0]?.total || 0,
      active: roomStats.rows[0]?.active || 0,
      archived: roomStats.rows[0]?.archived || 0
    },
    places: {
      total: placeStats.rows[0]?.total || 0,
      wish: placeStats.rows[0]?.wish || 0,
      planned: placeStats.rows[0]?.planned || 0,
      visited: placeStats.rows[0]?.visited || 0,
      missed: placeStats.rows[0]?.missed || 0
    },
    mailJobs: {
      total: jobStats.rows[0]?.total || 0,
      pending: jobStats.rows[0]?.pending || 0,
      sent: jobStats.rows[0]?.sent || 0,
      failed: jobStats.rows[0]?.failed || 0,
      cancelled: jobStats.rows[0]?.cancelled || 0
    },
    system: {
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(mem.rss / 1024 / 1024),
      dbConnected: true
    }
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  emailReminders: boolean;
  createdAt: string;
  roomCount: number;
}

export async function getAdminUsers(query = '', limit = 50): Promise<AdminUserRow[]> {
  const q = `%${query.toLowerCase().trim()}%`;
  const { rows } = await db.query<{
    id: string;
    email: string;
    username: string;
    email_reminders: boolean;
    created_at: string;
    room_count: number;
  }>(
    `SELECT 
       u.id, u.email, u.username, u.email_reminders, u.created_at,
       count(m.room_id)::int AS room_count
     FROM users u
     LEFT JOIN memberships m ON m.user_id = u.id AND m.state = 'active'
     WHERE ($1 = '%%' OR lower(u.email) LIKE $1 OR lower(u.username) LIKE $1)
     GROUP BY u.id, u.email, u.username, u.email_reminders, u.created_at
     ORDER BY u.created_at DESC
     LIMIT $2`,
    [q, limit]
  );

  return rows.map(r => ({
    id: r.id,
    email: r.email,
    username: r.username,
    emailReminders: r.email_reminders,
    createdAt: r.created_at,
    roomCount: r.room_count
  }));
}

export interface AdminRoomRow {
  id: string;
  title: string;
  status: string;
  anniversary: string | null;
  createdAt: string;
  members: string[];
  placesCount: number;
}

export async function getAdminRooms(query = '', limit = 50): Promise<AdminRoomRow[]> {
  const q = `%${query.toLowerCase().trim()}%`;
  const { rows } = await db.query<{
    id: string;
    title: string;
    status: string;
    anniversary: string | null;
    created_at: string;
    members: string | null;
    places_count: number;
  }>(
    `SELECT 
       r.id, r.title, r.status, r.anniversary, r.created_at,
       string_agg(u.username, ', ') AS members,
       (SELECT count(*)::int FROM places p WHERE p.room_id = r.id) AS places_count
     FROM rooms r
     LEFT JOIN memberships m ON m.room_id = r.id AND m.state IN ('active', 'archived')
     LEFT JOIN users u ON u.id = m.user_id
     WHERE ($1 = '%%' OR lower(r.title) LIKE $1 OR lower(coalesce(u.username, '')) LIKE $1)
     GROUP BY r.id, r.title, r.status, r.anniversary, r.created_at
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [q, limit]
  );

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    status: r.status,
    anniversary: r.anniversary,
    createdAt: r.created_at,
    members: r.members ? r.members.split(', ') : [],
    placesCount: r.places_count
  }));
}

export interface AdminJobRow {
  id: string;
  recipientEmail: string;
  placeName: string | null;
  kind: string;
  status: string;
  attempts: number;
  scheduledAt: string;
  sentAt: string | null;
}

export async function getAdminJobs(limit = 50): Promise<AdminJobRow[]> {
  const { rows } = await db.query<{
    id: string;
    email: string;
    place_name: string | null;
    kind: string;
    status: string;
    attempts: number;
    scheduled_at: string;
    sent_at: string | null;
  }>(
    `SELECT 
       j.id, u.email, p.name AS place_name, j.kind, j.status, j.attempts,
       j.scheduled_at, j.sent_at
     FROM mail_jobs j
     JOIN users u ON u.id = j.user_id
     LEFT JOIN places p ON p.id = j.place_id
     ORDER BY j.scheduled_at DESC
     LIMIT $1`,
    [limit]
  );

  return rows.map(r => ({
    id: r.id,
    recipientEmail: r.email,
    placeName: r.place_name,
    kind: r.kind,
    status: r.status,
    attempts: r.attempts,
    scheduledAt: r.scheduled_at,
    sentAt: r.sent_at
  }));
}

export async function triggerAdminWorker(): Promise<{ processed: number; errors: number }> {
  return processMailJobs(20);
}
