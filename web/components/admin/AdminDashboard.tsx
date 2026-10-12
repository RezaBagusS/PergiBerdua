'use client';

import { useState, useEffect, useCallback } from 'react';
import { Logo } from '../Artwork';
import type { AdminStats, AdminUserRow, AdminRoomRow, AdminJobRow } from '../../lib/admin';

interface Props {
  onLogout: () => void;
}

type Tab = 'overview' | 'users' | 'rooms' | 'jobs' | 'system';

function formatWib(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  try {
    return new Date(isoString).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' WIB';
  } catch {
    return isoString;
  }
}

export default function AdminDashboard({ onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [rooms, setRooms] = useState<AdminRoomRow[]>([]);
  const [jobs, setJobs] = useState<AdminJobRow[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [roomQuery, setRoomQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (e) {
      console.error('Failed to load admin stats:', e);
    }
  }, [onLogout]);

  const fetchUsers = useCallback(async (q = '') => {
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
      if (res.ok) setUsers(await res.json());
    } catch (e) {
      console.error('Failed to load users:', e);
    }
  }, []);

  const fetchRooms = useCallback(async (q = '') => {
    try {
      const res = await fetch(`/api/admin/rooms?q=${encodeURIComponent(q)}`);
      if (res.ok) setRooms(await res.json());
    } catch (e) {
      console.error('Failed to load rooms:', e);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/jobs');
      if (res.ok) setJobs(await res.json());
    } catch (e) {
      console.error('Failed to load jobs:', e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchUsers(), fetchRooms(), fetchJobs()]);
    setLoading(false);
  }, [fetchStats, fetchUsers, fetchRooms, fetchJobs]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleLogout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      onLogout();
    }
  }

  async function handleTriggerWorker() {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch('/api/admin/jobs/trigger', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(`Worker selesai: ${data.processed} email diproses, ${data.errors} gagal.`);
        await Promise.all([fetchStats(), fetchJobs()]);
      } else {
        showToast(data.error || 'Gagal menjalankan worker.');
      }
    } catch {
      showToast('Terjadi kesalahan jaringan.');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="admin-layout">
      {/* Top Header */}
      <header className="admin-header">
        <div className="admin-brand">
          <Logo />
          <span className="admin-portal-tag">PORTAL ADMIN</span>
        </div>

        <div className="admin-header-actions">
          <button
            className="secondary admin-worker-btn"
            disabled={actionBusy}
            onClick={handleTriggerWorker}
            title="Proses antrean pengingat kencan sekarang"
          >
            {actionBusy ? 'Memproses…' : 'Jalankan Worker Email ↻'}
          </button>
          <a href="/" target="_blank" rel="noopener noreferrer" className="secondary" style={{ textDecoration: 'none' }}>
            Lihat Web Pengguna ↗
          </a>
          <button className="danger-outline" onClick={handleLogout}>
            Keluar Sesi
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="admin-container">
        {/* Navigation Tabs */}
        <nav className="admin-nav" aria-label="Navigasi admin">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
            📊 Ringkasan Bisnis
          </button>
          <button className={tab === 'users' ? 'active' : ''} onClick={() => { setTab('users'); void fetchUsers(userQuery); }}>
            👥 Pengguna ({stats?.users.total ?? 0})
          </button>
          <button className={tab === 'rooms' ? 'active' : ''} onClick={() => { setTab('rooms'); void fetchRooms(roomQuery); }}>
            🏡 Ruang Pasangan ({stats?.rooms.total ?? 0})
          </button>
          <button className={tab === 'jobs' ? 'active' : ''} onClick={() => { setTab('jobs'); void fetchJobs(); }}>
            ✉️ Antrean Email ({stats?.mailJobs.total ?? 0})
          </button>
          <button className={tab === 'system' ? 'active' : ''} onClick={() => setTab('system')}>
            ⚙️ Sistem & Server
          </button>
        </nav>

        {loading && !stats ? (
          <div className="loading">Memuat data operasional…</div>
        ) : (
          <>
            {/* KPI Cards (Always visible on Overview, or top of dashboard) */}
            {tab === 'overview' && stats && (
              <section className="admin-kpi-grid">
                <div className="admin-kpi-card">
                  <div className="kpi-label">TOTAL PENGGUNA</div>
                  <div className="kpi-value">{stats.users.total}</div>
                  <div className="kpi-meta">
                    <span className="badge green">+{stats.users.newToday} hari ini</span>
                    <span>{stats.users.withReminders} notif aktif</span>
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="kpi-label">RUANG PASANGAN</div>
                  <div className="kpi-value">{stats.rooms.total}</div>
                  <div className="kpi-meta">
                    <span className="badge purple">{stats.rooms.active} aktif</span>
                    <span className="badge muted">{stats.rooms.archived} diarsip</span>
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="kpi-label">WISHLIST & KENCAN</div>
                  <div className="kpi-value">{stats.places.total}</div>
                  <div className="kpi-meta">
                    <span className="badge orange">{stats.places.planned} terjadwal</span>
                    <span className="badge green">{stats.places.visited} selesai</span>
                    {stats.places.missed > 0 && <span className="badge danger">{stats.places.missed} terlewat</span>}
                  </div>
                </div>

                <div className="admin-kpi-card">
                  <div className="kpi-label">STATUS EMAIL REMINDER</div>
                  <div className="kpi-value">{stats.mailJobs.sent} <small style={{ fontSize: '15px', color: 'var(--muted)' }}>/ {stats.mailJobs.total}</small></div>
                  <div className="kpi-meta">
                    <span className="badge green">{stats.mailJobs.sent} terkirim</span>
                    <span className="badge orange">{stats.mailJobs.pending} pending</span>
                    {stats.mailJobs.failed > 0 && <span className="badge danger">{stats.mailJobs.failed} gagal</span>}
                  </div>
                </div>
              </section>
            )}

            {/* TAB: OVERVIEW */}
            {tab === 'overview' && (
              <div className="admin-overview-grid">
                <div className="admin-card">
                  <div className="card-head">
                    <h3>Pendaftaran Pengguna Terbaru</h3>
                    <button className="text-button" onClick={() => setTab('users')}>Lihat Semua →</button>
                  </div>
                  <div className="table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Username</th>
                          <th>Email</th>
                          <th>Ruang Aktif</th>
                          <th>Waktu Daftar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.slice(0, 5).map(u => (
                          <tr key={u.id}>
                            <td><strong>{u.username}</strong></td>
                            <td>{u.email}</td>
                            <td>{u.roomCount > 0 ? <span className="badge green">1 Ruang</span> : <span className="badge muted">Belum ada</span>}</td>
                            <td>{formatWib(u.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="admin-card">
                  <div className="card-head">
                    <h3>Ruang Pasangan Terbaru</h3>
                    <button className="text-button" onClick={() => setTab('rooms')}>Lihat Semua →</button>
                  </div>
                  <div className="table-responsive">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Nama Ruang</th>
                          <th>Anggota</th>
                          <th>Wishlist</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rooms.slice(0, 5).map(r => (
                          <tr key={r.id}>
                            <td><strong>{r.title}</strong></td>
                            <td>{r.members.join(' & ') || '1 Anggota'}</td>
                            <td>{r.placesCount} tempat</td>
                            <td><span className={`badge ${r.status === 'active' ? 'green' : 'muted'}`}>{r.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: USERS */}
            {tab === 'users' && (
              <div className="admin-card">
                <div className="card-head">
                  <div>
                    <h3>Manajemen Pengguna</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Semua akun pengguna yang terverifikasi via email OTP.</p>
                  </div>
                  <input
                    type="search"
                    placeholder="Cari email atau username…"
                    value={userQuery}
                    onChange={e => {
                      setUserQuery(e.target.value);
                      void fetchUsers(e.target.value);
                    }}
                    style={{ maxWidth: '300px' }}
                  />
                </div>

                <div className="table-responsive">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User ID</th>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Notif Reminder</th>
                        <th>Ruang Aktif</th>
                        <th>Terdaftar Sejak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '30px' }}>Tidak ada data pengguna ditemukan.</td></tr>
                      ) : (
                        users.map(u => (
                          <tr key={u.id}>
                            <td><code>{u.id.slice(0, 8)}…</code></td>
                            <td><strong>{u.username}</strong></td>
                            <td>{u.email}</td>
                            <td>
                              <span className={`badge ${u.emailReminders ? 'green' : 'muted'}`}>
                                {u.emailReminders ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </td>
                            <td>{u.roomCount > 0 ? <span className="badge purple">{u.roomCount} Ruang</span> : '-'}</td>
                            <td>{formatWib(u.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: ROOMS */}
            {tab === 'rooms' && (
              <div className="admin-card">
                <div className="card-head">
                  <div>
                    <h3>Manajemen Ruang Pasangan</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Daftar ruang kencan privat pasangan (maksimal 2 anggota per ruang).</p>
                  </div>
                  <input
                    type="search"
                    placeholder="Cari nama ruang atau member…"
                    value={roomQuery}
                    onChange={e => {
                      setRoomQuery(e.target.value);
                      void fetchRooms(e.target.value);
                    }}
                    style={{ maxWidth: '300px' }}
                  />
                </div>

                <div className="table-responsive">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Room ID</th>
                        <th>Nama Ruang</th>
                        <th>Pasangan / Anggota</th>
                        <th>Tanggal Jadian</th>
                        <th>Wishlist</th>
                        <th>Status</th>
                        <th>Dibuat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>Tidak ada data ruang ditemukan.</td></tr>
                      ) : (
                        rooms.map(r => (
                          <tr key={r.id}>
                            <td><code>{r.id.slice(0, 8)}…</code></td>
                            <td><strong>{r.title}</strong></td>
                            <td>
                              {r.members.length === 2 ? (
                                <span className="badge purple">{r.members[0]} & {r.members[1]}</span>
                              ) : r.members.length === 1 ? (
                                <span className="badge muted">{r.members[0]} (Sendiri)</span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>{r.anniversary || '-'}</td>
                            <td>{r.placesCount} ide</td>
                            <td>
                              <span className={`badge ${r.status === 'active' ? 'green' : 'muted'}`}>
                                {r.status === 'active' ? 'Aktif' : 'Arsip'}
                              </span>
                            </td>
                            <td>{formatWib(r.createdAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: JOBS */}
            {tab === 'jobs' && (
              <div className="admin-card">
                <div className="card-head">
                  <div>
                    <h3>Antrean Pengiriman Email (Mail Jobs)</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Monitoring otomatis worker pengingat kencan H-1 & 2 jam sebelumnya.</p>
                  </div>
                  <button
                    className="primary"
                    disabled={actionBusy}
                    onClick={handleTriggerWorker}
                  >
                    {actionBusy ? 'Memproses…' : 'Proses Antrean Sekarang ↻'}
                  </button>
                </div>

                <div className="table-responsive">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Job ID</th>
                        <th>Penerima</th>
                        <th>Tempat Kencan</th>
                        <th>Jenis</th>
                        <th>Status</th>
                        <th>Percobaan</th>
                        <th>Jadwal Kirim</th>
                        <th>Waktu Terkirim</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.length === 0 ? (
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px' }}>Belum ada antrean email reminder kencan.</td></tr>
                      ) : (
                        jobs.map(j => (
                          <tr key={j.id}>
                            <td><code>{j.id.slice(0, 8)}…</code></td>
                            <td>{j.recipientEmail}</td>
                            <td>{j.placeName || '-'}</td>
                            <td><code>{j.kind}</code></td>
                            <td>
                              <span className={`badge ${
                                j.status === 'sent' ? 'green' : j.status === 'pending' ? 'orange' : j.status === 'failed' ? 'danger' : 'muted'
                              }`}>
                                {j.status}
                              </span>
                            </td>
                            <td>{j.attempts}x</td>
                            <td>{formatWib(j.scheduledAt)}</td>
                            <td>{formatWib(j.sentAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: SYSTEM */}
            {tab === 'system' && stats && (
              <div className="admin-overview-grid">
                <div className="admin-card">
                  <h3>Spesifikasi Runtime Node.js</h3>
                  <div className="admin-spec-list">
                    <div><span>Node.js Version</span><strong>{stats.system.nodeVersion}</strong></div>
                    <div><span>Uptime Server</span><strong>{Math.floor(stats.system.uptimeSeconds / 60)} menit ({stats.system.uptimeSeconds} detik)</strong></div>
                    <div><span>Memory Usage (RSS)</span><strong>{stats.system.memoryMb} MB</strong></div>
                    <div><span>Koneksi Database</span><strong style={{ color: 'green' }}>✓ PostgreSQL Terhubung</strong></div>
                  </div>
                </div>

                <div className="admin-card">
                  <h3>Petunjuk Pemantauan & Operasional</h3>
                  <p style={{ fontSize: '14px', lineHeight: '1.7' }}>
                    1. <strong>Tracing Log Server:</strong> Anda dapat melihat live stream request & error kapan saja dengan menjalankan:
                    <br />
                    <code>docker compose logs -f web</code>
                  </p>
                  <p style={{ fontSize: '14px', lineHeight: '1.7', marginTop: '10px' }}>
                    2. <strong>Mailpit Inbox:</strong> Untuk menginspeksi wujud fisik email notifikasi & OTP:
                    <br />
                    <a href="http://localhost:8025" target="_blank" rel="noopener noreferrer">Buka Mailpit Dashboard (Port 8025) ↗</a>
                  </p>
                  <p style={{ fontSize: '14px', lineHeight: '1.7', marginTop: '10px' }}>
                    3. <strong>Cron Scheduler:</strong> Worker otomatis berjalan di background dan memeriksa rencana kencan yang jatuh tempo setiap menit.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Toast */}
      {toast && (
        <div id="toast" className="show">
          {toast}
        </div>
      )}
    </div>
  );
}
