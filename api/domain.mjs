import {createHash, createHmac, randomBytes, randomInt, timingSafeEqual} from 'node:crypto';
export class ApiError extends Error {constructor(status,message){super(message);this.status=status}}
export const fail=(status,message)=>{throw new ApiError(status,message)};
export const hash=s=>createHash('sha256').update(String(s)).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export const otp=()=>String(randomInt(0,1000000)).padStart(6,'0');
export const otpHash=(secret,id,code)=>createHmac('sha256',secret).update(`${id}:${code}`).digest('hex');
export function equal(a,b){const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));return aa.length===bb.length&&timingSafeEqual(aa,bb)}
export function email(v){const s=String(v||'').trim().toLowerCase();if(s.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail(400,'Alamat email tidak valid.');return s}
export function username(v){const s=String(v||'').trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(s))fail(400,'Username: 3–24 huruf kecil, angka, atau underscore.');return s}
export function text(v,max,required=false){const s=String(v??'').trim();if(s.length>max||(required&&!s))fail(400,`Teks wajib diisi dan maksimal ${max} karakter.`);return s}
export function uuid(v){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(v)))fail(400,'ID tidak valid.');return v}
export function dateOnly(v){if(!v)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v||v>new Date().toISOString().slice(0,10))fail(400,'Tanggal jadian harus tanggal valid, bukan masa depan.');return v}
export const pairKey=(a,b)=>[a,b].sort().join(':');
export function placeInput(b){
 const category=text(b.category,30,true);
 if(!['Alam','Kuliner','Seni & budaya','Santai'].includes(category))fail(400,'Kategori tidak valid.');
 const budget=Number(b.budget);if(!Number.isSafeInteger(budget)||budget<0||budget>999999999)fail(400,'Budget tidak valid.');
 return {name:text(b.name,80,true),area:text(b.area,100,true),category,budget,note:text(b.note,600)};
}
export function scheduleTime(value){const d=new Date(value);if(!Number.isFinite(d.getTime())||d.getTime()<=Date.now())fail(400,'Pilih jadwal di masa depan.');return d.toISOString()}
export function reminderTimes(at,now=Date.now()){const t=new Date(at).getTime();return [24*3600000,2*3600000].map(ms=>t-ms).filter(t=>t>now).map(t=>new Date(t).toISOString())}
