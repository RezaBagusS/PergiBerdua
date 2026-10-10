// Run against Next dev or Docker web. API responses are mocked, not database integration.
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.TEST_ORIGIN || 'http://localhost:3000';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let logged=false,places=[],room=null;
const roomId='11111111-1111-4111-a111-111111111111';
const user={id:'22222222-2222-4222-a222-222222222222',username:'teman_pergi',email:'teman@example.com',emailReminders:true};
await page.route('**/api/**',async route=>{
 const p=new URL(route.request().url()).pathname;
 const b=route.request().method()==='POST'?route.request().postDataJSON():{};
 let out={},status=200;
 if(p==='/api/config')out={mode:'development'};
 else if(p==='/api/me'){if(!logged){status=401;out={error:'Silakan masuk.'}}else out={user,rooms:room?[room]:[],notices:[]}}
 else if(p==='/api/auth/request')out={requestId:'33333333-3333-4333-a333-333333333333'};
 else if(p==='/api/auth/verify'){logged=true;out={user}}
 else if(p==='/api/auth/logout'){logged=false;out={ok:true}}
 else if(p==='/api/rooms/create'){room={id:roomId,title:b.title,status:'active',anniversary:b.anniversary};out={id:roomId}}
 else if(p==='/api/room')out={room,members:[user],places,jobs:[]};
 else if(p==='/api/places/save'){const id=b.id||'44444444-4444-4444-a444-444444444444';if(b.id)places=places.map(p=>p.id===id?{...p,...b}:p);else places.push({...b,id,status:'wish',scheduled_at:null});out={id}}
 else if(p==='/api/places/action'){places=places.map(p=>p.id===b.id?{...p,status:b.action==='schedule'?'planned':b.action==='visited'?'visited':'wish',scheduled_at:b.at||null}:p);out={ok:true}}
 else if(p==='/api/rooms/profile'){room={...room,...b};out={ok:true}}
 else if(p==='/api/preferences'){user.emailReminders=b.emailReminders;out={ok:true}}
 else if(p==='/api/invites/create')out={url:'http://localhost:3000/#invite='+'a'.repeat(64)};
 else throw Error('Unexpected mocked request: '+p);
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(out)});
});
await page.goto(base);
await page.getByRole('button',{name:'Daftar',exact:true}).click();
await page.getByLabel('Username').fill('teman_pergi');
await page.getByLabel('Email',{exact:true}).fill('teman@example.com');
await page.screenshot({path:'test-results/register.png',fullPage:true});
await page.getByRole('button',{name:/Daftar dengan OTP/}).click();
await page.getByLabel('Kode verifikasi').fill('123456');
await page.getByRole('button',{name:/Verifikasi/}).click();
await page.getByRole('button',{name:/Buat ruang berdua/}).click();
await page.getByLabel('Nama ruang').fill('Ruang kecil kita');
await page.getByRole('button',{name:/Buat ruang →/}).click();
await page.getByRole('button',{name:/Buat undangan pasangan/}).click();
assert.ok(await page.getByLabel('Tautan undangan').inputValue());
await page.getByRole('button',{name:'Tutup',exact:true}).click();
await page.getByRole('button',{name:/Wishlist kita/}).click();
await page.getByRole('button',{name:'+ Tambah tempat',exact:true}).click();
await page.getByLabel('Nama tempat').fill('Kebun Raya Bogor');
await page.getByLabel('Area / kota').fill('Bogor');
await page.getByLabel('Budget berdua (Rp)').fill('150000');
await page.getByRole('button',{name:/Simpan wishlist/}).click();
await page.locator('.place-card').getByRole('button',{name:/Buka/}).click();
await page.getByRole('button',{name:/Rencanakan pergi/}).click();
await page.getByLabel('Tanggal & jam (WIB)').fill('2027-10-11T09:00');
await page.getByRole('button',{name:/Simpan rencana/}).click();
await page.evaluate(()=>window.scrollTo(0,0));
await page.screenshot({path:'test-results/dashboard.png',fullPage:true});
await page.getByLabel('Cari tempat').fill('tidak ada');
assert.equal(await page.locator('.place-card').count(),0);
await page.getByLabel('Cari tempat').fill('');
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'test-results/mobile.png',fullPage:true});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390));
await page.locator('.place-card').getByRole('button',{name:/Buka/}).click();
await page.getByRole('button',{name:/Sudah dikunjungi/}).click();
await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
await page.getByRole('button',{name:/Jadi kenangan/}).click();
await page.locator('.place-card').first().waitFor();
assert.equal(await page.locator('.place-card').count(),1);
await page.getByRole('button',{name:/Akun & ruang/}).click();
await page.getByLabel('Aktifkan reminder email').click();
await page.waitForFunction(()=>!document.querySelector('.switch-line input').checked);
assert.equal(user.emailReminders,false);
await page.getByRole('button',{name:/Ubah profil ruang/}).click();
await page.getByLabel('Nama ruang').fill('Rencana kita');
await page.getByRole('button',{name:/Simpan perubahan/}).click();
await page.getByRole('button',{name:'Keluar akun',exact:true}).click();
await page.getByLabel('Email',{exact:true}).waitFor();
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390));
assert.deepEqual(errors,[]);
console.log('PASS: browser with mocked APIs: register/OTP, create room, invitation, add/schedule/visit, search, preferences, profile, logout; mobile overflow and JS errors.');
}finally{await browser.close();}
