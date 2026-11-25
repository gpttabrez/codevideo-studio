# Phase 1 Remediation Plan

## P0 — Release Blockers

1. Eliminate `new Function` execution of untrusted scene code; design a real capability-isolated renderer/preview. Remove “sandboxed/isolated” claims until penetration-tested (`SEC-001`).
2. Add API authentication, ownership checks, restrictive origins/networking, rate limits and render quotas; do not expose job payloads/output by enumeration (`SEC-002`, `SEC-003`).
3. Run worker/browser under a non-root, sandboxed, resource-restricted container; remove `--no-sandbox` or document the platform-specific safe alternative (`SEC-004`).
4. Standardize render job response type on `outputUrl`; add an editor-to-download integration test (`REN-001`).
5. Add repeatable actual render smoke tests for MP4/WebM/GIF, dimensions/fps/duration, multiple scenes, failures and cleanup. Reproduce the prior 640×360/18-frame claim with checked-in fixture evidence (`REN-002`).

## P1 — Phase 1 Completeness

1. Implement or remove transition/audio output claims; FFmpeg must consume validated audio inputs and tests must verify sync (`ANIM-002`, `REN-004`).
2. Add cancellation, progress resilience, job expiry/cleanup, and bounded configurable worker concurrency (`REN-003`).
3. Fix generated character scene validation and accurately scope character functionality as static SVG generation (`FE-003`, `CHAR-001`).
4. Enforce AI-generation validation before rendering and add request timeouts/streaming only where API support is delivered (`AI-001`, `AI-002`).
5. Implement, disable, or label Assets/fullscreen/non-scene timeline operations as planned (`FE-002`).

## P2 — Maintainability and Release

1. Remove unused BullMQ/Redis/Postgres dependencies or implement the advertised architecture (`ARC-001`).
2. Extend CI with E2E, rendering, security regressions, coverage thresholds, audit/SBOM, and container scanning (`ARC-002`, `OSS-002`).
3. Correct README/security/deployment claims and document supported threat model, upgrade policy, release/versioning and production setup (`OSS-001`).
4. Lazy-load Monaco and set a web bundle budget (`OSS-003`).

## Exit Criteria

Approve Phase 1 only after P0 is complete, all P1 requirements selected for the Phase 1 scope are either verified or removed from public claims, and a clean CI run produces reproducible browser/render/security evidence.
