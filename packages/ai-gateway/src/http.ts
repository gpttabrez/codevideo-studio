export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const forwardAbort = (): void => controller.abort();
  externalSignal?.addEventListener('abort', forwardAbort);

  try {
    return await fetch(url, {...init, signal: controller.signal});
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
}

async function* readLines(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream: true});
      let boundary = buffer.indexOf('\n');
      while (boundary !== -1) {
        const line = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 1);
        if (line) yield line;
        boundary = buffer.indexOf('\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* decodeSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  for await (const line of readLines(body)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload && payload !== '[DONE]') yield payload;
  }
}

export async function* decodeNdjsonStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  yield* readLines(body);
}

export function parseJsonText(text: string): unknown {
  const fenced = text.match(/```(?:json|typescript|ts)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[{[]/);
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  if (start === -1 || end < start) {
    throw new Error('Provider response did not contain JSON.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
