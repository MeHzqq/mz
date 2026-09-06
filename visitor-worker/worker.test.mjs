import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './worker.mjs';
function request(path = 'info', headers = {}, method = 'GET', origin = 'https://mehz.org') {
  const req = new Request(origin + '/_visitor/' + path, { headers, method });
  Object.defineProperty(req, 'cf', { value: { city: 'Example City', country: 'AU', asn: 64500, asOrganization: 'Example Network', tlsVersion: 'TLSv1.3', secretField: 'do-not-return' } });
  return req;
}

test('returns only request metadata and prevents shared caching', async () => {
  const res = handleRequest(request('info', { 'CF-Connecting-IP': '203.0.113.42', Cookie: 'secret-session', Authorization: 'private-token' }));
  const data = await res.json();
  assert.deepEqual(data, { ip: '203.0.113.42', city: 'Example City', country: 'AU', organization: 'Example Network', asn: 64500, tls: 'TLSv1.3' });
  assert.match(res.headers.get('Cache-Control'), /no-store/);
  assert.equal(res.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});
test('does not expose other paths, alternate hosts or cross-origin callers', () => {
  assert.equal(handleRequest(request('other')).status, 404);
  assert.equal(handleRequest(request('info', {}, 'GET', 'https://other.example')).status, 404);
  assert.equal(handleRequest(request('info', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal(handleRequest(request('info', { Origin: 'https://other.example' })).status, 403);
  assert.equal(handleRequest(request('info', {}, 'POST')).status, 405);
});
test('bounded download sample and bodyless HEAD/ping', async () => {
  assert.equal(handleRequest(request('download?bytes=1048577')).status, 400);
  assert.equal(handleRequest(request('download?bytes=-1')).status, 400);
  const res = handleRequest(request('download?bytes=4096'));
  assert.equal((await res.arrayBuffer()).byteLength, 4096);
  assert.equal(res.headers.get('Content-Encoding'), 'identity');
  assert.equal((await handleRequest(request('download', {}, 'HEAD')).arrayBuffer()).byteLength, 0);
  assert.equal(handleRequest(request('ping')).status, 204);
});
