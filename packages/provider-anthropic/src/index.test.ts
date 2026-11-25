import {afterEach, describe, expect, it, vi} from 'vitest';
import {createAnthropicProvider} from './index.js';

afterEach(() => vi.unstubAllGlobals());

describe('Anthropic provider', () => {
  it('parses messages responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{text: 'hello'}],
          model: 'claude-test',
          usage: {input_tokens: 3, output_tokens: 2},
        }),
        {status: 200},
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createAnthropicProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.test',
    });
    const response = await provider.chat({
      messages: [{role: 'user', content: 'hi'}],
    });
    expect(response.text).toBe('hello');
    expect(response.usage?.promptTokens).toBe(3);
    expect(fetchMock.mock.calls[0]?.[1]).toHaveProperty(
      'headers.x-api-key',
      'test-key',
    );
  });
});
