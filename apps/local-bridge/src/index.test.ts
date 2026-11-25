import {afterEach, describe, expect, it, vi} from 'vitest';
import {assertAllowedUpstream, createBridgeServer, optionsFromEnv} from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local bridge', () => {
  it('only allows loopback upstreams', () => {
    expect(assertAllowedUpstream('http://127.0.0.1:11434')).toContain('127.0.0.1');
    expect(() => assertAllowedUpstream('https://example.com')).toThrow(/loopback/);
  });

  it('requires a bridge token', () => {
    expect(() => optionsFromEnv({})).toThrow(/LOCAL_BRIDGE_TOKEN/);
  });

  it('proxies chat requests with the configured token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ok: true}), {
      status: 200,
      headers: {'content-type': 'application/json'},
    }));
    vi.stubGlobal('fetch', fetchMock);
    const app = await createBridgeServer({token: 'secret', upstream: 'http://127.0.0.1:11434'});

    const denied = await app.inject({method: 'GET', url: '/models'});
    expect(denied.statusCode).toBe(401);

    const allowed = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: {'x-local-bridge-token': 'secret'},
      payload: {model: 'llama3.2', messages: []},
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual({ok: true});
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:11434/api/chat', expect.anything());
    await app.close();
  });
});
