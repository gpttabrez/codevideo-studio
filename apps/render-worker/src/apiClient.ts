import type {RenderJob, RenderStatus} from '@codevideo/render-jobs';

function apiUrl(): string {
  return (process.env.WORKER_API_URL ?? 'http://api:3001').replace(/\/$/, '');
}

function token(): string {
  const value = process.env.CODEVIDEO_WORKER_TOKEN;
  if (!value) throw new Error('CODEVIDEO_WORKER_TOKEN is not configured.');
  return value;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token()}`,
      ...(init.body ? {'content-type': 'application/json'} : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Worker API request failed (${response.status}) for ${path}: ${body.slice(0, 500)}`);
  }
  return (await response.json()) as T;
}

export async function claimJob(): Promise<RenderJob | null> {
  return request<RenderJob | null>('/api/internal/render/claim', {method: 'POST'});
}

export async function getJobStatus(id: string): Promise<RenderStatus> {
  const job = await request<{status: RenderStatus}>(`/api/internal/render/${encodeURIComponent(id)}`);
  return job.status;
}

export async function reportProgress(id: string, progress: number, message: string): Promise<void> {
  await request(`/api/internal/render/${encodeURIComponent(id)}/progress`, {
    method: 'POST',
    body: JSON.stringify({progress, message}),
  });
}

export async function reportComplete(id: string): Promise<void> {
  await request(`/api/internal/render/${encodeURIComponent(id)}/complete`, {method: 'POST'});
}

export async function reportFailure(id: string, error: string): Promise<void> {
  await request(`/api/internal/render/${encodeURIComponent(id)}/fail`, {
    method: 'POST',
    body: JSON.stringify({error}),
  });
}

export async function reportCancelled(id: string): Promise<void> {
  await request(`/api/internal/render/${encodeURIComponent(id)}/cancel`, {method: 'POST'});
}

export function workerApiUrl(): string {
  return apiUrl();
}
