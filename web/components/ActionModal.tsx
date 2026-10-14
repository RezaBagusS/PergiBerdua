import {useRef, useState, type FormEvent, type ReactNode} from 'react';
import Modal from './Modal';
import {Artwork} from './Artwork';
import {categories, type Category, type ModalState, type PlaceAction, type PlaceDraft} from '../lib/types';
import {dateInput, money, when, wibInput} from '../lib/format';

export interface ModalActions {
  savePlace: (draft: PlaceDraft, id?: string) => void;
  saveRoom: (title: string, anniversary: string, id?: string) => void;
  placeAction: (id: string, action: PlaceAction, at?: string) => void;
  leave: (roomId: string) => void;
  join: (value: string) => void;
  inviteEmail: (email: string) => void;
  cancelInvite: (roomId: string) => void;
}
interface Props {
  modal: ModalState; busy: boolean; error: string; readonly: boolean;
  close: () => void; open: (modal: ModalState) => void; actions: ModalActions;
}
function field(form: FormData, key: string) {return String(form.get(key) || '');}
export default function ActionModal({modal,busy,error,readonly,close,open,actions}: Props) {
  const [copyInfo,setCopyInfo] = useState('');
  const inviteInput = useRef<HTMLInputElement>(null);
  function submit(fn: (form: FormData) => void) {
    return (e: FormEvent<HTMLFormElement>) => {e.preventDefault();if(!busy)fn(new FormData(e.currentTarget));};
  }
  let title = '', content: ReactNode = null;
  switch(modal.kind) {
    case 'place': {
      const p = modal.place; title = p ? 'Ubah wishlist' : 'Satu tempat lagi untuk kita.';
      content = <form onSubmit={submit(f => actions.savePlace({
        name:field(f,'name'),area:field(f,'area'),category:field(f,'category') as Category,
        budget:Number(field(f,'budget')),note:field(f,'note')
      },p?.id))}>
        <label>Nama tempat<input name="name" required maxLength={80} defaultValue={p?.name || ''} placeholder="Kebun Raya Bogor" disabled={busy}/></label>
        <label>Area / kota<input name="area" required maxLength={100} defaultValue={p?.area || ''} placeholder="Bogor" disabled={busy}/></label>
        <div className="form-two"><label>Kategori<select name="category" defaultValue={p?.category || 'Alam'} disabled={busy}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Budget berdua (Rp)<input name="budget" type="number" min={0} max={999999999} defaultValue={p?.budget || 0} required disabled={busy}/></label>
        </div><label>Catatan kecil<textarea name="note" maxLength={600} defaultValue={p?.note || ''} disabled={busy}/></label>
        <button className="primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan wishlist →'}</button>
      </form>; break;
    }
    case 'detail': {
      const p = modal.place; title = p.name;
      const isMissed = p.status === 'missed';
      content = <><div className="detail-art"><Artwork kind={p.category}/></div><p>⌖ {p.area} · {p.category}</p>
        <div className="detail-metadata"><span>Budget berdua<strong>{money(p.budget)}</strong></span><span>{p.status === 'visited' ? 'Dikunjungi' : isMissed ? 'Terlewat' : 'Jadwal'}<strong>{when(p.status === 'visited' ? p.visited_at : p.scheduled_at)}</strong></span></div>
        <blockquote>{p.note || 'Belum ada catatan. Ceritanya menyusul.'}</blockquote>
        {isMissed && <div className="notice warning">Waktu kencan ini sudah terlewat ({when(p.scheduled_at)}). Jadwalkan tanggal baru atau tandai jika sudah dikunjungi.</div>}
        {readonly ? <div className="notice">Arsip hanya-baca. Tempat tidak dapat diubah.</div> : <div className="button-stack">
          <button className="primary" disabled={busy} onClick={() => open({kind:'schedule',place:p})}>{isMissed ? 'Jadwalkan ulang' : p.status === 'planned' ? 'Ubah jadwal' : 'Rencanakan pergi'} →</button>
          {p.status !== 'visited' && <button className="secondary" disabled={busy} onClick={() => actions.placeAction(p.id,'visited')}>✓ Sudah dikunjungi</button>}
          {p.status !== 'wish' && <button className="secondary" disabled={busy} onClick={() => actions.placeAction(p.id,'wish')}>{p.status === 'planned' || isMissed ? 'Batalkan jadwal' : 'Kembalikan ke wishlist'}</button>}
          <div className="button-row"><button className="text-button" disabled={busy} onClick={() => open({kind:'place',place:p})}>Edit tempat</button><button className="text-button danger" disabled={busy} onClick={() => open({kind:'delete',place:p})}>Hapus</button></div>
        </div>}</>; break;
    }
    case 'schedule': {
      const isMissed = modal.place.status === 'missed';
      title = isMissed ? 'Jadwalkan ulang kencan.' : 'Yuk, jadi pergi.';
      content = <><p>{modal.place.name} · Semua waktu menggunakan WIB.</p><form onSubmit={submit(f => actions.placeAction(modal.place.id,'schedule',new Date(field(f,'at')+':00+07:00').toISOString()))}>
        <label>{isMissed ? 'Tanggal & jam baru (WIB)' : 'Tanggal & jam (WIB)'}<input name="at" type="datetime-local" required defaultValue={wibInput(modal.place.scheduled_at)} disabled={busy}/></label>
        <div className="notice">Email dijadwalkan ulang otomatis (H-1 dan 2 jam sebelum pergi), hanya untuk waktu pengingat yang belum lewat.</div>
        <button className="primary" disabled={busy}>{busy ? 'Menyimpan…' : isMissed ? 'Simpan jadwal baru →' : 'Simpan rencana →'}</button>
      </form></>; break;
    }
    case 'delete': {
      title = 'Hapus tempat?';
      content = <><p>{modal.place.name} dan pengingatnya akan dihapus dari ruang ini.</p><button className="danger-button" disabled={busy} onClick={() => actions.placeAction(modal.place.id,'delete')}>Ya, hapus tempat</button><button className="secondary" disabled={busy} onClick={close}>Batal</button></>; break;
    }
    case 'room-profile': {
      const r = modal.room; title = r ? 'Profil ruang berdua' : 'Buat ruang kecil kalian.';
      content = <><p>Tanggal jadian hanya profil, bukan kunci login.</p><form onSubmit={submit(f => actions.saveRoom(field(f,'title'),field(f,'anniversary'),r?.id))}>
        <label>Nama ruang<input name="title" required maxLength={60} defaultValue={r?.title || 'Ruang kecil kita'} disabled={busy}/></label>
        <label>Tanggal jadian (opsional)<input name="anniversary" type="date" max={new Date().toISOString().slice(0,10)} defaultValue={dateInput(r?.anniversary || null)} disabled={busy}/></label>
        <button className="primary" disabled={busy}>{busy ? 'Menyimpan…' : r ? 'Simpan perubahan →' : 'Buat ruang →'}</button>
      </form></>; break;
    }
    case 'invite': {
      title = 'Undang pasangan ke ruang ini.';
      content = <>
        <p>Masukkan alamat email pasanganmu. Pasanganmu harus sudah terdaftar di PergiBerdua agar dapat menerima undangan.</p>
        {modal.outgoingInvite && (
          <div className="notice" style={{marginBottom: 16}}>
            <strong>Undangan sedang aktif:</strong>
            <p>Terkirim ke <b>{modal.outgoingInvite.invitee_email}</b>{modal.outgoingInvite.invitee_name ? ` (${modal.outgoingInvite.invitee_name})` : ''}. Menunggu konfirmasi pasangan.</p>
            <button type="button" className="danger-outline" style={{marginTop: 8}} disabled={busy} onClick={() => actions.cancelInvite(modal.roomId)}>
              Batalkan undangan ini
            </button>
          </div>
        )}
        <form onSubmit={submit(f => actions.inviteEmail(field(f,'email')))}>
          <label>Email Pasangan
            <input name="email" type="email" required placeholder="pasangan@email.com" defaultValue={modal.outgoingInvite?.invitee_email || ''} disabled={busy}/>
            <small>Sistem akan memverifikasi apakah akun pasangan sudah terdaftar.</small>
          </label>
          <button className="primary" disabled={busy}>{busy ? 'Mengirim undangan…' : 'Kirim undangan pasangan →'}</button>
        </form>
      </>; break;
    }
    case 'join': {
      title = 'Bergabung dengan pasangan.';
      content = <><p>Masukkan tautan atau kode dari pasanganmu. Kamu akan diminta mengonfirmasi sebelum bergabung.</p><form onSubmit={submit(f => actions.join(field(f,'token')))}><label>Undangan<textarea name="token" required maxLength={400} disabled={busy}/></label><button className="primary" disabled={busy}>Periksa undangan →</button></form></>; break;
    }
    case 'leave': {
      if (modal.solo) {
        title = 'Batalkan & hapus ruang?';
        content = <>
          <div className="notice">
            Pasangan belum pernah bergabung ke ruang ini. Jika kamu keluar sekarang, ruang ini akan dihapus seutuhnya dan kamu dapat memulai membuat ruang baru kapan saja.
          </div>
          <button className="danger-button" disabled={busy} onClick={() => actions.leave(modal.room.id)}>Ya, hapus ruang ini</button>
          <button className="secondary" disabled={busy} onClick={close}>Tetap di ruang ini</button>
        </>;
      } else {
        title = 'Keluar dari ruang pasangan?';
        content = <><div className="notice">Aksesmu ke wishlist dan kenangan di ruang ini langsung dicabut. Data tidak ikut ke ruang baru. Anggota yang tinggal mendapat arsip hanya-baca dan pemberitahuan.</div>
          <p>Undangan dan pengingat lama dibatalkan. Tidak perlu persetujuan pasangan. Akses lama tidak dapat dipulihkan melalui aplikasi saat ini.</p>
          <button className="danger-button" disabled={busy} onClick={() => actions.leave(modal.room.id)}>Saya paham, keluar dari ruang</button><button className="secondary" disabled={busy} onClick={close}>Tetap di ruang ini</button></>;
      }
      break;
    }
  }
  return <Modal title={title} busy={busy} error={error} onClose={close}>{content}</Modal>;
}
