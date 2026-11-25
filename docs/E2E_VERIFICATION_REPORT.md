# End-to-End Verification Report

Scope: verify the existing CodeVideo architecture end-to-end without replacing it. This report covers local runtime verification, Python/Cairo rendering with real camera/captions/audio, real MP4 validation, UI screenshots, and blockers that require operator-provided configuration.

## Verdict

- Local end-to-end pipeline verified: dashboard -> editor -> agent UI -> API asset upload -> owner-scoped asset access -> render job -> real PyCairo frames -> H.264/AAC MP4 -> ffprobe -> contact sheet.
- Build, lint, typecheck, and tests pass.
- Live AI agent/model workflow is not verified because no provider/model is configured.
- Approved Windows sandbox execution is not verified because no external isolation runner is configured.
- Only built-in Python/Cairo packs were used; the previously referenced external character pack was not found in the repository.

## Environment

Command:

```powershell
node --version; pnpm --version; python --version; ffmpeg -version 2>&1 | Select-Object -First 1; ffprobe -version 2>&1 | Select-Object -First 1; python -c "import cairo; print('cairo', cairo.version)"
```

Output:

```text
v22.23.4
10.34.1
Python 3.10.6
ffmpeg version 9.0.2-full_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers
ffprobe version 9.0.2-full_build-www.gyan.dev Copyright (c) 2007-2026 the FFmpeg developers
cairo 1.29.2
```

## Configuration Probe

Command:

```powershell
$names = @('OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','OLLAMA_BASE_URL','CODEVIDEO_PROVIDERS_JSON','CODEVIDEO_MODEL_ROLES_JSON','LOCAL_BRIDGE_TOKEN','CODEVIDEO_SANDBOX_RUNNER','CODEVIDEO_SANDBOX_RUNNER_READY','CODEVIDEO_SANDBOX_RUNNER_WINDOWS_PYTHON_READY','CODEVIDEO_SANDBOX_RUNNER_NETWORK_READY','CODEVIDEO_PROXY_SECRET','CODEVIDEO_WORKER_TOKEN'); foreach ($n in $names) { $v = Get-Item -Path "Env:$n" -ErrorAction SilentlyContinue; '{0}={1}' -f $n, [bool]$v }; "dotenv_exists=$(Test-Path -LiteralPath '.env')"
```

Output:

```text
OPENAI_API_KEY=False
ANTHROPIC_API_KEY=False
GEMINI_API_KEY=False
OLLAMA_BASE_URL=False
CODEVIDEO_PROVIDERS_JSON=False
CODEVIDEO_MODEL_ROLES_JSON=False
LOCAL_BRIDGE_TOKEN=False
CODEVIDEO_SANDBOX_RUNNER=False
CODEVIDEO_SANDBOX_RUNNER_READY=False
CODEVIDEO_SANDBOX_RUNNER_WINDOWS_PYTHON_READY=False
CODEVIDEO_SANDBOX_RUNNER_NETWORK_READY=False
CODEVIDEO_PROXY_SECRET=False
CODEVIDEO_WORKER_TOKEN=False
dotenv_exists=False
```

## Build, Lint, Typecheck, Tests

Commands and results:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Exact summary output:

```text
pnpm lint
 Tasks:    45 successful, 45 total
Cached:    45 cached, 45 total
  Time:    1.01s >>> FULL TURBO

pnpm typecheck
 Tasks:    45 successful, 45 total
Cached:    45 cached, 45 total
  Time:    1.19s >>> FULL TURBO

pnpm test
 Tasks:    45 successful, 45 total
Cached:    42 cached, 45 total
  Time:    8.549s

pnpm build
 Tasks:    25 successful, 25 total
Cached:    25 cached, 25 total
  Time:    705ms >>> FULL TURBO
```

Also passed after the atomic render-job write fix:

```powershell
pnpm test:render-smoke
```

Key output:

```text
real H.264 MP4 produced, 10,931 bytes, 640x360, 0.6s, 18 frames
owner/anonymous access verified
```

## Full Feature Render

Command:

```powershell
pnpm build; node scripts/feature-smoke.mjs
```

What the script verifiably does:

1. Uses ffmpeg to generate a real 1-second 440 Hz PCM WAV.
2. Starts API, Vite dev server, and render worker with explicit local proxy/worker secrets.
3. Uploads the WAV through `POST /api/assets`.
4. Verifies owner download returns HTTP 200 and non-owner download returns HTTP 404.
5. Builds a real Python-engine project with `scene.camera` using `easeInOut`, two `project.subtitles` cues, and the uploaded audio through `project.audio`.
6. Calls `renderProjectToFrames`, producing 30 real PNG frames with the built-in `teacher` pack manifest hash.
7. Uses ffmpeg to build a 960x360 contact sheet from selected frames.
8. Submits a real render job and waits for completion.
9. Copies the completed MP4 to `artifacts/e2e/full-feature.mp4`.
10. Runs ffprobe and asserts H.264 video, AAC audio, 640x360, and 1-second duration.

Key exact output:

```text
PASS ffmpeg generated a real WAV tone
PASS asset upload returns HTTP 201 (actual: 201)
PASS asset source is asset:asset_0a416da8-b411-40c7-adb9-4ef1cccef720.wav
PASS owner can download the uploaded asset
PASS non-owner receives HTTP 404 for the uploaded asset
PASS Python renderer produced 30 real PNG frames
PASS manifest records the real teacher pack hash
PASS ffmpeg built the contact sheet
PASS contact sheet PNG has real image data
PASS render submission returns HTTP 202 (actual: 202)
PASS render completes (actual: complete, error: )
PASS MP4 exists with 41568 bytes
PASS ffprobe exits 0 (stderr: )
PASS video codec is h264 (actual: h264)
PASS video resolution is 640x360
PASS audio codec is aac (actual: aac)
PASS duration is 1s (actual: 1.000000)
FEATURE_SMOKE_RESULT PASS
```

Direct ffprobe command:

```powershell
ffprobe -v error -show_entries "stream=index,codec_name,codec_type,width,height,nb_frames:format=duration" -of json "D:\CodeVideo\artifacts\e2e\full-feature.mp4"
```

Output:

```json
{
    "programs": [
    ],
    "stream_groups": [
    ],
    "streams": [
        {
            "index": 0,
            "codec_name": "h264",
            "codec_type": "video",
            "width": 640,
            "height": 360,
            "nb_frames": "30"
        },
        {
            "index": 1,
            "codec_name": "aac",
            "codec_type": "audio",
            "nb_frames": "45"
        }
    ],
    "format": {
        "duration": "1.000000"
    }
}
```

## UI Screenshots

Command:

```powershell
node scripts/ui-screenshots.mjs
```

Exact output:

```text
PASS dashboard screenshot captured
PASS editor screenshot captured
PASS agent panel is visible in the running UI
PASS upload controls are visible in the running UI
PASS model blocker is visible because no real provider is configured
PASS agent screenshot captured
PASS contact sheet viewer screenshot captured
UI_SCREENSHOTS_RESULT PASS
```

Artifacts:

| File | Purpose | Bytes |
| --- | --- | ---: |
| `artifacts/e2e/dashboard.png` | Running dashboard screenshot | 93,516 |
| `artifacts/e2e/editor.png` | Running editor screenshot, created through UI | 97,369 |
| `artifacts/e2e/agent.png` | Running agent UI with model blocker and upload controls | 66,044 |
| `artifacts/e2e/contact-sheet.png` | Real rendered-frame contact sheet | 138,957 |
| `artifacts/e2e/contact-sheet-viewer.png` | Contact sheet viewed in browser | 155,199 |
| `artifacts/e2e/full-feature.mp4` | Final H.264/AAC render | 41,568 |
| `artifacts/e2e/ffprobe.json` | Saved ffprobe metadata | 372 |
| `artifacts/e2e/project.json` | Exact project used for the feature render | 3,492 |
| `artifacts/e2e/ui-results.json` | Saved UI assertion results | 312 |

Hashes:

```text
SHA256 D0A462729FA9AA81FAC54979FF2BBD113797E52361450166CE42EE0BEFFC883B artifacts/e2e/full-feature.mp4
SHA256 614FB8F8FC4454966BE51F3EC16CB5AC950AA95F7ACCF734C8E54B3FE307647D artifacts/e2e/contact-sheet.png
```

## Fixes Made During Verification

- Wired `AgentStudio` into router, app shell, dashboard, and editor navigation.
- Added agent route parsing for `#/agent` and `#/agent/:projectId`.
- Fixed `Badge` to accept and spread standard `<span>` HTML attributes so `data-testid` works.
- Rewrote `docs/rendering.md`, `docs/architecture.md`, and `docs/animation-api.md`; corrected camera ease wording to the schema value `easeInOut`.
- Raised two slow real-render tests to 60 seconds.
- Replaced non-atomic render-job writes with temp-file-plus-rename writes to eliminate a real `404 Job not found` race observed under worker polling.
- Improved worker API error messages to include the failing path.
- Prevented `reportFailure` errors from masking original render errors.
- Added persistent verification scripts: `scripts/feature-smoke.mjs` and `scripts/ui-screenshots.mjs`.

## Blockers That Remain

- Live AI workflow: no provider, API key, Ollama endpoint, local bridge token, or role config exists. The UI correctly shows the model blocker; real agent completion and real vision feedback were not claimed.
- Approved Windows sandbox: no absolute runner path or readiness markers exist. Imported Python and network-enabled untrusted tools remain fail-closed.
- External Python/Cairo character pack: not present in the repository. Verified packs are the built-in `teacher`, `geometric`, and `code-window` packs.

## Exact Windows Setup Needed To Clear Blockers

Set provider and role configuration in the shell that starts API, agent worker, and web dev server:

```powershell
$env:CODEVIDEO_PROVIDERS_JSON = '[{"id":"primary","type":"openai","apiKey":"REPLACE_ME","defaultModel":"gpt-4o-mini","capabilities":{"text":true,"streaming":true,"jsonMode":true,"toolCalling":"native","vision":true}},{"id":"vision","type":"openai-compatible","baseUrl":"http://127.0.0.1:1234/v1","apiKey":"REPLACE_ME","defaultModel":"local-vision-model","capabilities":{"text":true,"streaming":true,"jsonMode":true,"toolCalling":"json-protocol","vision":true}}]'
$env:CODEVIDEO_MODEL_ROLES_JSON = '{"planning":{"providerId":"primary","model":"gpt-4o-mini"},"coding":{"providerId":"primary","model":"gpt-4o-mini"},"vision":{"providerId":"vision","model":"local-vision-model"},"quickCorrection":{"providerId":"primary","model":"gpt-4o-mini"}}'
```

Set local service secrets:

```powershell
$env:CODEVIDEO_PROXY_SECRET = 'REPLACE_WITH_RANDOM_SECRET'
$env:CODEVIDEO_DEV_USER = 'local'
$env:CODEVIDEO_WORKER_TOKEN = 'REPLACE_WITH_RANDOM_WORKER_TOKEN'
```

Set an approved external Windows isolation runner only after it has been installed and verified:

```powershell
$env:CODEVIDEO_SANDBOX_RUNNER = 'C:\Path\To\Verified\IsolationRunner.exe'
$env:CODEVIDEO_SANDBOX_RUNNER_READY = '1'
$env:CODEVIDEO_SANDBOX_RUNNER_WINDOWS_PYTHON_READY = '1'
$env:CODEVIDEO_SANDBOX_RUNNER_NETWORK_READY = '1'
```

Then rerun:

```powershell
pnpm build
node scripts/feature-smoke.mjs
node scripts/ui-screenshots.mjs
```

## Working Tree Note

No commit was made. `git status --short` showed the pre-existing modified `LICENSE` and untracked repository content, including the new `artifacts/`, `scripts/feature-smoke.mjs`, and `scripts/ui-screenshots.mjs`.
