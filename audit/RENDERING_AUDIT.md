# Rendering Audit

## Result

The intended path is implemented structurally: API writes a JSON job/queue marker, worker atomically renames a marker, Playwright opens the render route, frame data URLs are written to temp PNGs, and FFmpeg arguments support MP4/WebM/GIF. FFmpeg argument construction tests pass. The complete pipeline, actual media files, 640×360/18-frame prior claim, multiple scenes, resolutions/FPS, and repeated/corrupt rendering are **NOT VERIFIED**: no smoke-test command or integration test exists in the repository.

Audio clips are not passed to FFmpeg; only the first unmuted URL is passed to Motion Canvas player. There is no cancellation state/endpoint and `RENDER_CONCURRENCY` is unused.

### Finding REN-001

- Severity: High
- Exact location: `apps/web/src/components/editor/Editor.tsx:139`, `apps/render-worker/src/index.ts:82`, `packages/render-jobs/src/index.ts:20`
- Explanation: Completed renders publish `outputUrl`, while the editor waits for `url`.
- Reproduction: Queue and complete any render job, then poll it from the editor.
- Expected behavior: The rendered file is offered to the user.
- Actual behavior: The editor never recognizes a completed output.
- Recommended correction: Standardize `outputUrl` across API/client/types and integration-test completion.
- Blocks Phase 1 approval: Yes.

### Finding REN-002

- Severity: High
- Exact location: `apps/render-worker/src/index.ts:24`, `apps/render-worker/src/ffmpeg.test.ts:4`, `.github/workflows/ci.yml:20`
- Explanation: No test runs the worker against a browser/API/FFmpeg; provided tests only inspect argument strings.
- Reproduction: Search scripts/tests for a render smoke test; none exists.
- Expected behavior: CI or a documented repeatable command verifies an actual short MP4/WebM/GIF and metadata/frame count.
- Actual behavior: The earlier 640×360, 18-frame, 0.6-second result cannot be independently reproduced from repository automation.
- Recommended correction: Add a fixture project and containerized smoke test validating file existence, codec/dimensions/duration, error cleanup, and all formats.
- Blocks Phase 1 approval: Yes.

### Finding REN-003

- Severity: Medium
- Exact location: `packages/render-jobs/src/index.ts:8`, `apps/api/src/index.ts:120`, `apps/render-worker/src/index.ts:88`, `.env.example:12`
- Explanation: Job states have no cancellation state/API; worker loop is serial and ignores documented `RENDER_CONCURRENCY`.
- Reproduction: Inspect RenderStatus, routes, and worker loop; no cancellation/concurrency control exists.
- Expected behavior: Requested cancellation and configured concurrency are honored.
- Actual behavior: Neither capability exists.
- Recommended correction: Add cancellation tokens/state, worker termination checks, and bounded configurable concurrency.
- Blocks Phase 1 approval: No, but rendering requirements are incomplete.

### Finding REN-004

- Severity: Medium
- Exact location: `packages/animation-engine/src/runner.ts:193`, `apps/render-worker/src/ffmpeg.ts:10`
- Explanation: Audio is not supplied as an FFmpeg input or mapped into output, so output has no verified audio track or sync. Transitions are likewise unused (ANIM-002).
- Reproduction: Add an `AudioClip`, render, and inspect FFmpeg args/output streams.
- Expected behavior: Project audio is encoded and synchronized.
- Actual behavior: FFmpeg receives only PNG sequence input.
- Recommended correction: Resolve/validate audio assets, provide them to FFmpeg with explicit mapping/trim/mix, and test duration/sync.
- Blocks Phase 1 approval: No, unless audio rendering is a Phase 1 acceptance requirement.
