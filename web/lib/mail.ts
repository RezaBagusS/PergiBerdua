import nodemailer from 'nodemailer';
import { db, roomTx } from './db';

const origin = process.env.APP_ORIGIN || 'http://localhost:3000';

function getTransporter() {
  const host = process.env.SMTP_HOST || '127.0.0.1';
  const port = Number(process.env.SMTP_PORT || 1025);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user ? { auth: { user, pass } } : {}),
    connectionTimeout: 10000,
    socketTimeout: 15000
  });
}

const smtp = getTransporter();

export async function sendMail(to: string, subject: string, body: string) {
  const from = process.env.MAIL_FROM || 'PergiBerdua <hello@pergiberdua.local>';
  return smtp.sendMail({
    from,
    to,
    subject,
    text: body
  });
}

export async function processMailJobs(maxBatch = 10): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < maxBatch; i++) {
    const executed = await roomTx(async c => {
      const { rows } = await c.query<{
        id: string;
        user_id: string;
        room_id: string;
        place_id: string | null;
        kind: 'reminder' | 'room_closed';
      }>(
        "SELECT * FROM mail_jobs WHERE (status='pending' OR (status='failed' AND attempts<3)) AND scheduled_at<=now() ORDER BY scheduled_at LIMIT 1 FOR UPDATE"
      );

      const job = rows[0];
      if (!job) return false;

      const uRes = await c.query<{ email: string; email_reminders: boolean }>(
        'SELECT email, email_reminders FROM users WHERE id=$1',
        [job.user_id]
      );
      const u = uRes.rows[0];

      const memberRes = await c.query<{ state: string; status: string }>(
        'SELECT m.state, r.status FROM memberships m JOIN rooms r ON r.id=m.room_id WHERE m.room_id=$1 AND m.user_id=$2',
        [job.room_id, job.user_id]
      );
      const member = memberRes.rows[0];

      let title = 'Informasi ruang PergiBerdua';
      let message =
        'Pasangan telah keluar dari ruang bersama. Ruang lama kini menjadi arsip hanya-baca. Kamu dapat membuat ruang baru, tanpa memindahkan data lama.\n\nBuka ' +
        origin;

      if (job.kind === 'reminder') {
        const placeRes = await c.query<{
          name: string;
          area: string;
          budget: number;
          status: string;
          scheduled_at: string;
        }>('SELECT * FROM places WHERE id=$1', [job.place_id]);
        const p = placeRes.rows[0];

        if (
          !u?.email_reminders ||
          member?.state !== 'active' ||
          member?.status !== 'active' ||
          !p ||
          p.status !== 'planned' ||
          new Date(p.scheduled_at) <= new Date()
        ) {
          await c.query("UPDATE mail_jobs SET status='cancelled' WHERE id=$1", [job.id]);
          return true;
        }

        title = 'Rencana berdua: ' + p.name;
        message = `Kalian punya rencana ke ${p.name} (${p.area}).\n\n${new Date(p.scheduled_at).toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta'
        })} WIB\nBudget: Rp ${p.budget.toLocaleString('id-ID')} / berdua\n\nLihat atau ubah rencana di ${origin}\nAtur pengingat email melalui menu Akun.`;
      } else if (member?.state !== 'archived') {
        await c.query("UPDATE mail_jobs SET status='cancelled' WHERE id=$1", [job.id]);
        return true;
      }

      await c.query(
        "UPDATE mail_jobs SET status='sending', attempts=attempts+1, locked_at=now() WHERE id=$1",
        [job.id]
      );

      try {
        await sendMail(u.email, title, message);
        await c.query("UPDATE mail_jobs SET status='sent', sent_at=now() WHERE id=$1", [job.id]);
      } catch (sendErr) {
        console.error('Email delivery failed:', sendErr);
        errors++;
        await c.query(
          "UPDATE mail_jobs SET status='failed', scheduled_at=now()+interval '5 minutes' WHERE id=$1",
          [job.id]
        );
      }
      return true;
    });

    if (!executed) break;
    processed++;
  }

  return { processed, errors };
}
