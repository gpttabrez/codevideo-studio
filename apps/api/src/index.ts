import {
  cancelSession,
  createSession,
  decideApproval,
  listSessions,
  readOwnedSession,
  restoreCheckpoint,
  saveCheckpoint,
  updateSession,
} from '@codevideo/agent-jobs';
import {
  AiGateway,
  extractAnimationCode,
  parseModelRoles,
  validateGeneratedAnimation,
} from '@codevideo/ai-gateway';
import {configuredEntries, createGatewayFromConfig, createModelManagerFromGateway} from '@codevideo/model-config';
import {ProjectSchema} from '@codevideo/project-schema';
import {listPythonPacks} from '@codevideo/python-renderer';
import {
  cancelJob,
  claimNextJob,
  createJob,
  ensureDirs,
  listJobs,
  outputFile,
  readJob,
  updateJob,
  type RenderFormat,
  type RenderQuality,
} from '@codevideo/render-jobs';
import {createWorkspace, readWorkspace} from '@codevideo/tool-runtime';
import {getSandboxStatus} from '@codevideo/sandbox';
import {createId} from '@codevideo/shared';
import cors from '@fastify/cors';
import Fastify, {type FastifyError} from 'fastify';
import {createReadStream} from 'node:fs';
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {basename, extname, relative, resolve} from 'node:path';
import {z} from 'zod';
import {isWorkerToken, ownerFromProxy, requireEnv, workerTokenFromRequest} from './auth.js';
import {getLimits, validateProjectLimits} from './limits.js';

export function createGateway(): AiGateway {
  return createGatewayFromConfig();
}

export function createModelManager(gateway: AiGateway) {
  return createModelManagerFromGateway(gateway);
}

const renderSchema = z.object({
  project: z.unknown(),
  format: z.enum(['mp4', 'webm', 'gif']).default('mp4'),
  quality: z.enum(['draft', 'standard', 'high']).default('standard'),
});

const aiSchema = z.object({
  provider: z.string().min(1),
  model: z.string().optional(),
  prompt: z.string().min(1).max(20_000),
  mode: z.enum(['animation', 'storyboard', 'chat']).default('chat'),
});

const agentSchema = z.object({
  project: z.unknown(),
  goal: z.string().min(1).max(20_000),
  roles: z.record(z.string(), z.object({providerId: z.string().min(1), model: z.string().min(1)})).optional(),
});

const assetSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  dataBase64: z.string().min(1),
});

const approvalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
});

const checkpointSchema = z.object({
  label: z.string().min(1).max(200),
  workspaceId: z.string().min(1),
  projectFingerprint: z.string().min(1),
  affectedScenes: z.array(z.string()).default([]),
  messages: z.array(z.object({role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.string()})).default([]),
  toolHistory: z.array(z.object({
    id: z.string(),
    name: z.string(),
    arguments: z.unknown(),
    result: z.unknown().optional(),
    error: z.string().optional(),
    createdAt: z.string(),
  })).default([]),
  plan: z.array(z.string()).default([]),
  model: z.object({providerId: z.string(), model: z.string()}).optional(),
});

const progressSchema = z.object({
  progress: z.number().min(0).max(1),
  message: z.string().min(1).max(500),
});

const failureSchema = z.object({
  error: z.string().min(1).max(4000),
});

function httpError(statusCode: number, message: string): Error & {statusCode: number} {
  return Object.assign(new Error(message), {statusCode});
}

interface AssetRecord {
  id: string;
  ownerId: string;
  name: string;
  mimeType: string;
  filename: string;
  size: number;
  createdAt: string;
}

const ASSET_ROOT = resolve(process.env.ASSET_ROOT ?? process.env.RENDER_ASSET_ROOT ?? resolve(process.cwd(), 'data', 'assets'));
const ASSET_META_DIR = resolve(ASSET_ROOT, '.meta');

function assetMetaPath(id: string): string {
  return resolve(ASSET_META_DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, '')}.json`);
}

async function readAsset(id: string): Promise<AssetRecord | null> {
  try {
    return JSON.parse(await readFile(assetMetaPath(id), 'utf8')) as AssetRecord;
  } catch {
    return null;
  }
}

function assetExtension(name: string, mimeType: string): string {
  const fromName = extname(basename(name)).toLowerCase();
  if (/^[.][a-z0-9]{1,8}$/.test(fromName)) return fromName;
  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('mp3')) return '.mp3';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('jpeg')) return '.jpg';
  if (mimeType.includes('webp')) return '.webp';
  return '.bin';
}

export async function buildServer() {
  requireEnv('CODEVIDEO_PROXY_SECRET');
  requireEnv('CODEVIDEO_WORKER_TOKEN');
  const app = Fastify({
    logger: process.env.API_LOGGER !== 'false',
    bodyLimit: Number(process.env.API_MAX_BODY_BYTES ?? 1_000_000),
  });
  await app.register(cors, {
    origin: process.env.WEB_ORIGIN?.split(',').filter(Boolean) ?? false,
    credentials: false,
  });
  await ensureDirs();
  const gateway = createGateway();
  const modelManager = createModelManager(gateway);

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (path === '/api/health') return;
    if (path.startsWith('/api/internal/')) {
      if (!isWorkerToken(workerTokenFromRequest(request))) {
        return reply.code(401).send({error: 'Worker authentication required'});
      }
      return;
    }
    const owner = ownerFromProxy(request);
    if (!owner) return reply.code(401).send({error: 'Authentication required'});
    request.codevideoOwner = owner;
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    providers: gateway.listProviders().map(provider => provider.id),
    uptime: process.uptime(),
  }));

  app.get('/api/providers', async () => gateway.listProviders().map(item => {
    const provider = gateway.getProvider(item.id);
    return {
      id: provider.id,
      name: provider.name,
      capabilities: provider.capabilities,
    };
  }));
  app.get('/api/model-catalog', async () => configuredEntries().map(entry => ({
    id: entry.id,
    type: entry.type,
    name: entry.name,
    model: entry.defaultModel,
    hasKey: Boolean(entry.apiKey || (entry.apiKeyEnv && process.env[entry.apiKeyEnv])),
    hasBaseUrl: Boolean(entry.baseUrl),
    capabilities: entry.capabilities,
  })));
  app.get('/api/ai/usage', async () => gateway.getUsage());
  app.get('/api/ai/test/:provider', async request => {
    const {provider} = request.params as {provider: string};
    return gateway.testConnection(provider);
  });

  app.post('/api/ai/generate', async request => {
    const body = aiSchema.parse(request.body);
    const system =
      body.mode === 'animation'
        ? 'You are a Motion Canvas 3 animation engineer. Return only TypeScript source for a scene using makeScene2D. Import only from @motion-canvas/2d, @motion-canvas/core and @codevideo/animation. Do not use browser APIs or Node APIs.'
        : body.mode === 'storyboard'
          ? 'You are a video storyboard writer. Return concise JSON with name, description and a scenes array containing name, duration and narration fields.'
          : 'You are a helpful video production assistant.';
    const response = await gateway.chat(body.provider, {
      model: body.model,
      jsonMode: body.mode === 'storyboard',
      messages: [
        {role: 'system', content: system},
        {role: 'user', content: body.prompt},
      ],
    });
    if (body.mode === 'animation') {
      const code = extractAnimationCode(response.text);
      return {code, validation: validateGeneratedAnimation(code), usage: response.usage};
    }
    return {text: response.text, usage: response.usage};
  });

  app.get('/api/models', async () => modelManager.listDescriptors());
  app.get('/api/engines', async () => ({
    engines: ['python', 'svg'],
    default: 'python',
    python: {
      available: await (await import('@codevideo/python-renderer')).validatePythonEnvironment(),
      packs: await listPythonPacks(),
    },
    sandbox: getSandboxStatus(),
  }));

  app.post('/api/assets', {bodyLimit: 25_000_000}, async (request, reply) => {
    const owner = request.codevideoOwner!;
    const body = assetSchema.parse(request.body);
    const data = Buffer.from(body.dataBase64, 'base64');
    if (!data.length || data.length > 20_000_000) {
      return reply.code(400).send({error: 'Asset must be between 1 byte and 20 MB.'});
    }
    const id = createId('asset');
    const filename = `${id}${assetExtension(body.name, body.mimeType)}`;
    await mkdir(ASSET_ROOT, {recursive: true});
    await mkdir(ASSET_META_DIR, {recursive: true});
    await writeFile(resolve(ASSET_ROOT, filename), data);
    const record: AssetRecord = {
      id,
      ownerId: owner,
      name: basename(body.name).slice(0, 255),
      mimeType: body.mimeType,
      filename,
      size: data.length,
      createdAt: new Date().toISOString(),
    };
    await writeFile(assetMetaPath(id), JSON.stringify(record, null, 2), 'utf8');
    reply.code(201);
    return {
      id,
      name: record.name,
      mimeType: record.mimeType,
      size: record.size,
      url: `/api/assets/${id}`,
      src: `asset:${filename}`,
    };
  });

  app.get('/api/assets/:id', async (request, reply) => {
    const record = await readAsset((request.params as {id: string}).id);
    if (!record || record.ownerId !== request.codevideoOwner) {
      return reply.code(404).send({error: 'Asset not found'});
    }
    const path = resolve(ASSET_ROOT, record.filename);
    try {
      await stat(path);
    } catch {
      return reply.code(404).send({error: 'Asset not found'});
    }
    reply.header('content-type', record.mimeType);
    reply.header('content-length', String(record.size));
    reply.header('cache-control', 'private, no-store');
    return reply.send(createReadStream(path));
  });

  app.post('/api/agent/sessions', async (request, reply) => {
    const owner = request.codevideoOwner!;
    const body = agentSchema.parse(request.body);
    const project = ProjectSchema.parse(body.project);
    const workspace = await createWorkspace({ownerId: owner, project});
    const roles = body.roles
      ? parseModelRoles(body.roles)
      : Object.fromEntries(
          Object.entries(modelManager.getRoleConfig()).map(([role, ref]) => [role, ref]),
        );
    const session = await createSession({
      ownerId: owner,
      projectId: project.id,
      goal: body.goal,
      workspaceId: workspace.id,
      roles,
    });
    reply.code(202);
    return {id: session.id, status: session.status, workspaceId: workspace.id};
  });

  app.get('/api/agent/sessions', async request =>
    (await listSessions(request.codevideoOwner!)).map(session => ({
      id: session.id,
      status: session.status,
      message: session.message,
      createdAt: session.createdAt,
    })),
  );

  app.get('/api/agent/sessions/:id', async (request, reply) => {
    const session = await readOwnedSession(
      (request.params as {id: string}).id,
      request.codevideoOwner!,
    );
    if (!session) return reply.code(404).send({error: 'Agent session not found'});
    return session;
  });

  app.get('/api/agent/sessions/:id/previews/:file', async (request, reply) => {
    const session = await readOwnedSession(
      (request.params as {id: string}).id,
      request.codevideoOwner!,
    );
    if (!session) return reply.code(404).send({error: 'Agent session not found'});
    const file = (request.params as {file: string}).file;
    if (!/^preview-[a-zA-Z0-9_-]+\/frame-\d{6}\.png$/.test(file)) {
      return reply.code(400).send({error: 'Invalid preview path'});
    }
    const workspace = await readWorkspace(session.workspaceId);
    if (!workspace || workspace.ownerId !== request.codevideoOwner) {
      return reply.code(404).send({error: 'Workspace not found'});
    }
    const previewsDir = resolve(workspace.workDir, 'previews');
    const path = resolve(previewsDir, file);
    if (relative(previewsDir, path).startsWith('..')) {
      return reply.code(400).send({error: 'Invalid preview path'});
    }
    try {
      await stat(path);
    } catch {
      return reply.code(404).send({error: 'Preview not found'});
    }
    reply.header('content-type', 'image/png');
    reply.header('cache-control', 'private, no-store');
    return reply.send(createReadStream(path));
  });

  app.post('/api/agent/sessions/:id/resume', async (request, reply) => {
    const {id} = request.params as {id: string};
    const session = await readOwnedSession(id, request.codevideoOwner!);
    if (!session) return reply.code(404).send({error: 'Agent session not found'});
    if (session.status !== 'paused') {
      return reply.code(409).send({error: 'Only paused sessions can be resumed'});
    }
    return updateSession(id, {status: 'queued', message: 'Agent resumed'}, request.codevideoOwner!);
  });

  app.post('/api/agent/sessions/:id/approve', async (request, reply) => {
    const {id} = request.params as {id: string};
    const body = approvalSchema.parse(request.body);
    const session = await readOwnedSession(id, request.codevideoOwner!);
    if (!session) return reply.code(404).send({error: 'Agent session not found'});
    const pending = session.approvals.slice().reverse().find(item => item.decision === 'pending');
    if (!pending) return reply.code(404).send({error: 'No pending approval'});
    await decideApproval(id, pending.id, body.decision, request.codevideoOwner!);
    if (body.decision === 'approved') {
      await updateSession(id, {status: 'queued', message: 'Approval granted; agent resumed'}, request.codevideoOwner!);
    }
    return readOwnedSession(id, request.codevideoOwner!);
  });

  app.post('/api/agent/sessions/:id/cancel', async (request, reply) => {
    const {id} = request.params as {id: string};
    const session = await cancelSession(id, request.codevideoOwner!);
    if (!session) return reply.code(404).send({error: 'Agent session not found'});
    return session;
  });

  app.post('/api/agent/sessions/:id/checkpoints', async (request, reply) => {
    const {id} = request.params as {id: string};
    const body = checkpointSchema.parse(request.body);
    const checkpoint = await saveCheckpoint(id, body, request.codevideoOwner!);
    if (!checkpoint) return reply.code(404).send({error: 'Agent session not found'});
    return checkpoint;
  });

  app.post('/api/agent/sessions/:id/restore', async (request, reply) => {
    const {id} = request.params as {id: string};
    const {checkpointId} = z.object({checkpointId: z.string().min(1)}).parse(request.body);
    const session = await restoreCheckpoint(id, checkpointId, request.codevideoOwner!);
    if (!session) return reply.code(404).send({error: 'Checkpoint not found'});
    return session;
  });

  app.post('/api/render', async (request, reply) => {
    const owner = request.codevideoOwner!;
    const body = renderSchema.parse(request.body);
    const project = ProjectSchema.parse(body.project);
    const limits = getLimits();
    const invalid = validateProjectLimits(project, limits);
    if (invalid) return reply.code(400).send({error: invalid});
    const job = await createJob(
      {
        ownerId: owner,
        project,
        format: body.format as RenderFormat,
        quality: body.quality as RenderQuality,
      },
      {
        guard: async () => {
          const jobs = await listJobs();
          const active = jobs.filter(
            item =>
              item.ownerId === owner &&
              ['queued', 'rendering', 'cancelling'].includes(item.status),
          );
          if (active.length >= limits.maxConcurrentPerOwner) {
            throw httpError(429, 'Render concurrency limit reached.');
          }
          const queued = jobs.filter(item => item.status === 'queued');
          if (
            queued.filter(item => item.ownerId === owner).length >= limits.maxQueuedPerOwner ||
            queued.length >= limits.maxQueuedGlobal
          ) {
            throw httpError(429, 'Render queue limit reached.');
          }
        },
      },
    );
    reply.code(202);
    return {jobId: job.id, status: job.status};
  });

  app.get('/api/render', async request => {
    const owner = request.codevideoOwner!;
    return (await listJobs()).filter(job => job.ownerId === owner);
  });

  app.get('/api/render/:id', async (request, reply) => {
    const {id} = request.params as {id: string};
    const job = await readJob(id);
    if (!job || job.ownerId !== request.codevideoOwner) {
      return reply.code(404).send({error: 'Job not found'});
    }
    return job;
  });

  app.post('/api/render/:id/cancel', async (request, reply) => {
    const {id} = request.params as {id: string};
    const job = await readJob(id);
    if (!job || job.ownerId !== request.codevideoOwner) {
      return reply.code(404).send({error: 'Job not found'});
    }
    return cancelJob(id);
  });

  app.get('/outputs/:file', async (request, reply) => {
    const {file} = request.params as {file: string};
    if (!/^[a-zA-Z0-9_-]+\.(mp4|webm|gif)$/.test(file)) {
      return reply.code(400).send({error: 'Invalid output name'});
    }
    const format = file.split('.').pop() as RenderFormat;
    const id = file.slice(0, -(format.length + 1));
    const job = await readJob(id);
    if (!job || job.ownerId !== request.codevideoOwner || job.status !== 'complete') {
      return reply.code(404).send({error: 'Output not found'});
    }
    const path = outputFile(id, format);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      return reply.code(404).send({error: 'Output not found'});
    }
    const type = format === 'mp4' ? 'video/mp4' : format === 'webm' ? 'video/webm' : 'image/gif';
    reply.header('content-type', type);
    reply.header('content-length', String(size));
    reply.header('cache-control', 'private, no-store');
    return reply.send(createReadStream(path));
  });

  app.post('/api/internal/render/claim', async () => {
    return (await claimNextJob()) ?? null;
  });

  app.get('/api/internal/render/:id', async (request, reply) => {
    const {id} = request.params as {id: string};
    const job = await readJob(id);
    if (!job) return reply.code(404).send({error: 'Job not found'});
    return {id: job.id, status: job.status, project: job.project, format: job.format, quality: job.quality};
  });

  app.post('/api/internal/render/:id/progress', async (request, reply) => {
    const {id} = request.params as {id: string};
    const body = progressSchema.parse(request.body);
    const current = await readJob(id);
    if (!current) return reply.code(404).send({error: 'Job not found'});
    if (['cancelled', 'failed'].includes(current.status)) return current;
    return updateJob(id, body);
  });

  app.post('/api/internal/render/:id/complete', async (request, reply) => {
    const {id} = request.params as {id: string};
    const current = await readJob(id);
    if (!current) return reply.code(404).send({error: 'Job not found'});
    if (['cancelled', 'cancelling', 'failed'].includes(current.status)) return current;
    try {
      await stat(outputFile(id, current.format));
    } catch {
      return reply.code(409).send({error: 'Output file is missing'});
    }
    return updateJob(id, {
      status: 'complete',
      progress: 1,
      message: 'Render complete',
      outputUrl: `/outputs/${id}.${current.format}`,
      error: undefined,
    });
  });

  app.post('/api/internal/render/:id/fail', async (request, reply) => {
    const {id} = request.params as {id: string};
    const body = failureSchema.parse(request.body);
    const current = await readJob(id);
    if (!current) return reply.code(404).send({error: 'Job not found'});
    if (current.status === 'cancelled') return current;
    return updateJob(id, {
      status: 'failed',
      message: 'Render failed',
      error: body.error,
      outputUrl: undefined,
    });
  });

  app.post('/api/internal/render/:id/cancel', async (request, reply) => {
    const {id} = request.params as {id: string};
    const current = await readJob(id);
    if (!current) return reply.code(404).send({error: 'Job not found'});
    return updateJob(id, {
      status: 'cancelled',
      progress: 0,
      message: 'Render cancelled',
      outputUrl: undefined,
    });
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = error instanceof z.ZodError ? 400 : (error.statusCode ?? 500);
    reply.code(status).send({
      error: status >= 500 ? 'Internal server error' : error.message,
      ...(error instanceof z.ZodError ? {details: error.flatten()} : {}),
    });
  });

  return app;
}

async function main() {
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen({host, port});
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  await main();
}
