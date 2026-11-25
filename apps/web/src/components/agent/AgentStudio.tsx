import type {Project} from '@codevideo/project-schema';
import {
  Bot,
  Check,
  Cpu,
  Image as ImageIcon,
  ListChecks,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  Upload,
  X,
} from 'lucide-react';
import {useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent} from 'react';
import {apiFetch} from '../../lib/api.js';
import {useStudioStore} from '../../store/projectStore.js';
import {Badge, Button, Card, Field, Input, Select, Textarea} from '../ui.js';

interface ProviderInfo {
  id: string;
  name: string;
  capabilities?: Record<string, unknown>;
}

interface CatalogEntry {
  id: string;
  type: string;
  name: string;
  model?: string;
  hasKey: boolean;
  hasBaseUrl: boolean;
  capabilities?: Record<string, unknown>;
}

interface ModelDescriptor {
  role: string;
  providerId: string;
  providerName: string;
  model: string;
  capabilities?: Record<string, unknown>;
}

interface EngineStatus {
  engines: string[];
  default: string;
  python: {available: boolean; packs: string[]};
  sandbox: {supported: boolean; reason: string};
}

interface SessionSummary {
  id: string;
  status: string;
  message: string;
  createdAt: string;
}

interface AgentApproval {
  id: string;
  kind: string;
  decision: string;
  reason: string;
}

interface ToolEvent {
  id: string;
  name: string;
  arguments: unknown;
  result?: unknown;
  error?: string;
  createdAt: string;
}

interface CheckpointRecord {
  id: string;
  label: string;
  createdAt: string;
}

interface AgentMessage {
  role: string;
  content: string;
}

interface SessionDetail extends SessionSummary {
  goal: string;
  updatedAt: string;
  messages: AgentMessage[];
  toolHistory: ToolEvent[];
  checkpoints: CheckpointRecord[];
  approvals: AgentApproval[];
}

interface UploadedAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  src: string;
}

type ModelRole = 'planning' | 'coding' | 'vision' | 'quickCorrection';
type RoleSelection = Partial<Record<ModelRole, {providerId: string; model: string}>>;

const ROLES: ModelRole[] = ['planning', 'coding', 'vision', 'quickCorrection'];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function capabilitySummary(value?: Record<string, unknown>): string {
  if (!value) return 'capabilities unknown';
  return Object.entries(value)
    .filter(([, enabled]) => enabled === true || enabled === 'native' || enabled === 'json-protocol')
    .map(([name]) => name)
    .join(', ') || 'no capabilities declared';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolveValue, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolveValue(value.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export function AgentStudio({projectId}: {projectId?: string}) {
  const projects = useStudioStore(state => state.projects);
  const activeProjectId = useStudioStore(state => state.activeProjectId);
  const updateProject = useStudioStore(state => state.updateProject);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? activeProjectId ?? projects[0]?.id ?? '');
  const [goal, setGoal] = useState('');
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [descriptors, setDescriptors] = useState<ModelDescriptor[]>([]);
  const [engines, setEngines] = useState<EngineStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [roles, setRoles] = useState<RoleSelection>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const uploadRef = useRef<HTMLInputElement>(null);

  const project = projects.find(item => item.id === selectedProjectId) ?? null;

  const loadBootstrap = useCallback(async () => {
    const failures: string[] = [];
    const load = async <T,>(path: string, setter: (value: T) => void) => {
      try {
        setter(await apiFetch<T>(path));
      } catch (cause) {
        failures.push(cause instanceof Error ? cause.message : String(cause));
      }
    };
    await Promise.all([
      load<ProviderInfo[]>('/api/providers', setProviders),
      load<CatalogEntry[]>('/api/model-catalog', setCatalog),
      load<ModelDescriptor[]>('/api/models', setDescriptors),
      load<EngineStatus>('/api/engines', setEngines),
      load<SessionSummary[]>('/api/agent/sessions', setSessions),
    ]);
    setError(failures.length ? failures.join(' | ') : '');
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await apiFetch<SessionDetail>(`/api/agent/sessions/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedSessionId);
    const timer = window.setInterval(() => void loadDetail(selectedSessionId), 1500);
    return () => window.clearInterval(timer);
  }, [selectedSessionId, loadDetail]);

  useEffect(() => {
    setRoles(current => {
      const next: RoleSelection = {...current};
      for (const descriptor of descriptors) {
        const role = descriptor.role as ModelRole;
        if (ROLES.includes(role) && !next[role]) {
          next[role] = {providerId: descriptor.providerId, model: descriptor.model};
        }
      }
      const first = catalog[0];
      if (first?.model) {
        for (const role of ROLES) {
          if (!next[role]) next[role] = {providerId: first.id, model: first.model};
        }
      }
      return next;
    });
  }, [descriptors, catalog]);

  const options = useMemo(() => {
    const items = new Map<string, {providerId: string; model: string; label: string}>();
    for (const entry of catalog) {
      if (!entry.model) continue;
      const key = `${entry.id}|${entry.model}`;
      items.set(key, {providerId: entry.id, model: entry.model, label: `${entry.name} · ${entry.model}`});
    }
    for (const descriptor of descriptors) {
      const key = `${descriptor.providerId}|${descriptor.model}`;
      if (!items.has(key)) {
        items.set(key, {
          providerId: descriptor.providerId,
          model: descriptor.model,
          label: `${descriptor.providerName} · ${descriptor.model}`,
        });
      }
    }
    return [...items.values()];
  }, [catalog, descriptors]);

  const canStart = Boolean(project && goal.trim() && options.length);

  const startSession = async () => {
    if (!project || !goal.trim()) return;
    setMessage('');
    try {
      const created = await apiFetch<{id: string}>('/api/agent/sessions', {
        method: 'POST',
        body: JSON.stringify({project, goal, roles}),
      });
      setSelectedSessionId(created.id);
      setMessage(`Agent session ${created.id} created.`);
      await loadBootstrap();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const actOnSession = async (action: string, body?: unknown) => {
    if (!selectedSessionId) return;
    try {
      await apiFetch(`/api/agent/sessions/${selectedSessionId}/${action}`, {
        method: 'POST',
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
      await loadDetail(selectedSessionId);
      await loadBootstrap();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const testProvider = async (id: string) => {
    try {
      const result = await apiFetch<{ok: boolean}>(`/api/ai/test/${encodeURIComponent(id)}`);
      setTestResults(current => ({...current, [id]: result.ok ? 'connection ok' : 'connection failed'}));
    } catch (cause) {
      setTestResults(current => ({...current, [id]: cause instanceof Error ? cause.message : String(cause)}));
    }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !project) return;
    try {
      const dataBase64 = await fileToBase64(file);
      const asset = await apiFetch<UploadedAsset>('/api/assets', {
        method: 'POST',
        body: JSON.stringify({name: file.name, mimeType: file.type || 'application/octet-stream', dataBase64}),
      });
      const isAudio = file.type.startsWith('audio/');
      updateProject(project.id, current => ({
        ...current,
        assets: [
          ...current.assets,
          {
            id: asset.id,
            name: asset.name,
            type: isAudio ? 'audio' : 'image',
            url: asset.url,
            mimeType: asset.mimeType,
            size: asset.size,
            createdAt: new Date().toISOString(),
          },
        ],
        audio: isAudio
          ? [...current.audio, {
              id: asset.id,
              name: asset.name,
              src: asset.src,
              startTime: 0,
              duration: 0,
              volume: 1,
              muted: false,
            }]
          : current.audio,
      }));
      setMessage(`Uploaded ${asset.name}.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
    event.target.value = '';
  };

  const previews = useMemo(() => {
    const result: {id: string; src: string; label: string}[] = [];
    if (!detail) return result;
    for (const event of detail.toolHistory) {
      const output = asRecord(event.result);
      if (!output) continue;
      if (typeof output.data === 'string' && typeof output.mimeType === 'string') {
        result.push({
          id: event.id,
          src: `data:${output.mimeType};base64,${output.data}`,
          label: `${event.name} frame`,
        });
      }
      if (Array.isArray(output.frames)) {
        for (const value of output.frames) {
          if (typeof value !== 'string') continue;
          const relativePath = value.replace(/^[\\/]?previews[\\/]/, '').replace(/\\/g, '/');
          if (/^preview-[a-zA-Z0-9_-]+\/frame-\d{6}\.png$/.test(relativePath)) {
            result.push({
              id: `${event.id}-${relativePath}`,
              src: `/api/agent/sessions/${detail.id}/previews/${relativePath}`,
              label: relativePath,
            });
          }
        }
      }
    }
    return result;
  }, [detail]);

  const pendingApprovals = detail?.approvals.filter(item => item.decision === 'pending') ?? [];

  return (
    <div className="min-h-full bg-ink-950 p-8 text-slate-200" data-testid="agent-studio">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xl font-bold text-white">
            <Bot className="h-5 w-5 text-brand-400" /> AI Agent Studio
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Real sessions, configured models, tool logs, previews, approvals, and checkpoints.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadBootstrap()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </header>

      {error ? (
        <Card className="mb-6 border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200" data-testid="agent-error">
          API status: {error}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="p-5" data-testid="model-manager">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Settings2 className="h-4 w-4 text-brand-400" /> Model Manager
          </div>
          {options.length === 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200" data-testid="model-blocker">
              No configured models. Set provider credentials server-side with CODEVIDEO_PROVIDERS_JSON or legacy provider variables, then refresh. No fake model activity is used.
            </div>
          ) : (
            <div className="space-y-3">
              {ROLES.map(role => (
                <Field key={role} label={role}>
                  <Select
                    data-testid={`role-${role}`}
                    value={`${roles[role]?.providerId ?? ''}|${roles[role]?.model ?? ''}`}
                    onChange={event => {
                      const [providerId, model] = event.target.value.split('|');
                      if (!providerId || !model) return;
                      setRoles(current => ({...current, [role]: {providerId, model}}));
                    }}
                  >
                    <option value="|">Not selected</option>
                    {options.map(option => (
                      <option key={`${option.providerId}|${option.model}`} value={`${option.providerId}|${option.model}`}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          )}
          <div className="mt-4 space-y-1 border-t border-ink-700 pt-4">
            {descriptors.length ? descriptors.map(item => (
              <div key={`${item.role}-${item.providerId}-${item.model}`} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{item.role}</span>
                <span className="font-mono text-slate-500">{item.providerName}/{item.model}</span>
              </div>
            )) : <p className="text-xs text-slate-500">No role bindings returned by the API.</p>}
          </div>
        </Card>

        <Card className="p-5" data-testid="provider-configuration">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Cpu className="h-4 w-4 text-brand-400" /> Provider configuration
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Credentials stay server-side. This panel shows configured adapters and can test live connections.
          </p>
          <div className="space-y-3">
            {providers.length ? providers.map(provider => (
              <div key={provider.id} className="rounded-lg border border-ink-700 bg-ink-900 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white">{provider.name}</span>
                  <Badge>{provider.id}</Badge>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">{capabilitySummary(provider.capabilities)}</div>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void testProvider(provider.id)}>
                    Test connection
                  </Button>
                  {testResults[provider.id] ? (
                    <span className="text-[11px] text-slate-400">{testResults[provider.id]}</span>
                  ) : null}
                </div>
              </div>
            )) : <p className="text-xs text-slate-500">No provider adapters registered.</p>}
          </div>
          {engines ? (
            <div className="mt-4 border-t border-ink-700 pt-4 text-[11px] text-slate-400">
              <div>Default engine: {engines.default}</div>
              <div>Python/Cairo: {engines.python.available ? 'available' : 'unavailable'}</div>
              <div>Packs: {engines.python.packs.join(', ') || 'none'}</div>
              <div>Untrusted runner: {engines.sandbox.supported ? 'configured' : engines.sandbox.reason}</div>
            </div>
          ) : null}
        </Card>

        <Card className="p-5" data-testid="upload-controls">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Upload className="h-4 w-4 text-brand-400" /> Uploads
          </div>
          <Field label="Project" hint="Uploads are added to this local project.">
            <Select
              value={selectedProjectId}
              onChange={event => setSelectedProjectId(event.target.value)}
              data-testid="agent-project-select"
            >
              {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
          <input ref={uploadRef} type="file" className="hidden" onChange={event => void upload(event)} data-testid="asset-file-input" />
          <Button className="mt-3 w-full" variant="outline" onClick={() => uploadRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload audio or image
          </Button>
          <div className="mt-4 space-y-1 text-xs">
            {(project?.assets ?? []).length ? project!.assets.map(asset => (
              <div key={asset.id} className="flex items-center justify-between rounded bg-ink-900 px-2 py-1.5">
                <span className="truncate">{asset.name}</span>
                <span className="font-mono text-slate-500">{asset.mimeType}</span>
              </div>
            )) : <p className="text-slate-500">No uploaded assets in this project.</p>}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2" data-testid="agent-panel">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Bot className="h-4 w-4 text-brand-400" /> Agent sessions
          </div>
          <div className="space-y-3">
            <Field label="Task">
              <Textarea
                rows={3}
                value={goal}
                onChange={event => setGoal(event.target.value)}
                placeholder="Read the project, correct the caption, re-render the affected scene, and save a checkpoint."
                data-testid="agent-goal"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void startSession()} disabled={!canStart} data-testid="start-agent-session">
                <Play className="h-4 w-4" /> Start agent
              </Button>
              {!canStart ? (
                <span className="text-xs text-amber-300">Select a project, enter a task, and configure at least one model.</span>
              ) : null}
            </div>
            {message ? <p className="text-xs text-brand-300">{message}</p> : null}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
            <div className="space-y-1" data-testid="session-list">
              {sessions.length ? sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${session.id === selectedSessionId ? 'border-brand-500 bg-brand-500/10 text-white' : 'border-ink-700 bg-ink-900 text-slate-300'}`}
                >
                  <div className="truncate font-mono">{session.id}</div>
                  <div className="mt-1 text-slate-500">{session.status} · {session.message}</div>
                </button>
              )) : <p className="text-xs text-slate-500">No sessions yet.</p>}
            </div>

            <div data-testid="session-detail">
              {detail ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm text-white">{detail.id}</div>
                      <div className="text-xs text-slate-500">{detail.status} · {detail.message}</div>
                    </div>
                    <Badge data-testid="agent-status">{detail.status}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs" data-testid="agent-progress">
                    <div className="rounded bg-ink-900 p-2"><div className="text-base text-white">{detail.messages.length}</div><div className="text-slate-500">messages</div></div>
                    <div className="rounded bg-ink-900 p-2"><div className="text-base text-white">{detail.toolHistory.length}</div><div className="text-slate-500">tool calls</div></div>
                    <div className="rounded bg-ink-900 p-2"><div className="text-base text-white">{detail.checkpoints.length}</div><div className="text-slate-500">checkpoints</div></div>
                  </div>

                  {pendingApprovals.length ? (
                    <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3" data-testid="approval-controls">
                      <div className="text-xs font-semibold text-amber-200">Pending approvals</div>
                      {pendingApprovals.map(approval => (
                        <div key={approval.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span>{approval.kind}: {approval.reason}</span>
                          <span className="flex gap-2">
                            <Button size="sm" onClick={() => void actOnSession('approve', {decision: 'approved'})}>
                              <Check className="h-3 w-3" /> Approve
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => void actOnSession('approve', {decision: 'rejected'})}>
                              <X className="h-3 w-3" /> Reject
                            </Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void actOnSession('cancel')} data-testid="cancel-agent">
                      <Pause className="h-3 w-3" /> Cancel
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void actOnSession('resume')} disabled={detail.status !== 'paused'} data-testid="resume-agent">
                      <Play className="h-3 w-3" /> Resume
                    </Button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><ListChecks className="h-3 w-3" /> Tool logs</div>
                      <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[11px]" data-testid="tool-logs">
                        {detail.toolHistory.length ? detail.toolHistory.map(tool => (
                          <div key={tool.id} className="border-b border-ink-800 pb-2 last:border-0">
                            <div className="text-brand-300">{tool.name}</div>
                            <div className="truncate text-slate-500">{JSON.stringify(tool.arguments)}</div>
                            <div className={tool.error ? 'text-rose-300' : 'text-slate-400'}>
                              {(tool.error ?? JSON.stringify(tool.result ?? null)).slice(0, 240)}
                            </div>
                          </div>
                        )) : <p className="text-slate-600">No tool calls yet.</p>}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><RotateCcw className="h-3 w-3" /> Checkpoints</div>
                      <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2 text-[11px]" data-testid="checkpoints">
                        {detail.checkpoints.length ? detail.checkpoints.map(checkpoint => (
                          <div key={checkpoint.id} className="flex items-center justify-between gap-2 border-b border-ink-800 pb-2 last:border-0">
                            <div className="min-w-0">
                              <div className="truncate text-slate-300">{checkpoint.label}</div>
                              <div className="font-mono text-slate-600">{checkpoint.id}</div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => void actOnSession('restore', {checkpointId: checkpoint.id})}>
                              Restore
                            </Button>
                          </div>
                        )) : <p className="text-slate-600">No checkpoints yet.</p>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 max-h-48 overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-3 text-xs" data-testid="agent-messages">
                    {detail.messages.length ? detail.messages.map((item, index) => (
                      <div key={`${item.role}-${index}`} className="mb-2">
                        <span className="font-semibold text-slate-400">{item.role}: </span>
                        <span className="whitespace-pre-wrap text-slate-300">{item.content.slice(0, 1200)}</span>
                      </div>
                    )) : <p className="text-slate-600">No messages yet.</p>}
                  </div>
                </>
              ) : <p className="text-xs text-slate-500">Select a session to inspect its live state.</p>}
            </div>
          </div>
        </Card>

        <Card className="p-5" data-testid="contact-sheet">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <ImageIcon className="h-4 w-4 text-brand-400" /> Image / contact sheet preview
          </div>
          {previews.length ? (
            <div className="grid grid-cols-2 gap-2">
              {previews.map(preview => (
                <figure key={preview.id} className="rounded-lg border border-ink-700 bg-ink-950 p-1">
                  <img src={preview.src} alt={preview.label} className="aspect-video w-full rounded object-cover" />
                  <figcaption className="truncate px-1 py-1 text-[10px] text-slate-500">{preview.label}</figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No real preview frames have been produced by this session yet. Frames appear after render_preview or inspect_frame tool calls.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
