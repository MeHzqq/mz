# Wedding entrance

The Cloudflare Worker serves the W entrance at `/wedding`, `/wedding/` and
`/wedding/index.html`. The directory is returned only after the server validates
a signed session cookie. `POST /wedding/unlock` checks the code; `POST
/wedding/lock` clears the session. Sessions expire after eight hours and the
cookie is session-only, Secure, HttpOnly and SameSite=Strict.

Set `ACCESS_CODE` and a random, at least 32-character `COOKIE_SECRET` as Cloudflare
Worker secrets, never source files. Updating either invalidates existing
sessions. The login endpoint uses the Cloudflare rate limiter; its limits are
approximate and apply separately at each Cloudflare location.

The directory is kept locally at `_content/directory.html` and bundled as a text
module by Wrangler. That directory is ignored by Git. The whole Worker folder
is excluded from GitHub Pages. The public `wedding/index.html` contains only the
entrance as a fail-closed fallback; do not put the directory back there.

The directory was public before this change. Its earlier version remains in
Git history and any copies already downloaded. The entrance protects the live
route; it cannot withdraw those existing copies.

Run `node --test test/handler.test.mjs`, then `wrangler deploy --dry-run` before
`wrangler deploy`. Preserve `workers_dev: false`, `preview_urls: false`, the
origin check, and the Pages exclusions. Check the entrance, wrong code, correct
code, session reuse and locking after each release. Never commit real codes,
session cookies, signing secrets or the `_content` directory.
