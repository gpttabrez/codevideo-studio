import type {Project} from '@codevideo/project-schema';
import {runTrusted} from '@codevideo/sandbox';
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
export const PYTHON_ROOT = resolve(REPO_ROOT, 'python');
export const ENGINE_PATH = resolve(PYTHON_ROOT, 'codevideo', 'render.py');
export const PACKS_DIR = resolve(PYTHON_ROOT, 'codevideo', 'packs');

export interface PythonPackInfo {
  name: string;
  file: string;
  path: string;
  sha256: string;
}

export interface PythonRenderManifest {
  engine: 'python-cairo';
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  scenes: Array<{id: string | null; frames: number}>;
  packs: Record<string, {file: string; sha256: string}>;
}

export interface PythonRenderResult {
  manifest: PythonRenderManifest;
  frames: string[];
  stdout: string;
  stderr: string;
}

const PACK_FILES: Record<string, string> = {
  teacher: 'teacher.py',
  geometric: 'geometric.py',
  'code-window': 'code_window.py',
};

export function pythonCommand(): string {
  return process.env.PYTHON_COMMAND ?? 'python';
}

export async function listPythonPacks(): Promise<PythonPackInfo[]> {
  return Promise.all(Object.entries(PACK_FILES).map(async ([name, file]) => {
    const path = resolve(PACKS_DIR, file);
    const sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
    return {name, file, path, sha256};
  }));
}

export async function verifyPythonPacks(expected?: Record<string, string>): Promise<boolean> {
  const packs = await listPythonPacks();
  return packs.every(pack => !expected?.[pack.name] || expected[pack.name] === pack.sha256);
}

export async function validatePythonEnvironment(): Promise<{ok: boolean; message: string}> {
  try {
    const result = await runTrusted({
      workspaceId: 'python-environment-check',
      workspaceRoot: REPO_ROOT,
      command: pythonCommand(),
      args: ['-c', 'import cairo; surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, 2, 2); print("cairo-ok")'],
      timeoutMs: 30_000,
    });
    if (result.exitCode !== 0) {
      return {ok: false, message: result.stderr || result.stdout || 'Python check failed'};
    }
    return {ok: true, message: result.stdout.trim() || 'cairo-ok'};
  } catch (error) {
    return {ok: false, message: error instanceof Error ? error.message : String(error)};
  }
}

export async function renderProjectToFrames(
  project: Project,
  options: {
    outputDir: string;
    sceneIds?: string[];
    maxFrames?: number;
    timeoutMs?: number;
    onProgress?: (progress: number, message: string) => void;
  },
): Promise<PythonRenderResult> {
  await mkdir(options.outputDir, {recursive: true});
  const projectPath = resolve(options.outputDir, 'project.json');
  await writeFile(projectPath, JSON.stringify(project), 'utf8');
  const args = [
    ENGINE_PATH,
    '--project',
    projectPath,
    '--output',
    options.outputDir,
  ];
  if (options.sceneIds?.length) args.push('--scenes', options.sceneIds.join(','));
  if (options.maxFrames) args.push('--max-frames', String(options.maxFrames));
  const result = await runTrusted({
    workspaceId: `python-render-${project.id}`,
    workspaceRoot: REPO_ROOT,
    command: pythonCommand(),
    args,
    timeoutMs: options.timeoutMs ?? 300_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(`Python renderer failed: ${result.stderr || result.stdout}`);
  }
  let lastProgress = 0;
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^PROGRESS\s+(\d+)\s+(\d+)$/);
    if (!match) continue;
    const current = Number(match[1]);
    const total = Number(match[2]);
    if (total > 0) {
      lastProgress = Math.min(1, current / total);
      options.onProgress?.(lastProgress, `Rendering frame ${current}/${total}`);
    }
  }
  const manifest = JSON.parse(await readFile(resolve(options.outputDir, 'manifest.json'), 'utf8')) as PythonRenderManifest;
  const frames = (await readdir(options.outputDir))
    .filter(file => /^frame-\d+\.png$/.test(file))
    .sort()
    .map(file => resolve(options.outputDir, file));
  if (!frames.length) throw new Error('Python renderer produced no frames.');
  return {manifest, frames, stdout: result.stdout, stderr: result.stderr};
}

export async function renderAffectedScenes(
  project: Project,
  sceneIds: string[],
  outputDir: string,
): Promise<PythonRenderResult> {
  return renderProjectToFrames(project, {outputDir, sceneIds});
}
