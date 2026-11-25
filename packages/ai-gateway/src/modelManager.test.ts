import {describe, expect, it} from 'vitest';
import {ModelCapabilityError, ModelManager} from './modelManager.js';
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  ConnectionTest,
  ProviderCapabilities,
} from './types.js';

function fakeProvider(
  id: string,
  capabilities: ProviderCapabilities,
  behavior: (request: ChatRequest) => Promise<ChatResponse> = async request => ({
    text: `${id}:${request.messages[request.messages.length - 1]?.content ?? ''}`,
    model: request.model ?? 'test',
  }),
): AIProvider {
  return {
    id,
    name: id,
    capabilities,
    async listModels() { return ['test']; },
    chat: behavior,
    async *stream() { yield ''; },
    async testConnection(): Promise<ConnectionTest> { return {ok: true, message: 'ok', models: ['test']}; },
  };
}

function gateway(providers: AIProvider[]) {
  const map = new Map(providers.map(provider => [provider.id, provider]));
  return {
    has: (id: string) => map.has(id),
    getProvider: (id: string) => {
      const provider = map.get(id);
      if (!provider) throw new Error(`missing ${id}`);
      return provider;
    },
    listProviders: () => providers.map(({id, name}) => ({id, name})),
    chat: (id: string, request: ChatRequest) => map.get(id)!.chat(request),
  };
}

describe('ModelManager', () => {
  it('uses the primary model when it has the required capabilities', async () => {
    const primary = fakeProvider('primary', {
      text: true, streaming: true, jsonMode: true, toolCalling: 'native', vision: true,
    });
    const manager = new ModelManager(gateway([primary]), {
      roles: {coding: {providerId: 'primary', model: 'coder'}},
    });

    const response = await manager.chat('coding', {messages: [{role: 'user', content: 'hello'}]});
    expect(response.text).toContain('primary:hello');
  });

  it('falls back after provider failure without changing project context', async () => {
    const failing = fakeProvider('failing', {
      text: true, streaming: true, jsonMode: false, toolCalling: false, vision: false,
    }, async () => { throw new Error('offline'); });
    const fallback = fakeProvider('fallback', {
      text: true, streaming: true, jsonMode: false, toolCalling: false, vision: false,
    });
    const manager = new ModelManager(gateway([failing, fallback]), {
      roles: {
        coding: {
          providerId: 'failing',
          model: 'coder',
          fallback: [{providerId: 'fallback', model: 'local'}],
        },
      },
    });
    const messages = [{role: 'user' as const, content: 'preserve me'}];

    const response = await manager.chat('coding', {messages});
    expect(response.text).toContain('fallback:preserve me');
    expect(messages).toEqual([{role: 'user', content: 'preserve me'}]);
  });

  it('never falls back to a model lacking required capabilities', async () => {
    const primary = fakeProvider('primary', {
      text: true, streaming: true, jsonMode: false, toolCalling: false, vision: false,
    }, async () => { throw new Error('failed'); });
    const weakFallback = fakeProvider('weak', {
      text: true, streaming: true, jsonMode: false, toolCalling: false, vision: false,
    });
    const manager = new ModelManager(gateway([primary, weakFallback]), {
      roles: {
        vision: {
          providerId: 'primary',
          model: 'v1',
          fallback: [{providerId: 'weak', model: 'no-vision'}],
        },
      },
    });

    await expect(manager.chat('vision', {messages: [{role: 'user', content: 'look'}]}, {vision: true}))
      .rejects.toBeInstanceOf(ModelCapabilityError);
  });

  it('rejects missing role configuration with a capability error', async () => {
    const manager = new ModelManager(gateway([]));
    await expect(manager.resolve('planning')).rejects.toBeInstanceOf(ModelCapabilityError);
  });
});
