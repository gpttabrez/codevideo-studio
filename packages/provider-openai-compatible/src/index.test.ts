import {afterEach, describe, expect, it, vi} from 'vitest';
import {createOpenAICompatibleProvider, OpenAICompatibleProvider} from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAI-compatible provider', () => {
  it('does not claim vision or tool calling unless configured', () => {
    const provider = createOpenAICompatibleProvider({
      id: 'custom',
      name: 'Custom',
      baseUrl: 'http://localhost:1234/v1',
      defaultModel: 'local-model',
    });
    expect(provider.capabilities?.vision).toBe(false);
    expect(provider.capabilities?.toolCalling).toBe(false);
  });

  it('supports local endpoints without an API key', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {messages: Array<{role: string; content: unknown}>};
      expect(body.messages[0]?.content).toBe('hello');
      return new Response(JSON.stringify({
        choices: [{message: {content: 'world'}}],
        model: 'local-model',
      }), {status: 200, headers: {'content-type': 'application/json'}});
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAICompatibleProvider({
      id: 'lmstudio',
      name: 'LM Studio',
      baseUrl: 'http://localhost:1234/v1',
      defaultModel: 'local-model',
    });
    const response = await provider.chat({messages: [{role: 'user', content: 'hello'}]});
    expect(response.text).toBe('world');
  });

  it('encodes image parts when vision is enabled', async () => {
    let capturedBody = '';
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = String(init.body);
      return new Response(JSON.stringify({choices: [{message: {content: 'ok'}}]}), {
        status: 200,
        headers: {'content-type': 'application/json'},
      });
    }));
    const provider = new OpenAICompatibleProvider({
      id: 'vision-local',
      name: 'Vision Local',
      baseUrl: 'http://localhost:1234/v1',
      defaultModel: 'vision-model',
      supportsVision: true,
    });
    await provider.chatWithMessages({
      messages: [{
        role: 'user',
        content: 'describe',
        images: [{type: 'image', data: 'AA==', mimeType: 'image/png'}],
      }],
    });
    expect(capturedBody).toContain('data:image/png;base64,AA==');
  });
});
