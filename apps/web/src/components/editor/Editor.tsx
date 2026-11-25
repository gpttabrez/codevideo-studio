import {characterToSource} from '@codevideo/character-engine';
import {createDefaultScene, type Project, type Scene} from '@codevideo/project-schema';
import {createId, framesToSeconds, nowIso} from '@codevideo/shared';
import {ArrowLeft, Bot, Check, Download, Film, Loader2, Save} from 'lucide-react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {downloadProject, serializeProject} from '../../lib/storage.js';
import {
  addCharacter,
  addScene,
  duplicateScene,
  moveScene,
  removeScene,
  useStudioStore,
} from '../../store/projectStore.js';
import {Badge, Button, Dialog, Field, Input, Select} from '../ui.js';
import {Inspector} from './Inspector.js';
import {MonacoPanel} from './MonacoPanel.js';
import {Preview, type PreviewHandle} from './Preview.js';
import {Sidebar} from './Sidebar.js';
import {Timeline} from './Timeline.js';

const API_URL = import.meta.env.VITE_API_URL ?? '';

function splitSceneAt(project: Project, sceneId: string, seconds: number): Project {
  const index = project.scenes.findIndex(scene => scene.id === sceneId);
  if (index < 0) return project;
  const scene = project.scenes[index]!;
  const start = project.timeline.tracks
    .flatMap(track => track.clips)
    .find(clip => clip.refId === sceneId)?.start ?? 0;
  const offset = seconds - start;
  if (offset <= 0.2 || offset >= scene.duration - 0.2) return project;
  const first: Scene = {...scene, duration: offset};
  const second: Scene = {
    ...structuredClone(scene),
    id: createId('scene'),
    name: `${scene.name} (part 2)`,
    order: scene.order + 1,
    duration: scene.duration - offset,
  };
  const scenes = project.scenes.flatMap((item, position) => {
    if (position === index) return [first, second];
    if (position > index) return [{...item, order: item.order + 1}];
    return [item];
  });
  return {...project, scenes};
}

export function Editor({projectId, onBack}: {projectId: string; onBack: () => void}) {
  const projects = useStudioStore(state => state.projects);
  const activeProjectId = useStudioStore(state => state.activeProjectId);
  const selectedSceneId = useStudioStore(state => state.selectedSceneId);
  const openProject = useStudioStore(state => state.openProject);
  const updateProject = useStudioStore(state => state.updateProject);
  const selectScene = useStudioStore(state => state.selectScene);
  const previewRef = useRef<PreviewHandle>(null);
  const [frame, setFrame] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [format, setFormat] = useState<'mp4' | 'webm' | 'gif'>('mp4');
  const [quality, setQuality] = useState<'draft' | 'standard' | 'high'>('standard');
  const [jobId, setJobId] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<'idle' | 'queued' | 'rendering' | 'done' | 'error'>('idle');
  const [renderMessage, setRenderMessage] = useState('');

  const project = projects.find(item => item.id === projectId);

  useEffect(() => {
    if (activeProjectId !== projectId) openProject(projectId);
  }, [activeProjectId, openProject, projectId]);

  const patchProject = useCallback(
    (updater: (project: Project) => Project) => {
      updateProject(projectId, current => ({...updater(current), updatedAt: nowIso()}));
    },
    [projectId, updateProject],
  );

  const patchScene = useCallback(
    (sceneId: string, patch: Partial<Scene>) => {
      patchProject(current => ({
        ...current,
        scenes: current.scenes.map(scene => (scene.id === sceneId ? {...scene, ...patch} : scene)),
      }));
    },
    [patchProject],
  );

  const scene = useMemo(
    () => project?.scenes.find(item => item.id === selectedSceneId) ?? project?.scenes[0],
    [project, selectedSceneId],
  );

  useEffect(() => {
    if (project && !scene) selectScene(project.scenes[0]?.id ?? null);
  }, [project, scene, selectScene]);

  const handleSeek = useCallback((nextFrame: number) => {
    setFrame(nextFrame);
    previewRef.current?.seekFrame(nextFrame);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        previewRef.current?.toggle();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const next = Math.max(0, frame - (event.shiftKey ? 30 : 1));
        handleSeek(next);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleSeek(frame + (event.shiftKey ? 30 : 1));
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (project) downloadProject(project);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [frame, handleSeek, project]);

  useEffect(() => {
    if (!jobId || (renderStatus !== 'queued' && renderStatus !== 'rendering')) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`${API_URL}/api/render/${jobId}`);
        if (!response.ok) throw new Error(`Render job failed (${response.status})`);
        const job = (await response.json()) as {
          status: string;
          progress?: number;
          message?: string;
          outputUrl?: string;
        };
        if (cancelled) return;
        if (job.status === 'complete' && job.outputUrl) {
          setRenderStatus('done');
          setRenderMessage('Your video is ready.');
          window.open(`${API_URL}${job.outputUrl}`, '_blank');
        } else if (job.status === 'failed') {
          setRenderStatus('error');
          setRenderMessage(job.message ?? 'Render failed.');
        } else {
          setRenderStatus('rendering');
          setRenderMessage(`${Math.round((job.progress ?? 0) * 100)}% · ${job.message ?? 'Rendering'}`);
          window.setTimeout(poll, 900);
        }
      } catch (cause) {
        if (cancelled) return;
        setRenderStatus('error');
        setRenderMessage(cause instanceof Error ? cause.message : 'Render failed.');
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [jobId, renderStatus]);

  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-ink-950">
        <p className="text-sm text-slate-400">Project not found.</p>
        <Button onClick={onBack}>Back to studio</Button>
      </div>
    );
  }

  const handleStartRender = async () => {
    setRenderStatus('queued');
    setRenderMessage('Uploading project…');
    try {
      const response = await fetch(`${API_URL}/api/render`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({project, format, quality}),
      });
      if (!response.ok) throw new Error(`Render service unavailable (${response.status})`);
      const job = (await response.json()) as {jobId: string};
      setJobId(job.jobId);
      setRenderStatus('rendering');
      setRenderMessage('Job queued…');
    } catch (cause) {
      setRenderStatus('error');
      setRenderMessage(
        cause instanceof Error
          ? `${cause.message}. Start the API and worker with docker compose, or export the project JSON.`
          : 'Render failed.',
      );
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950" data-testid="editor">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-ink-800 bg-ink-900 px-4">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to studio">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <Input
            aria-label="Project name"
            value={project.name}
            onChange={event => patchProject(current => ({...current, name: event.target.value}))}
            className="h-8 w-64 border-transparent bg-transparent px-1 text-sm font-semibold focus:bg-ink-800"
          />
          <div className="flex items-center gap-2 px-1 text-[10px] text-slate-500">
            <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Check className="mr-1 h-2.5 w-2.5" /> Saved locally
            </Badge>
            <span>{project.scenes.length} scenes</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => { window.location.hash = `#/agent/${project.id}`; }}>
            <Bot className="h-4 w-4" /> AI Agent
          </Button>
          <Button variant="ghost" onClick={() => downloadProject(project)}>
            <Save className="h-4 w-4" /> Export JSON
          </Button>
          <Button onClick={() => setExportOpen(true)}>
            <Film className="h-4 w-4" /> Render video
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar
          project={project}
          selectedSceneId={scene?.id ?? null}
          onSelectScene={selectScene}
          onAddScene={() => {
            const next = addScene(project);
            patchProject(() => next);
            selectScene(next.scenes.at(-1)?.id ?? null);
          }}
          onDuplicateScene={id => {
            const next = duplicateScene(project, id);
            patchProject(() => next);
          }}
          onRemoveScene={id => {
            const next = removeScene(project, id);
            patchProject(() => next);
            if (selectedSceneId === id) selectScene(next.scenes[0]?.id ?? null);
          }}
          onMoveScene={(id, direction) => patchProject(current => moveScene(current, id, direction))}
          onAddCharacter={() => {
            const {project: next, character} = addCharacter(project);
            patchProject(() => next);
            const nextScene = createDefaultScene(
              `${character.name} scene`,
              next.scenes.length,
              `import character from ${JSON.stringify(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(character.svg)}`)};\n${characterToSource({
                id: character.id,
                name: character.name,
                config: character.configuration.config as never,
                parts: character.configuration.parts as Record<string, string>,
                svg: character.svg,
              })}`,
              4,
            );
            patchProject(current => ({...current, scenes: [...current.scenes, nextScene]}));
            selectScene(nextScene.id);
          }}
          onInsertCharacter={character => {
            const source = characterToSource({
              id: character.id,
              name: character.name,
              config: character.configuration.config as never,
              parts: character.configuration.parts as Record<string, string>,
              svg: character.svg,
            });
            patchScene(scene!.id, {source});
          }}
          onAddTemplate={(source, name) => {
            const nextScene = createDefaultScene(name, project.scenes.length, source, 5);
            patchProject(current => ({...current, scenes: [...current.scenes, nextScene]}));
            selectScene(nextScene.id);
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <Preview
                ref={previewRef}
                project={project}
                onFrame={setFrame}
                onDuration={() => undefined}
              />
              <MonacoPanel
                value={scene?.source ?? ''}
                onChange={value => scene && patchScene(scene.id, {source: value})}
                sceneName={scene?.name ?? 'No scene'}
              />
            </div>
            <Inspector
              project={project}
              scene={scene}
              onPatchScene={patch => scene && patchScene(scene.id, patch)}
              onPatchProject={patch => patchProject(current => ({...current, ...patch}))}
            />
          </div>
          <Timeline
            project={project}
            frame={frame}
            onSeek={handleSeek}
            onZoom={zoom => patchProject(current => ({...current, timeline: {...current.timeline, zoom}}))}
            onSelectScene={selectScene}
            onSplit={() =>
              scene &&
              patchProject(current => splitSceneAt(current, scene.id, framesToSeconds(frame, current.settings.fps)))
            }
            selectedSceneId={scene?.id ?? null}
          />
        </main>
      </div>

      <Dialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="Render video"
        description="Render through the local API and worker, or download the editable project."
        footer={
          <>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>Close</Button>
            <Button onClick={() => void handleStartRender()} disabled={renderStatus === 'queued' || renderStatus === 'rendering'}>
              {renderStatus === 'queued' || renderStatus === 'rendering' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Film className="h-4 w-4" />
              )}
              Start render
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Format">
              <Select value={format} onChange={event => setFormat(event.target.value as typeof format)}>
                <option value="mp4">MP4 · H.264</option>
                <option value="webm">WebM · VP9</option>
                <option value="gif">GIF · looping</option>
              </Select>
            </Field>
            <Field label="Quality">
              <Select value={quality} onChange={event => setQuality(event.target.value as typeof quality)}>
                <option value="draft">Draft · fast</option>
                <option value="standard">Standard</option>
                <option value="high">High · slower</option>
              </Select>
            </Field>
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3 text-xs text-slate-400">
            <div className="flex justify-between"><span>Resolution</span><span className="font-mono text-slate-200">{project.settings.width}×{project.settings.height}</span></div>
            <div className="mt-1 flex justify-between"><span>Frame rate</span><span className="font-mono text-slate-200">{project.settings.fps} fps</span></div>
            <div className="mt-1 flex justify-between"><span>Duration</span><span className="font-mono text-slate-200">{project.scenes.reduce((sum, scene) => sum + scene.duration, 0).toFixed(1)}s</span></div>
          </div>
          {renderMessage ? (
            <div className={`rounded-lg px-3 py-2 text-xs ${renderStatus === 'error' ? 'bg-rose-500/10 text-rose-300' : 'bg-brand-500/10 text-brand-300'}`}>
              {renderMessage}
            </div>
          ) : null}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              const blob = new Blob([serializeProject(project)], {type: 'application/json'});
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `${project.id}.codevideo.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4" /> Download project JSON instead
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
