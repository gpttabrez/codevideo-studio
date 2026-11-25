# Frontend Audit

## Result

React/Vite initialization, hash routing, dashboard create/open/duplicate/delete/search/import/export, Zustand persistence, Monaco, scene operations, inspector, and scene-timeline seeking are implemented. `pnpm.cmd --filter @codevideo/web test:e2e` passed one create/edit/play/add-scene workflow. Projects persist only in browser localStorage.

The asset tab is a placeholder. The fullscreen icon has no handler. Timeline visual/character/audio/subtitle tracks have no edit UI, and rendering success cannot complete in the UI.

### Finding FE-001

- Severity: High
- Exact location: `apps/web/src/components/editor/Editor.tsx:139`, `apps/render-worker/src/index.ts:82`, `packages/render-jobs/src/index.ts:20`
- Explanation: The client tests `job.url`, but the render job contract declares and the worker writes `outputUrl`.
- Reproduction: Complete any worker job, then poll it through the editor. Its status becomes `complete`, but `job.url` is undefined and polling continues.
- Expected behavior: A completed job changes the UI to done and opens/links its output.
- Actual behavior: The output is never opened and the UI remains in rendering state.
- Recommended correction: Use one typed response contract and consume `outputUrl`; add a component/API integration test.
- Blocks Phase 1 approval: Yes.

### Finding FE-002

- Severity: Medium
- Exact location: `apps/web/src/components/editor/Sidebar.tsx:58`, `apps/web/src/components/editor/Sidebar.tsx:162`, `apps/web/src/components/editor/Preview.tsx:143`
- Explanation: Assets only render placeholder copy and the fullscreen button has no `onClick`; both are presented as active studio capabilities.
- Reproduction: Select Assets or click Fullscreen preview.
- Expected behavior: Assets can be managed and fullscreen changes preview state.
- Actual behavior: No operation occurs.
- Recommended correction: Implement these workflows or disable/label them as planned.
- Blocks Phase 1 approval: No, but the advertised asset-management scope is not implemented.

### Finding FE-003

- Severity: Medium
- Exact location: `apps/web/src/components/editor/Editor.tsx:220`, `packages/animation-engine/src/validation.ts:55`
- Explanation: Adding a character prepends `import character from "data:image/svg+xml,..."`; the allowlist rejects this import, so the new scene is invalid.
- Reproduction: Add a character, select its generated scene, and inspect Monaco validation/preview.
- Expected behavior: A generated character scene validates and previews.
- Actual behavior: It contains an unsupported data-URL import.
- Recommended correction: Remove the unused import or represent the SVG through an allowed source mechanism; test the UI flow.
- Blocks Phase 1 approval: No, but character insertion is broken.
