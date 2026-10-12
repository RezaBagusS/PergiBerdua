import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import nodemailer from 'nodemailer';
import {ApiError,fail,hash,token,otp,otpHash,equal,email,username,text,uuid,dateOnly,pairKey,placeInput,scheduleTime,reminderTimes} from './domain.mjs';
const secret=process.env.AUTH_SECRET||'';
if(secret.length<32||secret.startsWith('replace-'))throw Error('Set AUTH_SECRET to a new random secret (at least 32 characters).');
const origin=process.env.APP_ORIGIN||'http://localhost:3000';
const secure=process.env.COOKIE_SECURE==='true';
const production=process.env.APP_MODE==='production';
function isAllowedOrigin(reqOrigin,reqHost){
 if(!reqOrigin)return false;
 if(reqOrigin===origin)return true;
 if(!production){
  try{
   const parsed=new URL(reqOrigin);
   if(parsed.hostname==='localhost'||parsed.hostname==='127.0.0.1')return true;
  }catch{}
 }
 try{
  const originHost=new URL(reqOrigin).host;
  if(reqHost&&originHost===reqHost)return true;
 }catch{}
 return false;
}
if(production&&(!secure||!origin.startsWith('https://')||!process.env.SMTP_USER||!process.env.SMTP_PASS))throw Error('Production requires HTTPS, secure cookies and configured SMTP credentials.');
const db=new pg.Pool({max:10});
const smtp=nodemailer.createTransport({host:process.env.SMTP_HOST||'mailpit',port:Number(process.env.SMTP_PORT||1025),secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}:{}),connectionTimeout:10000,socketTimeout:15000});
await db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
async function tx(fn){const c=await db.connect();try{await c.query('BEGIN');const v=await fn(c);await c.query('COMMIT');return v}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
// Low-volume MVP: serialize membership-changing and room-write operations.
// All routes and the reminder worker take this lock before room authorization.
async function roomTx(fn){return tx(async c=>{await c.query('SELECT pg_advisory_xact_lock(271828)');return fn(c)})}
async function sendMail(to,subject,body){return smtp.sendMail({from:process.env.MAIL_FROM||'PergiBerdua <hello@pergiberdua.local>',to,subject,text:body})}
function cookie(value,maxAge){return `pb_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`}
function sessionToken(req){const m=(req.headers.cookie||'').match(/(?:^|;\s*)pb_session=([a-f0-9]{64})(?:;|$)/);return m?.[1]||''}
async function auth(req){const raw=sessionToken(req);if(!raw)fail(401,'Silakan masuk terlebih dahulu.');const {rows}=await db.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hash(raw)]);if(!rows[0])fail(401,'Sesi berakhir. Silakan masuk lagi.');return rows[0]}
async function body(req){let s='';for await(const b of req){s+=b;if(Buffer.byteLength(s)>16384)fail(413,'Data terlalu besar.')}try{return JSON.parse(s||'{}')}catch{fail(400,'Format permintaan tidak valid.')}}
async function rate(key,limit,minutes){
 return tx(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);const {rows}=await c.query("SELECT count(*)::int AS n FROM rate_events WHERE bucket=$1 AND created_at>now()-($2::int*interval '1 minute')",[key,minutes]);if(rows[0].n>=limit)fail(429,'Terlalu banyak percobaan. Coba beberapa saat lagi.');await c.query('INSERT INTO rate_events(bucket) VALUES($1)',[key])});
}
async function roomAccess(c,user,room,write=false){
 const {rows}=await c.query(`SELECT r.*,m.state FROM rooms r JOIN memberships m ON m.room_id=r.id WHERE r.id=$1 AND m.user_id=$2 AND m.state IN ('active','archived')`,[uuid(room),user.id]);
 if(!rows[0])fail(403,'Kamu tidak punya akses ke ruang ini.');
 if(write&&(rows[0].status!=='active'||rows[0].state!=='active'))fail(403,'Arsip hanya dapat dibaca.');
 return rows[0];
}
async function activeRoom(c,user){const {rows}=await c.query("SELECT room_id FROM memberships WHERE user_id=$1 AND state='active'",[user.id]);return rows[0]?.room_id}
async function cancelPlaceJobs(c,id){await c.query("UPDATE mail_jobs SET status='cancelled' WHERE place_id=$1 AND status IN ('pending','failed')",[id])}
async function queuePlace(c,p){
 await cancelPlaceJobs(c,p.id);
 const members=await c.query("SELECT user_id FROM memberships WHERE room_id=$1 AND state='active'",[p.room_id]);
 for(const at of reminderTimes(p.scheduled_at))for(const m of members.rows)await c.query("INSERT INTO mail_jobs(id,room_id,place_id,user_id,kind,scheduled_at) VALUES($1,$2,$3,$4,'reminder',$5)",[randomUUID(),p.room_id,p.id,m.user_id,at]);
}
const routes={};
const route=(method,path,fn)=>routes[method+' '+path]=fn;
route('GET','/api/health',async()=>{await db.query('SELECT 1');return {ok:true}});
route('GET','/api/config',async()=>({mode:production?'production':'development',email:production?'SMTP':'Mailpit',whatsapp:false}));
route('POST','/api/auth/request',async(req)=>{
 const b=await body(req),em=email(b.email),intent=b.intent;
 if(!['login','register'].includes(intent))fail(400,'Pilih masuk atau daftar.');
 const name=intent==='register'?username(b.username):null;
 await rate('email:'+hash(em),4,15);await rate('ip:'+hash(req.socket.remoteAddress||''),20,15);
 const id=randomUUID(),code=otp();
 await tx(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['otp:'+em]);
  await c.query("UPDATE otp_requests SET used=true WHERE email=$1 AND used=false",[em]);
  await c.query("INSERT INTO otp_requests(id,email,username,intent,code_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",[id,em,name,intent,otpHash(secret,id,code)]);
 });
 try{await sendMail(em,'Kode masuk PergiBerdua',`Kode verifikasi kamu: ${code}\n\nBerlaku 10 menit. Jangan bagikan kode ini kepada siapa pun. Jika tidak meminta kode, abaikan email ini.\n\nPergiBerdua`)}
 catch{await db.query('UPDATE otp_requests SET used=true WHERE id=$1',[id]);fail(503,'Email belum dapat dikirim. Coba lagi nanti.')}
 return {requestId:id,message:'Kode dikirim. Periksa email kamu.'};
});
route('POST','/api/auth/verify',async(req,res)=>{
 const b=await body(req),id=uuid(b.requestId),code=String(b.code||'');
 await rate('verify:'+hash(req.socket.remoteAddress||''),40,15);
 if(!/^\d{6}$/.test(code))fail(400,'Kode harus 6 angka.');
 const result=await tx(async c=>{
  const {rows}=await c.query('SELECT * FROM otp_requests WHERE id=$1 FOR UPDATE',[id]),r=rows[0];
  if(!r||r.used||r.attempts>=5||new Date(r.expires_at)<new Date())return {error:'Kode kedaluwarsa atau tidak berlaku. Minta kode baru.'};
  await c.query('UPDATE otp_requests SET attempts=attempts+1 WHERE id=$1',[id]);
  if(!equal(r.code_hash,otpHash(secret,id,code)))return {error:'Kode tidak cocok. Maksimal 5 percobaan per kode.'};
  await c.query('UPDATE otp_requests SET used=true WHERE id=$1',[id]);
  let u=(await c.query('SELECT * FROM users WHERE email=$1',[r.email])).rows[0];
  if(r.intent==='register'){
   if(u)return {error:'Email ini sudah terdaftar. Gunakan halaman masuk.'};
   // ON CONFLICT avoids rolling back OTP consumption when registrations race.
   u=(await c.query('INSERT INTO users(id,email,username) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',[randomUUID(),r.email,r.username])).rows[0];
   if(!u)return {error:'Email atau username telah dipakai. Ulangi pendaftaran.'};
  }else if(!u)return {error:'Akun belum terdaftar. Buat akun terlebih dahulu.'};
  const raw=token();
  await c.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[hash(raw),u.id]);
  return {raw,user:{id:u.id,username:u.username,email:u.email}};
 });
 if(result.error)fail(400,result.error);
 res.setHeader('Set-Cookie',cookie(result.raw,7*86400));return {user:result.user};
});
route('POST','/api/auth/logout',async(req,res)=>{await db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(sessionToken(req))]);res.setHeader('Set-Cookie',cookie('',0));return {ok:true}});
route('GET','/api/me',async req=>{
 const u=await auth(req);
 const rooms=await db.query("SELECT r.*,m.state FROM rooms r JOIN memberships m ON m.room_id=r.id WHERE m.user_id=$1 AND m.state IN ('active','archived') ORDER BY r.created_at DESC",[u.id]);
 const notices=await db.query('SELECT id,message,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',[u.id]);
 return {user:{id:u.id,username:u.username,email:u.email,emailReminders:u.email_reminders},rooms:rooms.rows,notices:notices.rows};
});
route('POST','/api/preferences',async req=>{
 const u=await auth(req),b=await body(req);if(typeof b.emailReminders!=='boolean')fail(400,'Preferensi tidak valid.');
 await db.query('UPDATE users SET email_reminders=$1 WHERE id=$2',[b.emailReminders,u.id]);return {ok:true};
});
route('POST','/api/rooms/create',async req=>{
 const u=await auth(req),b=await body(req),title=text(b.title,60,true),ann=dateOnly(b.anniversary);
 return roomTx(async c=>{
  if(await activeRoom(c,u))fail(409,'Kamu sudah punya ruang aktif. Keluar dahulu sebelum membuat ruang baru.');
  const id=randomUUID();await c.query('INSERT INTO rooms(id,title,anniversary) VALUES($1,$2,$3)',[id,title,ann]);
  await c.query("INSERT INTO memberships VALUES($1,$2,'active')",[id,u.id]);return {id};
 });
});
route('POST','/api/invites/create',async req=>{
 const u=await auth(req),b=await body(req);
 return roomTx(async c=>{
  await roomAccess(c,u,b.roomId,true);
  const members=await c.query("SELECT count(*)::int AS n FROM memberships WHERE room_id=$1 AND state='active'",[b.roomId]);if(members.rows[0].n>=2)fail(409,'Ruang sudah berisi dua anggota.');
  await c.query('UPDATE invitations SET used=true WHERE room_id=$1',[b.roomId]);
  const raw=token();await c.query("INSERT INTO invitations(token_hash,room_id,created_by,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')",[hash(raw),b.roomId,u.id]);
  return {url:origin+'/#invite='+raw,code:raw,expiresInHours:24};
 });
});
route('POST','/api/invites/accept',async req=>{
 const u=await auth(req),b=await body(req);if(!/^[a-f0-9]{64}$/.test(String(b.token)))fail(400,'Kode undangan tidak valid.');
 return roomTx(async c=>{
  if(await activeRoom(c,u))fail(409,'Kamu sudah memiliki ruang aktif.');
  const inv=(await c.query("SELECT * FROM invitations WHERE token_hash=$1 AND used=false AND expires_at>now()",[hash(b.token)])).rows[0];
  if(!inv)fail(400,'Undangan sudah dipakai, dibatalkan, atau kedaluwarsa.');
  const r=(await c.query('SELECT * FROM rooms WHERE id=$1',[inv.room_id])).rows[0];
  const members=(await c.query("SELECT u.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 AND m.state='active'",[r.id])).rows;
  if(r.status!=='active'||members.length!==1||members[0].id===u.id)fail(409,'Undangan tidak dapat diterima.');
  const key=pairKey(members[0].username,u.username);
  if((await c.query('SELECT id FROM rooms WHERE pair_key=$1',[key])).rows.length)fail(409,'Pasangan username ini sudah pernah memiliki ruang. Pemulihan ruang lama belum tersedia.');
  await c.query("INSERT INTO memberships VALUES($1,$2,'active')",[r.id,u.id]);
  await c.query('UPDATE rooms SET pair_key=$1 WHERE id=$2',[key,r.id]);
  await c.query('UPDATE invitations SET used=true WHERE room_id=$1',[r.id]);
  const planned=(await c.query("SELECT * FROM places WHERE room_id=$1 AND status='planned' AND scheduled_at>now()",[r.id])).rows;
  for(const p of planned)await queuePlace(c,p);
  return {id:r.id};
 });
});
route('POST','/api/rooms/leave',async req=>{
 const u=await auth(req),b=await body(req);if(b.confirm!==true)fail(400,'Konfirmasi keluar diperlukan.');
 return roomTx(async c=>{
  await roomAccess(c,u,b.roomId,true);
  await c.query("UPDATE memberships SET state='left' WHERE room_id=$1 AND user_id=$2",[b.roomId,u.id]);
  await c.query("UPDATE memberships SET state='archived' WHERE room_id=$1 AND state='active'",[b.roomId]);
  await c.query("UPDATE rooms SET status='archived',archived_at=now() WHERE id=$1",[b.roomId]);
  await c.query('UPDATE invitations SET used=true WHERE room_id=$1',[b.roomId]);
  await c.query("UPDATE mail_jobs SET status='cancelled' WHERE room_id=$1 AND status IN ('pending','failed')",[b.roomId]);
  const left=(await c.query("SELECT user_id FROM memberships WHERE room_id=$1 AND state='archived'",[b.roomId])).rows;
  for(const m of left){
   await c.query('INSERT INTO notifications(id,user_id,message) VALUES($1,$2,$3)',[randomUUID(),m.user_id,'Pasangan telah keluar dari ruang bersama. Ruang ini kini menjadi arsip hanya-baca. Kamu dapat membuat ruang baru.']);
   await c.query("INSERT INTO mail_jobs(id,room_id,user_id,kind,scheduled_at) VALUES($1,$2,$3,'room_closed',now())",[randomUUID(),b.roomId,m.user_id]);
  }
  return {ok:true};
 });
});
route('POST','/api/rooms/profile',async req=>{
 const u=await auth(req),b=await body(req);return roomTx(async c=>{await roomAccess(c,u,b.roomId,true);await c.query('UPDATE rooms SET title=$1,anniversary=$2 WHERE id=$3',[text(b.title,60,true),dateOnly(b.anniversary),b.roomId]);return {ok:true}});
});
route('GET','/api/room',async req=>{
 const u=await auth(req),id=new URL(req.url,origin).searchParams.get('id');
 return roomTx(async c=>{
  const room=await roomAccess(c,u,id);
  const members=(await c.query("SELECT u.id,u.username,m.state FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 AND m.state!='left'",[id])).rows;
  const places=(await c.query('SELECT * FROM places WHERE room_id=$1 ORDER BY created_at DESC',[id])).rows;
  const jobs=(await c.query('SELECT j.id,j.place_id,j.kind,j.status,j.scheduled_at,j.attempts FROM mail_jobs j WHERE j.room_id=$1 AND j.user_id=$2 ORDER BY scheduled_at DESC LIMIT 20',[id,u.id])).rows;
  return {room,members,places,jobs};
 });
});
route('POST','/api/places/save',async req=>{
 const u=await auth(req),b=await body(req),v=placeInput(b);
 return roomTx(async c=>{
  await roomAccess(c,u,b.roomId,true);
  if(b.id){const r=await c.query('UPDATE places SET name=$1,area=$2,category=$3,budget=$4,note=$5 WHERE id=$6 AND room_id=$7 RETURNING id',[v.name,v.area,v.category,v.budget,v.note,uuid(b.id),b.roomId]);if(!r.rowCount)fail(404,'Tempat tidak ditemukan.');return {id:b.id}}
  const id=randomUUID();await c.query('INSERT INTO places(id,room_id,name,area,category,budget,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,b.roomId,v.name,v.area,v.category,v.budget,v.note,u.id]);return {id};
 });
});
route('POST','/api/places/action',async req=>{
 const u=await auth(req),b=await body(req);
 return roomTx(async c=>{
  await roomAccess(c,u,b.roomId,true);
  const p=(await c.query('SELECT * FROM places WHERE id=$1 AND room_id=$2',[uuid(b.id),b.roomId])).rows[0];if(!p)fail(404,'Tempat tidak ditemukan.');
  if(b.action==='delete'){await c.query('DELETE FROM places WHERE id=$1',[p.id]);return {ok:true}}
  if(b.action==='schedule'){
   const at=scheduleTime(b.at);await c.query("UPDATE places SET status='planned',scheduled_at=$1,visited_at=null WHERE id=$2",[at,p.id]);await queuePlace(c,{...p,scheduled_at:at});
  }else if(b.action==='visited'){
   await c.query("UPDATE places SET status='visited',visited_at=now() WHERE id=$1",[p.id]);await cancelPlaceJobs(c,p.id);
  }else if(b.action==='wish'){
   await c.query("UPDATE places SET status='wish',scheduled_at=null,visited_at=null WHERE id=$1",[p.id]);await cancelPlaceJobs(c,p.id);
  }else fail(400,'Aksi tidak valid.');
  return {ok:true};
 });
});
let working=false;
async function processMail(){
 if(working)return;working=true;
 try{
  // Sending holds the room lock, so leave/reschedule cannot complete mid-send.
  // SMTP acceptance and SQL commit cannot be atomic; duplicate sends remain possible after a crash.
  await roomTx(async c=>{
   const job=(await c.query("SELECT * FROM mail_jobs WHERE (status='pending' OR (status='failed' AND attempts<3)) AND scheduled_at<=now() ORDER BY scheduled_at LIMIT 1 FOR UPDATE")).rows[0];
   if(!job)return;
   const u=(await c.query('SELECT * FROM users WHERE id=$1',[job.user_id])).rows[0];
   const member=(await c.query('SELECT m.state,r.status FROM memberships m JOIN rooms r ON r.id=m.room_id WHERE m.room_id=$1 AND m.user_id=$2',[job.room_id,job.user_id])).rows[0];
   let title='Informasi ruang PergiBerdua',message='Pasangan telah keluar dari ruang bersama. Ruang lama kini menjadi arsip hanya-baca. Kamu dapat membuat ruang baru, tanpa memindahkan data lama.\n\nBuka '+origin;
   if(job.kind==='reminder'){
    const p=(await c.query('SELECT * FROM places WHERE id=$1',[job.place_id])).rows[0];
    if(!u?.email_reminders||member?.state!=='active'||member?.status!=='active'||!p||p.status!=='planned'||new Date(p.scheduled_at)<=new Date()){
     await c.query("UPDATE mail_jobs SET status='cancelled' WHERE id=$1",[job.id]);return;
    }
    title='Rencana berdua: '+p.name;
    message=`Kalian punya rencana ke ${p.name} (${p.area}).\n\n${new Date(p.scheduled_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB\nBudget: Rp ${p.budget.toLocaleString('id-ID')} / berdua\n\nLihat atau ubah rencana di ${origin}\nAtur pengingat email melalui menu Akun.`;
   }else if(member?.state!=='archived'){await c.query("UPDATE mail_jobs SET status='cancelled' WHERE id=$1",[job.id]);return;}
   await c.query("UPDATE mail_jobs SET status='sending',attempts=attempts+1,locked_at=now() WHERE id=$1",[job.id]);
   try{await sendMail(u.email,title,message);await c.query("UPDATE mail_jobs SET status='sent',sent_at=now() WHERE id=$1",[job.id])}
   catch{await c.query("UPDATE mail_jobs SET status='failed',scheduled_at=now()+interval '5 minutes' WHERE id=$1",[job.id]);console.error('Email delivery failed; retry scheduled.')}
  });
 }catch{console.error('Reminder worker failed; retry next tick.')}finally{working=false}
}
const timer=setInterval(processMail,15000);
const cleanup=setInterval(()=>db.query("DELETE FROM rate_events WHERE created_at<now()-interval '1 day'; DELETE FROM otp_requests WHERE created_at<now()-interval '1 day'; DELETE FROM sessions WHERE expires_at<now()").catch(()=>console.error('Cleanup failed.')),3600000);
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
 res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
 try{
  const path=new URL(req.url,origin).pathname;
  if(path.startsWith('/api/')){
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
   if(req.method!=='GET'){
    if(!isAllowedOrigin(req.headers.origin,req.headers['x-forwarded-host']||req.headers.host))fail(403,'Origin tidak diizinkan.');
    if(!(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Gunakan application/json.');
   }
   const handler=routes[req.method+' '+path];if(!handler)fail(404,'Endpoint tidak ditemukan.');
   res.end(JSON.stringify(await handler(req,res)));return;
  }
  fail(404,'API only. Buka frontend Next.js.');
 }catch(e){
  const status=e instanceof ApiError?e.status:e.code==='23505'?409:500;
  if(status===500)console.error('Request failed:',e.code||e.name);
  res.statusCode=status;res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({error:status===500?'Terjadi masalah server. Coba lagi.':e instanceof ApiError?e.message:'Data sudah digunakan atau ruang berubah. Muat ulang dan coba lagi.'}));
 }
});
server.listen(3000,'0.0.0.0',()=>console.log('PergiBerdua listening on port 3000. Mode: '+(production?'production':'local development')));
process.on('SIGTERM',()=>{clearInterval(timer);clearInterval(cleanup);server.close(async()=>{await db.end();process.exit(0)})});
