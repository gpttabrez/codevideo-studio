import {afterEach, describe, expect, it, vi} from 'vitest';
import {createOpenAIProvider} from './index.js';

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI provider', () => {
  it('parses chat completions responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{message: {content: 'hello'}}],
          model: 'gpt-test',
          usage: {prompt_tokens: 2, completion_tokens: 1, total_tokens: 3},
        }),
        {status: 200},
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOpenAIProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
    });
    const response = await provider.chat({
      messages: [{role: 'user', content: 'hi'}],
    });
    expect(response.text).toBe('hello');
    expect(response.usage?.totalTokens).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({method: 'POST'}),
    );
  });
});
