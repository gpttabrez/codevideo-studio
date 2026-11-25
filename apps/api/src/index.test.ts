import {createDefaultProject} from '@codevideo/project-schema';
import {outputFile} from '@codevideo/render-jobs';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {buildServer} from './index.js';

let dir: string;

const limitKeys = [
  'RENDER_MAX_WIDTH',
  'RENDER_MAX_HEIGHT',
  'RENDER_MAX_PIXELS',
  'RENDER_MAX_FPS',
  'RENDER_MAX_SCENES',
  'RENDER_MAX_SOURCE_BYTES',
  'RENDER_MAX_CONCURRENT_PER_OWNER',
  'RENDER_MAX_QUEUED_PER_OWNER',
  'RENDER_MAX_QUEUED_GLOBAL',
];

function userHeaders(user = 'alice', extra: Record<string, string> = {}) {
  return {
    'x-codevideo-proxy-secret': 'proxy-secret',
    'x-codevideo-user': user,
    ...extra,
  };
}

function workerHeaders() {
  return {authorization: 'Bearer worker-secret'};
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codevideo-api-'));
  process.env.RENDER_DATA_DIR = dir;
  process.env.CODEVIDEO_PROXY_SECRET = 'proxy-secret';
  process.env.CODEVIDEO_WORKER_TOKEN = 'worker-secret';
});

afterEach(async () => {
  delete process.env.RENDER_DATA_DIR;
  delete process.env.CODEVIDEO_PROXY_SECRET;
  delete process.env.CODEVIDEO_WORKER_TOKEN;
  for (const key of limitKeys) delete process.env[key];
  await rm(dir, {recursive: true, force: true});
});

describe('API authentication and ownership', () => {
  it('reports health without authentication', async () => {
    const app = await buildServer();
    const response = await app.inject({method: 'GET', url: '/api/health'});
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
    await app.close();
  });

  it('rejects missing and invalid proxy identity', async () => {
    const app = await buildServer();
    expect((await app.inject({method: 'GET', url: '/api/render'})).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/render',
          headers: {'x-codevideo-proxy-secret': 'wrong', 'x-codevideo-user': 'alice'},
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/render',
          headers: {'x-codevideo-proxy-secret': 'proxy-secret'},
        })
      ).statusCode,
    ).toBe(401);
    await app.close();
  });

  it('rejects worker bearer tokens on user routes and browser identity on worker routes', async () => {
    const app = await buildServer();
    expect(
      (await app.inject({method: 'GET', url: '/api/render', headers: workerHeaders()})).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/internal/render/claim',
          headers: userHeaders(),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/internal/render/claim',
          headers: {authorization: 'Bearer unknown-token'},
        })
      ).statusCode,
    ).toBe(401);
    await app.close();
  });

  it('queues a render job using the authenticated proxy identity', async () => {
    const app = await buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders('alice', {'x-codevideo-owner': 'bob'}),
      payload: {project: createDefaultProject(), format: 'webm', quality: 'draft'},
    });
    expect(response.statusCode).toBe(202);
    const {jobId} = response.json();
    const job = await app.inject({
      method: 'GET',
      url: `/api/render/${jobId}`,
      headers: userHeaders('alice'),
    });
    expect(job.json()).toMatchObject({id: jobId, status: 'queued', format: 'webm', ownerId: 'alice'});
    await app.close();
  });

  it('isolates jobs and cancellation across owners', async () => {
    const app = await buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders('alice'),
      payload: {project: createDefaultProject(), format: 'mp4', quality: 'draft'},
    });
    const {jobId} = created.json();
    expect((await app.inject({method: 'GET', url: `/api/render/${jobId}`, headers: userHeaders('bob')})).statusCode).toBe(404);
    expect((await app.inject({method: 'GET', url: '/api/render', headers: userHeaders('bob')})).json()).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/render/${jobId}/cancel`,
          headers: userHeaders('bob'),
        })
      ).statusCode,
    ).toBe(404);
    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/render/${jobId}/cancel`,
      headers: userHeaders('alice'),
    });
    expect(cancelled.json()).toMatchObject({status: 'cancelled'});
    const claim = await app.inject({
      method: 'POST',
      url: '/api/internal/render/claim',
      headers: workerHeaders(),
    });
    expect(claim.json()).toBeNull();
    await app.close();
  });

  it('allows only the owner to download a completed output', async () => {
    const app = await buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders('alice'),
      payload: {project: createDefaultProject(), format: 'mp4', quality: 'draft'},
    });
    const {jobId} = created.json();
    await writeFile(outputFile(jobId, 'mp4'), Buffer.from('video-bytes'));
    const complete = await app.inject({
      method: 'POST',
      url: `/api/internal/render/${jobId}/complete`,
      headers: workerHeaders(),
    });
    expect(complete.json()).toMatchObject({status: 'complete', outputUrl: `/outputs/${jobId}.mp4`});
    const owner = await app.inject({
      method: 'GET',
      url: `/outputs/${jobId}.mp4`,
      headers: userHeaders('alice'),
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.headers['content-type']).toContain('video/mp4');
    expect(owner.rawPayload.toString()).toBe('video-bytes');
    expect(
      (await app.inject({method: 'GET', url: `/outputs/${jobId}.mp4`, headers: userHeaders('bob')})).statusCode,
    ).toBe(404);
    expect((await app.inject({method: 'GET', url: `/outputs/${jobId}.mp4`})).statusCode).toBe(401);
    await app.close();
  });

  it('does not publish a completed output after cancellation', async () => {
    const app = await buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders('alice'),
      payload: {project: createDefaultProject(), format: 'mp4', quality: 'draft'},
    });
    const {jobId} = created.json();
    await app.inject({
      method: 'POST',
      url: `/api/render/${jobId}/cancel`,
      headers: userHeaders('alice'),
    });
    await writeFile(outputFile(jobId, 'mp4'), Buffer.from('late-video-bytes'));
    const complete = await app.inject({
      method: 'POST',
      url: `/api/internal/render/${jobId}/complete`,
      headers: workerHeaders(),
    });
    expect(complete.json()).toMatchObject({status: 'cancelled'});
    const job = await app.inject({
      method: 'GET',
      url: `/api/render/${jobId}`,
      headers: userHeaders('alice'),
    });
    expect(job.json().status).toBe('cancelled');
    expect(job.json().outputUrl).toBeUndefined();
    expect(
      (await app.inject({method: 'GET', url: `/outputs/${jobId}.mp4`, headers: userHeaders('alice')})).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('refuses to publish completion when the output file is missing', async () => {
    const app = await buildServer();
    const created = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders('alice'),
      payload: {project: createDefaultProject(), format: 'webm', quality: 'draft'},
    });
    const {jobId} = created.json();
    const complete = await app.inject({
      method: 'POST',
      url: `/api/internal/render/${jobId}/complete`,
      headers: workerHeaders(),
    });
    expect(complete.statusCode).toBe(409);
    expect((await app.inject({method: 'GET', url: `/api/render/${jobId}`, headers: userHeaders('alice')})).json().status).toBe('queued');
    await app.close();
  });
});

describe('API resource limits', () => {
  it('rejects invalid projects', async () => {
    const app = await buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders(),
      payload: {project: {name: 'bad'}},
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('rejects excessive resolution, scene count and source size', async () => {
    process.env.RENDER_MAX_SCENES = '1';
    const app = await buildServer();
    const tooManyScenes = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders(),
      payload: {project: createDefaultProject()},
    });
    expect(tooManyScenes.statusCode).toBe(400);
    expect(tooManyScenes.json().error).toContain('scene count');

    const project = createDefaultProject();
    project.scenes = [project.scenes[0]!];
    project.settings.width = 3840;
    const tooWide = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders(),
      payload: {project},
    });
    expect(tooWide.statusCode).toBe(400);
    expect(tooWide.json().error).toContain('resolution');

    project.settings.width = 640;
    project.settings.height = 360;
    project.scenes[0]!.source = 'x'.repeat(1000);
    process.env.RENDER_MAX_SOURCE_BYTES = '100';
    const oversizedSource = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders(),
      payload: {project},
    });
    expect(oversizedSource.statusCode).toBe(400);
    expect(oversizedSource.json().error).toContain('source');
    await app.close();
  });

  it('enforces per-owner concurrency under the job creation lock', async () => {
    process.env.RENDER_MAX_CONCURRENT_PER_OWNER = '1';
    const app = await buildServer();
    const first = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders('alice'),
      payload: {project: createDefaultProject()},
    });
    expect(first.statusCode).toBe(202);
    const second = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders('alice'),
      payload: {project: createDefaultProject()},
    });
    expect(second.statusCode).toBe(429);
    const otherOwner = await app.inject({
      method: 'POST',
      url: '/api/render',
      headers: userHeaders('bob'),
      payload: {project: createDefaultProject()},
    });
    expect(otherOwner.statusCode).toBe(202);
    await app.close();
  });
});
