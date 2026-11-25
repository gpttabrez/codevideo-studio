# Rendering

CodeVideo has two render engines. `engine: 'python'` is the default for new projects. Projects without an explicit `engine` migrate to `svg`, and existing SVG/Motion Canvas projects keep working.

## Python + Cairo engine

1. The browser calls `/api/render` through the authenticated same-origin proxy. The API validates the project and server-side limits under a creation lock.
2. The worker claims the job through `POST /api/internal/render/claim` with its service token.
3. For `engine === 'python'`, the worker writes the project to a temporary directory and calls `packages/python-renderer`, which invokes `python/codevideo/render.py` with `--project`, `--output`, optional `--scenes`, and optional `--max-frames`.
4. `render.py` uses PyCairo (`import cairo`) to draw real PNG frames. `cairocffi` is not used by the renderer: on the verified Windows 10 host it was installed but could not load a native Cairo DLL, while PyCairo created real surfaces and frames successfully.
5. Python packs are `teacher`, `geometric`, and `code-window`. Each pack is a real `.py` file under `python/codevideo/packs/` and receives `(ctx, progress, element)`. The manifest records SHA-256 hashes of the pack files.
6. Scene timing comes from `scene.duration` and `settings.fps`. Element transforms and `props.pack` select and place packs. `scene.camera` applies linear or easeInOut pan/zoom. `project.subtitles` draws active captions at the bottom. Legacy `text: '...'` strings in `scene.source` are also drawn as scene text.
7. The renderer emits `PROGRESS current total` lines and a `manifest.json` containing engine, dimensions, fps, frame count, scenes, and pack hashes.
8. ffmpeg encodes the PNG sequence. MP4 uses H.264, yuv420p, and faststart. WebM uses VP9. GIF uses palettegen/paletteuse.
9. When `project.audio` contains an unmuted clip, the worker resolves the clip source from the server-side asset directory, adds it as a second ffmpeg input, applies trim/delay/volume, maps video and audio, and encodes AAC audio. Uploaded audio is stored under `ASSET_ROOT`/`RENDER_ASSET_ROOT`; credentials and local absolute paths are never sent to the browser.

## SVG/Motion Canvas engine

For `engine: 'svg'`:

1. The worker injects the project into the web app's `#/render/:id` page.
2. The render page exposes `window.__codevideo_renderFrame(frame)` and seeks/renders one Motion Canvas frame to a PNG data URL.
3. The worker writes `frame-000000.png`, `frame-000001.png`, … to a temporary directory and uses the same ffmpeg encoder, including audio muxing.

Only bundled trusted Motion Canvas sources execute. Edited, imported, and AI-generated source is stored for editing but rejected before execution.

## Cancellation and limits

Cancellation of a queued job removes its queue marker. A running job is detected by the worker monitor, which aborts Chromium/ffmpeg and persists `cancelled`. For Python jobs, the Python subprocess is bounded by the render timeout; cancellation is checked between render phases. The worker loop is serial; `RENDER_CONCURRENCY` is not implemented. Per-owner and global API admission limits still apply.

## Verification

Run the reproducible smoke test with:

```powershell
pnpm test:render-smoke
```

It starts the built API, Vite web server, and worker; submits a fixture; verifies the output file and ffprobe metadata; and checks owner, non-owner, and anonymous download behavior.

## Supported now

- Python + Cairo PNG frame rendering with bundled packs.
- Structured camera pan/zoom via `scene.camera`.
- Structured captions via `project.subtitles`.
- Imported audio stored server-side and muxed into MP4/WebM output.
- SVG/Motion Canvas rendering for selected or migrated legacy projects.
- Owner-scoped asset upload and download endpoints.

## Unavailable or planned

- Arbitrary imported Python packs are not executed. On Windows 10, untrusted Python fails closed unless an approved external isolation runner is explicitly configured and marked ready.
- Imported Python with Cairo needs `CODEVIDEO_SANDBOX_RUNNER_WINDOWS_PYTHON_READY`; network access needs `CODEVIDEO_SANDBOX_RUNNER_NETWORK_READY`.
- There is no native Windows sandbox implementation in this repository; Windows Job Objects alone are not a filesystem/network security boundary.
- The Python engine does not execute Motion Canvas helpers, SVG character rigs, or arbitrary scene source.
- Multi-worker production queue/storage is not implemented. Redis/BullMQ and Postgres are not implemented.
- The Docker worker image does not guarantee Python/PyCairo availability; update the image before relying on the Python engine in containers.
