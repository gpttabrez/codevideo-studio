import {createDefaultProject} from '@codevideo/project-schema';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  assertOriginalsUnchanged,
  createWorkspace,
  deleteWorkspace,
  executeTool,
  readWorkingProject,
  workspaceRootDir,
  type ToolContext,
} from './index.js';

let root: string;
let workspaceId: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'codevideo-tool-runtime-'));
  process.env.TOOL_WORKSPACE_DIR = root;
  const project = createDefaultProject('Tool runtime test');
  project.scenes = project.scenes.slice(0, 1).map(scene => ({...scene, duration: 0.2}));
  const workspace = await createWorkspace({
    ownerId: 'owner-1',
    project,
    uploads: [{name: '../unsafe.png', data: Buffer.from('original')}],
  });
  workspaceId = workspace.id;
});

afterAll(async () => {
  await rm(root, {recursive: true, force: true});
  delete process.env.TOOL_WORKSPACE_DIR;
});

async function context(): Promise<ToolContext> {
  const {readWorkspace} = await import('./index.js');
  const workspace = await readWorkspace(workspaceId);
  if (!workspace) throw new Error('missing workspace');
  return {
    sessionId: 'session-1',
    workspace,
    ownerId: 'owner-1',
    requireApproval: async kind => kind === 'installDependencies',
  };
}

describe('tool runtime', () => {
  it('creates a copy-on-write workspace and keeps originals immutable', async () => {
    const ctx = await context();
    expect(workspaceRootDir()).toBe(root);
    expect(await assertOriginalsUnchanged(ctx.workspace)).toBe(true);
    expect(ctx.workspace.originalHashes['uploads/unsafepng']).toBeDefined();
  });

  it('updates scenes only in the working copy', async () => {
    const ctx = await context();
    const read = await executeTool('list_scenes', {}, ctx);
    expect(read.ok).toBe(true);
    const scenes = read.output as Array<{id: string}>;
    const result = await executeTool('update_scene', {
      sceneId: scenes[0]!.id,
      patch: {name: 'Renamed scene'},
    }, ctx);
    expect(result.ok).toBe(true);
    expect((await readWorkingProject(ctx.workspace)).scenes[0]?.name).toBe('Renamed scene');
    expect(await assertOriginalsUnchanged(ctx.workspace)).toBe(true);
  });

  it('renders real previews and returns image data for vision', async () => {
    const ctx = await context();
    const preview = await executeTool('render_preview', {}, ctx);
    expect(preview.ok).toBe(true);
    const output = preview.output as {frameCount: number; frames: string[]};
    expect(output.frameCount).toBeGreaterThan(0);
    const inspect = await executeTool('inspect_frame', {}, ctx);
    expect(inspect.ok).toBe(true);
    expect((inspect.output as {mimeType: string}).mimeType).toBe('image/png');
  }, 60_000);

  it('honors approvals and refuses immutable original changes', async () => {
    const ctx = await context();
    const install = await executeTool('request_approval', {
      kind: 'installDependencies',
      reason: 'required for render',
    }, ctx);
    expect((install.output as {approved: boolean}).approved).toBe(true);
    const forbidden = await executeTool('request_approval', {
      kind: 'modifyOriginalFiles',
      reason: 'overwrite upload',
    }, ctx);
    expect(forbidden.ok).toBe(false);
  });

  it('can delete a workspace', async () => {
    await deleteWorkspace(workspaceId);
    const {readWorkspace} = await import('./index.js');
    expect(await readWorkspace(workspaceId)).toBeNull();
  });
});
