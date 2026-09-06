// Public, read-only diagnostics for this visitor. No storage or application logs.
const ORIGIN = 'https://mehz.org';
const BASE = '/_visitor/';
const LIMIT = 1048576;
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};
function reply(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...headers, ...extra } });
}
export function handleRequest(request) {
  const url = new URL(request.url);
  if (url.origin !== ORIGIN || !['info', 'ping', 'download'].some(path => url.pathname === BASE + path)) return reply('{}', 404);
  if (request.method !== 'GET' && request.method !== 'HEAD') return reply('{}', 405, { Allow: 'GET, HEAD' });
  const site = request.headers.get('Sec-Fetch-Site');
  const origin = request.headers.get('Origin');
  if ((site && site !== 'same-origin' && site !== 'none') || (origin && origin !== ORIGIN)) return reply('{}', 403);
  if (url.pathname === BASE + 'ping') return reply(null, 204);
  if (url.pathname === BASE + 'download') {
    const raw = url.searchParams.get('bytes') || String(LIMIT);
    if (!/^\d+$/.test(raw) || Number(raw) < 1024 || Number(raw) > LIMIT) return reply('{}', 400);
    const length = Number(raw);
    const payload = request.method === 'HEAD' ? null : new Uint8Array(length);
    if (payload) for (let offset = 0; offset < length; offset += 65536) crypto.getRandomValues(payload.subarray(offset, Math.min(length, offset + 65536)));
    return reply(payload, 200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(length), 'Content-Encoding': 'identity' });
  }
  const cf = request.cf || {};
  const output = {};
  const values = {
    ip: request.headers.get('CF-Connecting-IP'),
    city: cf.city, region: cf.region, country: cf.country, continent: cf.continent,
    postalCode: cf.postalCode, latitude: cf.latitude, longitude: cf.longitude,
    timezone: cf.timezone, organization: cf.asOrganization, asn: cf.asn,
    http: cf.httpProtocol, tls: cf.tlsVersion, cipher: cf.tlsCipher,
    edge: cf.colo, tcpRtt: cf.clientTcpRtt,
  };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && value && value.length <= 512) output[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
  }
  return reply(request.method === 'HEAD' ? null : JSON.stringify(output));
}
export default { fetch: handleRequest };
