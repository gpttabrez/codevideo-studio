# CodeVideo Dual-Engine + AI Agent Implementation Progress

## Status

Implementation is complete through all eight phases.

- Existing SVG/Motion Canvas behavior is preserved.
- New projects default to Python + Cairo.
- Existing projects without an explicit `engine` migrate to SVG.
- AI providers and model roles are configuration-driven; no credentials are placed in frontend code, project JSON, sandboxes, or tool workspaces.
- Untrusted execution is fail-closed until an approved external Windows sandbox runner is configured.
- Final verification passed: `pnpm lint`, `pnpm test`, and `pnpm build`.

## Phase 1 — Model manager and provider capabilities

Status: completed

Implemented:

- Extended AI gateway types for multimodal messages, tool calls, usage, streaming, JSON mode, vision, tool calling, and role bindings.
- Added `ModelManager` with role bindings, configurable fallback chains, capability checks, fallback reasons, and context preservation.
- Added conservative capability defaults: vision and tool calling are not assumed unless configured or probed.
- Added `@codevideo/provider-openai-compatible` for OpenRouter, LM Studio, llama.cpp, vLLM, SGLang, custom OpenAI-compatible endpoints, and future compatible/fine-tuned models.
- Added environment-driven role configuration via `CODEVIDEO_MODEL_ROLES_JSON` and legacy role env fallbacks.

Tests passed:

- `pnpm --filter @codevideo/ai-gateway test` — 8 tests passed.
- `pnpm --filter @codevideo/provider-openai-compatible test` — 3 tests passed.

## Phase 2 — Persistent agent jobs and checkpoints

Status: completed

Implemented:

- Added `@codevideo/agent-jobs` with owner-scoped persistent sessions.
- Persisted messages, tool history, approvals, checkpoints, cancellation state, and restore points.
- Added explicit approval handling.
- `modifyOriginalFiles` is always rejected; original uploads cannot be changed.

Tests passed:

- `pnpm --filter @codevideo/agent-jobs test` — 4 tests passed.

## Phase 3 — Fail-closed sandbox strategy

Status: completed

Implemented:

- Added `@codevideo/sandbox` with `getSandboxStatus`, `assertUntrustedExecutionAvailable`, `resolveWorkspacePath`, `runUntrusted`, and `runTrusted`.
- Untrusted execution fails closed when no approved external runner is configured.
- Network access is disabled by default and requires an explicitly ready runner.
- Path traversal is blocked.
- Runner readiness is controlled by:
  - `CODEVIDEO_SANDBOX_RUNNER`
  - `CODEVIDEO_SANDBOX_RUNNER_READY`
  - `CODEVIDEO_SANDBOX_RUNNER_WINDOWS_PYTHON_READY`
  - `CODEVIDEO_SANDBOX_RUNNER_NETWORK_READY`
- Imported Python packs are not executed on Windows without a verified external sandbox runner.

Tests passed:

- `pnpm --filter @codevideo/sandbox test` — 5 tests passed.

## Phase 4 — Python + Cairo renderer and dual engine

Status: completed

Implemented:

- Added real Python renderer: `python/codevideo/render.py`.
- Added real `.py` visual packs:
  - `python/codevideo/packs/teacher.py`
  - `python/codevideo/packs/geometric.py`
  - `python/codevideo/packs/code_window.py`
  - `python/codevideo/packs/registry.py`
- Added `@codevideo/python-renderer` with environment validation, pack hashing/verification, real PNG frame rendering, affected-scene rendering, and `PROGRESS current total` parsing.
- `cairocffi` was initially installed but lacked a usable native Cairo DLL on Windows; renderer imports working `pycairo` via `import cairo`.
- Added `RenderEngineSchema` and optional `engine` to the project schema.
- Added `migrateProject()` so projects without `engine` migrate to `svg`.
- New default projects use `engine: 'python'`.
- `apps/render-worker` now uses the Python renderer for `project.engine === 'python'` and preserves the existing SVG/Motion Canvas Playwright path for `svg`.

Tests passed:

- `pnpm --filter @codevideo/python-renderer test` — 3 tests passed.
- `python -c "import cairo; ..."` — `pycairo-ok`.

## Phase 5 — Agent tool runtime and copy-on-write workspaces

Status: completed

Implemented:

- Added `@codevideo/tool-runtime` with copy-on-write workspaces.
- Original uploads are hashed and snapshotted; modifications are made only in a working copy.
- Added tools:
  - `read_project`
  - `list_scenes`
  - `update_scene`
  - `add_scene`
  - `render_preview`
  - `inspect_frame`
  - `request_approval`
  - `create_checkpoint`
- Upload names are sanitized with safe path segments.
- `modifyOriginalFiles` remains refused.
- Real preview frames can be rendered and inspected by vision-capable models.
- Generated runtime workspace data is ignored via `packages/tool-runtime/data/`.

Tests passed:

- `pnpm --filter @codevideo/tool-runtime test` — 5 tests passed.

## Phase 6 — Vision feedback loop

Status: completed

Implemented:

- Added `@codevideo/vision-loop` with `reviewFrame` and `runVisionLoop`.
- Parses bounded structured visual review output.
- Requires a vision-capable model and refuses incapable models.
- Runs real render/inspect/review/update iterations without fake progress.
- Test scene duration and timeout were adjusted to keep real ffmpeg rendering reliable on Windows.

Tests passed:

- `pnpm --filter @codevideo/vision-loop test` — 3 tests passed.

## Phase 7 — Config-driven providers, API, UI, local bridge, and agent worker

Status: completed

Implemented:

- Added `@codevideo/model-config`:
  - `CODEVIDEO_PROVIDERS_JSON` provider registry.
  - Legacy environment fallbacks.
  - Capability-aware gateway creation.
  - `createGatewayFromConfig`.
  - `createModelManagerFromGateway`.
  - `configuredEntries`.
- Removed hardcoded provider registration from `apps/api`; `createGateway()` now delegates to `createGatewayFromConfig()`.
- Added API routes:
  - `GET /api/models`
  - `GET /api/engines`
  - `POST /api/agent/sessions`
  - `GET /api/agent/sessions`
  - `GET /api/agent/sessions/:id`
  - `POST /api/agent/sessions/:id/approve`
  - `POST /api/agent/sessions/:id/cancel`
  - `POST /api/agent/sessions/:id/checkpoints`
  - `POST /api/agent/sessions/:id/restore`
- Added `apps/agent-worker` with persistent polling, JSON tool-call parsing, tool execution, checkpoints, vision pass, and final render approval gate.
- Added `apps/local-bridge`, a loopback-only token-authenticated proxy for Ollama and OpenAI-compatible local model servers.
- Added render engine selector to the web inspector.
- Added project migration in the web project store.

Tests passed:

- `pnpm --filter @codevideo/model-config test` — 3 tests passed.
- `pnpm --filter @codevideo/agent-worker test` — 3 tests passed.
- `pnpm --filter @codevideo/local-bridge test` — 3 tests passed.
- `pnpm --filter @codevideo/api lint` — passed.

## Phase 8 — Integration and final verification

Status: completed

Final verification passed:

- `pnpm install` — completed; workspace links and `pnpm-lock.yaml` updated for all new packages/apps.
- `pnpm lint` — passed for all 25 workspace packages.
- `pnpm test` — passed for all workspace test tasks.
- `pnpm build` — passed: 25 successful, 25 total.
- Web production build completed with a non-blocking Vite chunk-size warning.
- ffmpeg and ffprobe 9.0.2 available.

Working invariants:

- No real credentials are stored in frontend code, project files, tool workspaces, or sandbox contexts.
- Models are selected from configuration and capability requirements.
- No silent fallback to incapable models.
- Existing auth, ownership checks, render-job validation, and output publishing rules remain intact.
- Original uploads remain immutable.
- Dependencies, imported Python execution, original file modification, and final render are controlled by approval gates.
- Untrusted execution remains fail-closed on Windows.

## Modified and created files

Workspace/root:

- `package.json` — root pnpm/Turbo scripts and workspace dependencies.
- `pnpm-workspace.yaml` — includes `apps/*` and `packages/*`.
- `pnpm-lock.yaml` — updated dependency graph and workspace links.
- `turbo.json` — build/test/lint/typecheck task graph with caching.
- `.env.example` — documents provider, model, worker, render, local bridge, and sandbox variables.
- `.gitignore` — ignores generated agent/tool runtime data in addition to build/test artifacts.
- `docs/IMPLEMENTATION_PROGRESS.md` — this implementation progress report.

AI gateway and providers:

- `packages/ai-gateway/src/types.ts` — capability, multimodal, tool-call, usage, streaming, and role types.
- `packages/ai-gateway/src/modelManager.ts` — role routing, capability checks, fallback chains, and context preservation.
- `packages/ai-gateway/src/index.ts` — exports model manager and capability APIs.
- `packages/ai-gateway/src/modelManager.test.ts` — model manager tests.
- `packages/provider-openai-compatible/package.json` — new provider package manifest.
- `packages/provider-openai-compatible/tsconfig.json` — provider TypeScript config.
- `packages/provider-openai-compatible/src/index.ts` — OpenAI-compatible provider implementation.
- `packages/provider-openai-compatible/src/index.test.ts` — provider tests.

Agent state, sandbox, and tools:

- `packages/agent-jobs/package.json` — agent session package manifest.
- `packages/agent-jobs/tsconfig.json` — agent session TypeScript config.
- `packages/agent-jobs/src/index.ts` — persistent sessions, checkpoints, approvals, tool history, and cancellation.
- `packages/agent-jobs/src/index.test.ts` — agent session tests.
- `packages/sandbox/package.json` — sandbox package manifest.
- `packages/sandbox/tsconfig.json` — sandbox TypeScript config.
- `packages/sandbox/src/index.ts` — fail-closed sandbox status, path checks, and trusted/untrusted execution helpers.
- `packages/sandbox/src/index.test.ts` — sandbox tests.
- `packages/tool-runtime/package.json` — tool-runtime package manifest.
- `packages/tool-runtime/tsconfig.json` — tool-runtime TypeScript config.
- `packages/tool-runtime/src/index.ts` — workspaces, immutable originals, tool specs, previews, and approvals.
- `packages/tool-runtime/src/index.test.ts` — tool-runtime tests.

Python/Cairo engine:

- `python/codevideo/__init__.py` — Python renderer package marker.
- `python/codevideo/render.py` — real Cairo frame renderer with progress output.
- `python/codevideo/packs/__init__.py` — Python visual-pack package marker.
- `python/codevideo/packs/registry.py` — pack registry and metadata.
- `python/codevideo/packs/teacher.py` — teacher/character visual pack.
- `python/codevideo/packs/geometric.py` — geometric animation pack.
- `python/codevideo/packs/code_window.py` — progressive code-window pack.
- `packages/python-renderer/package.json` — Python renderer package manifest.
- `packages/python-renderer/tsconfig.json` — Python renderer TypeScript config.
- `packages/python-renderer/src/index.ts` — environment checks, pack hashes, renderer invocation, progress parsing, affected-scene rendering.
- `packages/python-renderer/src/index.test.ts` — real Cairo/PyCairo rendering tests.
- `packages/project-schema/src/schema.ts` — `RenderEngineSchema`, optional `engine`, and `migrateProject()`.
- `packages/project-schema/src/defaults.ts` — new default project engine is `python`.
- `apps/render-worker/package.json` — Python renderer dependency.
- `apps/render-worker/src/index.ts` — dual-engine render worker routing.

Vision loop and model configuration:

- `packages/vision-loop/package.json` — vision-loop package manifest.
- `packages/vision-loop/tsconfig.json` — vision-loop TypeScript config.
- `packages/vision-loop/src/index.ts` — vision review parsing and bounded feedback loop.
- `packages/vision-loop/src/index.test.ts` — vision-loop tests.
- `packages/model-config/package.json` — model-config package manifest.
- `packages/model-config/tsconfig.json` — model-config TypeScript config.
- `packages/model-config/src/index.ts` — provider registry parsing and gateway/model manager factories.
- `packages/model-config/src/index.test.ts` — model configuration tests.

API, agent worker, local bridge, and UI:

- `apps/api/package.json` — added agent/model/python/sandbox/tool dependencies.
- `apps/api/src/index.ts` — models, engines, agent sessions, approvals, checkpoints, restore, and config-driven gateway.
- `apps/agent-worker/package.json` — new agent-worker app manifest.
- `apps/agent-worker/tsconfig.json` — agent-worker TypeScript config.
- `apps/agent-worker/src/agent.ts` — agent loop, tool calls, checkpoints, approval gate.
- `apps/agent-worker/src/index.ts` — config-driven startup and worker entrypoint.
- `apps/agent-worker/src/agent.test.ts` — agent worker tests.
- `apps/local-bridge/package.json` — new local-bridge app manifest.
- `apps/local-bridge/tsconfig.json` — local-bridge TypeScript config.
- `apps/local-bridge/src/index.ts` — loopback token-authenticated model proxy.
- `apps/local-bridge/src/index.test.ts` — local bridge tests.
- `apps/web/src/components/editor/Inspector.tsx` — Python/Cairo vs SVG engine selector.
- `apps/web/src/store/projectStore.ts` — client-side engine migration and project store compatibility.

## Remaining operational requirement

- Windows host isolation is not provided by this repository alone. Before enabling untrusted imported Python packs or network access, configure an approved external sandbox runner and set the readiness environment variables listed in Phase 3.
- Until then, untrusted execution remains intentionally disabled.
