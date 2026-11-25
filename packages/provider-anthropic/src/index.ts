import {
  AIProviderError,
  decodeSseStream,
  estimateTokens,
  type AIProvider,
  type ChatRequest,
  type ChatResponse,
  type ConnectionTest,
} from '@codevideo/ai-gateway';

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    this.defaultModel = options.defaultModel ?? 'claude-3-5-haiku-latest';
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/v1/models`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new AIProviderError(
        `Failed to list models: ${response.status}`,
        this.id,
        response.status,
      );
    }
    const payload = (await response.json()) as {data?: Array<{id: string}>};
    return (payload.data ?? []).map(model => model.id);
  }

  private body(request: ChatRequest, stream: boolean) {
    const system = request.messages
      .filter(message => message.role === 'system')
      .map(message => message.content)
      .join('\n');
    return {
      model: request.model ?? this.defaultModel,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
      system,
      messages: request.messages
        .filter(message => message.role !== 'system')
        .map(message => ({role: message.role, content: message.content})),
      stream,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers(),
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
      content?: Array<{text?: string}>;
      model?: string;
      usage?: {input_tokens?: number; output_tokens?: number};
    };
    const text = (payload.content ?? []).map(item => item.text ?? '').join('');
    return {
      text,
      model: payload.model ?? request.model ?? this.defaultModel,
      usage: payload.usage
        ? {
            promptTokens: payload.usage.input_tokens ?? 0,
            completionTokens: payload.usage.output_tokens ?? estimateTokens(text),
            totalTokens:
              (payload.usage.input_tokens ?? 0) + (payload.usage.output_tokens ?? 0),
          }
        : undefined,
      raw: payload,
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers(),
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
    for await (const data of decodeSseStream(response.body)) {
      const payload = JSON.parse(data) as {
        type?: string;
        delta?: {type?: string; text?: string};
      };
      if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
        yield payload.delta.text ?? '';
      }
    }
  }

  async testConnection(): Promise<ConnectionTest> {
    try {
      const models = await this.listModels();
      return {ok: true, message: `Connected to ${this.name}`, models};
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        models: [],
      };
    }
  }
}

export function createAnthropicProvider(
  options: AnthropicProviderOptions,
): AIProvider {
  return new AnthropicProvider(options);
}
