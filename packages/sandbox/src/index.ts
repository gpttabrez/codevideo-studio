import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {isAbsolute, relative, resolve} from 'node:path';

export type SandboxPlatform = NodeJS.Platform;

export interface SandboxStatus {
  supported: boolean;
  platform: SandboxPlatform;
  reason: string;
  runner?: string;
}

export interface SandboxRequest {
  workspaceId: string;
  workspaceRoot: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  network?: boolean;
  importedPython?: boolean;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export class SandboxUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxUnavailableError';
  }
}

const SAFE_ENV_KEYS = [
  'PATH',
  'Path',
  'SYSTEMROOT',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'PYTHONIOENCODING',
  'PYTHONUTF8',
];

export function getSandboxStatus(
  env: NodeJS.ProcessEnv = process.env,
  platform: SandboxPlatform = process.platform,
): SandboxStatus {
  const runner = env.CODEVIDEO_SANDBOX_RUNNER;
  const ready = env.CODEVIDEO_SANDBOX_RUNNER_READY === '1';
  if (!runner) {
    return {
      supported: false,
      platform,
      reason: platform === 'win32'
        ? 'Windows Job Objects do not isolate filesystem or network access; no external isolation runner is configured.'
        : 'No external isolation runner is configured.',
    };
  }
  if (!ready) {
    return {supported: false, platform, runner, reason: 'Isolation runner is not marked ready.'};
  }
  if (!isAbsolute(runner) || !existsSync(runner)) {
    return {supported: false, platform, runner, reason: 'Isolation runner does not exist or is not an absolute path.'};
  }
  return {
    supported: true,
    platform,
    runner,
    reason: platform === 'win32'
      ? 'External Windows isolation runner is configured and marked ready.'
      : 'External isolation runner is configured and marked ready.',
  };
}

export function assertUntrustedExecutionAvailable(
  request: Pick<SandboxRequest, 'importedPython' | 'network'>,
  env: NodeJS.ProcessEnv = process.env,
  platform: SandboxPlatform = process.platform,
): void {
  const status = getSandboxStatus(env, platform);
  if (!status.supported) throw new SandboxUnavailableError(status.reason);
  if (request.importedPython && platform === 'win32' && !env.CODEVIDEO_SANDBOX_RUNNER_WINDOWS_PYTHON_READY) {
    throw new SandboxUnavailableError('Imported Python packs require a verified Windows isolation runner.');
  }
  if (request.network && !env.CODEVIDEO_SANDBOX_RUNNER_NETWORK_READY) {
    throw new SandboxUnavailableError('Network access is disabled in the sandbox.');
  }
}

export function resolveWorkspacePath(workspaceRoot: string, candidate: string): string {
  const root = resolve(workspaceRoot);
  const target = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  const rel = relative(root, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path escapes workspace: ${candidate}`);
  }
  return target;
}

function safeEnv(extra: Record<string, string> = {}): Record<string, string> {
  const output: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value) output[key] = value;
  }
  for (const [key, value] of Object.entries(extra)) {
    if (/^(CODEVIDEO_|API_|OPENAI|ANTHROPIC|GEMINI|.*TOKEN|.*KEY|.*SECRET)/i.test(key)) {
      throw new Error(`Refusing to pass sensitive environment variable: ${key}`);
    }
    output[key] = value;
  }
  return output;
}

async function runProcess(input: {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  stdin?: string;
  timeoutMs: number;
  maxOutputBytes: number;
}): Promise<SandboxResult> {
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (stdout.length > input.maxOutputBytes) {
      child.kill();
      stdout = stdout.slice(0, input.maxOutputBytes);
    }
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
    if (stderr.length > input.maxOutputBytes) {
      child.kill();
      stderr = stderr.slice(0, input.maxOutputBytes);
    }
  });
  if (input.stdin !== undefined) child.stdin.write(input.stdin);
  child.stdin.end();
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, input.timeoutMs);
  const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('close', code => resolvePromise(code ?? -1));
  });
  clearTimeout(timer);
  return {stdout, stderr, exitCode, timedOut};
}

export async function runUntrusted(request: SandboxRequest): Promise<SandboxResult> {
  assertUntrustedExecutionAvailable(request);
  const status = getSandboxStatus();
  const workspaceRoot = resolveWorkspacePath(request.workspaceRoot, '.');
  const payload = JSON.stringify({
    workspaceId: request.workspaceId,
    command: request.command,
    args: request.args ?? [],
    env: safeEnv(request.env),
    network: request.network ?? false,
    importedPython: request.importedPython ?? false,
    timeoutMs: request.timeoutMs ?? 60_000,
  });
  return runProcess({
    command: status.runner!,
    args: [],
    cwd: workspaceRoot,
    env: safeEnv(),
    stdin: payload,
    timeoutMs: request.timeoutMs ?? 60_000,
    maxOutputBytes: request.maxOutputBytes ?? 2_000_000,
  });
}

export async function runTrusted(request: SandboxRequest): Promise<SandboxResult> {
  if (request.importedPython || request.network) {
    throw new SandboxUnavailableError('Trusted execution cannot execute imported code or enable network access.');
  }
  const workspaceRoot = resolveWorkspacePath(request.workspaceRoot, '.');
  return runProcess({
    command: request.command,
    args: request.args ?? [],
    cwd: workspaceRoot,
    env: safeEnv(request.env),
    timeoutMs: request.timeoutMs ?? 60_000,
    maxOutputBytes: request.maxOutputBytes ?? 2_000_000,
  });
}
