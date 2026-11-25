# Open-Source Readiness

## Status: PARTIAL

Present: MIT license, README, `.env.example`, contribution guide, code of conduct, security-reporting policy, architecture/rendering/API docs, examples, and a GitHub Actions build/test workflow.

### Finding OSS-001

- Severity: High
- Exact location: `README.md:9`, `README.md:17`, `README.md:19`, `SECURITY.md:13`, `docs/architecture.md:7`
- Explanation: Public documentation calls execution “sandboxed”/“isolated” and rendering “real,” but SEC-001 and REN-002 show those claims are not release-safe/independently verified.
- Reproduction: Compare the named documentation with `packages/animation-engine/src/runner.ts:79` and test coverage.
- Expected behavior: Security and feature claims match tested implementation limits.
- Actual behavior: Documentation overstates isolation and render verification.
- Recommended correction: Correct claims immediately; publish a threat model and supported deployment boundary before release.
- Blocks Phase 1 approval: Yes.

### Finding OSS-002

- Severity: Medium
- Exact location: `.github/workflows/ci.yml:1`, `README.md:33`, `docker-compose.yml:1`
- Explanation: CI has no E2E/render/security/dependency-audit job; Docker compose has no health checks, non-root policy, resource limits, or documented production reverse-proxy/TLS/auth setup.
- Reproduction: Inspect workflow, quick start, and Compose file.
- Expected behavior: A public project has reproducible release checks and production deployment guidance.
- Actual behavior: Local-prototype instructions are present but release operations are incomplete.
- Recommended correction: Add release checklist, SBOM/dependency scanning, CI render tests, health checks, threat/deployment docs, issue templates, and versioning/release process.
- Blocks Phase 1 approval: No independently; contributes to the overall decision.

### Finding OSS-003

- Severity: Low
- Exact location: `apps/web` production build output reported by `pnpm.cmd build`
- Explanation: The initial client bundle is about 10 MB minified / 2.86 MB gzip, largely from Monaco workers, and Vite issues a chunk-size warning.
- Reproduction: Run `pnpm.cmd build`.
- Expected behavior: Heavy editor assets are code-split or documented as an intentional tradeoff.
- Actual behavior: First-load performance risk is unaddressed.
- Recommended correction: Lazy-load Monaco/editor route and establish a bundle budget.
- Blocks Phase 1 approval: No.
