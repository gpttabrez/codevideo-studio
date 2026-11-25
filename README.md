# CodeVideo Studio

> Open-source, code-driven video creation studio. Write Motion Canvas scenes in TypeScript, edit them on a real timeline, generate storyboards with your own AI provider, and render production-ready video.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![pnpm](https://img.shields.io/badge/pnpm-10.x-ff5b3f.svg)](https://pnpm.io)

## Features

- **Code-first animation** — every scene is TypeScript using Motion Canvas 3.
- **Restricted bundled scene execution** — only the three bundled Motion Canvas templates execute; edited, imported, and AI-generated source remains editable but is disabled until an isolated runtime exists.
- **Live preview** — real player, frame stepping, speed control, playhead, and timeline scrubbing.
- **Monaco editor** — syntax highlighting, TypeScript diagnostics, and CodeVideo API intellisense.
- **Visual timeline** — scene/character/audio/subtitle tracks, ruler, zoom, playhead, scene splitting.
- **SVG characters** — editable rigs with separate parts, expressions, and palettes; injectable into scenes as Motion Canvas images.
- **AI gateway** — pluggable OpenAI, Anthropic, Gemini, and Ollama providers; keys stay server-side.
- **Local storyboard generator** — create a project from a prompt without any API key.
- **Real rendering** — Playwright renders frames in a browser with WebGL, ffmpeg encodes MP4/WebM/GIF.
- **Portable projects** — import/export a single `.codevideo.json` file.
- **Docker deployment** — web + API + render worker via `docker compose`.

## Quick start

Requirements: Node 22+, pnpm 10+, ffmpeg, and a Chromium/Chrome installation for local rendering.

```bash
git clone https://github.com/gpttabrez/codevideo-studio.git
cd codevideo-studio
cp .env.example .env
pnpm install
pnpm dev
```

Open http://localhost:5173. The dashboard starts with a sample project so you can immediately open the editor.

### Local rendering

```bash
# terminal 1
pnpm --filter @codevideo/api dev

# terminal 2
pnpm --filter @codevideo/web dev

# terminal 3
pnpm --filter @codevideo/render-worker dev
```

Click **Render video** in the editor. The browser calls the same-origin Vite proxy, which injects the proxy secret and local development identity server-side. The API queues the job on disk, the worker claims it with a separate service token, renders it in headless Chromium, encodes with ffmpeg, and the API serves `/outputs/<job>.<format>` only to the owning authenticated user. The Vite proxy is for local development only; use the nginx proxy in Docker/public deployments.

If Playwright's browser is missing:

```bash
pnpm exec playwright install chromium
```

### Docker

```bash
cp .env.example .env
docker compose up --build
```

- Studio: http://localhost:8080
- Sign in with one of the `CODEVIDEO_USERS` entries from `.env` when the browser prompts for credentials.
- The API is not published; only the nginx proxy can reach it and set the trusted identity headers.
- Rendered files are persisted in the `render-outputs` volume; jobs and queue state are in `render-data`.

## Architecture

```
apps/
  web/            React 19 + Vite + Tailwind + Monaco studio UI
  api/            Fastify REST API (AI gateway + render queue)
  render-worker/  Playwright frame renderer + ffmpeg encoder
packages/
  project-schema/ Zod schema + default project/templates
  animation-engine/ Sandbox validator, compiler, Motion Canvas preview
  character-engine/ SVG rig generation and scene source export
  scene-runtime/  Scene ranges, render plans, source validation
  timeline-engine/ Timeline math, clip operations, ruler ticks
  audio-engine/   WAV generation, mixing, SRT export
  ai-gateway/     Provider-neutral AI interface + usage tracking
  provider-*/     OpenAI, Anthropic, Gemini, Ollama clients
   render-jobs/    File-backed render job queue owned by the API; worker uses authenticated internal routes
  shared/         IDs, time/frame helpers, result utilities
```

### Render pipeline

1. `POST /api/render` authenticates the proxy identity, validates the project and limits, and writes a job to `RENDER_DATA_DIR`.
2. The worker claims the job through `POST /api/internal/render/claim` using its own service token.
3. The worker injects the project into `#/render/<jobId>` in headless Chromium; the render page no longer calls the API.
4. For each frame the worker calls `renderFrameToDataUrl()` and writes a PNG.
5. ffmpeg encodes the PNG sequence into the selected format in the outputs-only volume.
6. The worker reports progress/completion through authenticated internal routes; `GET /api/render/<jobId>` and `GET /outputs/<job>.<ext>` are owner-scoped.

## AI providers

Keys are read from environment variables in the API process and never sent to the browser.

| Provider | Env vars |
| --- | --- |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Ollama | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |

OpenAI-compatible services can be used by setting `OPENAI_BASE_URL` to their API root.

Endpoints:

- `GET /api/health`
- `GET /api/providers`
- `GET /api/ai/usage`
- `POST /api/ai/generate` with `{provider, prompt, mode: "animation" | "storyboard" | "chat", model?}`
- `POST /api/render` with `{project, format: "mp4" | "webm" | "gif", quality: "draft" | "standard" | "high"}`
- `GET /api/render/:id`
- `POST /api/render/:id/cancel`

All routes except `/api/health` require reverse-proxy authentication. Internal `/api/internal/*` routes require the separate worker service token and are never exposed to the browser.

## Scripts

```bash
pnpm build              # build every workspace package/app
pnpm test               # run all Vitest suites
pnpm --filter @codevideo/web test:e2e   # Playwright studio flow
pnpm test:render-smoke                  # real API + worker + Chromium + ffmpeg render test
pnpm lint               # typecheck every workspace
pnpm clean              # remove build output
```

## Animation API

Scenes may import only:

```ts
import {Circle, Rect, Txt, Line, Img} from '@motion-canvas/2d';
import {all, chain, createRef, waitFor, easeInOutCubic} from '@motion-canvas/core';
import {fadeIn, fadeOut, slideIn, cameraMove, drawPath, pulse, typeText} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');
  // your generator-based animation
});
```

The validator rejects dynamic imports, unsupported modules, filesystem/network globals, and sources over 200 KB, but it is not a security boundary. Execution is limited to the bundled trusted sources until a genuinely isolated runtime is implemented.

## Roadmap

- Non-linear audio waveform editing and voice-over generation
- Cloud project sync and team workspaces
- Redis/BullMQ queue + Postgres persistence for multi-worker deployments
- Asset library with upload, trimming, and font management
- Template marketplace and community scene packs

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

MIT © CodeVideo contributors
