import {AiGateway, ModelManager, type AIProvider, type ConnectionTest, type ProviderCapabilities} from '@codevideo/ai-gateway';
import {createDefaultProject} from '@codevideo/project-schema';
import {createWorkspace, readWorkspace, type ToolContext} from '@codevideo/tool-runtime';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {reviewFrame, runVisionLoop} from './index.js';

let root: string;
let context: ToolContext;
let project = createDefaultProject('Vision loop test');

function fakeProvider(capabilities: ProviderCapabilities, response: string): AIProvider {
  return {
    id: 'vision-test',
    name: 'Vision test',
    capabilities,
    async listModels() { return ['vision-model']; },
    async chat() { return {text: response, model: 'vision-model'}; },
    async chatWithMessages() { return {text: response, model: 'vision-model'}; },
    async *stream() { yield ''; },
    async testConnection(): Promise<ConnectionTest> { return {ok: true, message: 'ok', models: []}; },
  };
}

function managerFor(provider: AIProvider): ModelManager {
  const gateway = new AiGateway();
  gateway.register(provider);
  return new ModelManager(gateway, {
    roles: {vision: {providerId: provider.id, model: 'vision-model'}},
  });
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'codevideo-vision-loop-'));
  process.env.TOOL_WORKSPACE_DIR = root;
  project.scenes = project.scenes.slice(0, 1).map(scene => ({...scene, duration: 0.1}));
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
});

describe('vision loop', () => {
  it('refuses to use a model without vision capability', async () => {
    const manager = managerFor(fakeProvider({
      text: true, streaming: true, jsonMode: false, toolCalling: false, vision: false,
    }, '{}'));
    await expect(reviewFrame(manager, {mimeType: 'image/png', data: 'AA=='}, 'review'))
      .rejects.toThrow(/capabilit/i);
  });

  it('reviews a real rendered frame', async () => {
    const manager = managerFor(fakeProvider({
      text: true, streaming: true, jsonMode: false, toolCalling: false, vision: true,
    }, JSON.stringify({score: 0.9, summary: 'Looks good', suggestions: []})));
    const review = await reviewFrame(manager, {mimeType: 'image/png', data: 'AA=='}, 'review');
    expect(review.score).toBe(0.9);
  });

  it('runs a bounded feedback loop with real previews', async () => {
    const manager = managerFor(fakeProvider({
      text: true, streaming: true, jsonMode: false, toolCalling: false, vision: true,
    }, JSON.stringify({score: 1, summary: 'Good', suggestions: []})));
    const result = await runVisionLoop(manager, context, project, {maxIterations: 2, threshold: 0.85});
    expect(result.complete).toBe(true);
    expect(result.iterations).toBe(1);
  }, 30_000);
});
