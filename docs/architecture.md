# Architecture

CodeVideo Studio is a pnpm/Turbo monorepo split into three applications and composable packages.

## Web app

The web app owns the studio UX and never holds provider credentials, worker credentials, or a permanent API token. In Docker, nginx authenticates the user with HTTP Basic credentials and overwrites `X-CodeVideo-User` and `X-CodeVideo-Proxy-Secret` before proxying to the API. The API is on an internal network and is not published. Local Vite development uses an equivalent server-side proxy with a fixed local identity; it is not a production authentication mechanism.

The dashboard and editor expose an AI Agent route (`#/agent`), but the running build must still be checked after changes. The agent UI reads provider/model status from the API, allows server-side asset upload, selects planning/coding/vision/quick-correction roles, starts and resumes sessions, approves tool proposals, cancels sessions, shows tool logs and checkpoints, and builds a contact sheet from real preview frames. It never sends provider secrets to the browser.

## API

The Fastify API validates all inputs with Zod, enforces server-side render limits under a job-creation lock, persists render jobs on disk, and scopes every user route to the authenticated owner. Internal `/api/internal/*` routes are protected by a separate worker service token and are the only way workers claim jobs or report status. Job metadata, source, uploaded assets, tool workspaces, and agent sessions stay in API-owned data volumes.

Agent session creation accepts explicit model roles but falls back to the configured defaults. Provider credentials come only from server-side `CODEVIDEO_PROVIDERS_JSON`, legacy provider env vars, `OLLAMA_BASE_URL`, or `LOCAL_BRIDGE_TOKEN`. `/api/providers` reports provider capabilities; `/api/model-catalog` reports which configured entries have keys/base URLs. The UI must display a blocker rather than fake a successful model connection.

Asset upload accepts base64 data with a 25 MB body limit, stores the original bytes and metadata under `ASSET_ROOT`/`RENDER_ASSET_ROOT`, and returns an `asset:` source. Asset download and agent preview-frame routes remain owner-scoped. Project import also preserves original uploaded files and hashes.

## Render worker and engines

The render worker receives a claimed job through the authenticated internal API. It supports two engines:

- `svg`: injects the project into the web app's `#/render/:id` page, drives headless Chromium through Playwright, and captures each Motion Canvas frame as PNG.
- `python`: writes the project to a temporary directory and calls `python/codevideo/render.py` through `@codevideo/python-renderer`. PyCairo draws real PNG frames from the project schema, bundled Python packs, camera moves, subtitles, and scene text.

Both engines encode frames with ffmpeg. MP4 uses H.264/yuv420p/faststart, WebM uses VP9, GIF uses palettegen/paletteuse, and audio from `project.audio` is resolved server-side and muxed as AAC. The worker reports progress/completion through internal routes; a monitor polls for cancellation and enforces an execution deadline. The loop is serial; `RENDER_CONCURRENCY` is not implemented.

## Agent worker and tool runtime

The agent worker claims sessions through internal routes and uses a configured model for each role. `withRoles()` scopes a `ModelManager` to the roles selected for that session, so quick-correction sessions do not silently reuse planning/vision defaults.

Tool execution uses copy-on-write workspaces under `packages/tool-runtime/data`. Original uploaded files are immutable; tools operate on workspace copies. Local filesystem operations are allowed only inside the workspace. Python execution is disabled by default. Network access is disabled by default and requires an explicitly approved external runner.

## Sandbox

On Windows 10 there is no in-repository security boundary for untrusted Python or network access. Job Objects and console process control are not sufficient. The system fails closed unless all of these are provided by an approved external runner:

- `CODEVIDEO_SANDBOX_RUNNER`
- `CODEVIDEO_SANDBOX_RUNNER_READY`
- `CODEVIDEO_SANDBOX_RUNNER_WINDOWS_PYTHON_READY`
- `CODEVIDEO_SANDBOX_RUNNER_NETWORK_READY` (only if network access is intentionally allowed)

Do not set these to bypass the boundary. The runner must genuinely isolate filesystem, process, and network access.

## Data model

Projects are portable JSON documents defined by `@codevideo/project-schema`. Scenes own source code; the timeline is derived from scenes via `syncProject`. `SceneSchema.camera` is optional and contains `from`/`to` points with `x`, `y`, `zoom`, and an `ease` mode of `linear` or `easeInOut`. `project.subtitles` carry structured captions. `project.audio` carries audio clips whose `src` may be an `asset:` reference.

Animation source validation is not a security boundary. Only bundled trusted Motion Canvas sources execute. Edited, imported, and AI-generated source is stored for editing but rejected before execution until a genuinely capability-isolated runtime is implemented.

## Current limitations

- No real provider/model was configured during the latest local check; live agent completion and vision feedback remain blocked until server-side credentials are supplied.
- No external Python/Cairo character pack was found in the repository; only bundled `teacher`, `geometric`, and `code-window` packs exist.
- The Docker worker image does not guarantee Python/PyCairo availability.
- Multi-worker production queue/storage is not implemented. Redis/BullMQ and Postgres are not implemented.
