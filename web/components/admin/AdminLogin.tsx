'use client';

import { useState, type FormEvent } from 'react';
import { Logo } from '../Artwork';

interface Props {
  onSuccess: () => void;
}

export default function AdminLogin({ onSuccess }: Props) {
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !secret.trim()) return;

    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secret.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Autentikasi admin gagal.');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi masalah saat login.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login-layout">
      <div className="admin-login-card">
        <div className="admin-login-head">
          <Logo />
          <span className="admin-badge">PORTAL OPERASIONAL & ADMIN</span>
        </div>
        <h2>Masuk ke Web Admin</h2>
        <p>Gunakan Kunci Rahasia Admin (*ADMIN_SECRET*) untuk mengakses panel pemantauan dan data bisnis.</p>

        <form onSubmit={handleSubmit}>
          <label>
            Kunci Rahasia Admin
            <input
              type="password"
              required
              autoFocus
              placeholder="Masukkan kunci ADMIN_SECRET..."
              value={secret}
              onChange={e => setSecret(e.target.value)}
              disabled={busy}
            />
          </label>

          {error && <p className="error" role="alert">{error}</p>}

          <button className="primary" disabled={busy || !secret.trim()} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Memverifikasi…' : 'Masuk ke Dashboard Admin →'}
          </button>
        </form>

        <div className="notice" style={{ marginTop: '20px' }}>
          <strong>Petunjuk Pengembang:</strong>
          <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
            Kunci default pengembangan lokal: <code>admin12345</code> (dapat disesuaikan melalui environment variable <code>ADMIN_SECRET</code>).
          </p>
        </div>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <a href="/" className="text-button" style={{ fontSize: '14px' }}>
            ← Kembali ke Aplikasi Pengguna
          </a>
        </div>
      </div>
    </div>
  );
}
