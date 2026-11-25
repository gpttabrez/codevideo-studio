import type {FrameRate, Project, RenderEngine, ResolutionPreset, Scene, SceneTransition} from '@codevideo/project-schema';
import {SlidersHorizontal} from 'lucide-react';
import {Badge, Field, Input, Select} from '../ui.js';

const RESOLUTION_SIZES: Record<ResolutionPreset, [number, number]> = {
  '1920x1080': [1920, 1080],
  '1080x1920': [1080, 1920],
  '1080x1080': [1080, 1080],
  '1280x720': [1280, 720],
};

const RESOLUTIONS: Record<ResolutionPreset, string> = {
  '1920x1080': '1920 × 1080 · 16:9',
  '1080x1920': '1080 × 1920 · 9:16',
  '1080x1080': '1080 × 1080 · 1:1',
  '1280x720': '1280 × 720 · 16:9',
};

export function Inspector({
  project,
  scene,
  onPatchScene,
  onPatchProject,
}: {
  project: Project;
  scene: Scene | undefined;
  onPatchScene: (patch: Partial<Scene>) => void;
  onPatchProject: (patch: Partial<Project>) => void;
}) {
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-ink-800 bg-ink-900" data-testid="inspector">
      <div className="flex h-11 items-center gap-2 border-b border-ink-800 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <SlidersHorizontal className="h-3.5 w-3.5 text-brand-400" /> Inspector
      </div>

      {!scene ? (
        <div className="p-5 text-xs text-slate-500">Select a scene to edit its properties.</div>
      ) : (
        <div className="space-y-5 p-4">
          <section className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Scene</h3>
            <Field label="Name">
              <Input value={scene.name} onChange={event => onPatchScene({name: event.target.value})} />
            </Field>
            <Field label={`Duration · ${scene.duration.toFixed(1)}s`}>
              <input
                type="range"
                min={1}
                max={30}
                step={0.5}
                value={scene.duration}
                onChange={event => onPatchScene({duration: Number(event.target.value)})}
                className="w-full accent-[#6d5efc]"
                aria-label="Scene duration"
              />
            </Field>
            <Field label="Background">
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Scene background color"
                  value={scene.background}
                  onChange={event => onPatchScene({background: event.target.value})}
                  className="h-9 w-10 cursor-pointer rounded border border-ink-600 bg-ink-900"
                />
                <Input
                  value={scene.background}
                  onChange={event => onPatchScene({background: event.target.value})}
                />
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Transition">
                <Select
                  value={scene.transition}
                  onChange={event => onPatchScene({transition: event.target.value as SceneTransition})}
                >
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="zoom">Zoom</option>
                </Select>
              </Field>
              <Field label="Length (s)">
                <Input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={scene.transitionDuration}
                  onChange={event => onPatchScene({transitionDuration: Number(event.target.value)})}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-ink-850 px-3 py-2 text-[11px] text-slate-400">
              <span>Tracked elements</span>
              <Badge>{scene.elements.length}</Badge>
            </div>
          </section>

          <section className="space-y-3 border-t border-ink-800 pt-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Project</h3>
            <Field label="Render engine">
              <Select
                value={project.engine ?? 'svg'}
                onChange={event => onPatchProject({engine: event.target.value as RenderEngine})}
              >
                <option value="python">Python + Cairo</option>
                <option value="svg">SVG · Motion Canvas</option>
              </Select>
            </Field>
            <Field label="Resolution">
              <Select
                value={project.settings.resolutionPreset}
                onChange={event => {
                  const preset = event.target.value as ResolutionPreset;
                  const [width, height] = RESOLUTION_SIZES[preset];
                  onPatchProject({
                    settings: {...project.settings, resolutionPreset: preset, width, height},
                  });
                }}
              >
                {Object.entries(RESOLUTIONS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Frame rate">
              <Select
                value={String(project.settings.fps)}
                onChange={event =>
                  onPatchProject({
                    settings: {...project.settings, fps: Number(event.target.value) as FrameRate},
                  })
                }
              >
                <option value="24">24 fps · cinematic</option>
                <option value="30">30 fps · standard</option>
                <option value="60">60 fps · smooth</option>
              </Select>
            </Field>
            <Field label="Canvas color">
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Project background color"
                  value={project.settings.background}
                  onChange={event =>
                    onPatchProject({
                      settings: {...project.settings, background: event.target.value},
                    })
                  }
                  className="h-9 w-10 cursor-pointer rounded border border-ink-600 bg-ink-900"
                />
                <Input
                  value={project.settings.background}
                  onChange={event =>
                    onPatchProject({
                      settings: {...project.settings, background: event.target.value},
                    })
                  }
                />
              </div>
            </Field>
          </section>

          <section className="border-t border-ink-800 pt-4">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Shortcuts</h3>
            <div className="space-y-1.5 text-[11px] text-slate-500">
              <div className="flex justify-between"><span>Play / pause</span><kbd className="rounded bg-ink-800 px-1.5 py-0.5 text-slate-300">Space</kbd></div>
              <div className="flex justify-between"><span>Seek frame</span><kbd className="rounded bg-ink-800 px-1.5 py-0.5 text-slate-300">← →</kbd></div>
              <div className="flex justify-between"><span>Save</span><kbd className="rounded bg-ink-800 px-1.5 py-0.5 text-slate-300">Ctrl S</kbd></div>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
