import {buildLocalStoryboard} from '@codevideo/ai-gateway';
import {formatTimecode} from '@codevideo/shared';
import {
  Bot,
  Copy,
  FilePlus2,
  Film,
  FolderOpen,
  GitFork,
  MoreHorizontal,
  Play,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {useMemo, useRef, useState, type ChangeEvent} from 'react';
import {downloadProject, projectDuration, readProjectFile, relativeDate} from '../../lib/storage.js';
import {routeHref} from '../../lib/router.js';
import {useStudioStore} from '../../store/projectStore.js';
import {Badge, Button, Card, Dialog, Field, Input, Textarea, Tooltip} from '../ui.js';

export function Dashboard() {
  const projects = useStudioStore(state => state.projects);
  const createProject = useStudioStore(state => state.createProject);
  const duplicateProject = useStudioStore(state => state.duplicateProject);
  const deleteProject = useStudioStore(state => state.deleteProject);
  const importProject = useStudioStore(state => state.importProject);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [name, setName] = useState('Untitled Video');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () =>
      [...projects]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .filter(project =>
          `${project.name} ${project.description}`.toLowerCase().includes(search.toLowerCase()),
        ),
    [projects, search],
  );

  const totalScenes = projects.reduce((sum, project) => sum + project.scenes.length, 0);
  const totalDuration = projects.reduce(
    (sum, project) => sum + project.scenes.reduce((sceneSum, scene) => sceneSum + scene.duration, 0),
    0,
  );

  const handleCreate = () => {
    if (!name.trim()) {
      setError('Give your project a name.');
      return;
    }
    const project = prompt.trim() ? buildLocalStoryboard(prompt) : createProject(name.trim());
    if (prompt.trim()) {
      project.name = name.trim();
      importProject(project);
    }
    setCreateOpen(false);
    setName('Untitled Video');
    setPrompt('');
    setError('');
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const project = await readProjectFile(file);
      importProject(project);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid project file');
    }
    event.target.value = '';
  };

  return (
    <div className="min-h-full bg-ink-950">
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-accent-400 text-lg font-black text-ink-950">
              C
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white">CodeVideo Studio</div>
              <div className="text-[11px] text-slate-500">Code-driven video creation</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip label="View source on GitHub">
              <a
                href="https://github.com/gpttabrez/codevideo-studio"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub repository"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-ink-800 hover:text-white"
              >
                <GitFork className="h-4 w-4" />
              </a>
            </Tooltip>
            <Button variant="outline" onClick={() => { window.location.hash = '#/agent'; }}>
              <Bot className="h-4 w-4" /> AI Agent
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <FilePlus2 className="h-4 w-4" /> New project
            </Button>
          </div>
        </div>
      </header>

      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleFile} />

      <main className="mx-auto max-w-[1400px] px-8 py-10">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Your studio</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Create animated explainers from TypeScript, edit them on a real timeline, and render
              production-ready video.
            </p>
          </div>
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              aria-label="Search projects"
              placeholder="Search projects..."
              className="pl-9"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-4">
          {[
            {label: 'Projects', value: projects.length, icon: Film},
            {label: 'Scenes', value: totalScenes, icon: Sparkles},
            {label: 'Total runtime', value: formatTimecode(totalDuration, 30), icon: Play},
          ].map(stat => (
            <Card key={stat.label} className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-slate-500">{stat.label}</div>
              </div>
            </Card>
          ))}
        </div>

        {visible.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <FolderOpen className="h-10 w-10 text-slate-600" />
            <div>
              <h2 className="text-lg font-semibold text-white">No projects found</h2>
              <p className="mt-1 text-sm text-slate-400">
                {search ? 'Try a different search.' : 'Create your first video project to get started.'}
              </p>
            </div>
            {!search ? (
              <Button onClick={() => setCreateOpen(true)}>
                <FilePlus2 className="h-4 w-4" /> Create project
              </Button>
            ) : null}
          </Card>
        ) : (
          <div className="grid grid-cols-3 gap-5">
            {visible.map(project => (
              <Card key={project.id} className="group overflow-hidden transition-transform hover:-translate-y-1 hover:border-brand-500/50">
                <a href={routeHref({name: 'editor', projectId: project.id})} className="block">
                  <div className="relative h-36 bg-gradient-to-br from-[#1b2450] via-[#121a35] to-[#0b1020]">
                    <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,#8b7dff_0,transparent_35%),radial-gradient(circle_at_80%_60%,#22d3ee_0,transparent_30%)]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
                        {project.scenes.length} scene{project.scenes.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <Badge className="absolute bottom-3 left-3">{projectDuration(project)}</Badge>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-white">{project.name}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {project.description || 'No description yet'}
                        </p>
                      </div>
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${project.name}`}
                          onClick={event => {
                            event.preventDefault();
                            setMenuId(menuId === project.id ? null : project.id);
                          }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        {menuId === project.id ? (
                          <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-lg border border-ink-600 bg-ink-800 py-1 shadow-xl">
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-ink-700"
                              onClick={event => {
                                event.preventDefault();
                                duplicateProject(project.id);
                                setMenuId(null);
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" /> Duplicate
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-ink-700"
                              onClick={event => {
                                event.preventDefault();
                                downloadProject(project);
                                setMenuId(null);
                              }}
                            >
                              <Upload className="h-3.5 w-3.5" /> Export JSON
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-950/40"
                              onClick={event => {
                                event.preventDefault();
                                setDeleteId(project.id);
                                setMenuId(null);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Updated {relativeDate(project.updatedAt)}</span>
                      <span className="flex items-center gap-1 font-medium text-brand-400 group-hover:text-brand-400">
                        Open <FolderOpen className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </a>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create a project"
        description="Start empty or let the local storyboard generator draft your first scene."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Project name">
            <Input value={name} onChange={event => setName(event.target.value)} autoFocus />
          </Field>
          <Field label="Describe your video (optional)" hint="Useful for a quick local AI storyboard.">
            <Textarea
              rows={3}
              placeholder="A friendly introduction to quantum computing..."
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
            />
          </Field>
          {error ? <p className="text-xs text-rose-400">{error}</p> : null}
        </div>
      </Dialog>

      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={open => !open && setDeleteId(null)}
        title="Delete project?"
        description="This removes the project from your local studio. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteId) deleteProject(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
