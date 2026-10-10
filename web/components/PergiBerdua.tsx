'use client';
// Botanical excursion notebook, lilac ticket and garden illustrations retained.
// UI is fully React/TypeScript: typed state, declarative JSX, no HTML injection.
import {useEffect, useRef, useState} from 'react';
import {api, ApiError} from '../lib/api';
import {invitationToken} from '../lib/format';
import type {Config, MeResponse, ModalState, RoomResponse, Tab} from '../lib/types';
import AuthScreen from './AuthScreen';
import Dashboard from './Dashboard';
import ActionModal, {type ModalActions} from './ActionModal';

function savePending(token: string) {
  try {if(token)sessionStorage.setItem('pb-invite',token);else sessionStorage.removeItem('pb-invite');}catch{/* Memory-only fallback. */}
}
export default function PergiBerdua() {
  const [config,setConfig] = useState<Config | null>(null);
  const [me,setMe] = useState<MeResponse | null>(null);
  const [data,setData] = useState<RoomResponse | null>(null);
  const [ready,setReady] = useState(false);
  const [fatal,setFatal] = useState('');
  const [pending,setPending] = useState('');
  const [tab,setTab] = useState<Tab>('wishlist');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [modal,setModal] = useState<ModalState | null>(null);
  const current = useRef<string | null>(null);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(value: string) {
    setMessage(value);
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>setMessage(''),4500);
  }
  async function load(selected = current.current) {
    const profile = await api.me();
    const id = profile.rooms.some(r=>r.id===selected) ? selected : profile.rooms.find(r=>r.status==='active')?.id || profile.rooms[0]?.id || null;
    const room = id ? await api.room(id) : null;
    current.current=id;setMe(profile);setData(room);
  }
  useEffect(() => {
    let cancelled = false;
    try {
      const match = location.hash.match(/^#invite=([a-f0-9]{64})$/);
      const token = match?.[1] || sessionStorage.getItem('pb-invite') || '';
      setPending(token);savePending(token);
      if(match)history.replaceState(null,'',location.pathname);
    } catch {/* Storage disabled: login still works. */}
    void (async()=>{
      try {
        const cfg = await api.config();
        let profile: MeResponse | null = null, room: RoomResponse | null = null;
        try {
          profile = await api.me();
          const id = profile.rooms.find(r=>r.status==='active')?.id || profile.rooms[0]?.id;
          if(id)room=await api.room(id);
        } catch(e) {if(!(e instanceof ApiError && e.status===401))throw e;}
        if(!cancelled){setConfig(cfg);setMe(profile);setData(room);current.current=room?.room.id||null;setReady(true);}
      }catch(e){if(!cancelled)setFatal(e instanceof Error?e.message:'Tidak dapat memuat aplikasi.');}
    })();
    return ()=>{cancelled=true;if(timer.current)clearTimeout(timer.current);};
  }, []);
  function open(value: ModalState) {setError('');setModal(value);}
  async function run(fn: ()=>Promise<void>) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try {await fn();}
    catch(e){
      if(e instanceof ApiError && e.status===401){
        setMe(null);setData(null);setModal(null);current.current=null;
        notify('Sesi berakhir. Silakan masuk lagi.');
      } else if(e instanceof ApiError && e.status===403){
        // Don't keep a stale editable room on screen after server revokes access.
        setModal(null);setData(null);current.current=null;
        try{await load(null);}catch{setMe(null);}
        setError(e.message);
      } else setError(e instanceof Error?e.message:'Terjadi masalah. Coba lagi.');
    }finally{lock.current=false;setBusy(false);}
  }
  async function updated(msg: string, selected = current.current) {
    setModal(null);await load(selected);notify(msg);
  }
  function roomId() {if(!current.current)throw new Error('Pilih ruang terlebih dahulu.');return current.current;}
  const actions: ModalActions = {
    savePlace:(draft,id)=>{void run(async()=>{await api.savePlace(roomId(),draft,id);await updated('Wishlist tersimpan.');});},
    saveRoom:(title,anniversary,id)=>{void run(async()=>{
      if(id){await api.roomProfile(id,title,anniversary);await updated('Profil ruang diperbarui.',id);}
      else {const r=await api.createRoom(title,anniversary);setTab('account');await updated('Ruang dibuat. Sekarang undang pasanganmu.',r.id);}
    });},
    placeAction:(id,action,at)=>{void run(async()=>{await api.placeAction(roomId(),id,action,at);await updated(action==='visited'?'Satu wishlist jadi kenangan.':action==='schedule'?'Rencana tersimpan. Pengingat dijadwalkan.':'Wishlist diperbarui.');});},
    leave:(id)=>{void run(async()=>{await api.leave(id);await updated('Kamu sudah keluar. Akun individualmu tetap aktif.',null);});},
    join:(value)=>{try{const token=invitationToken(value);setPending(token);savePending(token);setModal(null);setError('');}catch(e){setError(e instanceof Error?e.message:'Undangan tidak valid.');}}
  };
  if(fatal)return <main className="loading"><div><h1>Belum bisa tersambung.</h1><p role="alert">{fatal}</p><button className="primary" onClick={()=>location.reload()}>Coba lagi</button></div></main>;
  if(!ready||!config)return <main className="loading" role="status">Menyiapkan ruang berdua…</main>;
  return <>
    {me ? <Dashboard me={me} data={data} config={config} pendingInvite={pending} busy={busy} tab={tab}
      setTab={value=>{setTab(value);void run(()=>load());}}
      selectRoom={id=>{void run(()=>load(id));}}
      open={open}
      logout={()=>{void run(async()=>{await api.logout();setMe(null);setData(null);current.current=null;setTab('wishlist');setModal(null);});}}
      acceptInvite={()=>{void run(async()=>{const r=await api.accept(pending);setPending('');savePending('');setTab('wishlist');await updated('Kalian sekarang satu ruang.',r.id);});}}
      dismissInvite={()=>{setPending('');savePending('');}}
      createInvite={()=>{void run(async()=>{const invitation=await api.invite(roomId());open({kind:'invite',invitation});});}}
      setReminder={enabled=>{void run(async()=>{await api.preferences(enabled);await load();notify('Preferensi tersimpan.');});}}
      refresh={()=>{void run(()=>load());}}
    /> : <AuthScreen config={config} pendingInvite={pending} onAuthenticated={()=>load(null)}/>}
    {error && !modal && <div className="global-error" role="alert">{error}<button className="text-button" onClick={()=>setError('')}>Tutup</button></div>}
    {modal && <ActionModal key={modal.kind + ('place' in modal ? modal.place?.id || '' : '')} modal={modal} busy={busy} error={error} readonly={data?.room.status==='archived'} close={()=>{if(!busy){setModal(null);setError('');}}} open={open} actions={actions}/>}
    <div id="toast" role="status" aria-live="polite" className={message?'show':''}>{message}</div>
  </>;
}
