import {createId, nowIso} from '@codevideo/shared';
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export type AgentStatus =
  | 'queued'
  | 'running'
  | 'awaiting-approval'
  | 'paused'
  | 'cancelling'
  | 'cancelled'
  | 'complete'
  | 'failed';

export type ApprovalKind =
  | 'installDependencies'
  | 'executeImportedPython'
  | 'modifyOriginalFiles'
  | 'finalRender';

export type ApprovalDecision = 'pending' | 'approved' | 'rejected';

export interface ApprovalRecord {
  id: string;
  kind: ApprovalKind;
  decision: ApprovalDecision;
  reason: string;
  requestedAt: string;
  decidedAt?: string;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ToolEvent {
  id: string;
  name: string;
  arguments: unknown;
  result?: unknown;
  error?: string;
  createdAt: string;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  createdAt: string;
  label: string;
  workspaceId: string;
  projectFingerprint: string;
  affectedScenes: string[];
  messages: AgentMessage[];
  toolHistory: ToolEvent[];
  plan: string[];
  model?: {providerId: string; model: string};
}

export interface AgentSession {
  id: string;
  ownerId: string;
  projectId: string;
  goal: string;
  status: AgentStatus;
  message: string;
  createdAt: string;
  updatedAt: string;
  workspaceId: string;
  roles: Record<string, {providerId: string; model: string}>;
  messages: AgentMessage[];
  toolHistory: ToolEvent[];
  plan: string[];
  checkpoints: Checkpoint[];
  approvals: ApprovalRecord[];
  error?: string;
}

export interface CreateAgentSessionInput {
  ownerId: string;
  projectId: string;
  goal: string;
  workspaceId: string;
  roles: Record<string, {providerId: string; model: string}>;
  messages?: AgentMessage[];
}

export function getAgentDataDir(): string {
  return resolve(process.env.AGENT_DATA_DIR ?? resolve(process.cwd(), 'data', 'agents'));
}

function sessionsDir(): string {
  return resolve(getAgentDataDir(), 'sessions');
}

function locksDir(): string {
  return resolve(getAgentDataDir(), 'locks');
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

function sessionFile(id: string): string {
  return resolve(sessionsDir(), `${safeId(id)}.json`);
}

export async function ensureAgentDirs(): Promise<void> {
  await Promise.all([mkdir(sessionsDir(), {recursive: true}), mkdir(locksDir(), {recursive: true})]);
}

async function withAgentLock<T>(operation: () => Promise<T>): Promise<T> {
  await mkdir(locksDir(), {recursive: true});
  const path = resolve(locksDir(), 'sessions.lock');
  let acquired = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await mkdir(path);
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
    }
  }
  if (!acquired) throw new Error('Timed out acquiring agent session lock.');
  try {
    return await operation();
  } finally {
    await rm(path, {recursive: true, force: true});
  }
}

async function persist(session: AgentSession): Promise<AgentSession> {
  await writeFile(sessionFile(session.id), JSON.stringify(session, null, 2), 'utf8');
  return session;
}

export async function readSession(id: string): Promise<AgentSession | null> {
  try {
    return JSON.parse(await readFile(sessionFile(id), 'utf8')) as AgentSession;
  } catch {
    return null;
  }
}

export async function readOwnedSession(id: string, ownerId: string): Promise<AgentSession | null> {
  const session = await readSession(id);
  return session && session.ownerId === ownerId ? session : null;
}

export async function createSession(input: CreateAgentSessionInput): Promise<AgentSession> {
  await ensureAgentDirs();
  return withAgentLock(async () => {
    const now = nowIso();
    const session: AgentSession = {
      id: createId('agent'),
      ownerId: input.ownerId,
      projectId: input.projectId,
      goal: input.goal,
      status: 'queued',
      message: 'Agent session created',
      createdAt: now,
      updatedAt: now,
      workspaceId: input.workspaceId,
      roles: input.roles,
      messages: input.messages ?? [],
      toolHistory: [],
      plan: [],
      checkpoints: [],
      approvals: [],
    };
    return persist(session);
  });
}

export async function listSessions(ownerId?: string): Promise<AgentSession[]> {
  await ensureAgentDirs();
  const files = (await readdir(sessionsDir())).filter(file => file.endsWith('.json'));
  const sessions = await Promise.all(files.map(file => readSession(file.replace(/\.json$/, ''))));
  return sessions
    .filter((session): session is AgentSession => Boolean(session))
    .filter(session => !ownerId || session.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<AgentSession, 'id' | 'createdAt' | 'ownerId'>>,
  ownerId?: string,
): Promise<AgentSession | null> {
  const current = ownerId ? await readOwnedSession(id, ownerId) : await readSession(id);
  if (!current) return null;
  const next: AgentSession = {
    ...current,
    ...patch,
    id: current.id,
    ownerId: current.ownerId,
    createdAt: current.createdAt,
    updatedAt: nowIso(),
  };
  return persist(next);
}

export async function appendMessage(
  id: string,
  message: AgentMessage,
  ownerId?: string,
): Promise<AgentSession | null> {
  const session = ownerId ? await readOwnedSession(id, ownerId) : await readSession(id);
  if (!session) return null;
  return updateSession(id, {messages: [...session.messages, message]}, ownerId);
}

export async function appendToolEvent(
  id: string,
  event: Omit<ToolEvent, 'id' | 'createdAt'>,
  ownerId?: string,
): Promise<AgentSession | null> {
  const session = ownerId ? await readOwnedSession(id, ownerId) : await readSession(id);
  if (!session) return null;
  const toolEvent: ToolEvent = {...event, id: createId('tool'), createdAt: nowIso()};
  return updateSession(id, {toolHistory: [...session.toolHistory, toolEvent]}, ownerId);
}

export async function saveCheckpoint(
  id: string,
  input: Omit<Checkpoint, 'id' | 'sessionId' | 'createdAt'>,
  ownerId?: string,
): Promise<Checkpoint | null> {
  const session = ownerId ? await readOwnedSession(id, ownerId) : await readSession(id);
  if (!session) return null;
  const checkpoint: Checkpoint = {
    ...input,
    id: createId('checkpoint'),
    sessionId: session.id,
    createdAt: nowIso(),
  };
  await updateSession(id, {checkpoints: [...session.checkpoints, checkpoint]}, ownerId);
  return checkpoint;
}

export async function findCheckpoint(id: string, checkpointId: string): Promise<Checkpoint | null> {
  const session = await readSession(id);
  return session?.checkpoints.find(checkpoint => checkpoint.id === checkpointId) ?? null;
}

export async function restoreCheckpoint(
  id: string,
  checkpointId: string,
  ownerId?: string,
): Promise<AgentSession | null> {
  const session = ownerId ? await readOwnedSession(id, ownerId) : await readSession(id);
  const checkpoint = session?.checkpoints.find(item => item.id === checkpointId);
  if (!session || !checkpoint) return null;
  return updateSession(id, {
    status: 'paused',
    message: `Restored checkpoint ${checkpointId}`,
    workspaceId: checkpoint.workspaceId,
    messages: structuredClone(checkpoint.messages),
    toolHistory: structuredClone(checkpoint.toolHistory),
    plan: structuredClone(checkpoint.plan),
    roles: checkpoint.model ? {
      ...session.roles,
      coding: checkpoint.model,
    } : session.roles,
  }, ownerId);
}

export async function requestApproval(
  id: string,
  kind: ApprovalKind,
  reason: string,
  ownerId?: string,
): Promise<ApprovalRecord | null> {
  const session = ownerId ? await readOwnedSession(id, ownerId) : await readSession(id);
  if (!session) return null;
  const record: ApprovalRecord = {
    id: createId('approval'),
    kind,
    decision: 'pending',
    reason,
    requestedAt: nowIso(),
  };
  await updateSession(id, {
    status: 'awaiting-approval',
    message: `Approval required: ${kind}`,
    approvals: [...session.approvals, record],
  }, ownerId);
  return record;
}

export async function decideApproval(
  id: string,
  approvalId: string,
  decision: Exclude<ApprovalDecision, 'pending'>,
  ownerId?: string,
): Promise<ApprovalRecord | null> {
  const session = ownerId ? await readOwnedSession(id, ownerId) : await readSession(id);
  if (!session) return null;
  const approval = session.approvals.find(item => item.id === approvalId);
  if (!approval || approval.decision !== 'pending') return null;
  const effectiveDecision = approval.kind === 'modifyOriginalFiles' ? 'rejected' : decision;
  const updated: ApprovalRecord = {
    ...approval,
    decision: effectiveDecision,
    decidedAt: nowIso(),
  };
  const approvals = session.approvals.map(item => item.id === approvalId ? updated : item);
  await updateSession(id, {
    status: effectiveDecision === 'approved' && session.status === 'awaiting-approval'
      ? 'paused'
      : session.status,
    approvals,
    message: effectiveDecision === 'approved'
      ? `Approved: ${approval.kind}`
      : `Rejected: ${approval.kind}`,
  }, ownerId);
  return updated;
}

export async function hasApproval(
  id: string,
  kind: ApprovalKind,
  ownerId?: string,
): Promise<boolean> {
  const session = ownerId ? await readOwnedSession(id, ownerId) : await readSession(id);
  return Boolean(session?.approvals.some(item => item.kind === kind && item.decision === 'approved'));
}

export async function cancelSession(id: string, ownerId?: string): Promise<AgentSession | null> {
  const session = ownerId ? await readOwnedSession(id, ownerId) : await readSession(id);
  if (!session || ['cancelled', 'complete', 'failed'].includes(session.status)) return session;
  return updateSession(id, {status: 'cancelling', message: 'Cancelling agent'}, ownerId);
}
