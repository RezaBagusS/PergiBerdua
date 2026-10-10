import test from 'node:test';
import assert from 'node:assert/strict';
import {email,username,text,otp,otpHash,equal,token,hash,dateOnly,pairKey,placeInput,scheduleTime,reminderTimes} from '../domain.mjs';
test('email normalized and invalid address rejected',()=>{
 assert.equal(email('  KAMU@example.com '),'kamu@example.com');
 for(const v of ['x','x@','x @example.com',''])assert.throws(()=>email(v));
});
test('username normalized, bounded and cannot use pair separator',()=>{
 assert.equal(username(' TEMAN_1 '),'teman_1');
 for(const v of ['ab','a:b','../abc','a'.repeat(25),'<script>'])assert.throws(()=>username(v));
});
test('pair key is canonical, unique by usernames and order-independent',()=>{
 assert.equal(pairKey('budi','ani'),pairKey('ani','budi'));
 assert.notEqual(pairKey('ani','budi'),pairKey('ani','doni'));
});
test('OTP values have six digits and cryptographically bound challenge',()=>{
 for(let i=0;i<50;i++)assert.match(otp(),/^\d{6}$/);
 assert.notEqual(otpHash('secret','a','123456'),otpHash('secret','b','123456'));
 assert.ok(equal(otpHash('s','a','123456'),otpHash('s','a','123456')));
 assert.ok(!equal('short','longer'));assert.ok(!equal('abc','abd'));
});
test('session tokens are random and hashed',()=>{
 const a=token(),b=token();assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,b);
 assert.equal(hash(a).length,64);assert.notEqual(hash(a),a);
});
test('anniversary validates date and stays optional',()=>{
 assert.equal(dateOnly(''),null);assert.equal(dateOnly('2024-02-29'),'2024-02-29');
 assert.throws(()=>dateOnly('2025-02-29'));assert.throws(()=>dateOnly('2999-01-01'));
});
test('place validates category, names and integer budget',()=>{
 const p={name:'Bogor',area:'Bogor',category:'Alam',budget:100000,note:'Piknik'};
 assert.equal(placeInput(p).budget,100000);
 for(const v of [-1,2.5,Infinity,1000000000])assert.throws(()=>placeInput({...p,budget:v}));
 assert.throws(()=>placeInput({...p,category:'bad'}));assert.throws(()=>placeInput({...p,name:''}));
 assert.throws(()=>text('a'.repeat(81),80,true));
});
test('schedule must be future; only future reminder times are generated',()=>{
 assert.throws(()=>scheduleTime('2001-01-01'));assert.throws(()=>scheduleTime('bad'));
 const now=Date.now();
 assert.equal(reminderTimes(new Date(now+48*3600000),now).length,2);
 assert.equal(reminderTimes(new Date(now+3*3600000),now).length,1);
 assert.equal(reminderTimes(new Date(now+3600000),now).length,0);
 assert.ok(scheduleTime(new Date(now+3600000).toISOString()));
});
