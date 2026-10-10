export const money = (v: number) => new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR',maximumFractionDigits:0}).format(v);
export const when = (v: string | null) => v ? new Date(v).toLocaleString('id-ID', {dateStyle:'long',timeStyle:'short',timeZone:'Asia/Jakarta'})+' WIB' : 'Belum dijadwalkan';
export const day = (v: string | null) => v ? new Date(v).toLocaleDateString('id-ID', {dateStyle:'long',timeZone:'Asia/Jakarta'}) : 'Belum diisi';
export const dateInput = (v: string | null) => v ? new Date(v).toISOString().slice(0,10) : '';
export const wibInput = (v: string | null) => v ? new Date(new Date(v).getTime()+7*3600000).toISOString().slice(0,16) : '';
export function invitationToken(value: string) {
  const match = value.trim().match(/(?:#invite=)?([a-f0-9]{64})$/);
  if (!match) throw new Error('Tempel kode atau tautan undangan yang valid.');
  return match[1];
}
