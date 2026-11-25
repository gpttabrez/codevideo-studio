# Architecture Audit

## Verified Architecture

The repository is a pnpm workspace with Turbo, three apps, and 13 packages. Workspace references resolve and `pnpm.cmd build` completed for all 16 workspaces. TypeScript strict mode is centrally configured. CI installs, lints, builds, and tests, but does not run E2E or a render smoke test.

The implemented queue is filesystem-backed (`packages/render-jobs`), not BullMQ/Postgres. `bullmq`, `ioredis`, and `pg` are declared but never used by application code.

### Finding ARC-001

- Severity: Medium
- Exact location: `apps/api/package.json:25`, `apps/api/package.json:27`, `apps/api/package.json:28`, `apps/render-worker/package.json:20`, `apps/render-worker/package.json:21`
- Explanation: BullMQ, Redis, and Postgres dependencies are shipped although the queue implementation uses filesystem JSON files only. This increases dependency/security maintenance scope and misstates architectural readiness.
- Reproduction: Search production sources for imports of `bullmq`, `ioredis`, or `pg`; none exist.
- Expected behavior: Declared runtime dependencies support the selected production architecture.
- Actual behavior: File queue is the only implementation; Redis/Postgres dependencies are unused.
- Recommended correction: Remove unused dependencies or implement/document the selected durable queue architecture.
- Blocks Phase 1 approval: No, but blocks a production-scale queue claim.

### Finding ARC-002

- Severity: Low
- Exact location: `turbo.json:8`, `.github/workflows/ci.yml:20`
- Explanation: `test` depends on cached builds and CI omits `test:e2e` and a render integration test.
- Reproduction: Inspect the Turbo task and CI workflow.
- Expected behavior: Release CI includes browser and rendering paths claimed in documentation.
- Actual behavior: Only unit/Vitest tests run in CI.
- Recommended correction: Add isolated E2E and containerized render smoke jobs with artifacts.
- Blocks Phase 1 approval: No independently; contributes to REN-002.

See also `SEC-002`, `REN-002`, and `DEP-001` in the dedicated reports.
