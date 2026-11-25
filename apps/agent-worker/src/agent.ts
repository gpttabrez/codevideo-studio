import {
  appendMessage,
  appendToolEvent,
  listSessions,
  requestApproval,
  saveCheckpoint,
  updateSession,
  type AgentSession,
} from '@codevideo/agent-jobs';
import type {ModelManager, ModelRoleConfig} from '@codevideo/ai-gateway';
import type {Project} from '@codevideo/project-schema';
import {
  executeTool,
  readWorkingProject,
  readWorkspace,
  TOOL_SPECS,
  type ToolContext,
} from '@codevideo/tool-runtime';
import {runVisionLoop} from '@codevideo/vision-loop';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate);
}

export function extractToolCall(text: string): ToolCall | null {
  try {
    const value = parseJson(text);
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.tool !== 'string') return null;
    const args = raw.arguments && typeof raw.arguments === 'object'
      ? raw.arguments as Record<string, unknown>
      : {};
    return {name: raw.tool, arguments: args};
  } catch {
    return null;
  }
}

export async function runAgentStep(
  session: AgentSession,
  project: Project,
  manager: ModelManager,
  context: ToolContext,
): Promise<{done: boolean; message: string}> {
  const sceneSummary = project.scenes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(scene => `${scene.id}: ${scene.name} (${scene.duration}s)`)
    .join('\n');
  const messages = [
    {
      role: 'system' as const,
      content: [
        'You are a persistent video production agent.',
        'Return JSON only: {"tool":"name","arguments":{}} to use a tool, or {"done":true,"message":"summary"} when finished.',
        `Available tools: ${TOOL_SPECS.map(spec => spec.name).join(', ')}`,
      ].join('\n'),
    },
    ...session.messages.slice(-12).map(message => ({
      role: message.role === 'tool' ? 'user' : message.role,
      content: message.content,
    })),
    {
      role: 'user' as const,
      content: `Goal: ${session.goal}\nScenes:\n${sceneSummary || '(none)'}`,
    },
  ];
  const response = await manager.chat('coding', {
    messages,
    tools: TOOL_SPECS.map(spec => ({
      name: spec.name,
      description: spec.description,
      inputSchema: spec.parameters,
    })),
    jsonMode: true,
  }, {toolCalling: 'json-protocol'});
  const call = extractToolCall(response.text);
  if (!call) {
    const done = parseJson(response.text) as {done?: boolean; message?: string};
    return {done: done.done === true, message: done.message ?? response.text};
  }
  const result = await executeTool(call.name, call.arguments, context);
  await appendToolEvent(session.id, {
    name: call.name,
    arguments: call.arguments,
    ...(result.ok ? {result: result.output} : {error: result.error}),
  }, session.ownerId);
  return {
    done: false,
    message: `${call.name}: ${result.ok ? 'ok' : result.error ?? 'failed'}`,
  };
}

export async function toolContextForSession(session: AgentSession): Promise<ToolContext> {
  const workspace = await readWorkspace(session.workspaceId);
  if (!workspace || workspace.ownerId !== session.ownerId) {
    throw new Error(`Workspace not found for session ${session.id}`);
  }
  return {
    sessionId: session.id,
    workspace,
    ownerId: session.ownerId,
    requireApproval: async (kind, reason) => {
      const approval = await requestApproval(session.id, kind, reason, session.ownerId);
      await updateSession(session.id, {status: 'awaiting-approval'}, session.ownerId);
      return Boolean(approval);
    },
  };
}

export async function runSession(
  session: AgentSession,
  manager: ModelManager,
  maxSteps = 8,
): Promise<void> {
  if (session.status !== 'queued' && session.status !== 'paused') return;
  await updateSession(session.id, {status: 'running', message: 'Agent running'}, session.ownerId);
  const scopedManager = manager.withRoles(session.roles as Partial<ModelRoleConfig>);
  const context = await toolContextForSession(session);
  const project = await readWorkingProject(context.workspace);
  let stopped = false;
  for (let step = 0; step < maxSteps; step += 1) {
    const current = await listSessions(session.ownerId).then(items =>
      items.find(item => item.id === session.id),
    );
    if (!current || current.status === 'cancelled' || current.status === 'awaiting-approval') {
      stopped = true;
      break;
    }
    const result = await runAgentStep(current, project, scopedManager, context);
    await appendMessage(session.id, {role: 'assistant', content: result.message}, session.ownerId);
    await saveCheckpoint(session.id, {
      label: `step-${step + 1}`,
      workspaceId: context.workspace.id,
      projectFingerprint: project.id,
      affectedScenes: project.scenes.map(scene => scene.id),
      messages: [...current.messages, {role: 'assistant' as const, content: result.message}],
      toolHistory: current.toolHistory,
      plan: current.plan,
    }, session.ownerId);
    if (result.done) break;
  }
  if (!stopped) {
    try {
      await runVisionLoop(scopedManager, context, project, {maxIterations: 1});
    } catch {
      await appendMessage(session.id, {
        role: 'assistant',
        content: 'Vision loop skipped because no capable vision model is available.',
      }, session.ownerId);
    }
  }
  await requestApproval(session.id, 'finalRender', 'Render final video', session.ownerId);
  await updateSession(session.id, {
    status: 'awaiting-approval',
    message: 'Final render approval required',
  }, session.ownerId);
}

export async function runWorkerOnce(manager: ModelManager): Promise<boolean> {
  const queued = (await listSessions()).filter(session => session.status === 'queued');
  const session = queued[0];
  if (!session) return false;
  await runSession(session, manager);
  return true;
}

export async function startWorkerLoop(manager: ModelManager): Promise<void> {
  const interval = Math.max(500, Number(process.env.AGENT_POLL_MS ?? 1500));
  for (;;) {
    const worked = await runWorkerOnce(manager);
    await new Promise(resolvePromise => setTimeout(resolvePromise, worked ? 100 : interval));
  }
}
