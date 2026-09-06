# mehz.org

The homepage is the existing static GitHub Pages site. Its top-left `mehz.org`
link opens `/private/`. Cloudflare Access displays a Google sign-in screen and
allows only approved accounts. A small Cloudflare Worker verifies that session
again before it renders the private index.

**The code alone does not enable Google sign-in. Complete the Cloudflare and
Google setup below, deploy the Worker, and verify it before merging the homepage
link change.** Until setup is complete, the Worker denies access. No Google
credentials, approved email addresses, or real private links are in this repo.

## How it works

1. A visitor clicks `mehz.org` and opens `https://mehz.org/private/`.
2. Cloudflare Access prompts for Google sign-in when a session is needed.
3. The Access policy checks that Google authenticated an approved email.
4. The Worker checks the signed Access token, the intended application, its
   lifetime, and a second exact email allowlist.
5. The Worker renders the index with the signed-in email, private links and a
   **Sign out** link. Later visits reuse the Access session until it expires.

The public root and Matrix animation stay on GitHub Pages. Only `/private*`
routes to the Worker, which implements `/private` and `/private/`; other paths
return 404. Private responses are never cached. There is no browser-side login
flag or unauthenticated private JSON endpoint.

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

Choose an **8 hour** application session duration. Under login methods, disable
accepting all identity providers and select **Google only**. Leave the login
method selection screen enabled if you want visitors to see the Google button.

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

`build` is a dry run and does not deploy. `deploy` publishes the Worker and
attaches the route in `wrangler.jsonc`. Initially it returns 503 until its
configuration is present. If Cloudflare reports a quota or paid-plan prompt,
review that before proceeding.

Set these values as **Worker secrets**, either in the Worker dashboard under
Settings → Variables and Secrets, or using the commands below. Enter the values
at the prompts; do not put values into command-line history.

| Secret | Required value |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | `https://your-team.cloudflareaccess.com` |
| `ACCESS_AUD` | The Access application's AUD tag |
| `ALLOWED_EMAILS` | Comma-separated approved email addresses, matching the Access policy |
| `INDEX_LINKS_JSON` | Optional JSON array of links; omit it or use `[]` for an empty index |

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
the current tab. The index starts with a clear empty state when no links exist.

Confirm that the Worker route is `mehz.org/private*`, and that **workers.dev** and
**preview URLs** are disabled. These settings are also in `wrangler.jsonc`.
The Worker rejects requests from origins other than `https://mehz.org`.

References: [Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) ·
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) ·
[Access JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

### 5. Verify live behavior, then enable the homepage link

Before merging the homepage change, check the deployed `/private/` directly:

- In a fresh browser session, it shows the Google login screen.
- An approved Google account reaches the index; an unapproved account is denied.
- `/private` is also protected and redirects to `/private/` after authorization.
- Opening the URL directly and adding query parameters still require login.
- Sign out clears site access. Cloudflare notes revocation can take about
  20–30 seconds; this also signs out the user's other Cloudflare Access apps,
  but does not sign them out of Google itself.
- The public homepage and Matrix animation remain accessible without login.
- Direct GitHub Pages requests have no private index or private links to return.
- Check the public repository contains no real emails, client secret or private
  link data. Keep any future private content out of the Pages publishing source.

Once these checks pass, merge the homepage link change. The button then opens
the working protected index.

## Updating access or links

To approve someone, update both the Access policy and the Worker's
`ALLOWED_EMAILS` secret. To remove someone, remove them from both and revoke
their Access sessions. The Worker reads the allowlist on each request, including
for already-issued tokens. Updating `INDEX_LINKS_JSON` changes the directory
without publishing the links in GitHub.

This protects the index and its list of links. Each linked tool needs its own
access control if the tool itself contains private information. GitHub Pages
and this public repository are not private storage.

## Verification and recovery

`pnpm test` uses locally generated signing keys and real signed JWTs to check
authentication, authorization, session lifetime, alternate origins, response
caching and safe link rendering. It does not replace the live Google/Cloudflare
checks above. `pnpm run build` bundles the actual Worker with Wrangler without
publishing it.

If rollout needs to be paused, change the homepage brand link back to `/`, and
keep Access enabled while investigating the Worker. Never introduce a static
copy of private content as a fallback. Disable the Worker route only after any
private content at the underlying origin has been ruled out.
