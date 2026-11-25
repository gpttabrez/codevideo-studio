import {AnimationPreview} from '@codevideo/animation-engine';
import {
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {Project} from '@codevideo/project-schema';
import {formatTimecode, framesToSeconds} from '@codevideo/shared';
import {Button, Tooltip} from '../ui.js';

export interface PreviewHandle {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  seekFrame: (frame: number) => void;
  seekSeconds: (seconds: number) => void;
  getFrame: () => number;
}

export interface PreviewProps {
  project: Project;
  onFrame?: (frame: number, seconds: number) => void;
  onDuration?: (seconds: number) => void;
}

export const Preview = forwardRef<PreviewHandle, PreviewProps>(function Preview(
  {project, onFrame, onDuration},
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<AnimationPreview | null>(null);
  const callbacksRef = useRef({onFrame, onDuration});
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  callbacksRef.current = {onFrame, onDuration};

  const reloadKey = useMemo(
    () =>
      JSON.stringify({
        scenes: project.scenes.map(scene => scene.source),
        settings: project.settings,
        audio: project.audio,
      }),
    [project.scenes, project.settings, project.audio],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const timer = window.setTimeout(() => {
      setError(null);
      const preview = new AnimationPreview({
        container,
        onFrame: (nextFrame, seconds) => {
          setFrame(nextFrame);
          callbacksRef.current.onFrame?.(nextFrame, seconds);
        },
        onDuration: seconds => {
          setDuration(seconds);
          callbacksRef.current.onDuration?.(seconds);
        },
        onError: nextError => setError(nextError.message),
      });
      try {
        preview.load(project);
        preview.setSpeed(speed);
        previewRef.current = preview;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        preview.dispose();
        previewRef.current = null;
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      previewRef.current?.dispose();
      previewRef.current = null;
    };
    // reloadKey intentionally drives reloads when animation source/settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, speed]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        previewRef.current?.play();
        setPlaying(true);
      },
      pause: () => {
        previewRef.current?.pause();
        setPlaying(false);
      },
      toggle: () => {
        previewRef.current?.toggle();
        setPlaying(value => !value);
      },
      restart: () => {
        previewRef.current?.restart();
        setFrame(0);
        setPlaying(false);
      },
      seekFrame: next => {
        previewRef.current?.seekFrame(next);
        setFrame(next);
      },
      seekSeconds: seconds => previewRef.current?.seekSeconds(seconds),
      getFrame: () => previewRef.current?.frame ?? 0,
    }),
    [],
  );

  const fps = project.settings.fps;
  const durationFrames = Math.max(0, Math.round(duration * fps));

  return (
    <section className="flex min-h-0 flex-1 flex-col border-b border-ink-800 bg-ink-950" data-testid="preview-panel">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-ink-800 px-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Play className="h-3.5 w-3.5 text-brand-400" /> Preview
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>{project.settings.width}×{project.settings.height}</span>
          <span className="text-ink-600">•</span>
          <span>{fps} fps</span>
          <Tooltip label="Fullscreen preview is not available">
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Fullscreen preview unavailable" disabled>
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <div
          className="relative h-full max-h-full w-full overflow-hidden rounded-lg border border-ink-700 bg-black shadow-2xl"
          style={{aspectRatio: `${project.settings.width} / ${project.settings.height}`}}
        >
          <div ref={containerRef} className="absolute inset-0" data-testid="preview-container" />
          {!error ? null : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-950/95 p-6 text-center">
              <div className="text-sm font-semibold text-rose-300">Animation error</div>
              <pre className="max-h-40 max-w-full overflow-auto whitespace-pre-wrap text-left text-[11px] text-rose-200/80">
                {error}
              </pre>
            </div>
          )}
        </div>
      </div>

      <div className="flex h-12 shrink-0 items-center gap-3 border-t border-ink-800 bg-ink-900 px-4">
        <div className="flex items-center gap-1">
          <Tooltip label="Restart">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
              previewRef.current?.restart();
              setFrame(0);
              setPlaying(false);
            }} aria-label="Restart preview">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip label="Previous frame">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
              const next = Math.max(0, frame - 1);
              previewRef.current?.seekFrame(next);
              setFrame(next);
            }} aria-label="Previous frame">
              <SkipBack className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Button
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => {
              previewRef.current?.toggle();
              setPlaying(value => !value);
            }}
            aria-label={playing ? 'Pause preview' : 'Play preview'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Tooltip label="Next frame">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
              const next = frame + 1;
              previewRef.current?.seekFrame(next);
              setFrame(next);
            }} aria-label="Next frame">
              <SkipForward className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
        <div className="font-mono text-xs text-slate-300">
          {formatTimecode(framesToSeconds(frame, fps), fps)} <span className="text-slate-600">/</span>{' '}
          <span className="text-slate-500">{formatTimecode(framesToSeconds(durationFrames, fps), fps)}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Volume2 className="h-4 w-4 text-slate-500" />
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={event => setSpeed(Number(event.target.value))}
            className="h-7 rounded-md border border-ink-600 bg-ink-800 px-2 text-xs text-slate-200"
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
        </div>
      </div>
    </section>
  );
});
