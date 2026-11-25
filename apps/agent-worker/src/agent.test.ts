import {createSession} from '@codevideo/agent-jobs';
import {AiGateway, ModelManager, type AIProvider, type ConnectionTest} from '@codevideo/ai-gateway';
import {createDefaultProject} from '@codevideo/project-schema';
import {createWorkspace, readWorkspace, type ToolContext} from '@codevideo/tool-runtime';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {extractToolCall, runAgentStep} from './agent.js';

let root: string;
let context: ToolContext;
let project = createDefaultProject('Agent worker test');

function fakeProvider(text: string): AIProvider {
  return {
    id: 'coding-test',
    name: 'Coding test',
    capabilities: {
      text: true,
      streaming: true,
      jsonMode: true,
      toolCalling: 'json-protocol',
      vision: false,
    },
    async listModels() { return ['coder']; },
    async chat() { return {text, model: 'coder'}; },
    async chatWithMessages() { return {text, model: 'coder'}; },
    async *stream() { yield ''; },
    async testConnection(): Promise<ConnectionTest> { return {ok: true, message: 'ok', models: []}; },
  };
}

function managerFor(text: string): ModelManager {
  const gateway = new AiGateway();
  gateway.register(fakeProvider(text));
  return new ModelManager(gateway, {
    roles: {coding: {providerId: 'coding-test', model: 'coder'}},
  });
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'codevideo-agent-worker-'));
  process.env.TOOL_WORKSPACE_DIR = root;
  process.env.AGENT_DATA_DIR = join(root, 'agents');
  project.scenes = project.scenes.slice(0, 1).map(scene => ({...scene, duration: 0.2}));
  const workspace = await createWorkspace({ownerId: 'owner-1', project});
  context = {
    sessionId: 'session-1',
    workspace: (await readWorkspace(workspace.id))!,
    ownerId: 'owner-1',
  };
});

afterAll(async () => {
  await rm(root, {recursive: true, force: true});
  delete process.env.TOOL_WORKSPACE_DIR;
  delete process.env.AGENT_DATA_DIR;
});

describe('agent worker', () => {
  it('extracts JSON tool calls', () => {
    expect(extractToolCall('{"tool":"list_scenes","arguments":{}}')).toEqual({
      name: 'list_scenes',
      arguments: {},
    });
    expect(extractToolCall('no json')).toBeNull();
  });

  it('executes a tool through the model loop', async () => {
    const session = await createSession({
      ownerId: 'owner-1',
      projectId: project.id,
      goal: 'Inspect scenes',
      workspaceId: context.workspace.id,
      roles: {coding: {providerId: 'coding-test', model: 'coder'}},
    });
    const manager = managerFor(JSON.stringify({tool: 'list_scenes', arguments: {}}));
    const result = await runAgentStep(session, project, manager, context);
    expect(result.done).toBe(false);
    expect(result.message).toContain('list_scenes');
  });

  it('reports completion when the model returns done', async () => {
    const session = await createSession({
      ownerId: 'owner-1',
      projectId: project.id,
      goal: 'Finish',
      workspaceId: context.workspace.id,
      roles: {coding: {providerId: 'coding-test', model: 'coder'}},
    });
    const manager = managerFor(JSON.stringify({done: true, message: 'all set'}));
    const result = await runAgentStep(session, project, manager, context);
    expect(result).toEqual({done: true, message: 'all set'});
  });
});
