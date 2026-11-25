# Test Results

Commands were executed from `D:\CodeVideo` on 2026-11-23. The PowerShell `pnpm` shim was blocked by execution policy; equivalent `pnpm.cmd` commands were used. No source was modified.

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm lint` | blocked | `pnpm.ps1` execution policy error; rerun below. |
| `pnpm.cmd lint` | 0 | 29 Turbo tasks successful (16 workspace lint commands plus prerequisite builds); cached results were replayed. |
| `pnpm.cmd typecheck` | 0 | All 16 workspace typechecks completed successfully. |
| `pnpm.cmd build` | 0 | 16 successful workspaces. Vite warned that the main bundle is 10,043.09 kB (2,860.20 kB gzip), over 500 kB advisory limit. |
| `pnpm.cmd test` | 0 | 29 Turbo tasks successful; **50 tests passed, 0 failed** across 16 test files. |
| `pnpm.cmd --filter @codevideo/web test:e2e` | 0 | **1 passed, 0 failed**; dashboard/editor preview workflow only. |
| render smoke test | not available | No script or integration test found; not run. |
| `pnpm.cmd audit --prod --json` | NOT VERIFIED | The registry-dependent command did not return a usable result in the audit environment; no dependency-vulnerability conclusion is made. |

## Coverage Gaps

- No actual frame/image/video output test; no verification of the cited 640×360, 18-frame, 0.6-second result.
- No MP4/WebM/GIF end-to-end test, failure recovery, cleanup, cancellation, concurrent worker, audio, or transitions test.
- No live AI-provider integration test (credentials/services unavailable).
- No security regression test for sandbox escape, authorization, limits, path boundaries, or worker isolation.
- No coverage report/threshold is configured.
