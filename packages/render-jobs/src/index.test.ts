import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createDefaultProject} from '@codevideo/project-schema';
import {cancelJob, claimNextJob, createJob, listJobs, outputsDir, readJob, updateJob} from './index.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codevideo-jobs-'));
  process.env.RENDER_DATA_DIR = dir;
});

afterEach(async () => {
  delete process.env.RENDER_DATA_DIR;
  await rm(dir, {recursive: true, force: true});
});

describe('render jobs', () => {
  it('creates, queues, claims and updates a job', async () => {
    const job = await createJob({
      ownerId: 'alice',
      project: createDefaultProject(),
      format: 'mp4',
      quality: 'standard',
    });
    expect(job.status).toBe('queued');
    expect((await readJob(job.id))?.id).toBe(job.id);

    const claimed = await claimNextJob();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe('rendering');
    expect(await claimNextJob()).toBeNull();

    await updateJob(job.id, {status: 'complete', progress: 1, outputUrl: '/outputs/test.mp4'});
    expect((await readJob(job.id))?.status).toBe('complete');
    expect(await listJobs()).toHaveLength(1);
  });

  it('cancels queued jobs before a worker claims them', async () => {
    const job = await createJob({ownerId: 'alice', project: createDefaultProject(), format: 'mp4', quality: 'draft'});
    expect((await cancelJob(job.id))?.status).toBe('cancelled');
    expect(await claimNextJob()).toBeNull();
  });

  it('does not create a job when the admission guard rejects it', async () => {
    await expect(
      createJob(
        {ownerId: 'alice', project: createDefaultProject(), format: 'mp4', quality: 'draft'},
        {
          guard: async () => {
            throw new Error('limit reached');
          },
        },
      ),
    ).rejects.toThrow('limit reached');
    expect(await listJobs()).toEqual([]);
  });

  it('uses the output directory override', async () => {
    const outputDir = join(dir, 'custom-outputs');
    process.env.RENDER_OUTPUTS_DIR = outputDir;
    expect(outputsDir()).toBe(outputDir);
    delete process.env.RENDER_OUTPUTS_DIR;
  });

  it('does not overwrite a cancelled job when a late completion arrives', async () => {
    const job = await createJob({ownerId: 'alice', project: createDefaultProject(), format: 'mp4', quality: 'draft'});
    await claimNextJob();
    expect((await cancelJob(job.id))?.status).toBe('cancelling');
    await updateJob(job.id, {status: 'cancelled'});
    expect((await readJob(job.id))?.status).toBe('cancelled');
    expect((await cancelJob(job.id))?.status).toBe('cancelled');
  });
});
