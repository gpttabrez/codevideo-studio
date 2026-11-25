# Security Policy

## Reporting vulnerabilities

Please report suspected vulnerabilities privately through GitHub Security
Advisories for this repository. Do not open a public issue for sensitive
details.

## Deployment trust boundary

The browser never receives a permanent API token, worker token, provider key,
or trusted identity header. In the supported Docker deployment the browser
authenticates with HTTP Basic credentials to the nginx proxy. nginx verifies
those credentials, sets `X-CodeVideo-User` from `$remote_user`, and injects a
server-side `X-CodeVideo-Proxy-Secret`. The API rejects requests without both
headers. The API container is not published; only the proxy can reach it.

`CODEVIDEO_USERS` supports a single-user installation or multiple named users.
Use `CODEVIDEO_HTPASSWD` with pre-hashed bcrypt entries if passwords must not
appear in environment values. Every job stores the authenticated owner and all
status, cancellation, listing, and output routes are owner-scoped. Client-
supplied owner headers are ignored and overwritten by the proxy.

The render worker authenticates to the API separately with
`CODEVIDEO_WORKER_TOKEN` on `/api/internal/*` routes. That token is never
passed to the web image or browser. The worker has only an outputs volume; job
metadata and source stay in the API-only data volume.

Local Vite development uses a server-side proxy that injects
`CODEVIDEO_DEV_USER`; it is a convenience for localhost only and must not be
exposed as a production authentication mechanism.

## Credentials

All AI provider credentials are handled by the API server and are read from
server-side environment variables. The browser never receives API keys.
Generated animation source is validated, but validation is not an isolation
boundary. Only bundled trusted Motion Canvas sources execute; edited,
imported, and AI-generated sources remain inert until a real isolated runtime
is available.

## Container limitations

The worker and API containers run as non-root with dropped capabilities, no
new privileges, read-only root filesystems, tmpfs scratch space, pids limits,
and internal networking. Chromium's sandbox is enabled by default;
`CHROMIUM_DISABLE_SANDBOX` is opt-in only for platforms where the sandbox
cannot run. Host kernel support for user namespaces/seccomp varies; where it
is unavailable, Chromium and container isolation are weaker and the
deployment must not be treated as multi-tenant hardened.

## Supported versions

Security fixes are applied to the latest released minor version.
