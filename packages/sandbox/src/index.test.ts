import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  getSandboxStatus,
  resolveWorkspacePath,
  runTrusted,
  runUntrusted,
  SandboxUnavailableError,
} from './index.js';

let workspace: string;
const originalEnv = {...process.env};

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'codevideo-sandbox-'));
  delete process.env.CODEVIDEO_SANDBOX_RUNNER;
  delete process.env.CODEVIDEO_SANDBOX_RUNNER_READY;
});

afterAll(async () => {
  process.env = originalEnv;
  await rm(workspace, {recursive: true, force: true});
});

describe('sandbox', () => {
  it('fails closed for untrusted execution on this host', () => {
    const status = getSandboxStatus();
    expect(status.supported).toBe(false);
    expect(status.reason).toMatch(/isolation|runner/i);
  });

  it('refuses untrusted Python without an approved runner', async () => {
    await expect(runUntrusted({
      workspaceId: 'ws-1',
      workspaceRoot: workspace,
      command: 'python',
      args: ['-c', 'print(1)'],
      importedPython: true,
    })).rejects.toBeInstanceOf(SandboxUnavailableError);
  });

  it('refuses network access', async () => {
    await expect(runUntrusted({
      workspaceId: 'ws-1',
      workspaceRoot: workspace,
      command: 'python',
      args: ['-c', 'print(1)'],
      network: true,
    })).rejects.toBeInstanceOf(SandboxUnavailableError);
  });

  it('rejects workspace traversal', () => {
    expect(() => resolveWorkspacePath(workspace, '../escape.txt')).toThrow(/escapes workspace/);
  });

  it('runs trusted built-in commands without shell interpretation', async () => {
    const result = await runTrusted({
      workspaceId: 'ws-1',
      workspaceRoot: workspace,
      command: process.execPath,
      args: ['-e', 'process.stdout.write("ok")'],
    });
    expect(result.stdout).toBe('ok');
    expect(result.exitCode).toBe(0);
  });
});
