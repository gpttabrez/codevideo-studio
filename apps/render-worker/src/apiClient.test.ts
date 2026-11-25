import {afterEach, describe, expect, it} from 'vitest';
import {claimJob} from './apiClient.js';

afterEach(() => {
  delete process.env.CODEVIDEO_WORKER_TOKEN;
});

describe('worker API client', () => {
  it('refuses to call the API without a worker service token', async () => {
    delete process.env.CODEVIDEO_WORKER_TOKEN;
    await expect(claimJob()).rejects.toThrow('CODEVIDEO_WORKER_TOKEN is not configured.');
  });
});
