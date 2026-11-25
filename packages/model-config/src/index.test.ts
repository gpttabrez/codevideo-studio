import {describe, expect, it} from 'vitest';
import {createGatewayFromConfig, createModelManagerFromGateway, parseProviderConfig} from './index.js';

describe('model config', () => {
  it('parses configurable providers and capabilities', () => {
    const entries = parseProviderConfig([{
      id: 'local-vision',
      type: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
      defaultModel: 'vision-model',
      capabilities: {vision: true, toolCalling: 'json-protocol'},
    }]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.capabilities?.vision).toBe(true);
  });

  it('creates a gateway without a hardcoded provider selection', () => {
    const env = {
      CODEVIDEO_PROVIDERS_JSON: JSON.stringify([{
        id: 'custom',
        type: 'openai-compatible',
        baseUrl: 'http://localhost:1234/v1',
        defaultModel: 'local-model',
      }]),
    };
    const gateway = createGatewayFromConfig(env);
    expect(gateway.listProviders().map(item => item.id)).toEqual(['custom']);
    const manager = createModelManagerFromGateway(gateway, env);
    expect(manager.getRoleConfig().coding).toEqual({providerId: 'custom', model: 'local-model'});
  });

  it('does not assume vision by default', () => {
    const env = {
      CODEVIDEO_PROVIDERS_JSON: JSON.stringify([{
        id: 'plain',
        type: 'openai-compatible',
        baseUrl: 'http://localhost:1234/v1',
        defaultModel: 'local-model',
      }]),
    };
    const gateway = createGatewayFromConfig(env);
    expect(gateway.getProvider('plain').capabilities?.vision).toBe(false);
  });
});
