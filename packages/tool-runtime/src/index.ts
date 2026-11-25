import {
  createDefaultScene,
  deserializeProject,
  ProjectSchema,
  SceneSchema,
  type Project,
  type Scene,
} from '@codevideo/project-schema';
import {renderAffectedScenes} from '@codevideo/python-renderer';
import {createId} from '@codevideo/shared';
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {basename, isAbsolute, relative, resolve} from 'node:path';

export type ApprovalKind =
  | 'installDependencies'
  | 'executeImportedPython'
  | 'modifyOriginalFiles'
  | 'finalRender';

export interface UploadedFile {
  name: string;
  data: Buffer;
}

export interface WorkspaceInfo {
  id: string;
  ownerId: string;
  projectId: string;
  root: string;
  originalDir: string;
  workDir: string;
  originalHashes: Record<string, string>;
}

export interface ToolContext {
  sessionId: string;
  workspace: WorkspaceInfo;
  ownerId: string;
  requireApproval?: (kind: ApprovalKind, reason: string) => Promise<boolean>;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolExecutionResult {
  ok: boolean;
  output: unknown;
  error?: string;
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'read_project',
    description: 'Read the current copy-on-write project JSON.',
    parameters: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    name: 'list_scenes',
    description: 'List scene ids, names, durations and order.',
    parameters: {type: 'object', properties: {}, additionalProperties: false},
  },
  {
    name: 'update_scene',
    description: 'Update one scene in the working copy.',
    parameters: {
      type: 'object',
      properties: {
        sceneId: {type: 'string'},
        patch: {type: 'object'},
      },
      required: ['sceneId', 'patch'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_scene',
    description: 'Add a new scene to the working copy.',
    parameters: {
      type: 'object',
      properties: {
        name: {type: 'string'},
        duration: {type: 'number'},
        source: {type: 'string'},
      },
      required: ['name', 'duration'],
      additionalProperties: false,
    },
  },
  {
    name: 'render_preview',
    description: 'Render affected scenes to real PNG frames with Python and Cairo.',
    parameters: {
      type: 'object',
      properties: {
        sceneIds: {type: 'array', items: {type: 'string'}},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'inspect_frame',
    description: 'Read a rendered frame as a base64 image for vision analysis.',
    parameters: {
      type: 'object',
      properties: {
        framePath: {type: 'string'},
        frameIndex: {type: 'number'},
      },
      additionalProperties: false,
    },
  },
  {
    name: 'request_approval',
    description: 'Request explicit approval for dependency install, imported Python, or final render.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['installDependencies', 'executeImportedPython', 'finalRender'],
        },
        reason: {type: 'string'},
      },
      required: ['kind', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_checkpoint',
    description: 'Summarize recoverable state for the agent.',
    parameters: {
      type: 'object',
      properties: {
        label: {type: 'string'},
      },
      required: ['label'],
      additionalProperties: false,
    },
  },
];

export function workspaceRootDir(): string {
  return resolve(process.env.TOOL_WORKSPACE_DIR ?? resolve(process.cwd(), 'data', 'workspaces'));
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function hash(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function createWorkspace(input: {
  ownerId: string;
  project: Project;
  uploads?: UploadedFile[];
  workspaceId?: string;
}): Promise<WorkspaceInfo> {
  const id = safeSegment(input.workspaceId ?? createId('workspace'));
  const root = resolve(workspaceRootDir(), id);
  const originalDir = resolve(root, 'original');
  const workDir = resolve(root, 'work');
  await mkdir(resolve(originalDir, 'uploads'), {recursive: true});
  await mkdir(resolve(workDir, 'uploads'), {recursive: true});
  await mkdir(resolve(workDir, 'previews'), {recursive: true});
  const projectJson = JSON.stringify(ProjectSchema.parse(input.project), null, 2);
  await writeFile(resolve(originalDir, 'project.json'), projectJson, 'utf8');
  await writeFile(resolve(workDir, 'project.json'), projectJson, 'utf8');
  const originalHashes: Record<string, string> = {'project.json': hash(projectJson)};
  for (const upload of input.uploads ?? []) {
    const name = safeSegment(basename(upload.name));
    if (!name) continue;
    await writeFile(resolve(originalDir, 'uploads', name), upload.data);
    await writeFile(resolve(workDir, 'uploads', name), upload.data);
    originalHashes[`uploads/${name}`] = hash(upload.data);
  }
  await writeFile(resolve(root, 'workspace.json'), JSON.stringify({
    id,
    ownerId: input.ownerId,
    projectId: input.project.id,
    originalHashes,
  }, null, 2), 'utf8');
  return {id, ownerId: input.ownerId, projectId: input.project.id, root, originalDir, workDir, originalHashes};
}

export async function readWorkspace(workspaceId: string): Promise<WorkspaceInfo | null> {
  const id = safeSegment(workspaceId);
  const root = resolve(workspaceRootDir(), id);
  try {
    const metadata = JSON.parse(await readFile(resolve(root, 'workspace.json'), 'utf8')) as {
      ownerId: string;
      projectId: string;
      originalHashes: Record<string, string>;
    };
    return {
      id,
      ownerId: metadata.ownerId,
      projectId: metadata.projectId,
      root,
      originalDir: resolve(root, 'original'),
      workDir: resolve(root, 'work'),
      originalHashes: metadata.originalHashes,
    };
  } catch {
    return null;
  }
}

export async function assertOriginalsUnchanged(workspace: WorkspaceInfo): Promise<boolean> {
  for (const [name, expected] of Object.entries(workspace.originalHashes)) {
    try {
      const actual = hash(await readFile(resolve(workspace.originalDir, name)));
      if (actual !== expected) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function readWorkingProject(workspace: WorkspaceInfo): Promise<Project> {
  return deserializeProject(await readFile(resolve(workspace.workDir, 'project.json'), 'utf8'));
}

export async function writeWorkingProject(workspace: WorkspaceInfo, project: Project): Promise<void> {
  const parsed = ProjectSchema.parse(project);
  await writeFile(resolve(workspace.workDir, 'project.json'), JSON.stringify(parsed, null, 2), 'utf8');
}

function inside(root: string, candidate: string): string {
  const target = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  const rel = relative(root, target);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path escapes workspace.');
  return target;
}

async function latestPreviewFrame(workspace: WorkspaceInfo, frameIndex?: number): Promise<string> {
  const previewsDir = resolve(workspace.workDir, 'previews');
  const dirs = (await readdir(previewsDir)).filter(name => name.startsWith('preview-')).sort().reverse();
  for (const dir of dirs) {
    const frames = (await readdir(resolve(previewsDir, dir)))
      .filter(name => /^frame-\d+\.png$/.test(name))
      .sort();
    if (!frames.length) continue;
    const selected = frameIndex === undefined
      ? frames[0]!
      : frames[Math.min(Math.max(0, frameIndex), frames.length - 1)]!;
    return resolve(previewsDir, dir, selected);
  }
  throw new Error('No preview frames are available.');
}

export async function executeTool(name: string, args: Record<string, unknown>, context: ToolContext): Promise<ToolExecutionResult> {
  try {
    const project = await readWorkingProject(context.workspace);
    if (name === 'read_project') {
      return {ok: true, output: project};
    }
    if (name === 'list_scenes') {
      return {
        ok: true,
        output: project.scenes
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(scene => ({id: scene.id, name: scene.name, duration: scene.duration, order: scene.order})),
      };
    }
    if (name === 'update_scene') {
      const sceneId = String(args.sceneId ?? '');
      const patch = args.patch as Partial<Scene>;
      const index = project.scenes.findIndex(scene => scene.id === sceneId);
      if (index < 0) throw new Error(`Scene not found: ${sceneId}`);
      const updated = SceneSchema.parse({...project.scenes[index], ...patch, id: sceneId});
      const scenes = [...project.scenes];
      scenes[index] = updated;
      await writeWorkingProject(context.workspace, {...project, scenes});
      return {ok: true, output: {scene: updated}};
    }
    if (name === 'add_scene') {
      const nameValue = String(args.name ?? 'New scene');
      const duration = Number(args.duration ?? 5);
      const source = typeof args.source === 'string' ? args.source : undefined;
      const scene = createDefaultScene(nameValue, project.scenes.length, source ?? `Text: ${nameValue}`, duration);
      await writeWorkingProject(context.workspace, {...project, scenes: [...project.scenes, scene]});
      return {ok: true, output: {scene}};
    }
    if (name === 'render_preview') {
      const sceneIds = Array.isArray(args.sceneIds)
        ? args.sceneIds.filter((item): item is string => typeof item === 'string')
        : project.scenes.map(scene => scene.id);
      const previewDir = resolve(context.workspace.workDir, 'previews', `preview-${Date.now()}-${createId('p')}`);
      const result = await renderAffectedScenes(project, sceneIds, previewDir);
      return {
        ok: true,
        output: {
          frameCount: result.manifest.frameCount,
          frames: result.frames.map(frame => relative(context.workspace.workDir, frame)),
        },
      };
    }
    if (name === 'inspect_frame') {
      const framePath = typeof args.framePath === 'string'
        ? inside(context.workspace.workDir, args.framePath)
        : await latestPreviewFrame(context.workspace, typeof args.frameIndex === 'number' ? args.frameIndex : undefined);
      const data = await readFile(inside(context.workspace.workDir, framePath));
      return {
        ok: true,
        output: {
          mimeType: 'image/png',
          data: data.toString('base64'),
        },
      };
    }
    if (name === 'request_approval') {
      const kind = args.kind as ApprovalKind;
      if (kind === 'modifyOriginalFiles') {
        return {ok: false, output: null, error: 'Original uploads are immutable.'};
      }
      const reason = String(args.reason ?? 'Approval requested');
      const approved = await context.requireApproval?.(kind, reason) ?? false;
      return {ok: true, output: {kind, approved}};
    }
    if (name === 'create_checkpoint') {
      return {
        ok: true,
        output: {
          label: String(args.label ?? 'checkpoint'),
          workspaceId: context.workspace.id,
          projectFingerprint: hash(JSON.stringify(project)),
        },
      };
    }
    return {ok: false, output: null, error: `Unknown tool: ${name}`};
  } catch (error) {
    return {ok: false, output: null, error: error instanceof Error ? error.message : String(error)};
  }
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await rm(resolve(workspaceRootDir(), safeSegment(workspaceId)), {recursive: true, force: true});
}
