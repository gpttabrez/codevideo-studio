# Security Audit

## Result

No destructive security test was run. Review confirms a critical sandbox escape and unauthenticated data/render surface. Claims that execution is isolated are not substantiated: user source runs in a same-origin browser context and worker Chromium uses `--no-sandbox`.

### Finding SEC-001

- Severity: Critical
- Exact location: `packages/animation-engine/src/validation.ts:9`, `packages/animation-engine/src/validation.ts:101`, `packages/animation-engine/src/validation.ts:115`, `packages/animation-engine/src/runner.ts:79`
- Explanation: Identifier denylisting plus `new Function` allows constructor-chain/global access, arbitrary browser JavaScript, network requests, storage access, and render-worker denial of service.
- Reproduction: Validate source using `({}).constructor.constructor('return globalThis')`; property/string tokens bypass the validator, then source is executed by `new Function`.
- Expected behavior: Generated/imported scene code is isolated from global capabilities.
- Actual behavior: The claimed sandbox is bypassable.
- Recommended correction: Replace in-process evaluation with a hardened capability-isolated execution model; remove the security claim until independently penetration-tested.
- Blocks Phase 1 approval: Yes.

### Finding SEC-002

- Severity: High
- Exact location: `apps/api/src/index.ts:78`, `apps/api/src/index.ts:120`, `apps/api/src/index.ts:132`, `apps/api/src/index.ts:134`, `apps/api/src/index.ts:141`
- Explanation: No authentication/authorization protects render creation, full job listing, job retrieval (including project source), or output download. CORS is not access control; when `WEB_ORIGIN` is absent it permits all origins.
- Reproduction: Send unauthenticated requests to the named routes; no identity/ownership check occurs.
- Expected behavior: Users can access only their own jobs/projects and render resource use is controlled.
- Actual behavior: Any network client reaching the API can create jobs and enumerate/read others' jobs/outputs.
- Recommended correction: Require authentication, job ownership, rate/size quotas, and restrictive deployment networking; set explicit allowed origins.
- Blocks Phase 1 approval: Yes for public deployment.

### Finding SEC-003

- Severity: High
- Exact location: `apps/api/src/index.ts:63`, `packages/project-schema/src/schema.ts:56`, `packages/project-schema/src/schema.ts:153`, `apps/render-worker/src/index.ts:26`
- Explanation: Accepted projects permit up to 7680×4320, 60 FPS, scenes up to one hour and an unbounded scene count. Render CPU/disk work has no quota, cancellation, or overall timeout. Malicious scene code can also loop indefinitely.
- Reproduction: Submit a schema-valid project with many maximum-duration scenes and high resolution/FPS.
- Expected behavior: Render cost and execution time are bounded per tenant/job.
- Actual behavior: A single unauthenticated request can consume the serial worker for an unbounded practical duration.
- Recommended correction: Add authentication, strict project/frame/pixel/body quotas, timeout/watchdog, cancellation, process isolation, and resource limits.
- Blocks Phase 1 approval: Yes for public deployment.

### Finding SEC-004

- Severity: Medium
- Exact location: `apps/render-worker/src/index.ts:27`, `docker/worker.Dockerfile:1`
- Explanation: Chromium is launched with `--no-sandbox`; the worker Docker image runs as root by default. This magnifies impact of browser/scene compromise.
- Reproduction: Inspect launch arguments and Dockerfile for `USER`.
- Expected behavior: Isolated browser runs as unprivileged user with Chromium sandbox enabled where supported.
- Actual behavior: Both protections are absent.
- Recommended correction: Use an unprivileged user, hardened browser/container profile, read-only filesystem, dropped capabilities, and isolated network.
- Blocks Phase 1 approval: Yes in combination with SEC-001.
