# Final Security Remediation Report

Date: 2026-11-24. Scope: `D:\CodeVideo` final Phase 1 security remediation. No original audit or untracked work was deleted. No commit or push was made.

## Classification Summary

| Issue | Classification | Evidence |
| --- | --- | --- |
| SEC-001a: untrusted/edited/imported/AI scene source executes before rendering | FIXED AND VERIFIED | `apps/render-worker/src/index.ts` runs only `project.source === 'bundled'`; `packages/scene-runtime/src/index.ts` rejects non-bundled sources; `packages/animation-engine/src/index.test.ts › animation source validation › rejects network and global access`, `› rejects imports outside the sandbox allowlist`, and `› rejects dynamic imports` passed. |
| SEC-001b: genuine capability-isolated runtime for scene code | NOT FIXED | No separate capability-isolated renderer/preview was introduced. `new Function` remains in trusted bundled-source motion assets; SEC-001 original P0 architecture item is still open. |
| SEC-002: browser receives permanent API secrets / worker token / trusted identity headers | FIXED AND VERIFIED | `apps/web/src/pages/RenderPage.tsx` declares only `__codevideo_renderProject`; no `VITE_*` API secret is used. `apps/api/src/index.test.ts › rejects missing and invalid proxy identity` and `› rejects worker bearer tokens on user routes and browser identity on worker routes` passed. |
| SEC-002: client-supplied owner ID trusted by API | FIXED AND VERIFIED | `apps/api/src/auth.ts › ownerFromProxy()` derives owner only from validated proxy secret plus header. `apps/api/src/index.test.ts › isolates jobs and cancellation across owners` and `› allows only the owner to download a completed output` passed. |
| SEC-002: job payload/output enumeration by guessing IDs | FIXED AND VERIFIED | API list/status/cancel/output handlers are owner-scoped in `apps/api/src/index.ts`; `apps/api/src/index.test.ts › isolates jobs and cancellation across owners` and `› allows only the owner to download a completed output` passed. |
| SEC-003: no resource, concurrency, or queue limits | FIXED AND VERIFIED | `apps/api/src/limits.ts`, `packages/render-jobs/src/index.ts` guard/lock. `apps/api/src/index.test.ts › rejects excessive resolution, scene count and source size` and `› enforces per-owner concurrency under the job creation lock` passed; `packages/render-jobs/src/index.test.ts › does not create a job when the admission guard rejects it` passed. |
| SEC-004: worker runs with default browser sandbox disabled | FIXED AND VERIFIED | `apps/render-worker/src/index.ts` calls `chromium.launch({ headless: true })` with no `--no-sandbox`; verified by source inspection and a full smoke render through real Chromium. |
| SEC-004: container runtime hardening | FIXED BUT NOT VERIFIED | Dockerfiles-compose were hardened and `docker compose config --quiet` passed, but no Docker daemon was available, so image build/run and cgroup enforcement were not verified. See `audit/remediation/docker-security-final.md`. |

## Implemented Trust Boundary

- `docker/nginx.conf.template` terminates HTTP Basic auth server-side, sets `X-CodeVideo-User` from `$remote_user`, overwrites any client-supplied identity header, injects `X-CodeVideo-Proxy-Secret`, and sets `client_max_body_size 1m`.
- `docker/web-entrypoint.sh` fails closed when `CODEVIDEO_PROXY_SECRET` is absent and generates the htpasswd file from server-side environment/config.
- `apps/api/src/index.ts` requires `CODEVIDEO_PROXY_SECRET` and `CODEVIDEO_WORKER_TOKEN` at startup. All non-public user routes require validated proxy identity; `/api/internal/*` requires worker bearer token only.
- API container has no published port in `docker-compose.yml`; worker runs only on the internal `backend` network with no browser-facing port.
- Local Vite dev proxy injects identity server-side from `CODEVIDEO_DEV_USER`; it is explicitly documented as local-only and not a production identity mechanism.

## Negative Controls Verified

- Missing/invalid proxy identity: HTTP 401.
- Worker token on a user route: HTTP 401.
- Browser proxy identity on an internal worker route: HTTP 401.
- Cross-owner job status/cancel: HTTP 404.
- Cross-owner completed output download: HTTP 404.
- Unauthenticated output download: HTTP 401.
- Late completion after cancellation does not publish an output.
- Completion with a missing output file returns HTTP 409.

## Final Security Decision

Security remediation is incomplete. SEC-001b remains a critical unresolved P0 item from the original audit, and Docker runtime hardening remains unexecuted. Final Phase 1 status must remain **NOT APPROVED**.
