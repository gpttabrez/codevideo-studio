import {afterEach, describe, expect, it, vi} from 'vitest';
import {createOllamaProvider} from './index.js';

afterEach(() => vi.unstubAllGlobals());

describe('Ollama provider', () => {
  it('parses local chat responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'llama3.2',
          message: {content: 'hello'},
          prompt_eval_count: 5,
          eval_count: 3,
        }),
        {status: 200},
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOllamaProvider({baseUrl: 'http://localhost:11434'});
    const response = await provider.chat({
      messages: [{role: 'user', content: 'hi'}],
    });
    expect(response.text).toBe('hello');
    expect(response.usage?.totalTokens).toBe(8);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({method: 'POST'}),
    );
  });

  it('reports connection failures without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const provider = createOllamaProvider();
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('offline');
  });
});
