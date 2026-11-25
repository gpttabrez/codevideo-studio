import * as core from '@motion-canvas/core';
import {EditableTimeEvents} from '@motion-canvas/core/lib/scenes/timeEvents/EditableTimeEvents.js';
import * as two from '@motion-canvas/2d';
import {EMPTY_SOURCE, FEATURE_SOURCE, INTRO_SOURCE, type Project, type Scene} from '@codevideo/project-schema';
import ts from 'typescript';
import * as helpers from './helpers.js';
import {validateAnimationSource} from './validation.js';

type SceneRunner = core.ThreadGeneratorFactory<two.View2D>;
type FullDescription = core.FullSceneDescription<SceneRunner>;
type CompiledScene = ReturnType<typeof two.makeScene2D>;

function withRefSupport<T extends object>(module: T): T {
  const wrappers = new Map<Function, Function>();
  return new Proxy(module, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (
        typeof value === 'function' &&
        /^class\s/.test(Function.prototype.toString.call(value))
      ) {
        let wrapped = wrappers.get(value);
        if (!wrapped) {
          const Original = value as new (...args: unknown[]) => object;
          wrapped = new Proxy(Original, {
            construct(Target, args) {
              const node = Reflect.construct(Target, args);
              const props = args[0] as {ref?: (node: object) => void} | undefined;
              if (props && typeof props.ref === 'function') {
                props.ref(node);
              }
              return node;
            },
          });
          wrappers.set(value, wrapped);
        }
        return wrapped;
      }
      return value;
    },
  });
}

const MODULE_MAP: Record<string, unknown> = {
  '@motion-canvas/2d': withRefSupport(two),
  '@motion-canvas/core': core,
  '@codevideo/animation': helpers,
};

const TRUSTED_SCENE_SOURCES = new Set([INTRO_SOURCE, FEATURE_SOURCE, EMPTY_SOURCE]);

export function isTrustedSceneSource(source: string): boolean {
  return TRUSTED_SCENE_SOURCES.has(source);
}

export function compileSceneSource(source: string): CompiledScene {
  const validation = validateAnimationSource(source);
  if (!validation.ok) {
    throw new Error(
      `Animation source is not valid:\n${validation.errors.join('\n')}`,
    );
  }
  if (!isTrustedSceneSource(source)) {
    throw new Error(
      'This scene is not a bundled trusted template and cannot be executed. ' +
        'Imported, edited, and AI-generated scene code remains editable but is disabled until an isolated execution runtime is available.',
    );
  }

  const {outputText} = ts.transpileModule(source, {
    fileName: 'scene.ts',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      isolatedModules: true,
    },
  });

  const moduleExports: Record<string, unknown> = {};
  const sandboxRequire = (specifier: string): unknown => {
    const module = MODULE_MAP[specifier];
    if (!module) {
      throw new Error(
        `Module "${specifier}" is not available in the animation sandbox.`,
      );
    }
    return module;
  };

  try {
    const execute = new Function(
      'exports',
      'module',
      'require',
      'makeScene2D',
      outputText,
    ) as (
      exports: Record<string, unknown>,
      module: {exports: Record<string, unknown>},
      require: (specifier: string) => unknown,
      makeScene2D: typeof two.makeScene2D,
    ) => void;

    execute(
      moduleExports,
      {exports: moduleExports},
      sandboxRequire,
      two.makeScene2D,
    );
  } catch (error) {
    throw new Error(
      `Animation failed to initialise: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const compiled = moduleExports.default;
  if (!compiled || typeof compiled !== 'object') {
    throw new Error(
      'Animation source must export a default scene created with makeScene2D().',
    );
  }
  return compiled as CompiledScene;
}

export function createSceneDescription(
  scene: Scene,
  size: core.Vector2,
  logger: core.Logger,
  sharedWebGLContext: core.SharedWebGLContext,
): FullDescription {
  const base = compileSceneSource(scene.source);
  const playback = new core.PlaybackManager();
  const description = {
    ...base,
    name: scene.name,
    size,
    resolutionScale: 1,
    playback: new core.PlaybackStatus(playback),
    logger,
    onReplaced: new core.ValueDispatcher<FullDescription>(base as FullDescription),
    timeEventsClass: EditableTimeEvents,
    sharedWebGLContext,
    variables: undefined,
    experimentalFeatures: false,
  };
  return description as unknown as FullDescription;
}

export interface AnimationPreviewOptions {
  container: HTMLElement;
  onFrame?: (frame: number, timeSeconds: number) => void;
  onDuration?: (seconds: number) => void;
  onError?: (error: Error) => void;
}

export class AnimationPreview {
  private player: core.Player | null = null;
  private stage: core.Stage | null = null;
  private renderer: core.Renderer | null = null;
  private renderLogger: core.Logger | null = null;
  private subscriptions: Array<() => void> = [];
  private fps = 30;
  private background = '#000000';
  private destroyed = false;

  constructor(private readonly options: AnimationPreviewOptions) {}

  get frame(): number {
    return this.player?.playback.frame ?? 0;
  }

  get durationFrames(): number {
    return this.player?.playback.duration ?? 0;
  }

  get isPlaying(): boolean {
    return this.player?.status.state === core.PlaybackState.Playing;
  }

  load(project: Project): void {
    this.disposeRuntime();

    try {
      const size = new core.Vector2(
        project.settings.width,
        project.settings.height,
      );
    this.fps = project.settings.fps;
    this.background = project.settings.background;
    const logger = new core.Logger();
      const sharedWebGLContext = new core.SharedWebGLContext(logger);
      const scenes = [...project.scenes]
        .sort((a, b) => a.order - b.order)
        .map(scene =>
          createSceneDescription(scene, size, logger, sharedWebGLContext),
        );

      const motionProject = {
        name: project.name,
        scenes,
        plugins: [],
        logger,
        audio: project.audio.find(clip => !clip.muted)?.src,
        variables: {},
        experimentalFeatures: false,
      } as unknown as core.Project;

      this.renderLogger = new core.Logger();
      this.renderer = new core.Renderer({
        ...motionProject,
        logger: this.renderLogger,
      } as unknown as core.Project);

      this.player = new core.Player(
        motionProject,
        {
          range: [0, Number.POSITIVE_INFINITY],
          fps: this.fps,
          size,
          audioOffset: 0,
          resolutionScale: 1,
        },
        {paused: true},
      );

      const stage = new core.Stage();
      stage.configure({
        size,
        resolutionScale: 1,
        background: project.settings.background,
        colorSpace: 'srgb' as core.CanvasColorSpace,
      });
      const canvas = stage.finalBuffer;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.objectFit = 'contain';
      canvas.setAttribute('data-testid', 'preview-canvas');
      this.options.container.appendChild(canvas);
      this.stage = stage;

      this.subscriptions.push(
        this.player.onRender.subscribe(async () => {
          const current = this.player;
          const activeStage = this.stage;
          if (!current || !activeStage) return;
          await activeStage.render(
            current.playback.currentScene,
            current.playback.previousScene,
          );
        }),
      );

      this.subscriptions.push(
        this.player.onFrameChanged.subscribe(frame => {
          this.options.onFrame?.(frame, frame / this.fps);
        }),
      );

      this.subscriptions.push(
        this.player.onDurationChanged.subscribe(frames => {
          this.options.onDuration?.(frames / this.fps);
        }),
      );

      this.player.activate();
      this.player.requestSeek(0);
      this.player.requestRender();
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(normalized);
      throw normalized;
    }
  }

  play(): void {
    this.player?.togglePlayback(true);
  }

  pause(): void {
    this.player?.togglePlayback(false);
  }

  toggle(): void {
    this.player?.togglePlayback();
  }

  restart(): void {
    this.player?.requestReset();
    this.player?.requestSeek(0);
  }

  seekFrame(frame: number): void {
    this.player?.requestSeek(Math.max(0, Math.round(frame)));
  }

  seekSeconds(seconds: number): void {
    this.seekFrame(seconds * this.fps);
  }

  setSpeed(speed: number): void {
    this.player?.setSpeed(speed);
  }

  async renderFrameToDataUrl(frame: number): Promise<string> {
    const renderer = this.renderer;
    const logger = this.renderLogger;
    const stage = this.stage;
    if (!renderer || !logger || !stage) {
      throw new Error('No animation is loaded.');
    }

    const target = Math.max(0, Math.round(frame));
    const time = target / this.fps;
    let renderError: Error | null = null;
    const unsubscribe = logger.onLogged.subscribe(payload => {
      if (payload.level === core.LogLevel.Error) {
        renderError = new Error(payload.message);
      }
    });

    try {
      (
        renderer as unknown as {playback: core.PlaybackManager}
      ).playback.fps = this.fps;
      await renderer.renderFrame(
        {
          name: `frame-${target}`,
          range: [time, time + 1 / this.fps],
          fps: this.fps,
          exporter: {name: 'image', options: {}},
          size: new core.Vector2(stage.finalBuffer.width, stage.finalBuffer.height),
          resolutionScale: 1,
          colorSpace: 'srgb',
          background: this.background,
        },
        time,
      );
      if (renderError) throw renderError;
      return renderer.stage.finalBuffer.toDataURL('image/png');
    } finally {
      unsubscribe();
    }
  }

  private disposeRuntime(): void {
    for (const unsubscribe of this.subscriptions) {
      try {
        unsubscribe();
      } catch {}
    }
    this.subscriptions = [];
    if (this.player) {
      this.player.deactivate();
      this.player = null;
    }
    if (this.stage) {
      this.stage.finalBuffer.remove();
      this.stage = null;
    }
    this.renderer = null;
    this.renderLogger = null;
  }

  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.disposeRuntime();
  }
}
