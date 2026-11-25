# Final Docker/Worker Security Report

Date: 2026-11-24. Scope: `D:\CodeVideo` final Phase 1 container and worker hardening.

## Classification Summary

| Issue | Classification | Evidence |
| --- | --- | --- |
| API port exposure | FIXED AND VERIFIED | `docker-compose.yml` gives `api` no `ports:`; only `web` publishes `8080:8080`; worker has no ports. Verified by final `docker compose config --quiet` exit 0 and compose file inspection. |
| Worker browser sandbox flag | FIXED AND VERIFIED | `apps/render-worker/src/index.ts` launches Chromium without `--no-sandbox`; full MP4 smoke render passed using that code path. |
| Non-root API/worker/nginx processes | FIXED BUT NOT VERIFIED | `docker/api.Dockerfile` uses uid `10001`, `docker/worker.Dockerfile` uses uid `10001`, and `docker/web.Dockerfile` now uses `USER nginx` on port `8080`; compose tmpfs mounts are uid/gid `101` for nginx state. Image build/run could not be executed because Docker daemon was unavailable. |
| Capability and privilege restrictions | FIXED BUT NOT VERIFIED | `docker-compose.yml` sets `cap_drop: ALL`, `no-new-privileges:true`, `read_only`, `tmpfs`, and `deploy.resources.limits.pids`. Config syntax verified; runtime enforcement not verified. |
| Resource limits | FIXED BUT NOT VERIFIED | CPU/memory/pids limits are present in compose. `docker compose config --quiet` passed; cgroup enforcement not executed. |
| Secret leakage into image build context | FIXED AND VERIFIED | `.dockerignore` now excludes `.env` and `.env.*` (with `!.env.example`). A temporary `.env` used for config validation was removed; `Test-Path .env` returned `False`. |
| nginx Basic auth/identity injection | FIXED BUT NOT VERIFIED | `docker/nginx.conf.template` and `docker/web-entrypoint.sh` implement server-side identity overwrite and fail-closed secret validation. Container image build was blocked by unavailable Docker daemon. |
| Web entrypoint shell syntax | NOT VERIFIED | Host has no POSIX `sh`; WSL `bash.exe -n` failed with `execvpe(/bin/bash) failed: No such file or directory`. Docker image build would have validated this but daemon was unavailable. |

## Compose Validation

Initial `docker compose config --no-interpolate --quiet` passed but did not catch a semantic conflict: `pids_limit` plus `deploy.resources.limits.pids`. This was fixed by removing top-level `pids_limit` and keeping `pids` under `deploy.resources.limits`.

Final validation used a temporary `.env` with dummy values only:

```powershell
$env:CODEVIDEO_PROXY_SECRET='build-validation-only'
$env:CODEVIDEO_WORKER_TOKEN='build-validation-only'
$env:CODEVIDEO_USERS='build:validation-only'
$env:WEB_ORIGIN='http://localhost:8080'
docker compose -f docker-compose.yml config --quiet
```

Actual result: `compose_full_config_exit=0`.

## Docker Build Attempt

`docker compose -f docker-compose.yml build web` could not run:

```text
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

Actual result: `docker_web_build_exit=1` due to unavailable daemon, not a compose/Dockerfile error.

## Hardening Implemented

- API not published; worker not published; API and worker on internal `backend` network only.
- Separate `render-data` (jobs/state) and `render-outputs` (completed MP4) volumes.
- Worker image: Node 22 bookworm, non-root user, Playwright browsers under `/opt/ms-playwright`, FFmpeg, `RENDER_OUTPUTS_DIR=/outputs`, `NODE_OPTIONS=--max-old-space-size=1024`.
- API image: Node 22 Alpine, non-root uid `10001`, builds `render-jobs`, `project-schema`, and `api`, owns `/data/outputs`.
- Web image: nginx Alpine with `apache2-utils` and `gettext`; listens on `8080`, runs as `nginx`, writes htpasswd/config to uid/gid `101` tmpfs mounts, and fails closed without proxy secret.
- All services use `cap_drop: ALL`, `no-new-privileges:true`, `read_only`, tmpfs, pids/CPU/memory limits, and healthchecks where applicable.
- Documentation explicitly states that gVisor/seccomp/AppArmor are not configured and container isolation is not a complete security boundary.

## Final Docker Decision

Compose configuration is valid and manifest-level hardening is present, but container images and runtime restrictions were not built or executed. Final Phase 1 status must remain **NOT APPROVED**.
