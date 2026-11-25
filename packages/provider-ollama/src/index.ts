import {
  AIProviderError,
  decodeNdjsonStream,
  estimateTokens,
  type AIProvider,
  type ChatRequest,
  type ChatResponse,
  type ConnectionTest,
} from '@codevideo/ai-gateway';

export interface OllamaProviderOptions {
  baseUrl?: string;
  defaultModel?: string;
}

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (local)';
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.defaultModel = options.defaultModel ?? 'llama3.2';
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`, {signal});
    if (!response.ok) {
      throw new AIProviderError(
        `Failed to list models: ${response.status}`,
        this.id,
        response.status,
      );
    }
    const payload = (await response.json()) as {
      models?: Array<{name?: string}>;
    };
    return (payload.models ?? []).flatMap(model => (model.name ? [model.name] : []));
  }

  private body(request: ChatRequest, stream: boolean) {
    return {
      model: request.model ?? this.defaultModel,
      messages: request.messages,
      stream,
      format: request.jsonMode ? 'json' : undefined,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens,
      },
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: request.signal,
      body: JSON.stringify(this.body(request, false)),
    });
    if (!response.ok) {
      throw new AIProviderError(
        `Chat request failed: ${response.status} ${await response.text()}`,
        this.id,
        response.status,
      );
    }
    const payload = (await response.json()) as {
      model?: string;
      message?: {content?: string};
      eval_count?: number;
      prompt_eval_count?: number;
    };
    const text = payload.message?.content ?? '';
    return {
      text,
      model: payload.model ?? request.model ?? this.defaultModel,
      usage: {
        promptTokens: payload.prompt_eval_count ?? 0,
        completionTokens: payload.eval_count ?? estimateTokens(text),
        totalTokens: (payload.prompt_eval_count ?? 0) + (payload.eval_count ?? 0),
      },
      raw: payload,
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      signal: request.signal,
      body: JSON.stringify(this.body(request, true)),
    });
    if (!response.ok || !response.body) {
      throw new AIProviderError(
        `Stream request failed: ${response.status} ${await response.text()}`,
        this.id,
        response.status,
      );
    }
    for await (const line of decodeNdjsonStream(response.body)) {
      const payload = JSON.parse(line) as {message?: {content?: string}};
      const text = payload.message?.content;
      if (text) yield text;
    }
  }

  async testConnection(): Promise<ConnectionTest> {
    try {
      const models = await this.listModels();
      return {
        ok: true,
        message: models.length ? `Connected to ${this.name}` : 'Connected; no models pulled yet',
        models,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        models: [],
      };
    }
  }
}

export function createOllamaProvider(options?: OllamaProviderOptions): AIProvider {
  return new OllamaProvider(options);
}
