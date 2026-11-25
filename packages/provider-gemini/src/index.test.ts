import {afterEach, describe, expect, it, vi} from 'vitest';
import {createGeminiProvider} from './index.js';

afterEach(() => vi.unstubAllGlobals());

describe('Gemini provider', () => {
  it('parses generateContent responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{content: {parts: [{text: 'hello'}]}}],
          usageMetadata: {promptTokenCount: 4, candidatesTokenCount: 2},
        }),
        {status: 200},
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createGeminiProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.test',
      defaultModel: 'gemini-test',
    });
    const response = await provider.chat({
      messages: [{role: 'user', content: 'hi'}],
    });
    expect(response.text).toBe('hello');
    expect(response.usage?.completionTokens).toBe(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('gemini-test:generateContent');
  });
});
