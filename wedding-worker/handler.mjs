const COOKIE = '__Host-mehz_wedding';
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const PAGE_PATHS = new Set(['/wedding', '/wedding/', '/wedding/index.html']);

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function signatureBytes(value) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try { return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='), c => c.charCodeAt(0)); }
  catch { return null; }
}

async function signingKey(env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.COOKIE_SECRET + '\0' + env.ACCESS_CODE), {name:'HMAC', hash:'SHA-256'}, false, ['sign','verify']);
}

async function makeSession(env, now) {
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `wedding.v1.${now + SESSION_SECONDS}.${nonce}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(payload));
  return `${payload}.${base64url(signature)}`;
}

async function hasSession(request, env, now) {
  if (!configured(env)) return false;
  const cookies = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).filter(s => s.startsWith(COOKIE + '='));
  if (cookies.length !== 1) return false;
  const token = cookies[0].slice(COOKIE.length + 1);
  const match = /^wedding\.v1\.(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires <= now || expires > now + SESSION_SECONDS) return false;
  const signature = signatureBytes(match[3]);
  if (!signature) return false;
  try { return await crypto.subtle.verify('HMAC', await signingKey(env), signature, encoder.encode(token.slice(0, token.lastIndexOf('.')))); }
  catch { return false; }
}

function configured(env) {
  return /^\d{4}$/.test(env.ACCESS_CODE || '') && typeof env.COOKIE_SECRET === 'string' && env.COOKIE_SECRET.length >= 32;
}

function headers(extra = {}) {
  return new Headers({
    'Cache-Control':'private, no-store, max-age=0',
    'CDN-Cache-Control':'no-store',
    'Cloudflare-CDN-Cache-Control':'no-store',
    'Referrer-Policy':'same-origin',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'X-Robots-Tag':'noindex, nofollow, noarchive',
    'Vary':'Cookie',
    ...extra
  });
}

function result(request, status, message, extra = {}) {
  const responseHeaders = headers(extra);
  if ((request.headers.get('Accept') || '').includes('application/json')) {
    responseHeaders.set('Content-Type','application/json; charset=utf-8');
    return new Response(JSON.stringify({ok:status === 200, message}), {status, headers:responseHeaders});
  }
  responseHeaders.set('Content-Type','text/plain; charset=utf-8');
  return new Response(message, {status, headers:responseHeaders});
}

function redirect(location, extra = {}) {
  return new Response(null, {status:303, headers:headers({Location:location, ...extra})});
}

async function readCode(request) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/x-www-form-urlencoded')) return null;
  if (Number(request.headers.get('Content-Length') || 0) > 128 || !request.body) return null;
  const reader = request.body.getReader();
  let length = 0, text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 128) { await reader.cancel(); return null; }
      text += decoder.decode(value, {stream:true});
    }
    text += decoder.decode();
    const values = new URLSearchParams(text).getAll('code');
    return values.length === 1 && /^\d{4}$/.test(values[0]) ? values[0] : null;
  } finally { reader.releaseLock(); }
}

function sameCode(a, b) {
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let i=0; i<a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function contentPolicy(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/application\/json|\bsrc=/.test(match[1])) continue;
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(match[2]));
    hashes.push(`'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`);
  }
  return `default-src 'none'; script-src 'self' ${hashes.join(' ')}; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`;
}

export function createHandler({gateHtml, directoryHtml, now = () => Math.floor(Date.now()/1000)}) {
  const policies = new Map();
  async function htmlResponse(request, html) {
    if (!policies.has(html)) policies.set(html, contentPolicy(html));
    return new Response(request.method === 'HEAD' ? null : html, {headers:headers({
      'Content-Type':'text/html; charset=utf-8',
      'Content-Security-Policy':await policies.get(html)
    })});
  }
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.origin !== env.SITE_ORIGIN) return result(request, 404, 'Not found.');
    const isPage = PAGE_PATHS.has(url.pathname);
    if (!isPage && url.pathname !== '/wedding/unlock' && url.pathname !== '/wedding/lock') return result(request,404,'Not found.');
    if (isPage) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return result(request,405,'Method not allowed.',{Allow:'GET, HEAD'});
      const unlocked = await hasSession(request,env,now());
      return htmlResponse(request,unlocked ? directoryHtml : gateHtml);
    }
    if (request.method !== 'POST') return result(request,405,'Method not allowed.',{Allow:'POST'});
    if (request.headers.get('Origin') !== env.SITE_ORIGIN || request.headers.get('Sec-Fetch-Site') === 'cross-site') return result(request,403,'Please open the page and try again.');
    if (url.pathname === '/wedding/lock') return redirect('/wedding/',{'Set-Cookie':`${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`});
    if (!configured(env) || !env.LOGIN_LIMITER) return result(request,503,'Unable to unlock right now. Please try again.');
    try {
      const {success} = await env.LOGIN_LIMITER.limit({key:'wedding-login:' + (request.headers.get('CF-Connecting-IP') || 'unknown')});
      if (!success) return result(request,429,'Too many attempts. Wait a minute and try again.',{'Retry-After':'60'});
    } catch { return result(request,503,'Unable to unlock right now. Please try again.'); }
    const code = await readCode(request);
    if (!sameCode(code,env.ACCESS_CODE)) return result(request,401,'That code isn’t correct. Please try again.');
    const cookie = `${COOKIE}=${await makeSession(env,now())}; Path=/; Secure; HttpOnly; SameSite=Strict`;
    if ((request.headers.get('Accept') || '').includes('application/json')) return result(request,200,'Unlocked.',{'Set-Cookie':cookie});
    return redirect('/wedding/',{'Set-Cookie':cookie});
  };
}
