import {useState} from 'react';
import {Artwork, Logo} from './Artwork';
import {categories, type Config, type Filter, type MeResponse, type ModalState, type Place, type RoomResponse, type Tab} from '../lib/types';
import {day, money, when} from '../lib/format';

export interface DashboardProps {
  me: MeResponse;
  data: RoomResponse | null;
  config: Config;
  pendingInvite: string;
  busy: boolean;
  tab: Tab;
  setTab: (tab: Tab) => void;
  selectRoom: (id: string) => void;
  open: (modal: ModalState) => void;
  logout: () => void;
  acceptInvite: () => void;
  dismissInvite: () => void;
  createInvite: () => void;
  setReminder: (enabled: boolean) => void;
  refresh: () => void;
}
const navItems: {id: Tab; icon: string; label: string}[] = [
  {id:'wishlist',icon:'⌖',label:'Wishlist kita'}, {id:'plans',icon:'◷',label:'Rencana pergi'},
  {id:'memories',icon:'♡',label:'Jadi kenangan'}, {id:'account',icon:'☷',label:'Akun & ruang'}
];
const mailLabels = {pending:'Terjadwal',sending:'Mengirim',sent:'Terkirim',failed:'Gagal',cancelled:'Dibatalkan'};

export default function Dashboard(props: DashboardProps) {
  const {me, data, config, pendingInvite, busy, tab, setTab, selectRoom, open, logout, acceptInvite, dismissInvite} = props;
  const [filter, setFilter] = useState<Filter>('Semua');
  const [search, setSearch] = useState('');
  const room = data?.room;
  const readonly = room?.status === 'archived';
  const hasActive = me.rooms.some(r => r.status === 'active');
  const list = (data?.places || [])
    .filter(p => tab === 'plans' ? p.status === 'planned' : tab === 'memories' ? p.status === 'visited' : p.status !== 'visited')
    .filter(p => filter === 'Semua' || p.category === filter)
    .filter(p => (p.name+' '+p.area).toLowerCase().includes(search.toLowerCase()));
  const next = data?.places.filter(p => p.status === 'planned' && p.scheduled_at && Date.parse(p.scheduled_at) > Date.now())
    .sort((a,b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!))[0];
  function navigate(value: Tab) {setFilter('Semua'); setSearch(''); setTab(value);}
  return <div className="dashboard">
    <aside className="rail"><Logo/><div className="eyebrow">RUANG KECIL KITA</div><nav aria-label="Menu utama">
      {navItems.map(n => <button key={n.id} disabled={busy} aria-current={tab === n.id ? 'page' : undefined} className={tab === n.id ? 'active' : ''} onClick={() => navigate(n.id)}><span aria-hidden="true">{n.icon}</span>{n.label}</button>)}
    </nav><div className="rail-poem">Tempatnya boleh jauh.<br/><em>Rencananya jangan.</em></div>
      <div className="profile"><b>{me.user.username[0].toUpperCase()}</b><span>{me.user.username}<small>Akun individual</small></span></div>
    </aside>
    <main className="main">
      <header className="topbar"><span>Ruang untuk dua, bukan semua.</span><div>
        {!!me.rooms.length && <select aria-label="Pilih ruang" value={room?.id || ''} disabled={busy} onChange={e => {setSearch('');setFilter('Semua');selectRoom(e.target.value);}}>
          {me.rooms.map(r => <option key={r.id} value={r.id}>{r.title}{r.status === 'archived' ? ' · Arsip' : ''}</option>)}
        </select>}
        <button className="text-button" disabled={busy} onClick={logout}>Keluar akun</button>
      </div></header>
      {!!me.notices.length && <details className="notice"><summary>Pemberitahuan akun ({me.notices.length})</summary>{me.notices.map(n => <p key={n.id}>{n.message}</p>)}</details>}
      {pendingInvite && <div className="invite-banner"><div><strong>Undangan pasangan menunggu.</strong><p>{hasActive ? 'Kamu masih memiliki ruang aktif. Keluar dari ruang tersebut sebelum menerima.' : 'Pastikan tautan berasal dari pasanganmu sebelum menerima.'}</p></div><button className="primary" disabled={busy || hasActive} onClick={acceptInvite}>Terima undangan</button><button className="text-button" disabled={busy} onClick={dismissInvite}>Abaikan</button></div>}
      {tab === 'account' ? <Account {...props}/> : !room || !data ? <section className="empty-onboarding">
        <div className="eyebrow">SATU RUANG, DUA ORANG.</div><h1>Rencana pertama<br/>dimulai <em>di sini.</em></h1>
        <p>Buat ruang sendiri, lalu undang pasangan. Atau gunakan tautan yang pasanganmu bagikan.</p>
        <button className="primary" disabled={busy} onClick={() => open({kind:'room-profile'})}>Buat ruang berdua <span>+</span></button>
        <button className="secondary" disabled={busy} onClick={() => open({kind:'join'})}>Punya kode undangan?</button><div className="onboarding-art"><Artwork/></div>
      </section> : <>
        <section className="greeting"><div><div className="eyebrow">{readonly ? 'ARSIP · HANYA-BACA' : room.title.toUpperCase()}</div>
          <h1>{tab === 'memories' ? 'Pernah pergi. Selalu ingat.' : tab === 'plans' ? 'Bukan lagi kapan-kapan.' : 'Banyak tempat. Satu teman pergi.'}</h1>
          <p>{readonly ? 'Data lama tetap di sini, tidak dibawa ke pasangan baru.' : 'Simpan yang bikin penasaran. Wujudkan pelan-pelan, berdua.'}</p></div>
          {!readonly && <button className="primary" disabled={busy} onClick={() => open({kind:'place'})}>+ Tambah tempat</button>}
        </section>
        {readonly && <div className="notice">Ruang ini telah ditutup. Kamu masih dapat membacanya dan membuat ruang baru. {!hasActive && <button className="text-button" disabled={busy} onClick={() => open({kind:'room-profile'})}>Buat ruang baru →</button>}</div>}
        {tab !== 'memories' && <section className="trip-hero"><div className="hero-art"><Artwork kind={next?.category}/></div><div className="trip-ticket">
          <div className="eyebrow">{next ? 'RENCANA TERDEKAT' : 'TIKET UNTUK DUA'}</div><h2>{next?.name || 'Mau ke mana dulu?'}</h2><p>⌖ {next?.area || 'Satu tempat, banyak kemungkinan.'}</p>
          <div className="ticket-date">{next ? when(next.scheduled_at) : 'Mulai dari satu wishlist kecil.'}</div>
          <div className="ticket-bottom"><span>{data.members.map(m => m.username).join(' & ')}</span>
            {next ? <button className="secondary" disabled={busy} onClick={() => open({kind:'detail',place:next})}>Lihat rencana ↗</button>
              : !readonly && <button className="secondary" disabled={busy} onClick={() => open({kind:'place'})}>Tambah tempat ↗</button>}
          </div>
        </div></section>}
        <section className="collection"><div className="section-heading"><div><h2>{tab === 'memories' ? 'Album perjalanan' : tab === 'plans' ? 'Tanggal untuk kita' : 'Daftar kapan-kapan'} <span>{list.length}</span></h2>
          <p>{data.members.length < 2 && !readonly ? 'Pasangan belum bergabung. Undang lewat Akun & ruang.' : 'Yang disimpan hari ini, bisa jadi cerita besok.'}</p></div>
          <input type="search" placeholder="Cari tempat..." aria-label="Cari tempat" value={search} onChange={e => setSearch(e.target.value)}/>
        </div><div className="filters">{(['Semua', ...categories] as const).map(v => <button key={v} aria-pressed={filter === v} className={filter === v ? 'selected' : ''} onClick={() => setFilter(v)}>{v}</button>)}</div>
          <div className="place-grid">{list.map(p => <PlaceCard key={p.id} place={p} readonly={!!readonly} busy={busy} onOpen={() => open({kind:'detail',place:p})}/>)}</div>
          {!list.length && <div className="empty"><span aria-hidden="true">⌖</span><h3>Masih ada ruang untuk cerita.</h3><p>Tambahkan tempat atau coba kategori lain.</p></div>}
        </section>
        <div className="nudge"><span aria-hidden="true">◷</span><div><strong>Biar “nanti” nggak jadi lupa.</strong><p>Reminder email H-1 & 2 jam sebelumnya. WhatsApp belum terhubung.</p></div><button className="text-button" disabled={busy} onClick={() => navigate('account')}>Atur pengingat →</button></div>
      </>}
      <footer>PergiBerdua · Sedikit rencana. Banyak cerita.<span>{config.mode === 'development' ? 'Email lokal melalui Mailpit' : 'Email melalui SMTP'} · Waktu WIB</span></footer>
    </main>
  </div>;
}
function PlaceCard({place:p, readonly, busy, onOpen}: {place:Place;readonly:boolean;busy:boolean;onOpen:()=>void}) {
  return <article className="place-card"><div className="place-art"><Artwork kind={p.category}/><span className="tag">{p.category}</span>
    {p.status !== 'wish' && <span className="status">{p.status === 'visited' ? '✓ Sudah dikunjungi' : '◷ Sudah direncanakan'}</span>}
  </div><div className="place-body"><h3>{p.name}</h3><p>⌖ {p.area}</p><div className="place-bottom"><span>{money(p.budget)}<small> / berdua</small></span><button className="text-button" disabled={busy} onClick={onOpen}>{readonly ? 'Lihat' : 'Buka'} ↗</button></div></div></article>;
}
function Account({me,data,busy,open,createInvite,setReminder,refresh}: DashboardProps) {
  const r = data?.room, ro = r?.status === 'archived';
  return <>
    <section className="greeting"><div><div className="eyebrow">MILIKMU, TETAP MILIKMU.</div><h1>Akun & ruang berdua.</h1></div></section>
    <div className="account-grid">
      <section className="panel"><h2>Akun individual</h2><p><strong>{me.user.username}</strong><br/>{me.user.email}</p>
        <label className="switch-line"><input type="checkbox" checked={me.user.emailReminders} disabled={busy} onChange={e => setReminder(e.target.checked)}/> Aktifkan reminder email</label>
        <p className="fineprint">Notifikasi keamanan dan penutupan ruang tetap dikirim. Pengingat yang sudah terlewat tidak dikirim ulang.</p>
        <div className="notice">WhatsApp belum tersedia. Kanal ini membutuhkan integrasi resmi dan persetujuan penerima.</div>
      </section>
      <section className="panel"><h2>{r?.title || 'Belum punya ruang'}</h2>
        {r && data ? <><p>{data.members.map(m => m.username).join(' & ')}<br/>Tanggal jadian: {day(r.anniversary)}</p>
          <span className="env-pill">{ro ? 'ARSIP HANYA-BACA' : `${data.members.length}/2 ANGGOTA`}</span>
          {!ro && <div className="button-stack">
            <button className="secondary" disabled={busy} onClick={() => open({kind:'room-profile',room:r})}>Ubah profil ruang</button>
            {data.members.length < 2 && <button className="primary" disabled={busy} onClick={createInvite}>Buat undangan pasangan</button>}
            <button className="danger-outline" disabled={busy} onClick={() => open({kind:'leave',room:r})}>Keluar dari ruang pasangan</button>
          </div>}</> : <p>Satu ruang aktif per akun. Arsip lama tidak dihitung sebagai ruang aktif.</p>}
        {!me.rooms.some(r => r.status === 'active') && <div className="button-stack"><button className="primary" disabled={busy} onClick={() => open({kind:'room-profile'})}>Buat ruang baru</button><button className="secondary" disabled={busy} onClick={() => open({kind:'join'})}>Masukkan kode undangan</button></div>}
      </section>
    </div>
    {data && <section className="panel mail-panel"><h2>Pengingat email milikmu</h2><p>Status “terkirim” berarti diterima server SMTP, bukan jaminan dibaca penerima.</p>
      <div className="job-list">{data.jobs.length ? data.jobs.map(j => <div key={j.id}><span>{j.kind === 'room_closed' ? 'Pemberitahuan ruang' : data.places.find(p => p.id === j.place_id)?.name || 'Tempat'}<small>{when(j.scheduled_at)}</small></span><span className="env-pill">{mailLabels[j.status]}</span></div>) : <p>Belum ada pengingat. Jadwalkan tempat dahulu.</p>}</div>
      <button className="text-button" disabled={busy} onClick={refresh}>Perbarui status ↻</button>
    </section>}
  </>;
}
