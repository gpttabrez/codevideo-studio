import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  appendToolEvent,
  createSession,
  decideApproval,
  findCheckpoint,
  hasApproval,
  readOwnedSession,
  requestApproval,
  restoreCheckpoint,
  saveCheckpoint,
  updateSession,
} from './index.js';

let dataDir: string;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'codevideo-agent-jobs-'));
  process.env.AGENT_DATA_DIR = dataDir;
});

afterAll(async () => {
  await rm(dataDir, {recursive: true, force: true});
  delete process.env.AGENT_DATA_DIR;
});

function baseInput() {
  return {
    ownerId: 'owner-1',
    projectId: 'project-1',
    goal: 'Build a nice explainer',
    workspaceId: 'workspace-1',
    roles: {coding: {providerId: 'ollama', model: 'local'}},
  };
}

describe('agent jobs', () => {
  it('persists sessions and enforces owner scoping', async () => {
    const session = await createSession(baseInput());
    expect(await readOwnedSession(session.id, 'owner-1')).not.toBeNull();
    expect(await readOwnedSession(session.id, 'owner-2')).toBeNull();
    const updated = await updateSession(session.id, {status: 'running'}, 'owner-2');
    expect(updated).toBeNull();
  });

  it('records tool history and restores checkpoints after restart', async () => {
    const session = await createSession(baseInput());
    await updateSession(session.id, {status: 'running', plan: ['plan']}, 'owner-1');
    await appendToolEvent(session.id, {
      name: 'readProject',
      arguments: {},
      result: {scenes: 1},
    }, 'owner-1');
    const checkpoint = await saveCheckpoint(session.id, {
      label: 'after-read',
      workspaceId: 'workspace-2',
      projectFingerprint: 'fingerprint-1',
      affectedScenes: ['scene-1'],
      messages: [{role: 'assistant', content: 'draft'}],
      toolHistory: [{
        id: 'tool-1',
        name: 'readProject',
        arguments: {},
        createdAt: new Date().toISOString(),
      }],
      plan: ['next'],
      model: {providerId: 'ollama', model: 'local'},
    }, 'owner-1');
    expect(checkpoint).not.toBeNull();
    expect(await findCheckpoint(session.id, checkpoint!.id)).not.toBeNull();

    const restored = await restoreCheckpoint(session.id, checkpoint!.id, 'owner-1');
    expect(restored?.workspaceId).toBe('workspace-2');
    expect(restored?.plan).toEqual(['next']);
    expect(restored?.toolHistory).toHaveLength(1);
  });

  it('never permits modification of immutable original files', async () => {
    const session = await createSession(baseInput());
    const approval = await requestApproval(
      session.id,
      'modifyOriginalFiles',
      'overwrite upload',
      'owner-1',
    );
    const decision = await decideApproval(session.id, approval!.id, 'approved', 'owner-1');
    expect(decision?.decision).toBe('rejected');
    expect(await hasApproval(session.id, 'modifyOriginalFiles', 'owner-1')).toBe(false);
  });

  it('tracks ordinary approvals', async () => {
    const session = await createSession(baseInput());
    const approval = await requestApproval(
      session.id,
      'installDependencies',
      'install cairo',
      'owner-1',
    );
    const decision = await decideApproval(session.id, approval!.id, 'approved', 'owner-1');
    expect(decision?.decision).toBe('approved');
    expect(await hasApproval(session.id, 'installDependencies', 'owner-1')).toBe(true);
  });
});
