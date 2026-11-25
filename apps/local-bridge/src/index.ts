import Fastify, {type FastifyInstance} from 'fastify';
import {createHash, timingSafeEqual} from 'node:crypto';

export type LocalBridgeProtocol = 'ollama' | 'openai';

export interface LocalBridgeOptions {
  token: string;
  upstream: string;
  protocol?: LocalBridgeProtocol;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function safeEqual(left: string, right: string): boolean {
  const a = digest(left);
  const b = digest(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function assertAllowedUpstream(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) upstreams are allowed.');
  if (url.username || url.password) throw new Error('Upstream credentials are not allowed.');
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('Local bridge may only proxy to loopback model servers.');
  }
  return url.toString().replace(/\/$/, '');
}

export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): LocalBridgeOptions {
  const token = env.LOCAL_BRIDGE_TOKEN;
  if (!token) throw new Error('LOCAL_BRIDGE_TOKEN must be configured.');
  const protocol = env.LOCAL_BRIDGE_PROTOCOL === 'openai' ? 'openai' : 'ollama';
  return {
    token,
    upstream: assertAllowedUpstream(env.LOCAL_BRIDGE_UPSTREAM ?? 'http://127.0.0.1:11434'),
    protocol,
  };
}

export async function createBridgeServer(options: LocalBridgeOptions): Promise<FastifyInstance> {
  const upstream = assertAllowedUpstream(options.upstream);
  const protocol = options.protocol ?? 'ollama';
  const app = Fastify({logger: false, bodyLimit: 10_000_000});

  app.addHook('onRequest', async (request, reply) => {
    const header = request.headers['x-local-bridge-token'];
    const auth = request.headers.authorization;
    const bearer = typeof auth === 'string' ? /^Bearer\s+(.+)$/i.exec(auth)?.[1] : undefined;
    const provided = typeof header === 'string' ? header : bearer;
    if (!provided || !safeEqual(provided, options.token)) {
      return reply.code(401).send({error: 'Local bridge token required'});
    }
  });

  app.get('/health', async () => ({status: 'ok', upstream, protocol}));

  app.get('/models', async (_request, reply) => {
    const path = protocol === 'ollama' ? '/api/tags' : '/v1/models';
    const response = await fetch(`${upstream}${path}`);
    reply.code(response.status);
    reply.header('content-type', 'application/json');
    return await response.json();
  });

  app.post('/chat', async (request, reply) => {
    const path = protocol === 'ollama' ? '/api/chat' : '/v1/chat/completions';
    const response = await fetch(`${upstream}${path}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(request.body),
    });
    reply.code(response.status);
    reply.header('content-type', response.headers.get('content-type') ?? 'application/json');
    return response.body ? await response.json() : {};
  });

  return app;
}

async function main(): Promise<void> {
  const options = optionsFromEnv();
  const app = await createBridgeServer(options);
  const port = Number(process.env.LOCAL_BRIDGE_PORT ?? 4310);
  const host = process.env.LOCAL_BRIDGE_HOST ?? '127.0.0.1';
  await app.listen({host, port});
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  await main();
}
