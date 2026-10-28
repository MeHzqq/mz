# mehz.org

The homepage is the existing static GitHub Pages site. Its top-left `mehz.org`
link opens `/private/`. Cloudflare Access displays a Google sign-in screen and
allows only approved accounts. A small Cloudflare Worker verifies that session
again before it renders the private index or serves Pathway Designer at
`/private/tools/pathway/`.

The live Google login and Worker were configured and tested before the homepage
link was published. The steps below document how to maintain or recreate that
setup. Future Worker code updates require a direct Wrangler deployment;
automatic Git builds are not connected. No Google credentials, approved email
addresses, or configured private-link secrets are in this repo. The built-in
Pathway destination and its source code are in the repository.

## How it works

1. A visitor clicks `mehz.org` and opens `https://mehz.org/private/`.
2. Cloudflare Access prompts for Google sign-in when a session is needed.
3. The Access policy checks that Google authenticated an approved email.
4. The Worker checks the signed Access token, the intended application, its
   lifetime, and a second exact email allowlist.
5. The Worker renders the index with the signed-in email, configured private
   links, a built-in **Pathway Designer** link and a **Sign out** link. Later
   visits reuse the Access session until it expires.
6. Opening Pathway Designer checks authorization again for every HTML,
   stylesheet, JavaScript module and module-worker request, including direct
   file URLs and `HEAD` requests.

The public root and Matrix animation stay on GitHub Pages. Only `/private*`
routes to the Worker. It implements `/private`, `/private/`, the Pathway root
and the explicit file list in `private-worker/src/pathway.mjs`; other paths
return 404. Private responses use `no-store` headers. There is no browser-side
login flag or unauthenticated private JSON endpoint.

Pathway files live in `private-worker/_assets/private/tools/pathway/` and are
uploaded with the Worker through its `ASSETS` binding. `run_worker_first: true`
in `private-worker/wrangler.jsonc` ensures asset requests run through the
authorization code first. Keep it enabled, with `html_handling` and
`not_found_handling` set to `none`: missing files return 404, asset failures
return 503, and neither case falls back to GitHub Pages or another tool page.
Keep `workers_dev` and `preview_urls` disabled.

The root `_config.yml` excludes `private-worker` from GitHub Pages; the
`_assets` directory also starts with an underscore so Jekyll omits it by
default. Preserve both protections, and do not replace the Pages build with a
raw repository upload that ignores these exclusions. The former
`/tools/pathway/` location contains only a move notice and browser redirect.

## Moving Pathway behind the existing login

Use this order when deploying the migration or maintaining its two delivery
paths. The account setup below remains applicable.

1. Confirm the existing Access application still covers both `/private` and
   `/private/*`, with the same AUD and approved-email policy. Preserve the
   Worker's existing `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_EMAILS` and
   optional `INDEX_LINKS_JSON` secrets; this migration does not require replacing
   them or creating a new Access application.
2. From `private-worker`, run `pnpm install --frozen-lockfile`, `pnpm test` and
   `pnpm run build`, then deploy with `pnpm run deploy`. This publishes the
   authenticated asset bundle and index link together. Verify the protected
   tool and a direct module URL before publishing the Pages changes.
3. Publish the GitHub Pages changes together: `_config.yml` exclusions, removal
   of the former public tool assets, and the redirect-only
   `tools/pathway/index.html`. Wait for the Pages deployment to finish. The old
   public tool remains available until this removal has reached the public
   origin and any cached copies have expired or been purged.
4. Verify that `/tools/pathway/` only redirects to the private location, and
   that old URLs such as `/tools/pathway/app.mjs`, `/tools/pathway/solver.mjs`
   and `/tools/pathway/worker.mjs` return no tool content. Check both
   `mehz.org` and the direct GitHub Pages origin. Also verify that neither
   `/private-worker/_assets/private/tools/pathway/index.html` nor
   `/private/tools/pathway/index.html` exposes the tool at the Pages origin.
   If Cloudflare still serves an old public asset, purge that cached URL and
   repeat the check.
5. In a fresh session, confirm the new tool page and direct asset URLs require
   login. An approved account must load the tool and its module worker; an
   unapproved account must be denied. Confirm configured directory links,
   sign-out, the public homepage and Matrix animation still work.

Website authentication does not make this public repository or its Git history
confidential. Pathway was previously public, and this migration cannot retract
source or files already obtained. Keep credentials and confidential content
out of the repository even when their website route requires login.

## One-time account setup

### 1. Confirm Cloudflare routing

The public site's response headers indicate GitHub Pages behind Cloudflare.
Confirm `mehz.org` is an active zone in your Cloudflare account, its GitHub Pages
DNS record is **Proxied**, and HTTPS is enabled. Preserve the existing DNS target
and GitHub Pages settings. Enable **Always Use HTTPS** if it is not already on.

Create or use your Cloudflare Zero Trust organization and note its team domain,
for example `https://your-team.cloudflareaccess.com`.

### 2. Connect Google to Cloudflare Access

In Google Cloud / Google Auth Platform, configure an OAuth consent screen for
this login application, then create an OAuth client of type **Web application**.
For personal Gmail accounts, choose an external audience; if the Google app is
in testing, add the approved accounts as test users where required.

Use your actual team domain in both of these fields:

| Google field | Value |
| --- | --- |
| Authorized JavaScript origins | `https://your-team.cloudflareaccess.com` |
| Authorized redirect URIs | `https://your-team.cloudflareaccess.com/cdn-cgi/access/callback` |

In Cloudflare, open **Zero Trust → Integrations → Identity providers → Add new
identity provider → Google**. Enter the Google client ID and client secret,
enable PKCE, save, and use the identity provider's Test action.

Keep the Google client secret in that Cloudflare form. The Worker does not need
it. Do not put it in GitHub, HTML, or JavaScript.

Reference: [Cloudflare's Google identity-provider guide](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/).

### 3. Protect the private paths

Create **one Self-hosted Access application** named **mehz.org Private Index**.
Add both public-hostname entries to that same application:

| Domain | Path |
| --- | --- |
| `mehz.org` | `private` |
| `mehz.org` | `private/*` |

Both entries must share the same application and **Application Audience (AUD)**.
The wildcard path alone does not cover the slashless `/private` path. Keep the
public root outside the application. Check that no more-specific Access
application or Worker route overrides these paths.

Choose a **6 hour** application session duration. Under login methods, disable
accepting all identity providers and select **Google only**. Leave the login
method selection screen enabled if you want visitors to see the Google button.

Under Additional settings, enable **HTTP Only** and **Binding Cookie**, and set
**Same Site Attribute** to **Lax**. Leave **Enforce cookie path attribute** off:
the sign-out endpoint is outside `/private`, so it must receive the application's
cookie to clear the session. If changing this setting after testing, remove old
path-scoped test cookies from that browser to avoid duplicate-cookie redirects.

Create an **Allow** policy with:

- **Include → Emails:** each approved Google email address.
- **Require → Login Methods:** the Google identity provider created above.

Put email and login-method conditions in these separate Include and Require
sections. Multiple Include rules are alternatives, so putting Google in an
Include rule could allow every Google user. Do not add an Everyone, Bypass,
service-token, or email one-time-code alternative to this application.

Copy the application's **AUD tag** for the next step. It is a 64-character
hexadecimal value.

References: [Application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) ·
[Access policy rules](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).

### 4. Configure and deploy the Worker

Use Node.js 22+ and the pnpm version recorded in `private-worker/package.json`.
From the `private-worker` folder:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm exec wrangler login
pnpm run deploy
```

`build` is a dry run and does not deploy. `deploy` publishes the Worker and its
asset bundle, and attaches the route in `wrangler.jsonc`. For a new setup it
returns 503 until its configuration is present. For an existing setup, preserve
the current secrets and Access application rather than repeating account
creation. If Cloudflare reports a quota or paid-plan prompt, review that before
proceeding.

Set these values as **Worker secrets**, either in the Worker dashboard under
Settings → Variables and Secrets, or using the commands below. Enter the values
at the prompts; do not put values into command-line history.

The dashboard may create a new version when secrets change without deploying
it. In **Deployments → Version History**, promote the version containing the
updated secrets to 100%, then verify the live page. This also applies when
changing approved emails or private links later.

| Secret | Required value |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | `https://your-team.cloudflareaccess.com` |
| `ACCESS_AUD` | The Access application's AUD tag |
| `ALLOWED_EMAILS` | Comma-separated approved email addresses, matching the Access policy |
| `INDEX_LINKS_JSON` | Optional JSON array of additional links; omit it or use `[]` to show only the built-in Pathway Designer link |

```sh
pnpm exec wrangler secret put ACCESS_TEAM_DOMAIN
pnpm exec wrangler secret put ACCESS_AUD
pnpm exec wrangler secret put ALLOWED_EMAILS
pnpm exec wrangler secret put INDEX_LINKS_JSON
```

An illustrative `INDEX_LINKS_JSON` value is:

```json
[
  {
    "title": "Example tool",
    "url": "https://example.com/tool",
    "description": "An optional short description."
  }
]
```

Replace the example with your real links only in Cloudflare's secret value.
Each entry needs `title` and `url`; `description` is optional. URLs can be HTTPS
addresses or root-relative paths such as `/another-tool/`. Script URLs,
protocol-relative URLs and embedded credentials are rejected. Links remain in
the current tab. The Worker preserves configured links in their existing order
and appends Pathway Designer unless an equivalent destination is already
present. With no optional links, the index still shows Pathway Designer; it is
not an empty directory. Do not overwrite an existing `INDEX_LINKS_JSON` secret
just to add the built-in tool.

Confirm that the Worker route is `mehz.org/private*`, and that **workers.dev** and
**preview URLs** are disabled. These settings are also in `wrangler.jsonc`.
The Worker rejects requests from origins other than `https://mehz.org`.

References: [Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) ·
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) ·
[Access JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

### 5. Verify live behavior

For a new setup, check the deployed `/private/` before enabling the homepage
link. For the Pathway migration, also follow the deployment order above:

- In a fresh browser session, it shows the Google login screen.
- An approved Google account reaches the index; an unapproved account is denied.
- `/private` is also protected and redirects to `/private/` after authorization.
- Opening the URL directly and adding query parameters still require login.
- `/private/tools/pathway/` and every file in `PATHWAY_FILES` require an
  approved session. Test direct module and stylesheet URLs as well as the page;
  a successful login screen alone does not verify asset protection.
- Sign out clears site access. Cloudflare notes revocation can take about
  20–30 seconds; this also signs out the user's other Cloudflare Access apps,
  but does not sign them out of Google itself.
- The public homepage and Matrix animation remain accessible without login.
- Direct GitHub Pages requests have no private index or private tool asset tree
  to return, and the old public Pathway module URLs no longer serve the tool.
- Check the public repository contains no real emails, client secret or private
  link data. Keep any future private content out of the Pages publishing source.

For a new setup, once these checks pass, merge the homepage link change. The
button then opens the working protected index.

## Updating access or links

To approve someone, update both the Access policy and the Worker's
`ALLOWED_EMAILS` secret. To remove someone, remove them from both and revoke
their Access sessions. The Worker reads the allowlist on each request, including
for already-issued tokens. Updating `INDEX_LINKS_JSON` changes the directory
without publishing the links in GitHub.

This protects the index and Pathway files served by this Worker. Other linked
tools need their own access control if they contain private information.
GitHub Pages and this public repository are not private storage.

## Verification and recovery

`pnpm test` uses locally generated signing keys and real signed JWTs to check
authentication, authorization, session lifetime, alternate origins, response
caching and safe link rendering. Private-tool checks also need to cover direct
asset requests, the built-in link and missing-file behavior. Local checks do
not replace the live Google/Cloudflare and Pages-origin checks above.
`pnpm run build` bundles the actual Worker with Wrangler without publishing it.

If rollout needs to be paused, change the homepage brand link back to `/`, and
keep Access enabled while investigating the Worker. Never introduce a static
copy of the tool or private content as a fallback, and do not restore its old
public assets to recover the service. Disable the Worker route only after any
private content at the underlying origin has been ruled out.
