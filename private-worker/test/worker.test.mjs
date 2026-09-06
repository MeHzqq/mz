import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { handleRequest } from '../src/worker.mjs';

const issuer = 'https://mehz-test.cloudflareaccess.com';
const audience = 'a'.repeat(64);
const allowedEmail = 'owner@example.com';
const privateTitle = 'Confidential index destination';
const privateUrl = 'https://private.example.com/unguessable-secret-location';
const env = {
  ACCESS_TEAM_DOMAIN: issuer,
  ACCESS_AUD: audience,
  SITE_ORIGIN: 'https://mehz.org',
  ALLOWED_EMAILS: `${allowedEmail}, second@example.com`,
  INDEX_LINKS_JSON: JSON.stringify([{ title: privateTitle, url: privateUrl }]),
};

const { privateKey, publicKey } = await generateKeyPair('RS256');
const unrelatedKeys = await generateKeyPair('RS256');
const publicJwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const localKeys = createLocalJWKSet({ keys: [publicJwk] });
const keySetFactory = configuredIssuer => {
  assert.equal(configuredIssuer, issuer);
  return localKeys;
};

async function token(overrides = {}, signingKey = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: issuer,
    aud: [audience],
    sub: 'test-user-id',
    email: allowedEmail,
    type: 'app',
    iat: now - 30,
    nbf: now - 30,
    exp: now + 300,
    ...overrides,
  };
  for (const [key, value] of Object.entries(claims)) {
    if (value === undefined) delete claims[key];
  }
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(signingKey);
}

function request(jwt, { path = '/private/', origin = env.SITE_ORIGIN, method = 'GET', headers = {} } = {}) {
  if (jwt !== undefined) headers = { ...headers, 'Cf-Access-Jwt-Assertion': jwt };
  return new Request(`${origin}${path}`, { method, headers });
}

async function rejection(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  const body = await response.text();
  assert.ok(!body.includes(privateTitle), 'Rejected request must not expose a private title');
  assert.ok(!body.includes(privateUrl), 'Rejected request must not expose a private destination');
  return body;
}

test('a cryptographically valid, allowed account receives the private index', async () => {
  const response = await handleRequest(request(await token()), env, keySetFactory);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(body.includes(privateTitle));
  assert.ok(body.includes(privateUrl));
  assert.ok(body.includes(allowedEmail));
  assert.ok(body.includes('/cdn-cgi/access/logout'));
  assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  const policy = response.headers.get('Content-Security-Policy');
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce);
  assert.ok(body.includes(`<style nonce="${nonce}">`));
});

test('email allowlist comparison ignores surrounding spaces and case', async () => {
  const response = await handleRequest(request(await token({ email: '  OWNER@EXAMPLE.COM  ' })), {
    ...env, ALLOWED_EMAILS: ' Owner@Example.COM , SECOND@example.com ',
  }, keySetFactory);
  assert.equal(response.status, 200);
});

test('a correctly signed but unapproved account is denied', async () => {
  await rejection(await handleRequest(request(await token({ email: 'outsider@example.com' })), env, keySetFactory), 403);
});

test('removing an account from the allowlist revokes an otherwise unexpired token immediately', async () => {
  const jwt = await token();
  assert.equal((await handleRequest(request(jwt), env, keySetFactory)).status, 200);
  await rejection(await handleRequest(request(jwt), {
    ...env, ALLOWED_EMAILS: 'second@example.com',
  }, keySetFactory), 403);
});

test('missing JWT and a spoofed identity header cannot reveal the index', async () => {
  await rejection(await handleRequest(request(), env, keySetFactory), 401);
  await rejection(await handleRequest(request(undefined, {
    headers: { 'Cf-Access-Authenticated-User-Email': allowedEmail },
  }), env, keySetFactory), 401);
});

test('the unsigned identity header cannot replace the signed token identity', async () => {
  await rejection(await handleRequest(request(await token({ email: 'outsider@example.com' }), {
    headers: { 'Cf-Access-Authenticated-User-Email': allowedEmail },
  }), env, keySetFactory), 403);
});

test('changing signed payload data without signing it again is rejected', async () => {
  const parts = (await token({ email: 'outsider@example.com' })).split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  claims.email = allowedEmail;
  parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
  await rejection(await handleRequest(request(parts.join('.')), env, keySetFactory), 401);
});

test('a matching key identifier with an unrelated signing key is rejected', async () => {
  await rejection(await handleRequest(request(await token({}, unrelatedKeys.privateKey)), env, keySetFactory), 401);
});

test('HS256 algorithm substitution is rejected even with otherwise valid claims', async () => {
  const parts = (await token()).split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  const forged = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
    .sign(new TextEncoder().encode(JSON.stringify(publicJwk)));
  await rejection(await handleRequest(request(forged), env, keySetFactory), 401);
});

const invalidClaims = [
  ['wrong issuer', () => ({ iss: 'https://another.cloudflareaccess.com' })],
  ['missing issuer', () => ({ iss: undefined })],
  ['wrong audience', () => ({ aud: 'b'.repeat(64) })],
  ['missing audience', () => ({ aud: undefined })],
  ['expired token', () => ({ exp: Math.floor(Date.now() / 1000) - 120, iat: Math.floor(Date.now() / 1000) - 300 })],
  ['future not-before time', () => ({ nbf: Math.floor(Date.now() / 1000) + 120 })],
  ['missing expiration', () => ({ exp: undefined })],
  ['missing not-before time', () => ({ nbf: undefined })],
  ['missing issued-at time', () => ({ iat: undefined })],
  ['future issued-at time', () => ({ iat: Math.floor(Date.now() / 1000) + 120 })],
  ['expiration equal to issued-at time', () => { const now = Math.floor(Date.now() / 1000); return { exp: now, iat: now }; }],
  ['organization token', () => ({ type: 'org' })],
  ['missing token type', () => ({ type: undefined })],
  ['missing email', () => ({ email: undefined })],
  ['non-string email', () => ({ email: [allowedEmail] })],
  ['missing subject', () => ({ sub: undefined })],
  ['empty subject', () => ({ sub: '' })],
];

for (const [name, claims] of invalidClaims) {
  test(`${name} is rejected without private data`, async () => {
    await rejection(await handleRequest(request(await token(claims())), env, keySetFactory), 401);
  });
}

test('malformed and oversized tokens are rejected', async () => {
  for (const jwt of ['not-a-jwt', 'eyJhbGciOiJub25lIn0.e30.', 'x'.repeat(16385)]) {
    await rejection(await handleRequest(request(jwt), env, keySetFactory), 401);
  }
});

test('failure to retrieve signing keys fails closed', async () => {
  await rejection(await handleRequest(request(await token()), env, () => {
    throw new Error('Signing endpoint unavailable');
  }), 401);
});

for (const field of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'SITE_ORIGIN', 'ALLOWED_EMAILS']) {
  test(`missing ${field} fails closed`, async () => {
    const incomplete = { ...env };
    delete incomplete[field];
    await rejection(await handleRequest(request(await token()), incomplete, keySetFactory), 503);
  });
}

const invalidConfiguration = [
  ['insecure issuer', { ACCESS_TEAM_DOMAIN: 'http://mehz-test.cloudflareaccess.com' }],
  ['untrusted issuer domain', { ACCESS_TEAM_DOMAIN: 'https://mehz-test.cloudflareaccess.com.attacker.example' }],
  ['issuer with a path', { ACCESS_TEAM_DOMAIN: `${issuer}/other` }],
  ['invalid audience identifier', { ACCESS_AUD: 'replace-this-value' }],
  ['insecure site origin', { SITE_ORIGIN: 'http://mehz.org' }],
  ['site origin with a path', { SITE_ORIGIN: 'https://mehz.org/private' }],
  ['empty email allowlist', { ALLOWED_EMAILS: ' , ' }],
  ['non-email allowlist entry', { ALLOWED_EMAILS: 'owner@example.com, invalid' }],
];

for (const [name, overrides] of invalidConfiguration) {
  test(`${name} fails closed`, async () => {
    await rejection(await handleRequest(request(await token()), { ...env, ...overrides }, keySetFactory), 503);
  });
}

test('unknown paths cannot expose private contents, including with a valid token', async () => {
  const jwt = await token();
  for (const path of ['/', '/private/anything', '/private.html', '/private%2F', '/Private/']) {
    await rejection(await handleRequest(request(jwt, { path }), env, keySetFactory), 404);
  }
});

test('alternate origins cannot expose private contents', async () => {
  const jwt = await token();
  for (const origin of ['http://mehz.org', 'https://www.mehz.org', 'https://mehz-index.example.workers.dev', 'https://mehz.org:8443']) {
    await rejection(await handleRequest(request(jwt, { origin }), env, keySetFactory), 404);
  }
});

test('the slashless route redirects only after successful authorization', async () => {
  await rejection(await handleRequest(request(undefined, { path: '/private' }), env, keySetFactory), 401);
  const response = await handleRequest(request(await token(), { path: '/private' }), env, keySetFactory);
  await rejection(response, 302);
  assert.equal(response.headers.get('Location'), '/private/');
});

test('HEAD obeys authentication and returns no response body', async () => {
  const accepted = await handleRequest(request(await token(), { method: 'HEAD' }), env, keySetFactory);
  assert.equal(accepted.status, 200);
  assert.equal(await accepted.text(), '');
  const rejected = await handleRequest(request(undefined, { method: 'HEAD' }), env, keySetFactory);
  assert.equal(rejected.status, 401);
  assert.equal(await rejected.text(), '');
});

test('unsupported methods return 405 and the supported method list', async () => {
  const jwt = await token();
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const response = await handleRequest(request(jwt, { method }), env, keySetFactory);
    await rejection(response, 405);
    assert.equal(response.headers.get('Allow'), 'GET, HEAD');
  }
});

test('an authorized account can open an empty index', async () => {
  const jwt = await token();
  for (const index of [undefined, '', '[]']) {
    const response = await handleRequest(request(jwt), { ...env, INDEX_LINKS_JSON: index }, keySetFactory);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /No links added yet\./);
  }
});

test('malformed index configuration fails closed without partial link disclosure', async () => {
  const jwt = await token();
  const validLink = { title: privateTitle, url: privateUrl };
  for (const index of ['{broken', '{}', JSON.stringify([validLink, { title: 'Invalid', url: 'javascript:alert(1)' }])]) {
    await rejection(await handleRequest(request(jwt), { ...env, INDEX_LINKS_JSON: index }, keySetFactory), 503);
  }
});
