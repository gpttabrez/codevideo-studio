# Animation Engine Audit

## Result

Motion Canvas 3.17 packages are installed. The implementation compiles TypeScript, manually assembles Motion Canvas scene descriptions, supports preview play/pause/seek, helper-based position/scale/opacity/camera animation, and calls `Renderer.renderFrame()` for capture. The `withRefSupport()` wrapper exists to invoke `ref` props on wrapped 2D classes.

The automated tests validate source parsing only; they do not test a rendered frame, transform pixels, multiple-scene output, transition output, repeated renderer use, or compatibility with the undocumented `FullSceneDescription` construction. Transitions are schema/UI metadata only and are never applied during rendering.

### Finding ANIM-001

- Severity: Critical
- Exact location: `packages/animation-engine/src/validation.ts:9`, `packages/animation-engine/src/validation.ts:101`, `packages/animation-engine/src/validation.ts:115`, `packages/animation-engine/src/runner.ts:79`
- Explanation: The validator rejects identifier tokens but deliberately ignores property names, then executes transpiled source with `new Function`. An attacker can obtain `Function` through `({}).constructor.constructor`, construct `return globalThis` as a string, and reach browser globals/network. This is not a security sandbox.
- Reproduction: Submit a scene whose source builds a function via `({}).constructor.constructor('return globalThis')`; validation does not see the string/global identifier or property names, and `compileSceneSource` executes it.
- Expected behavior: Untrusted scene code cannot reach global APIs, network, storage, or escape its capability boundary.
- Actual behavior: Static denylisting is bypassable before unrestricted JavaScript execution.
- Recommended correction: Do not execute untrusted source with `new Function`. Isolate in a dedicated sandboxed origin/worker with strict CSP and capability messaging, or run code in a hardened server-side isolate/container with network/filesystem disabled. Treat AST validation only as defense in depth.
- Blocks Phase 1 approval: Yes.

### Finding ANIM-002

- Severity: Medium
- Exact location: `packages/project-schema/src/schema.ts:61`, `packages/animation-engine/src/runner.ts:186`, `packages/animation-engine/src/runner.ts:317`
- Explanation: Scene transition values are persisted but not consumed by player, stage, or frame-render logic.
- Reproduction: Change a scene transition to slide/zoom and render/preview scene boundaries.
- Expected behavior: Configured transition changes output at boundaries.
- Actual behavior: Only sequential scenes render; transition metadata has no runtime effect.
- Recommended correction: Implement transition composition or remove the exposed configuration.
- Blocks Phase 1 approval: No, but transition support is not implemented.

### Finding ANIM-003

- Severity: Medium
- Exact location: `packages/animation-engine/src/index.test.ts:5`, `packages/scene-runtime/src/index.test.ts:8`
- Explanation: Tests stop at validation/range planning and do not exercise canvas/WebGL output or `renderFrame()`.
- Reproduction: Review the named test files.
- Expected behavior: Renderer regression tests cover frame capture, transforms, multiple scenes, and repeated calls.
- Actual behavior: No such test exists.
- Recommended correction: Add Playwright visual/integration tests with deterministic frame assertions.
- Blocks Phase 1 approval: Yes, until a real render path is verified.
