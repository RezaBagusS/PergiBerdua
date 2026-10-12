import {useState, type FormEvent} from 'react';
import {api} from '../lib/api';
import type {AuthMode, Config} from '../lib/types';
import {Artwork, Logo} from './Artwork';

interface Props {
  config: Config;
  pendingInvite: string;
  onAuthenticated: () => Promise<void>;
}
export default function AuthScreen({config, pendingInvite, onAuthenticated}: Props) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setInfo('');
    try {await fn();} catch (e) {setError(e instanceof Error ? e.message : 'Terjadi masalah. Coba lagi.');}
    finally {setBusy(false);}
  }
  async function requestOtp() {
    const result = await api.requestOtp(mode, email, username);
    setChallenge(result.requestId); setCode(''); setInfo('Kode dikirim. Periksa email kamu.');
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void perform(async () => {
      if (challenge) {
        await api.verifyOtp(challenge, code);
        await onAuthenticated();
      } else await requestOtp();
    });
  }
  return <main className="auth-layout">
    <section className="auth-story"><Logo/><div className="eyebrow">DARI WISHLIST, JADI CERITA.</div>
      <h1>Banyak tempat.<br/> Satu <em>teman pergi.</em></h1>
      <p>Untuk semua “kapan-kapan ke sini”<br/>yang layak jadi rencana berdua.</p>
      <div className="postcard"><Artwork/><div>♡ Tiket untuk dua <span>Tujuan: waktu bersama →</span></div></div>
      <p className="story-foot">Simpan tempat. Ingat waktunya. Pergi berdua.</p>
    </section>
    <section className="auth-content">
      <span className="env-pill">{config.mode === 'development' ? 'PENGEMBANGAN LOKAL · MAILPIT' : 'AKUN INDIVIDUAL · OTP EMAIL'}</span>
      <div className="auth-form">
        {pendingInvite && <div className="notice">Ada undangan pasangan menunggu. Masuk atau daftar dahulu, lalu terima undangannya.</div>}
        {!challenge && <div className="segmented" aria-label="Masuk atau daftar">
          <button type="button" disabled={busy} aria-pressed={mode === 'login'} className={mode === 'login' ? 'selected' : ''} onClick={() => {setMode('login'); setError('');}}>Masuk</button>
          <button type="button" disabled={busy} aria-pressed={mode === 'register'} className={mode === 'register' ? 'selected' : ''} onClick={() => {setMode('register'); setError('');}}>Daftar</button>
        </div>}
        <h2>{challenge ? <>Cek email,<br/><em>teman pergi.</em></> : mode === 'login' ? <>Ketemu lagi,<br/><em>teman pergi.</em></> : <>Cerita kita<br/>mulai <em>di sini.</em></>}</h2>
        <p>{challenge ? <>Kode 6 angka telah dikirim ke <strong>{email}</strong>. Berlaku 10 menit, maksimal 5 percobaan.</> : mode === 'login' ? 'Tanpa password bersama. Masuk dengan kode sekali pakai di email kamu.' : 'Satu akun untuk kamu. Satu undangan untuk pasanganmu.'}</p>
        <form onSubmit={submit} aria-busy={busy}>
          {challenge ? <label>Kode verifikasi<input key="code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" autoFocus value={code} onChange={e => setCode(e.target.value)} disabled={busy}/></label> : <>
            {mode === 'register' && <label>Username<input name="username" required pattern="[a-z0-9_]{3,24}" minLength={3} maxLength={24} autoComplete="username" placeholder="teman_pergi" value={username} onChange={e => setUsername(e.target.value)} disabled={busy}/><small>3 sampai 24 huruf kecil, angka, atau underscore. Unik per orang.</small></label>}
            <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="kamu@example.com" value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
          </>}
          <button className="primary" disabled={busy}>{busy ? 'Memproses…' : challenge ? 'Verifikasi & masuk' : mode === 'login' ? 'Kirim kode masuk' : 'Daftar dengan OTP'}<span>→</span></button>
        </form>
        {challenge && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px', alignItems: 'center' }}>
            <button type="button" className="text-button" disabled={busy} onClick={() => void perform(requestOtp)}>
              Kirim ulang kode OTP ↻
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setChallenge(null);
                setCode('');
                setError('');
                setInfo('');
              }}
            >
              ← Kembali ke Halaman Masuk / Daftar
            </button>
          </div>
        )}
        {error && (
          <div style={{ marginTop: '14px' }}>
            <p className="error" role="alert">{error}</p>
            {error.includes('belum terdaftar') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    setMode('register');
                    setChallenge(null);
                    setCode('');
                    setError('');
                    setInfo('');
                  }}
                >
                  Buat Akun Baru (Daftar) Sekarang →
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setChallenge(null);
                    setCode('');
                    setError('');
                    setInfo('');
                  }}
                >
                  ← Kembali ke Halaman Masuk / Daftar
                </button>
              </div>
            )}
            {error.includes('sudah terdaftar') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    setMode('login');
                    setChallenge(null);
                    setCode('');
                    setError('');
                    setInfo('');
                  }}
                >
                  Masuk ke Akun Terdaftar →
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setChallenge(null);
                    setCode('');
                    setError('');
                    setInfo('');
                  }}
                >
                  ← Kembali ke Halaman Masuk / Daftar
                </button>
              </div>
            )}
          </div>
        )}
        {info && <p className="fineprint" role="status">{info}</p>}
        {config.mode === 'development' && <div className="notice">Mode lokal: email ditangkap Mailpit. Buka <a href="http://localhost:8025" target="_blank" rel="noopener noreferrer">kotak email pengujian ↗</a>, bukan inbox sungguhan.</div>}
        <p className="fineprint">Akun tetap milik masing-masing. Tanggal jadian bukan kunci login.</p>
      </div>
    </section>
  </main>;
}
