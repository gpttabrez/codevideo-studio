import {EMPTY_SOURCE, FEATURE_SOURCE, INTRO_SOURCE} from '@codevideo/project-schema';
import type {Character, Project} from '@codevideo/project-schema';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FileCode2,
  ImagePlus,
  Layers3,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import {useState} from 'react';
import {Badge, Button, Tabs} from '../ui.js';

const TEMPLATES = [
  {id: 'intro', name: 'Animated intro', source: INTRO_SOURCE, description: 'Card reveal + camera move'},
  {id: 'feature', name: 'Feature highlight', source: FEATURE_SOURCE, description: 'Drawing path sequence'},
  {id: 'blank', name: 'Blank scene', source: EMPTY_SOURCE, description: 'Start from scratch'},
];

export function Sidebar({
  project,
  selectedSceneId,
  onSelectScene,
  onAddScene,
  onDuplicateScene,
  onRemoveScene,
  onMoveScene,
  onAddCharacter,
  onInsertCharacter,
  onAddTemplate,
}: {
  project: Project;
  selectedSceneId: string | null;
  onSelectScene: (id: string) => void;
  onAddScene: () => void;
  onDuplicateScene: (id: string) => void;
  onRemoveScene: (id: string) => void;
  onMoveScene: (id: string, direction: -1 | 1) => void;
  onAddCharacter: () => void;
  onInsertCharacter: (character: Character) => void;
  onAddTemplate: (source: string, name: string) => void;
}) {
  const [tab, setTab] = useState('scenes');

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900" data-testid="sidebar">
      <div className="p-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            {id: 'scenes', label: 'Scenes', icon: <Layers3 className="h-3.5 w-3.5" />},
            {id: 'characters', label: 'Cast', icon: <UserRound className="h-3.5 w-3.5" />},
            {id: 'assets', label: 'Assets', icon: <ImagePlus className="h-3.5 w-3.5" />},
            {id: 'templates', label: 'Templates', icon: <Sparkles className="h-3.5 w-3.5" />},
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {tab === 'scenes' ? (
          <div className="space-y-2">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {project.scenes.length} scenes
              </span>
              <Button size="sm" variant="secondary" onClick={onAddScene}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            {project.scenes.map((scene, index) => (
              <div
                key={scene.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectScene(scene.id)}
                onKeyDown={event => event.key === 'Enter' && onSelectScene(scene.id)}
                className={`group rounded-lg border p-2.5 transition-colors ${
                  scene.id === selectedSceneId
                    ? 'border-brand-500/70 bg-brand-500/10'
                    : 'border-transparent bg-ink-850 hover:border-ink-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-ink-700 text-[10px] font-semibold text-slate-300">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">
                    {scene.name}
                  </span>
                  <Badge>{scene.duration}s</Badge>
                </div>
                <div className="mt-2 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Move up" onClick={event => { event.stopPropagation(); onMoveScene(scene.id, -1); }}>
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Move down" onClick={event => { event.stopPropagation(); onMoveScene(scene.id, 1); }}>
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Duplicate" onClick={event => { event.stopPropagation(); onDuplicateScene(scene.id); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-rose-400"
                    title="Delete"
                    onClick={event => { event.stopPropagation(); onRemoveScene(scene.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'characters' ? (
          <div className="space-y-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cast</span>
              <Button size="sm" variant="secondary" onClick={onAddCharacter}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            {project.characters.length === 0 ? (
              <div className="rounded-lg border border-dashed border-ink-600 p-5 text-center text-xs text-slate-500">
                No characters yet. Create an SVG rig to use in your scenes.
              </div>
            ) : (
              project.characters.map(character => (
                <div key={character.id} className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 p-2">
                  <div
                    className="h-10 w-8 shrink-0 rounded bg-cyan-500/10"
                    dangerouslySetInnerHTML={{__html: character.svg}}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-slate-200">{character.name}</div>
                    <div className="text-[10px] text-slate-500">{character.expression}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Character scene execution is unavailable until isolated execution is implemented"
                    disabled
                    onClick={() => onInsertCharacter(character)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === 'assets' ? (
          <div className="rounded-lg border border-dashed border-ink-600 p-6 text-center">
            <ImagePlus className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-xs text-slate-400">Asset uploads are not available in this release.</p>
            <p className="mt-1 text-[11px] text-slate-600">This panel is intentionally disabled until secure asset storage is implemented.</p>
          </div>
        ) : null}

        {tab === 'templates' ? (
          <div className="space-y-2">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Scene templates
            </div>
            {TEMPLATES.map(template => (
              <button
                key={template.id}
                onClick={() => onAddTemplate(template.source, template.name)}
                className="w-full rounded-lg border border-ink-700 bg-ink-850 p-3 text-left transition-colors hover:border-brand-500/60"
              >
                <div className="flex items-center gap-2">
                  <FileCode2 className="h-4 w-4 text-accent-400" />
                  <span className="text-xs font-semibold text-slate-200">{template.name}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{template.description}</p>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-ink-800 p-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-600">
          <span>Motion Canvas 3</span>
          <span className="text-emerald-500">● Ready</span>
        </div>
      </div>
    </aside>
  );
}
