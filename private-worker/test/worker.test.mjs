import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { handleRequest } from '../src/worker.mjs';
import { PATHWAY_ROOT, PATHWAY_FILES } from '../src/pathway.mjs';

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

test('an authorized account sees the built-in Pathway link when no secret links are configured', async () => {
  const jwt = await token();
  for (const index of [undefined, '', '[]']) {
    const response = await handleRequest(request(jwt), { ...env, INDEX_LINKS_JSON: index }, keySetFactory);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes(`${env.SITE_ORIGIN}${PATHWAY_ROOT}`));
    assert.match(body, /Pathway Designer/);
    assert.doesNotMatch(body, /No links added yet\./);
  }
});

const assetMarker = 'PRIVATE_PATHWAY_ASSET_TEST_MARKER';
const representativeToolPaths = [PATHWAY_ROOT, ...['app.mjs', 'solver.mjs', 'worker.mjs', 'style.css'].map(file => PATHWAY_ROOT + file)];
const assetBody = file => `${assetMarker}:${file}`;

function assetFixture(overrides = {}) {
  const calls = [];
  const ASSETS = {
    async fetch(input, init) {
      const assetRequest = input instanceof Request ? input : new Request(input, init);
      calls.push(assetRequest);
      const file = new URL(assetRequest.url).pathname.split('/').at(-1);
      assert.ok(PATHWAY_FILES.includes(file), `Only an allowlisted asset should reach the binding: ${file}`);
      return new Response(assetRequest.method === 'HEAD' ? null : assetBody(file), {
        headers: {
          'Content-Type': file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'text/javascript',
          'Cache-Control': 'public, max-age=86400',
          'CDN-Cache-Control': 'public, max-age=86400',
          'Cloudflare-CDN-Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
          ETag: '"asset-test-etag"',
        },
      });
    },
  };
  return { calls, settings: { ...env, ASSETS, ...overrides } };
}

function assertPrivateAssetHeaders(response, file) {
  assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('ETag'), null);
  const type = response.headers.get('Content-Type');
  assert.match(type, file.endsWith('.html') ? /^text\/html\b/ : file.endsWith('.css') ? /^text\/css\b/ : /^(?:text|application)\/javascript\b/);
  const policy = response.headers.get('Content-Security-Policy');
  assert.match(policy, /(?:^|;)\s*default-src 'none'(?:;|$)/);
  assert.match(policy, /(?:^|;)\s*script-src [^;]*'self'/);
  assert.match(policy, /(?:^|;)\s*worker-src [^;]*'self'/);
  assert.match(policy, /(?:^|;)\s*frame-ancestors 'none'(?:;|$)/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-(?:inline|eval)'/);
}

async function rejectTool(response, status) {
  const body = await rejection(response, status);
  assert.ok(!body.includes(assetMarker), 'Rejected request must not expose tool bytes');
}

test('every declared Pathway asset is authenticated, has its own MIME type, and is never publicly cached', async () => {
  const jwt = await token();
  for (const file of PATHWAY_FILES) {
    const fixture = assetFixture();
    const response = await handleRequest(request(jwt, { path: PATHWAY_ROOT + file }), fixture.settings, keySetFactory);
    assert.equal(response.status, 200, file);
    assert.equal(await response.text(), assetBody(file), file);
    assertPrivateAssetHeaders(response, file);
    assert.equal(fixture.calls.length, 1);
    assert.equal(new URL(fixture.calls[0].url).pathname, PATHWAY_ROOT + file);
  }
});

test('the authenticated tool directory maps internally to index.html without an asset redirect', async () => {
  const fixture = assetFixture();
  const response = await handleRequest(request(await token(), { path: PATHWAY_ROOT }), fixture.settings, keySetFactory);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Location'), null);
  assert.equal(await response.text(), assetBody('index.html'));
  assert.equal(new URL(fixture.calls[0].url).pathname, PATHWAY_ROOT + 'index.html');
  assertPrivateAssetHeaders(response, 'index.html');
});

test('HTML, app modules, solver modules, worker scripts and CSS reject invalid or unapproved identities before fetching assets', async () => {
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    ['missing assertion', undefined, 401],
    ['malformed assertion', 'not-a-jwt', 401],
    ['oversized assertion', 'x'.repeat(16385), 401],
    ['unapproved email', await token({ email: 'outsider@example.com' }), 403],
    ['expired session', await token({ iat: now - 600, exp: now - 120 }), 401],
    ['wrong audience', await token({ aud: 'b'.repeat(64) }), 401],
    ['wrong issuer', await token({ iss: 'https://other.cloudflareaccess.com' }), 401],
    ['wrong signing key', await token({}, unrelatedKeys.privateKey), 401],
  ];
  for (const path of representativeToolPaths) {
    for (const [name, jwt, status] of cases) {
      const fixture = assetFixture();
      await rejectTool(await handleRequest(request(jwt, {
        path, headers: { 'Cf-Access-Authenticated-User-Email': allowedEmail },
      }), fixture.settings, keySetFactory), status);
      assert.equal(fixture.calls.length, 0, `${name}: ${path}`);
    }
  }
});

test('removing an account immediately blocks later module fetches with its existing token', async () => {
  const fixture = assetFixture();
  const jwt = await token();
  const path = PATHWAY_ROOT + 'solver.mjs';
  assert.equal((await handleRequest(request(jwt, { path }), fixture.settings, keySetFactory)).status, 200);
  fixture.settings.ALLOWED_EMAILS = 'second@example.com';
  await rejectTool(await handleRequest(request(jwt, { path }), fixture.settings, keySetFactory), 403);
  assert.equal(fixture.calls.length, 1);
});

test('alternate origins cannot obtain any representative Pathway resource', async () => {
  const jwt = await token();
  for (const origin of ['http://mehz.org', 'https://www.mehz.org', 'https://mehz-private-index.example.workers.dev', 'https://mehz.org:8443', 'https://mehzqq.github.io']) {
    for (const path of representativeToolPaths) {
      const fixture = assetFixture();
      await rejectTool(await handleRequest(request(jwt, { path, origin }), fixture.settings, keySetFactory), 404);
      assert.equal(fixture.calls.length, 0);
    }
  }
});

test('unknown, encoded, case-changed and traversal-like tool paths never reach the asset store', async () => {
  const jwt = await token();
  const paths = [
    '/tools/pathway/app.mjs', '/private-tools/pathway/app.mjs', '/private/tools/pathway-extra/app.mjs',
    PATHWAY_ROOT + 'missing.mjs', PATHWAY_ROOT + 'app.mjs.map', PATHWAY_ROOT + '.env',
    PATHWAY_ROOT + 'App.mjs', PATHWAY_ROOT + 'app.mjs/', PATHWAY_ROOT + 'nested/app.mjs',
    PATHWAY_ROOT + '/app.mjs', PATHWAY_ROOT + '%61pp.mjs', PATHWAY_ROOT + 'app.mjs%00',
    '/private/tools/pathway%2Fapp.mjs', '/private/tools/pathway%5Capp.mjs',
    '/private/tools/pathway%252Fapp.mjs', PATHWAY_ROOT + '../app.mjs',
    PATHWAY_ROOT + '%2e%2e/solver.mjs', PATHWAY_ROOT + '%252e%252e/solver.mjs',
  ];
  for (const path of paths) {
    const fixture = assetFixture();
    await rejectTool(await handleRequest(request(jwt, { path }), fixture.settings, keySetFactory), 404);
    assert.equal(fixture.calls.length, 0, path);
  }
});

test('slashless Pathway URLs redirect only after authorization and HEAD redirects have no body', async () => {
  const path = PATHWAY_ROOT.slice(0, -1) + '?mode=review';
  const fixture = assetFixture();
  await rejectTool(await handleRequest(request(undefined, { path }), fixture.settings, keySetFactory), 401);
  await rejectTool(await handleRequest(request(await token({ email: 'outsider@example.com' }), { path }), fixture.settings, keySetFactory), 403);
  for (const method of ['GET', 'HEAD']) {
    const response = await handleRequest(request(await token(), { path, method }), fixture.settings, keySetFactory);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), PATHWAY_ROOT + '?mode=review');
    assert.match(response.headers.get('Cache-Control'), /no-store/);
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
  assert.equal(fixture.calls.length, 0);
});

test('tool HEAD requests authenticate normally and expose no body', async () => {
  const jwt = await token();
  for (const path of representativeToolPaths) {
    const fixture = assetFixture();
    const accepted = await handleRequest(request(jwt, { path, method: 'HEAD' }), fixture.settings, keySetFactory);
    assert.equal(accepted.status, 200);
    assert.equal(await accepted.text(), '');
    assertPrivateAssetHeaders(accepted, path === PATHWAY_ROOT ? 'index.html' : path.split('/').at(-1));
    assert.equal(fixture.calls[0].method, 'HEAD');
    const rejected = await handleRequest(request(undefined, { path, method: 'HEAD' }), fixture.settings, keySetFactory);
    await rejectTool(rejected, 401);
    assert.equal(fixture.calls.length, 1);
  }
});

test('only GET and HEAD can reach tool assets', async () => {
  const jwt = await token();
  for (const path of representativeToolPaths) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const fixture = assetFixture();
      const response = await handleRequest(request(jwt, { path, method }), fixture.settings, keySetFactory);
      await rejectTool(response, 405);
      assert.equal(response.headers.get('Allow'), 'GET, HEAD');
      assert.equal(fixture.calls.length, 0);
    }
  }
});

test('session, identity, range and conditional headers plus query strings never reach the asset binding', async () => {
  const fixture = assetFixture();
  const response = await handleRequest(request(await token(), {
    path: PATHWAY_ROOT + 'worker.mjs?cache=anything&token=do-not-forward',
    headers: {
      Cookie: 'CF_Authorization=do-not-forward',
      Authorization: 'Bearer do-not-forward',
      'Cf-Access-Authenticated-User-Email': allowedEmail,
      Range: 'bytes=0-10',
      'If-None-Match': '"asset-test-etag"',
      'If-Modified-Since': 'Wed, 21 Oct 2026 07:28:00 GMT',
    },
  }), fixture.settings, keySetFactory);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), assetBody('worker.mjs'));
  assert.equal(new URL(fixture.calls[0].url).search, '');
  assert.deepEqual([...fixture.calls[0].headers], []);
});

test('missing configuration or signing-key failures cannot fetch tool assets', async () => {
  const jwt = await token();
  for (const field of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'SITE_ORIGIN', 'ALLOWED_EMAILS']) {
    const fixture = assetFixture(); delete fixture.settings[field];
    await rejectTool(await handleRequest(request(jwt, { path: PATHWAY_ROOT }), fixture.settings, keySetFactory), 503);
    assert.equal(fixture.calls.length, 0);
  }
  const fixture = assetFixture();
  await rejectTool(await handleRequest(request(jwt, { path: PATHWAY_ROOT }), fixture.settings, () => { throw new Error('Unavailable signing keys'); }), 401);
  assert.equal(fixture.calls.length, 0);
});

test('asset binding absence, exceptions, redirects and non-success statuses fail closed without forwarding bodies', async () => {
  const jwt = await token();
  const failures = [
    ['absent binding', undefined, 503],
    ['throwing binding', { fetch() { throw new Error(assetMarker); } }, 503],
    ...[206, 301, 302, 304, 403, 404, 500].map(status => [
      'asset status ' + status,
      { fetch() { return new Response(status === 304 ? null : assetMarker, { status, headers: { Location: 'https://public.example/tool', 'Cache-Control': 'public, max-age=1000' } }); } },
      status === 404 ? 404 : 503,
    ]),
  ];
  for (const [name, ASSETS, status] of failures) {
    for (const method of ['GET', 'HEAD']) {
      const response = await handleRequest(request(jwt, { path: PATHWAY_ROOT + 'app.mjs', method }), { ...env, ASSETS }, keySetFactory);
      const body = await rejection(response, status);
      assert.ok(!body.includes(assetMarker), name);
      assert.equal(response.headers.get('Location'), null, name);
      if (method === 'HEAD') assert.equal(body, '', name);
    }
  }
});

test('asset access is independent of an invalid private-index links secret', async () => {
  const fixture = assetFixture({ INDEX_LINKS_JSON: '{broken' });
  const response = await handleRequest(request(await token(), { path: PATHWAY_ROOT }), fixture.settings, keySetFactory);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), assetBody('index.html'));
});

test('the private index preserves configured destinations and avoids adding duplicate Pathway links', async () => {
  const jwt = await token();
  for (const existingToolUrl of [null, PATHWAY_ROOT, PATHWAY_ROOT.slice(0, -1), PATHWAY_ROOT + 'index.html', env.SITE_ORIGIN + PATHWAY_ROOT]) {
    const links = [{ title: privateTitle, url: privateUrl }];
    if (existingToolUrl) links.push({ title: 'Existing private tool entry', url: existingToolUrl });
    const response = await handleRequest(request(jwt), { ...env, INDEX_LINKS_JSON: JSON.stringify(links) }, keySetFactory);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes(privateTitle));
    assert.ok(body.includes(privateUrl));
    const destinations = [...body.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1], env.SITE_ORIGIN));
    const toolLinks = destinations.filter(url => url.origin === env.SITE_ORIGIN && [PATHWAY_ROOT, PATHWAY_ROOT.slice(0, -1), PATHWAY_ROOT + 'index.html'].includes(url.pathname));
    assert.equal(toolLinks.length, 1, String(existingToolUrl));
    if (existingToolUrl) assert.ok(body.includes('Existing private tool entry'));
  }
});

test('malformed index configuration fails closed without partial link disclosure', async () => {
  const jwt = await token();
  const validLink = { title: privateTitle, url: privateUrl };
  for (const index of ['{broken', '{}', JSON.stringify([validLink, { title: 'Invalid', url: 'javascript:alert(1)' }])]) {
    await rejection(await handleRequest(request(jwt), { ...env, INDEX_LINKS_JSON: index }, keySetFactory), 503);
  }
});
