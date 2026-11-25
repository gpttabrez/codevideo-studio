import {createHash, timingSafeEqual} from 'node:crypto';
import type {FastifyRequest} from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    codevideoOwner?: string;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function safeEqual(left: string, right: string): boolean {
  const a = digest(left);
  const b = digest(right);
  return timingSafeEqual(a, b);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

export function ownerFromProxy(request: FastifyRequest): string | null {
  const expected = process.env.CODEVIDEO_PROXY_SECRET;
  const provided = request.headers['x-codevideo-proxy-secret'];
  if (!expected || typeof provided !== 'string' || !safeEqual(provided, expected)) return null;
  const owner = request.headers['x-codevideo-user'];
  if (typeof owner !== 'string' || !/^[A-Za-z0-9._@-]{1,128}$/.test(owner)) return null;
  return owner;
}

export function isWorkerToken(value: string | undefined): boolean {
  const expected = process.env.CODEVIDEO_WORKER_TOKEN;
  if (!expected || !value) return false;
  return safeEqual(value, expected);
}

export function workerTokenFromRequest(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}
