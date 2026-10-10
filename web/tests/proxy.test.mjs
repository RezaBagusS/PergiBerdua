import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

// Tests actual handler source with mocked fetch, not an installed Next server.
const source=await readFile(new URL('../app/api/[...path]/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const handler=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputText).toString('base64'));
process.env.APP_ORIGIN='http://localhost:3000';
process.env.API_INTERNAL_URL='http://api:3000';
function req(path,{method='POST',origin='http://localhost:3000',body='{}',type='application/json'}={}){
 const r=new Request('http://localhost:3000/api/'+path,{method,headers:{...(origin?{Origin:origin}:{}),'Content-Type':type,Cookie:'pb_session=abc'},...(method==='POST'?{body}:{})});
 Object.defineProperty(r,'nextUrl',{value:new URL(r.url)});return r;
}
const context=path=>({params:Promise.resolve({path:path.split('?')[0].split('/')})});
test('rejects paths not explicitly allowlisted',async()=>{
 assert.equal((await handler.POST(req('../../metadata'),context('../../metadata'))).status,404);
});
test('rejects missing and foreign POST origins',async()=>{
 for(const origin of ['', 'https://attacker.example'])assert.equal((await handler.POST(req('auth/request',{origin}),context('auth/request'))).status,403);
});
test('rejects non-JSON POST',async()=>{
 assert.equal((await handler.POST(req('auth/verify',{type:'text/plain'}),context('auth/verify'))).status,415);
});
test('bounds streaming request bytes',async()=>{
 assert.equal((await handler.POST(req('auth/request',{body:'a'.repeat(16385)}),context('auth/request'))).status,413);
});
test('passes cookie and exact origin; preserves backend status and Set-Cookie',async t=>{
 let requestUrl,options;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  requestUrl=String(url);options=opts;
  return new Response('{"error":"wrong code"}',{status:400,headers:{'Set-Cookie':'pb_session=example; HttpOnly; SameSite=Lax; Path=/'}});
 });
 const response=await handler.POST(req('auth/verify'),context('auth/verify'));
 assert.equal(requestUrl,'http://api:3000/api/auth/verify');
 assert.equal(options.headers.get('origin'),'http://localhost:3000');
 assert.equal(options.headers.get('cookie'),'pb_session=abc');
 assert.equal(options.cache,'no-store');
 assert.equal(options.redirect,'error');
 assert.equal(response.status,400);
 assert.match(response.headers.get('set-cookie'),/HttpOnly/);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('GET preserves query and remains fixed-upstream',async t=>{
 let called;
 t.mock.method(globalThis,'fetch',async url=>{called=String(url);return Response.json({ok:true})});
 const response=await handler.GET(req('room?id=abc',{method:'GET'}),context('room'));
 assert.equal(called,'http://api:3000/api/room?id=abc');assert.equal(response.status,200);
});
test('upstream failure is a generic 503 without details',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw Error('secret connection info')});
 const response=await handler.GET(req('health',{method:'GET'}),context('health'));
 assert.equal(response.status,503);assert.ok(!(await response.text()).includes('secret'));
});
