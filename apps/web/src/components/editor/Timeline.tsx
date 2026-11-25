import type {Project} from '@codevideo/project-schema';
import {formatTimecode, framesToSeconds} from '@codevideo/shared';
import {getRulerTicks} from '@codevideo/timeline-engine';
import {Crosshair, Scissors, ZoomIn} from 'lucide-react';
import {useRef, type MouseEvent} from 'react';
import {Button, Tooltip} from '../ui.js';

const TRACK_COLORS: Record<string, string> = {
  scene: 'from-brand-500/80 to-brand-600/60 border-brand-400/60',
  character: 'from-cyan-500/70 to-cyan-700/50 border-cyan-400/50',
  audio: 'from-emerald-500/70 to-emerald-700/50 border-emerald-400/50',
  subtitle: 'from-amber-500/70 to-amber-700/50 border-amber-400/50',
  visual: 'from-fuchsia-500/70 to-fuchsia-700/50 border-fuchsia-400/50',
};

export function Timeline({
  project,
  frame,
  onSeek,
  onZoom,
  onSelectScene,
  onSplit,
  selectedSceneId,
}: {
  project: Project;
  frame: number;
  onSeek: (frame: number) => void;
  onZoom: (zoom: number) => void;
  onSelectScene: (id: string) => void;
  onSplit: () => void;
  selectedSceneId: string | null;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const fps = project.settings.fps;
  const zoom = project.timeline.zoom;
  const duration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const ticks = getRulerTicks(duration, zoom);
  const playheadSeconds = framesToSeconds(frame, fps);

  const seekFromEvent = (event: MouseEvent<HTMLDivElement>) => {
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const seconds = Math.max(0, (event.clientX - rect.left + lane.scrollLeft) / zoom);
    onSeek(Math.min(Math.round(seconds * fps), Math.round(duration * fps)));
  };

  return (
    <section className="flex h-[220px] shrink-0 flex-col border-t border-ink-800 bg-ink-900" data-testid="timeline-panel">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-ink-800 px-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Crosshair className="h-3.5 w-3.5 text-brand-400" /> Timeline
          <span className="ml-2 font-mono text-[11px] normal-case tracking-normal text-slate-500">
            {formatTimecode(playheadSeconds, fps)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Tooltip label="Split selected scene at playhead">
            <Button variant="ghost" size="sm" onClick={onSplit}>
              <Scissors className="h-3.5 w-3.5" /> Split
            </Button>
          </Tooltip>
          <div className="flex items-center gap-2">
            <ZoomIn className="h-3.5 w-3.5 text-slate-500" />
            <input
              aria-label="Timeline zoom"
              type="range"
              min={20}
              max={240}
              step={10}
              value={zoom}
              onChange={event => onZoom(Number(event.target.value))}
              className="h-1 w-28 accent-[#6d5efc]"
            />
            <span className="w-9 font-mono text-[11px] text-slate-500">{zoom}px</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-36 shrink-0 border-r border-ink-800">
          <div className="h-7 border-b border-ink-800 bg-ink-850 px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-500">
            Tracks
          </div>
          {project.timeline.tracks.map(track => (
            <div
              key={track.id}
              className="flex h-11 items-center gap-2 border-b border-ink-800/60 px-3 text-xs text-slate-300"
            >
              <span className={`h-2 w-2 rounded-full ${track.kind === 'scene' ? 'bg-brand-400' : track.kind === 'audio' ? 'bg-emerald-400' : track.kind === 'subtitle' ? 'bg-amber-400' : 'bg-cyan-400'}`} />
              <span className="truncate">{track.name}</span>
            </div>
          ))}
        </div>

        <div ref={laneRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden" onClick={seekFromEvent}>
          <div className="relative h-7 border-b border-ink-800 bg-ink-850" style={{width: Math.max(duration * zoom + 80, 800)}}>
            {ticks.map(tick => (
              <div key={tick.label} className="absolute top-0 h-full" style={{left: tick.pixel}}>
                <div className="h-2 w-px bg-ink-600" />
                <span className="ml-1 text-[10px] text-slate-500">{tick.label}</span>
              </div>
            ))}
          </div>
          {project.timeline.tracks.map(track => (
            <div
              key={track.id}
              className="relative h-11 border-b border-ink-800/60"
              style={{width: Math.max(duration * zoom + 80, 800)}}
            >
              {track.clips.map(clip => (
                <button
                  key={clip.id}
                  onClick={event => {
                    event.stopPropagation();
                    onSeek(Math.round(clip.start * fps));
                    if (clip.refId) onSelectScene(clip.refId);
                  }}
                  title={`${clip.name} · ${clip.duration.toFixed(1)}s`}
                  className={`absolute top-1.5 h-8 overflow-hidden rounded-md border bg-gradient-to-r px-2 text-left text-[11px] font-medium text-white/90 shadow transition hover:brightness-125 ${TRACK_COLORS[track.kind] ?? TRACK_COLORS.visual} ${clip.refId === selectedSceneId ? 'ring-2 ring-white/70' : ''}`}
                  style={{left: clip.start * zoom + 2, width: Math.max(clip.duration * zoom - 4, 24)}}
                >
                  <span className="block truncate">{clip.name}</span>
                </button>
              ))}
            </div>
          ))}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]"
            style={{left: playheadSeconds * zoom}}
          >
            <div className="absolute -left-[5px] top-0 h-2.5 w-2.5 rotate-45 bg-rose-400" />
          </div>
        </div>
      </div>
    </section>
  );
}
