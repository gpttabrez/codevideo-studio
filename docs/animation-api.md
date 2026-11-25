# Animation API

CodeVideo supports two animation APIs. The API available to a project depends on `project.engine`.

## SVG/Motion Canvas (`engine: 'svg'`)

A scene exports a default generator created with `makeScene2D`.

```ts
import {Circle, Txt} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, waitFor} from '@motion-canvas/core';
import {cameraMove, fadeIn, pulse} from '@codevideo/animation';

export default makeScene2D(function* (view) {
  view.fill('#0b1020');
  const title = createRef<Txt>();
  const orb = createRef<Circle>();

  view.add(new Txt({text: 'Hello', fontSize: 72, fill: '#fff', opacity: 0, ref: title}));
  view.add(new Circle({size: 80, fill: '#6d5efc', x: -400, ref: orb}));

  yield* all(fadeIn(title(), 0.5), pulse(orb(), 1.4, 0.8));
  yield* cameraMove(view, {x: 20, zoom: 1.05}, 1.5, easeInOutCubic);
  yield* waitFor(1);
});
```

Allowed imports:

- `@motion-canvas/2d`
- `@motion-canvas/core`
- `@codevideo/animation`

Helpers: `fadeIn`, `fadeOut`, `slideIn`, `cameraMove`, `drawPath`, `pulse`, `typeText`.

Forbidden: `fetch`, `XMLHttpRequest`, `WebSocket`, `eval`, `Function`, `process`, `require`, `window`, `document`, `localStorage`, timers, dynamic `import()`, and any other module specifier.

Only bundled trusted Motion Canvas sources execute. Edited, imported, and AI-generated source is stored for editing but rejected before execution.

## Python + Cairo (`engine: 'python'`)

Python scenes are data-driven from the project schema; arbitrary Python source is not executed. The renderer imports PyCairo (`import cairo`) and draws one PNG per frame. `cairocffi` is not used by the renderer.

A Python scene uses:

- `scene.duration` for timing.
- `scene.elements[]` with `x`, `y`, `scale`, `opacity`, `order`, and `props.pack`.
- `scene.camera` for structured pan/zoom:
  - `from`/`to`: `{x, y, zoom}` where `zoom > 0`.
  - `ease`: `linear` (default) or `easeInOut`.
- `project.subtitles[]` for structured captions with start/end timing.
- Legacy `text: '...'` strings in `scene.source` for simple scene text.
- `project.audio[]` for imported audio. Audio is resolved server-side from `asset:` references and muxed by ffmpeg; it is not drawn by Python.

Bundled packs are real Python files under `python/codevideo/packs/`:

- `teacher.py`: presenter/whiteboard figure.
- `geometric.py`: geometric shapes and animation.
- `code-window.py`: code editor window.

Each pack receives `(ctx, progress, element)` where `ctx` is the Cairo context, `progress` is the local scene progress from 0 to 1, and `element` is the schema element with merged `props`. Pack file hashes are written to `manifest.json`.

Imported Python packs are not executed. On Windows 10, Python execution stays disabled unless an approved external runner is configured and marked ready with `CODEVIDEO_SANDBOX_RUNNER`, `CODEVIDEO_SANDBOX_RUNNER_READY`, and `CODEVIDEO_SANDBOX_RUNNER_WINDOWS_PYTHON_READY`. Network access additionally requires `CODEVIDEO_SANDBOX_RUNNER_NETWORK_READY`.

## Current limitations

- No external Python/Cairo character pack was found in the repository; the three bundled packs above are the only available packs.
- The Python engine does not execute Motion Canvas source or SVG character rigs.
- The SVG engine does not execute Python packs.
- There is no structured audio API inside scene source; audio belongs to `project.audio`.
- There is no scene-level `camera` execution in the browser renderer beyond trusted Motion Canvas helpers; structured `scene.camera` applies to the Python/Cairo engine.
