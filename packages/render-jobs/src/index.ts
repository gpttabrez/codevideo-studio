import type {Project} from '@codevideo/project-schema';
import {createId, nowIso} from '@codevideo/shared';
import {randomUUID} from 'node:crypto';
import {mkdir, readdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export type RenderFormat = 'mp4' | 'webm' | 'gif';
export type RenderQuality = 'draft' | 'standard' | 'high';
export type RenderStatus = 'queued' | 'rendering' | 'cancelling' | 'cancelled' | 'complete' | 'failed';

export interface RenderJob {
  id: string;
  ownerId: string;
  project: Project;
  format: RenderFormat;
  quality: RenderQuality;
  status: RenderStatus;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  outputUrl?: string;
  error?: string;
}

export function getDataDir(): string {
  return resolve(process.env.RENDER_DATA_DIR ?? resolve(process.cwd(), 'data'));
}

function jobsDir(): string {
  return resolve(getDataDir(), 'jobs');
}

function queueDir(): string {
  return resolve(getDataDir(), 'queue');
}

function lockDir(): string {
  return resolve(getDataDir(), 'locks');
}

export function outputsDir(): string {
  return resolve(process.env.RENDER_OUTPUTS_DIR ?? resolve(getDataDir(), 'outputs'));
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, {force: true});
    throw error;
  }
}

export async function ensureDirs(): Promise<void> {
  await Promise.all([
    mkdir(jobsDir(), {recursive: true}),
    mkdir(queueDir(), {recursive: true}),
    mkdir(lockDir(), {recursive: true}),
    mkdir(outputsDir(), {recursive: true}),
  ]);
}

async function withJobLock<T>(operation: () => Promise<T>): Promise<T> {
  await mkdir(lockDir(), {recursive: true});
  const path = resolve(lockDir(), 'create.lock');
  let acquired = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await mkdir(path);
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  if (!acquired) throw new Error('Timed out acquiring render job lock.');
  try {
    return await operation();
  } finally {
    await rm(path, {recursive: true, force: true});
  }
}

function jobFile(id: string): string {
  return resolve(jobsDir(), `${safeId(id)}.json`);
}

function queueFile(id: string): string {
  return resolve(queueDir(), `${safeId(id)}.json`);
}

export async function createJob(
  input: {
    ownerId: string;
    project: Project;
    format: RenderFormat;
    quality: RenderQuality;
  },
  options: {guard?: () => Promise<void>} = {},
): Promise<RenderJob> {
  await ensureDirs();
  return withJobLock(async () => {
    await options.guard?.();
    const now = nowIso();
    const job: RenderJob = {
      id: createId('job'),
      ownerId: input.ownerId,
      project: input.project,
      format: input.format,
      quality: input.quality,
      status: 'queued',
      progress: 0,
      message: 'Waiting for a render worker',
      createdAt: now,
      updatedAt: now,
    };
    await writeJsonAtomic(jobFile(job.id), job);
    await writeJsonAtomic(queueFile(job.id), {id: job.id});
    return job;
  });
}

export async function readJob(id: string): Promise<RenderJob | null> {
  try {
    return JSON.parse(await readFile(jobFile(id), 'utf8')) as RenderJob;
  } catch {
    return null;
  }
}

export async function updateJob(
  id: string,
  patch: Partial<Omit<RenderJob, 'id' | 'createdAt'>>,
): Promise<RenderJob | null> {
  const job = await readJob(id);
  if (!job) return null;
  const next: RenderJob = {...job, ...patch, id: job.id, updatedAt: nowIso()};
  await writeJsonAtomic(jobFile(id), next);
  return next;
}

export async function listJobs(): Promise<RenderJob[]> {
  await ensureDirs();
  const files = (await readdir(jobsDir())).filter(file => file.endsWith('.json'));
  const jobs = await Promise.all(files.map(file => readJob(file.replace(/\.json$/, ''))));
  return jobs
    .filter((job): job is RenderJob => Boolean(job))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function claimNextJob(): Promise<RenderJob | null> {
  await ensureDirs();
  const files = (await readdir(queueDir())).filter(file => file.endsWith('.json')).sort();
  for (const file of files) {
    const markerPath = resolve(queueDir(), file);
    const claimedPath = `${markerPath}.claimed`;
    try {
      await rename(markerPath, claimedPath);
    } catch {
      continue;
    }
    const id = file.replace(/\.json$/, '');
    const current = await readJob(id);
    await rm(claimedPath, {force: true});
    if (!current || current.status === 'cancelled' || current.status === 'cancelling') continue;
    const job = await updateJob(id, {status: 'rendering', progress: 0, message: 'Preparing render'});
    if (job) return job;
  }
  return null;
}

export async function cancelJob(id: string): Promise<RenderJob | null> {
  const job = await readJob(id);
  if (!job || ['complete', 'failed', 'cancelled'].includes(job.status)) return job;
  const status = job.status === 'queued' ? 'cancelled' : 'cancelling';
  if (status === 'cancelled') await rm(queueFile(id), {force: true});
  return updateJob(id, {status, message: status === 'cancelled' ? 'Render cancelled' : 'Cancelling render'});
}

export function outputFile(id: string, format: RenderFormat): string {
  return resolve(outputsDir(), `${safeId(id)}.${format}`);
}

export function outputUrl(id: string, format: RenderFormat): string {
  return `/outputs/${safeId(id)}.${format}`;
}
