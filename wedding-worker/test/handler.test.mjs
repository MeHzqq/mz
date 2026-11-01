import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHandler} from '../handler.mjs';

const gateHtml = await readFile(new URL('../gate.html',import.meta.url),'utf8');
const directoryHtml = '<!doctype html><h1>PRIVATE_DIRECTORY_FIXTURE</h1>';
const origin = 'https://mehz.org';
function setup(overrides = {}) {
  let time = 1793484000;
  const env = {SITE_ORIGIN:origin, ACCESS_CODE:'2468', COOKIE_SECRET:'test-only-signing-secret-'.repeat(3), LOGIN_LIMITER:{limit:async()=>({success:true})}, ...overrides};
  return {env, handle:createHandler({gateHtml,directoryHtml,now:()=>time}), advance:seconds=>{time+=seconds;}};
}
function post(code='2468', options={}) {
  return new Request(origin+'/wedding/unlock',{method:'POST',headers:{Origin:origin,Accept:'application/json','Content-Type':'application/x-www-form-urlencoded',...options.headers},body:options.body??new URLSearchParams({code})});
}
async function unlock(s) {
  const response=await s.handle(post(),s.env);
  assert.equal(response.status,200);
  return response.headers.get('Set-Cookie').split(';')[0];
}

test('all entry URLs and query parameters remain locked without a signed cookie',async()=>{
  const s=setup();
  for(const path of ['/wedding','/wedding/','/wedding/index.html','/wedding/?code=2468&unlocked=true']) {
    const r=await s.handle(new Request(origin+path),s.env);
    assert.equal(r.status,200);
    const body=await r.text();
    assert.equal(body,gateHtml);
    assert.ok(!body.includes('PRIVATE_DIRECTORY_FIXTURE'));
    assert.ok(!body.includes(s.env.ACCESS_CODE));
    assert.match(r.headers.get('Cache-Control'),/no-store/);
    assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  }
  const head=await s.handle(new Request(origin+'/wedding/index.html',{method:'HEAD'}),s.env);
  assert.equal(await head.text(),'');
});

test('wrong, missing, duplicate and oversized codes never receive a session',async()=>{
  const s=setup();
  for(const body of ['code=0000','code=24680','code=2468&code=2468','code=2468%00','code=2468'+'x'.repeat(200),'']) {
    const r=await s.handle(post('2468',{body}),s.env);
    assert.equal(r.status,401);
    assert.equal(r.headers.get('Set-Cookie'),null);
    assert.ok(!(await r.text()).includes('PRIVATE_DIRECTORY_FIXTURE'));
  }
});

test('correct code gives a signed session and serves the directory on every supported page URL',async()=>{
  const s=setup();
  const r=await s.handle(post(),s.env);
  assert.equal(r.status,200);
  const cookie=r.headers.get('Set-Cookie');
  assert.match(cookie,/^__Host-mehz_wedding=wedding\.v1\./);
  assert.match(cookie,/Path=\/; Secure; HttpOnly; SameSite=Strict/);
  assert.ok(!cookie.includes('Max-Age'));
  for(const path of ['/wedding','/wedding/','/wedding/index.html']) {
    const page=await s.handle(new Request(origin+path,{headers:{Cookie:cookie.split(';')[0]}}),s.env);
    assert.equal(await page.text(),directoryHtml);
    assert.match(page.headers.get('Cache-Control'),/no-store/);
  }
});

test('plain HTML form works without JavaScript',async()=>{
  const s=setup();
  const r=await s.handle(post('2468',{headers:{Accept:'text/html'}}),s.env);
  assert.equal(r.status,303);
  assert.equal(r.headers.get('Location'),'/wedding/');
  assert.ok(r.headers.has('Set-Cookie'));
});

test('forged, modified, duplicate, expired and rotated sessions fail closed',async()=>{
  const s=setup();const cookie=await unlock(s);
  const altered=cookie.slice(0,-5)+(cookie.at(-5)==='a'?'b':'a')+cookie.slice(-4);
  for(const value of ['__Host-mehz_wedding=true','__Host-mehz_wedding=2468',altered,cookie+'; '+cookie]) {
    const r=await s.handle(new Request(origin+'/wedding/',{headers:{Cookie:value}}),s.env);
    assert.equal(await r.text(),gateHtml);
  }
  s.advance(8*3600);
  assert.equal(await(await s.handle(new Request(origin+'/wedding/',{headers:{Cookie:cookie}}),s.env)).text(),gateHtml);
  const fresh=setup();const freshCookie=await unlock(fresh);
  fresh.env.ACCESS_CODE='8642';
  assert.equal(await(await fresh.handle(new Request(origin+'/wedding/',{headers:{Cookie:freshCookie}}),fresh.env)).text(),gateHtml);
});

test('missing secrets or limiter and limiter errors cannot unlock the page',async()=>{
  for(const overrides of [{ACCESS_CODE:''},{COOKIE_SECRET:''},{LOGIN_LIMITER:null},{LOGIN_LIMITER:{limit:async()=>{throw Error('unavailable');}}}]) {
    const s=setup(overrides);const r=await s.handle(post(),s.env);
    assert.equal(r.status,503);assert.equal(r.headers.get('Set-Cookie'),null);
  }
});

test('rate limit response refuses even a correct code',async()=>{
  const s=setup({LOGIN_LIMITER:{limit:async()=>({success:false})}});
  const r=await s.handle(post(),s.env);
  assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');assert.equal(r.headers.get('Set-Cookie'),null);
});

test('foreign origins, cross-site submissions, unknown paths and unsupported methods are rejected',async()=>{
  const s=setup();
  for(const headers of [{Origin:'https://example.com'},{Origin:''},{'Sec-Fetch-Site':'cross-site'}]) {
    assert.equal((await s.handle(post('2468',{headers}),s.env)).status,403);
  }
  for(const path of ['/wedding/source','/wedding-worker/_content/directory.html','/wedding/unlock/']) {
    assert.equal((await s.handle(new Request(origin+path),s.env)).status,404);
  }
  assert.equal((await s.handle(new Request('https://example.com/wedding/'),s.env)).status,404);
  assert.equal((await s.handle(new Request(origin+'/wedding/unlock'),s.env)).status,405);
  assert.equal((await s.handle(new Request(origin+'/wedding/',{method:'POST'}),s.env)).status,405);
});

test('lock clears the session and redirects to the entrance',async()=>{
  const s=setup();const cookie=await unlock(s);
  const r=await s.handle(new Request(origin+'/wedding/lock',{method:'POST',headers:{Origin:origin,Cookie:cookie}}),s.env);
  assert.equal(r.status,303);assert.equal(r.headers.get('Location'),'/wedding/');
  assert.match(r.headers.get('Set-Cookie'),/Max-Age=0/);
  assert.equal(await(await s.handle(new Request(origin+'/wedding/'),s.env)).text(),gateHtml);
});
