import { createRemoteJWKSet, jwtVerify } from 'jose';
import { renderPage, renderIndex, readLinks } from './page.mjs';

let cachedIssuer;
let cachedKeys;

function remoteKeys(issuer) {
  if (cachedIssuer !== issuer) {
    cachedKeys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5000,
    });
    cachedIssuer = issuer;
  }
  return cachedKeys;
}

function configuration(env) {
  const issuer = (env.ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer)) {
    throw new Error('Invalid Access team domain');
  }
  if (!/^[a-f0-9]{64}$/.test(env.ACCESS_AUD || '')) throw new Error('Missing Access audience');
  const origin = new URL(env.SITE_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.SITE_ORIGIN) {
    throw new Error('Invalid site origin');
  }
  const emails = (env.ALLOWED_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  if (!emails.length || emails.some(email => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))) {
    throw new Error('Missing or invalid email allowlist');
  }
  return { issuer, audience: env.ACCESS_AUD, origin: origin.origin, emails: new Set(emails) };
}

function response(request, title, content, status = 200, extraHeaders = {}) {
  const nonce = crypto.randomUUID();
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    ...extraHeaders,
  };
  return new Response(request.method === 'HEAD' ? null : renderPage(title, content, nonce), { status, headers });
}

// keySetFactory is a test seam for real, locally signed JWTs. The deployed entry
// point always uses Cloudflare's HTTPS signing-key endpoint, never request input.
export async function handleRequest(request, env, keySetFactory = remoteKeys) {
  const url = new URL(request.url);
  if (url.pathname !== '/private' && url.pathname !== '/private/') {
    return response(request, 'Page not found', '<p>This page does not exist.</p>', 404);
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return response(request, 'Method not allowed', '<p>This page can only be opened in your browser.</p>', 405, { Allow: 'GET, HEAD' });
  }

  let config;
  try {
    config = configuration(env);
  } catch {
    return response(request, 'Temporarily unavailable', '<p>The private index is not available yet. Please try again later.</p>', 503);
  }
  if (url.origin !== config.origin) {
    return response(request, 'Page not found', '<p>This page does not exist.</p>', 404);
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) {
    return response(request, 'Sign in required', '<p>Sign in to open the private index.</p><p><a href="/">Return home</a></p>', 401);
  }
  let identity;
  try {
    const { payload } = await jwtVerify(token, keySetFactory(config.issuer), {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'nbf', 'sub', 'email', 'type'],
      clockTolerance: 5,
    });
    if (payload.type !== 'app' || typeof payload.sub !== 'string' || !payload.sub ||
        typeof payload.email !== 'string' || typeof payload.iat !== 'number' ||
        payload.iat > Date.now() / 1000 + 5 || payload.exp <= payload.iat) {
      throw new Error('Not a valid user session');
    }
    identity = payload;
  } catch {
    return response(request, 'Please sign in again', '<p>Your sign-in could not be verified.</p><p><a href="/cdn-cgi/access/logout">Sign out and try again</a></p>', 401);
  }

  if (!config.emails.has(identity.email.trim().toLowerCase())) {
    return response(request, 'Access not approved', '<p>This Google account does not have access to the private index.</p><p><a href="/cdn-cgi/access/logout">Sign out</a></p>', 403);
  }
  if (url.pathname === '/private') {
    return response(request, 'Private index', '', 302, { Location: '/private/' });
  }

  try {
    // Private link titles and destinations live in a Worker secret, never in the
    // public repository, static HTML, or a browser-side JavaScript bundle.
    const links = readLinks(env.INDEX_LINKS_JSON, config.origin);
    return response(request, 'Index', renderIndex(identity.email, links));
  } catch {
    return response(request, 'Temporarily unavailable', '<p>The private index could not be loaded. Please try again later.</p>', 503);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
